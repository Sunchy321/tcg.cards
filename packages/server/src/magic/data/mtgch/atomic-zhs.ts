import { createReadStream } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import readline from 'node:readline';
import { and, eq, notExists, sql } from 'drizzle-orm';

import { atomicZhs, type AtomicZhs } from '@model/magic/schema/data/mtgch/atomic-zhs';

import Task from '@/common/task';
import { db } from '@/drizzle';
import { normalizeText } from '@/magic/data/mtgch/normalize';
import { Card, CardLocalization, CardPart, CardPartLocalization } from '@/magic/schema/card';

import { dataPath } from '@/config';

import { mtgch as log } from '@/magic/logger';

export interface ImportAtomicProgress {
    type:     'progress' | 'complete' | 'error';
    current:  number;
    total:    number;
    success:  number;
    failed:   number;
    message?: string;
}

/**
 * Get the latest atomic_zhs.json file path
 */
async function getLatestAtomicZhsPath(): Promise<string | null> {
    const mtgchDir = join(dataPath, 'magic/mtgch');

    try {
        const entries = await readdir(mtgchDir, { withFileTypes: true });

        // Find all directories matching pattern "magic-cards-zhs-data-*"
        const dataDirs = entries
            .filter(e => e.isDirectory() && e.name.startsWith('magic-cards-zhs-data-'))
            .map(e => e.name)
            .sort()
            .reverse(); // Sort descending to get latest first

        for (const dir of dataDirs) {
            const atomicZhsPath = join(mtgchDir, dir, 'atomic_zhs.json');

            // Check if atomic_zhs.json exists
            try {
                const fs = await import('node:fs/promises');
                await fs.access(atomicZhsPath);
                return atomicZhsPath;
            } catch {
                continue;
            }
        }

        return null;
    } catch (error) {
        log.error(`Failed to find atomic_zhs.json: ${error instanceof Error ? error.message : 'Unknown error'}`);
        return null;
    }
}

/**
 * Parse atomic_zhs.json file and build a lookup map
 * Key: oracle_id
 * Value: AtomicZhs data
 */
async function loadAtomicZhsData(): Promise<Map<string, AtomicZhs>> {
    const filePath = await getLatestAtomicZhsPath();

    if (!filePath) {
        throw new Error('atomic_zhs.json file not found');
    }

    log.info(`Loading atomic_zhs.json from: ${filePath}`);

    const dataMap = new Map<string, AtomicZhs>();

    return new Promise((resolve, reject) => {
        const fileStream = createReadStream(filePath);
        const rl = readline.createInterface({
            input:     fileStream,
            crlfDelay: Infinity,
        });

        let lineCount = 0;

        rl.on('line', line => {
            try {
                lineCount++;
                // Replace double backslashes with single backslashes before parsing
                const processedLine = line.replace(/\\\\/g, '\\');
                const jsonData = JSON.parse(processedLine);
                const parsed = atomicZhs.parse(jsonData);

                // Normalize text fields
                if (parsed.official_text != null) {
                    parsed.official_text = normalizeText(parsed.official_text);
                }
                if (parsed.translated_text != null) {
                    parsed.translated_text = normalizeText(parsed.translated_text);
                }

                dataMap.set(parsed.oracle_id, parsed);
            } catch (error) {
                log.warn(`Failed to parse line ${lineCount}: ${error instanceof Error ? error.message : 'Unknown error'}`);
            }
        });

        rl.on('close', () => {
            log.info(`Loaded ${dataMap.size} entries from atomic_zhs.json`);
            resolve(dataMap);
        });

        rl.on('error', error => {
            reject(error);
        });
    });
}

export class ImportAtomicZhsTask extends Task<ImportAtomicProgress> {
    private limit?: number;
    private shouldStop = false;

    // Progress tracking
    private current = 0;
    private total = 0;
    private cardSuccessCount = 0;
    private cardFailCount = 0;
    private partSuccessCount = 0;
    private partFailCount = 0;

    constructor(limit?: number) {
        super();
        this.limit = limit;
    }

    protected async startImpl(): Promise<void> {
        this.shouldStop = false;
        this.current = 0;
        this.total = 0;
        this.cardSuccessCount = 0;
        this.cardFailCount = 0;
        this.partSuccessCount = 0;
        this.partFailCount = 0;

        log.info(`Starting import from atomic_zhs.json (limit: ${this.limit ?? 'unlimited'})`);

        // Setup interval progress reporting
        this.intervalProgress(500, () => ({
            type:    'progress' as const,
            current: this.current,
            total:   this.total,
            success: this.cardSuccessCount,
            failed:  this.cardFailCount,
        }));

        try {
            // Load atomic_zhs.json data
            const atomicData = await loadAtomicZhsData();

            // Query cards missing zhs localization
            const cardsToProcess = await db
                .selectDistinctOn([Card.cardId], {
                    cardId:           Card.cardId,
                    partCount:        Card.partCount,
                    scryfallOracleId: Card.scryfallOracleId,
                })
                .from(Card)
                .where(
                    notExists(
                        db.select()
                            .from(CardLocalization)
                            .where(
                                and(
                                    eq(CardLocalization.cardId, Card.cardId),
                                    eq(CardLocalization.locale, 'zhs'),
                                ),
                            ),
                    ),
                )
                .orderBy(Card.cardId)
                .limit(this.limit ?? 999999);

            // Calculate total as intersection of cards missing localization and cards with atomic_zhs data
            let matchedCards = 0;
            for (const card of cardsToProcess) {
                let hasData = false;
                for (const oracleId of card.scryfallOracleId) {
                    if (atomicData.has(oracleId)) {
                        hasData = true;
                        break;
                    }
                }
                if (hasData) matchedCards++;
            }

            this.total = matchedCards;
            log.info(`Found ${cardsToProcess.length} cards missing zhs localization, ${this.total} have atomic_zhs data`);

            for (let i = 0; i < cardsToProcess.length && !this.shouldStop; i++) {
                const card = cardsToProcess[i];

                try {
                    // Try to find matching data using oracle_id
                    let zhsData: AtomicZhs | undefined;

                    // Try each oracle_id in the array
                    for (const oracleId of card.scryfallOracleId) {
                        zhsData = atomicData.get(oracleId);
                        if (zhsData) break;
                    }

                    if (!zhsData) {
                        this.cardFailCount++;
                        log.warn(`No atomic_zhs data found for ${card.cardId}`);
                        continue;
                    }

                    // Only increment current for cards with atomic_zhs data
                    this.current++;

                    // Get card parts that need localization
                    const partsNeedingLocalization = await db
                        .select({
                            partIndex: CardPart.partIndex,
                        })
                        .from(CardPart)
                        .where(
                            and(
                                eq(CardPart.cardId, card.cardId),
                                notExists(
                                    db.select()
                                        .from(CardPartLocalization)
                                        .where(
                                            and(
                                                eq(CardPartLocalization.cardId, CardPart.cardId),
                                                eq(CardPartLocalization.partIndex, CardPart.partIndex),
                                                eq(CardPartLocalization.locale, 'zhs'),
                                            ),
                                        ),
                                ),
                            ),
                        );

                    // Import localizations in a transaction
                    await db.transaction(async tx => {
                        // For single-part cards
                        if (card.partCount === 1) {
                            const zhsName = zhsData.translated_name ?? zhsData.official_name ?? zhsData.name;
                            const zhsTypeline = zhsData.translated_type ?? zhsData.type_line;
                            const zhsText = zhsData.translated_text ?? zhsData.official_text ?? zhsData.oracle_text;

                            // Insert CardLocalization
                            await tx.insert(CardLocalization).values({
                                cardId:     card.cardId,
                                locale:     'zhs',
                                name:       zhsName,
                                typeline:   zhsTypeline,
                                text:       zhsText,
                                __lastDate: '0000-00-00',
                            });

                            // Add dev:unified tag to card
                            await tx.update(Card)
                                .set({ tags: sql`array_append(${Card.tags}, 'dev:unified')` })
                                .where(eq(Card.cardId, card.cardId));

                            this.cardSuccessCount++;
                            log.info(`Imported CardLocalization for ${card.cardId}: ${zhsName}`);

                            // Insert CardPartLocalization
                            if (partsNeedingLocalization.length > 0) {
                                await tx.insert(CardPartLocalization).values({
                                    cardId:    card.cardId,
                                    locale:    'zhs',
                                    partIndex: 0,
                                    name:      zhsName,
                                    typeline:  zhsTypeline,
                                    text:      zhsText,
                                });

                                this.partSuccessCount++;
                                log.info(`Imported CardPartLocalization for ${card.cardId} part 0: ${zhsName}`);
                            }
                        } else {
                            // For multi-part cards, we need to match each part with atomic_zhs data
                            const partLocalizations: {
                                partIndex: number;
                                name:      string;
                                typeline:  string;
                                text:      string;
                            }[] = [];

                            for (const part of partsNeedingLocalization) {
                                // Try to find atomic_zhs data for each oracle_id
                                let partZhsData: AtomicZhs | undefined;
                                for (const oracleId of card.scryfallOracleId) {
                                    partZhsData = atomicData.get(oracleId);
                                    if (partZhsData) break;
                                }

                                if (partZhsData) {
                                    const zhsName = partZhsData.official_name ?? partZhsData.translated_name;
                                    const zhsTypeline = partZhsData.translated_type ?? '';
                                    const zhsText = partZhsData.official_text ?? partZhsData.translated_text ?? '';

                                    if (zhsName) {
                                        partLocalizations.push({
                                            partIndex: part.partIndex,
                                            name:      zhsName,
                                            typeline:  zhsTypeline,
                                            text:      zhsText,
                                        });
                                    }
                                }
                            }

                            if (partLocalizations.length === card.partCount) {
                                // Sort by partIndex
                                partLocalizations.sort((a, b) => a.partIndex - b.partIndex);

                                // Compose full card name and text
                                const fullName = partLocalizations.map(p => p.name).join(' // ');
                                const fullTypeline = partLocalizations.map(p => p.typeline).join(' // ');
                                const fullText = partLocalizations.map(p => p.text).join('\n////////////////////\n');

                                // Insert CardLocalization
                                await tx.insert(CardLocalization).values({
                                    cardId:     card.cardId,
                                    locale:     'zhs',
                                    name:       fullName,
                                    typeline:   fullTypeline,
                                    text:       fullText,
                                    __lastDate: '0000-00-00',
                                });

                                // Add dev:unified tag to card
                                await tx.update(Card)
                                    .set({ tags: sql`array_append(${Card.tags}, 'dev:unified')` })
                                    .where(eq(Card.cardId, card.cardId));

                                this.cardSuccessCount++;
                                log.info(`Imported CardLocalization for ${card.cardId}: ${fullName}`);

                                // Insert CardPartLocalizations
                                for (const part of partLocalizations) {
                                    await tx.insert(CardPartLocalization).values({
                                        cardId:    card.cardId,
                                        locale:    'zhs',
                                        partIndex: part.partIndex,
                                        name:      part.name,
                                        typeline:  part.typeline,
                                        text:      part.text,
                                    });

                                    this.partSuccessCount++;
                                    log.info(`Imported CardPartLocalization for ${card.cardId} part ${part.partIndex}: ${part.name}`);
                                }
                            } else {
                                this.cardFailCount++;
                                log.warn(`Incomplete parts for ${card.cardId}: found ${partLocalizations.length}/${card.partCount}`);
                            }
                        }
                    });
                } catch (error) {
                    this.cardFailCount++;
                    log.error(`Failed to process ${card.cardId}: ${error instanceof Error ? error.message : 'Unknown error'}`);
                }
            }

            // Send completion message
            this.emit('progress', {
                type:    'complete',
                current: this.current,
                total:   this.total,
                success: this.cardSuccessCount,
                failed:  this.cardFailCount,
                message: `Import from atomic_zhs.json completed: ${this.cardSuccessCount}/${this.total} cards, ${this.partSuccessCount} parts (${this.cardFailCount} failed)`,
            });

            if (this.current >= this.total) {
                log.info(`Import completed: ${this.cardSuccessCount}/${this.total} cards, ${this.partSuccessCount} parts (${this.cardFailCount} failed)`);
            } else {
                log.info(`Import stopped: ${this.cardSuccessCount}/${this.current} cards, ${this.partSuccessCount} parts (${this.cardFailCount} failed)`);
            }
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : 'Unknown error';
            log.error(`Import failed: ${errorMsg}`);

            this.emit('progress', {
                type:    'error',
                current: this.current,
                total:   this.total,
                success: this.cardSuccessCount,
                failed:  this.cardFailCount,
                message: errorMsg,
            });

            throw error;
        }
    }

    protected stopImpl(): void {
        this.shouldStop = true;
        log.info('Import atomic_zhs task stop requested');
    }
}
