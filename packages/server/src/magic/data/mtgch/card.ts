import { and, eq, notExists, sql } from 'drizzle-orm';
import { gotScraping } from 'crawlee';

import { mtgchCard, type MtgchCard, type MtgchFace } from '@model/magic/schema/data/mtgch/card';

import Task from '@/common/task';
import { db } from '@/drizzle';
import { normalizeText } from '@/magic/data/mtgch/normalize';
import { Card, CardLocalization, CardPart, CardPartLocalization } from '@/magic/schema/card';
import { Mtgch } from '@/magic/schema/data/mtgch';
import { Print } from '@/magic/schema/print';

import { mtgch as log } from '@/magic/logger';

// Cache expiration time: 180 days
const CACHE_EXPIRATION_DAYS = 180;

export interface ImportProgress {
    type:     'progress' | 'complete' | 'error';
    step:     'card' | 'part';
    current:  number;
    total:    number;
    success:  number;
    failed:   number;
    message?: string;
}

/**
 * Fetch card data from MTGCH API using Crawlee's gotScraping
 * Automatically handles rate limiting, retries, and session management
 * @returns Card data or null if not found (404)
 */
async function fetchFromMtgch(set: string, number: string): Promise<MtgchCard | null> {
    const url = `https://mtgch.com/api/v1/card/${set.toLowerCase()}/${number}/`;

    try {
        const response = await gotScraping({
            url,
            responseType: 'json',
            headers:      {
                'User-Agent': 'Mozilla/5.0 (compatible; TCG-Cards-Bot/1.0)',
                'Accept':     'application/json',
            },
            http2: false,
            // Crawlee automatically handles retries with exponential backoff
            // Note: 404 is excluded - card not found should return null immediately
            retry: {
                limit: 5,
            },
            timeout: {
                request: 30000, // 30s timeout per request
            },
            // Respect rate limiting headers
            hooks: {
                afterResponse: [
                    response => {
                        if (response.statusCode === 404) {
                            throw new Error('Card not found (404)');
                        }

                        return response;
                    },
                ],
                beforeRetry: [
                    (error, retryCount) => {
                        log.warn(`Retry ${retryCount} for ${set}/${number}: ${error.message}`);
                    },
                ],
            },
        });

        const result = mtgchCard.parse(response.body);

        if (result.zhs_text != null) {
            result.zhs_text = normalizeText(result.zhs_text);
        }

        if (result.atomic_translated_text != null) {
            result.atomic_translated_text = normalizeText(result.atomic_translated_text);
        }

        if (result.other_faces != null) {
            for (const face of result.other_faces) {
                if (face.zhs_text != null) {
                    face.zhs_text = normalizeText(face.zhs_text);
                }

                if (face.atomic_translated_text != null) {
                    face.atomic_translated_text = normalizeText(face.atomic_translated_text);
                }
            }
        }

        if (result.zhs_flavor_text != null) {
            result.zhs_flavor_text = normalizeText(result.zhs_flavor_text);
        }

        return result;
    } catch (error) {
        // Check if it's a 404 error - card not found
        if (error instanceof Error && error.message === 'Card not found (404)') {
            log.debug(`Card not found (404) for ${set}/${number}`);
            return null;
        }

        if (error && typeof error === 'object' && 'response' in error) {
            const response = (error as any).response;
            if (response?.statusCode === 404) {
                log.debug(`Card not found (404) for ${set}/${number}`);
                return null;
            }
        }

        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        log.error(`Failed to fetch card ${set}/${number}: ${errorMessage}`);
        throw new Error(`Failed to fetch card from MTGCH: ${errorMessage}`);
    }
}

/**
 * Get card data from MTGCH with caching
 * Cache expires after 180 days
 * @returns Card data or null if not found
 */
export async function getMtgchCard(set: string, number: string): Promise<MtgchCard | null> {
    const normalizedSet = set.toLowerCase();

    // Check cache first
    const cached = await db
        .select()
        .from(Mtgch)
        .where(
            and(
                eq(Mtgch.set, normalizedSet),
                eq(Mtgch.number, number),
            ),
        )
        .limit(1);

    let cardData: MtgchCard | null;

    // Return cached data if exists and not expired (including cached null for 404)
    if (cached.length > 0 && cached[0].expiresAt > new Date()) {
        cardData = cached[0].data as MtgchCard | null;
        if (cardData === null) {
            log.debug(`Using cached 404 for ${set}/${number}`);
        } else {
            log.debug(`Using cached data for ${set}/${number}`);
        }
    } else {
        // Fetch data from MTGCH
        cardData = await fetchFromMtgch(set, number);

        // Cache both successful and 404 results
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + CACHE_EXPIRATION_DAYS);

        await db
            .insert(Mtgch)
            .values({
                set:    normalizedSet,
                number: number,
                data:   cardData,
                expiresAt,
            })
            .onConflictDoUpdate({
                target: [Mtgch.set, Mtgch.number],
                set:    {
                    data:      cardData,
                    createdAt: new Date(),
                    expiresAt,
                },
            });

        if (cardData === null) {
            log.debug(`Cached 404 for ${set}/${number}, expires at ${expiresAt.toISOString()}`);
        } else {
            log.debug(`Cached new data for ${set}/${number}, expires at ${expiresAt.toISOString()}`);
        }
    }

    return cardData;
}

export function extractFaceData(mtgchData: MtgchCard, targetPartIndex: number): MtgchFace | null {
    if (mtgchData.face_index === targetPartIndex || (mtgchData.face_index == -1 && targetPartIndex === 0)) {
        // Extract all fields except other_faces and is_preview
        const { other_faces: _other_faces, is_preview: _is_preview, ...faceData } = mtgchData;
        return faceData;
    }

    if (mtgchData.other_faces && Array.isArray(mtgchData.other_faces)) {
        for (const face of mtgchData.other_faces) {
            if (face.face_index === targetPartIndex) {
                return face;
            }
        }
    }

    return null;
}

export async function countMissingLocalization(): Promise<{
    cardLocalization:     number;
    cardPartLocalization: number;
}> {
    const cardsCount = await db
        .select({ count: sql<number>`count(*)` })
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
        .then(rows => Number(rows[0]?.count ?? 0));

    const partsCount = await db
        .select({ count: sql<number>`count(*)` })
        .from(CardPart)
        .where(
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
        )
        .then(rows => Number(rows[0]?.count ?? 0));

    return {
        cardLocalization:     cardsCount,
        cardPartLocalization: partsCount,
    };
}

export class ImportLocalizationTask extends Task<ImportProgress> {
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

        log.info(`Starting import localization (limit: ${this.limit ?? 'unlimited'})`);

        // Setup interval progress reporting every 0.5 seconds
        this.intervalProgress(500, () => ({
            type:    'progress' as const,
            step:    'card' as const,
            current: this.current,
            total:   this.total,
            success: this.cardSuccessCount,
            failed:  this.cardFailCount,
        }));

        try {
            // Query cards missing zhs localization along with their parts
            const cardsToProcess = await db
                .selectDistinctOn([Card.cardId], {
                    cardId:    Card.cardId,
                    partCount: Card.partCount,
                    set:       Print.set,
                    number:    Print.number,
                })
                .from(Card)
                .innerJoin(Print, eq(Card.cardId, Print.cardId))
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
                .orderBy(Card.cardId, Print.set, Print.number)
                .limit(this.limit ?? 999999);

            this.total = cardsToProcess.length;

            for (let i = 0; i < this.total && !this.shouldStop; i++) {
                const card = cardsToProcess[i];

                try {
                    // Crawlee handles rate limiting automatically
                    const mtgchData = await getMtgchCard(card.set, card.number);

                    // If card not found (404), skip it
                    if (mtgchData === null) {
                        this.cardFailCount++;
                        log.warn(`Card not found on MTGCH for ${card.cardId} (${card.set} ${card.number})`);
                        this.current = i + 1;
                        continue;
                    }

                    // Get parts that need localization
                    const partsNeedingLocalization = await db
                        .select({ partIndex: CardPart.partIndex })
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

                    // Wrap all database operations in a transaction
                    await db.transaction(async tx => {
                        // Insert CardLocalization - compose from all parts
                        if (mtgchData.full_translated_name != null
                          || mtgchData.full_official_name != null
                          || mtgchData.atomic_translated_name != null
                          || mtgchData.atomic_official_name != null) {
                            // Collect all faces data
                            const allFaces: MtgchFace[] = [extractFaceData(mtgchData, 0)!];

                            if (mtgchData.other_faces && Array.isArray(mtgchData.other_faces)) {
                                allFaces.push(...mtgchData.other_faces);
                            }

                            // Sort faces by index
                            allFaces.sort((a, b) => a.face_index - b.face_index);

                            const names = allFaces.map(face => face.atomic_official_name ?? face.atomic_translated_name);
                            const zhsName = mtgchData.full_official_name ?? mtgchData.full_translated_name ?? names.join(' // ');

                            // Compose typeline from all faces
                            const typelines = allFaces.map(face => face.atomic_translated_type!);
                            const zhsTypeline = typelines.join(' // ');

                            // Compose text from all faces
                            const texts = allFaces.map(face => face.atomic_translated_text!);
                            const zhsText = texts.join('\n////////////////////\n');

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
                        } else {
                            this.cardFailCount++;
                            log.warn(`No Chinese full name found for ${card.cardId} (${card.set} ${card.number})`);
                        }

                        // Insert CardPartLocalizations
                        for (const part of partsNeedingLocalization) {
                            const faceData = extractFaceData(mtgchData, part.partIndex);

                            if (faceData) {
                                const zhsName = faceData.atomic_official_name ?? faceData.atomic_translated_name;
                                const zhsTypeline = faceData.atomic_translated_type ?? '';
                                const zhsText = faceData.atomic_translated_text ?? '';

                                if (zhsName != null) {
                                    await tx.insert(CardPartLocalization).values({
                                        cardId:    card.cardId,
                                        locale:    'zhs',
                                        partIndex: part.partIndex,
                                        name:      zhsName,
                                        typeline:  zhsTypeline,
                                        text:      zhsText,
                                    });

                                    this.partSuccessCount++;
                                    log.info(`Imported CardPartLocalization for ${card.cardId} part ${part.partIndex}: ${zhsName}`);
                                } else {
                                    this.partFailCount++;
                                    log.warn(`No Chinese localized name found for ${card.cardId} part ${part.partIndex}`);
                                }
                            } else {
                                this.partFailCount++;
                                log.warn(`No face data found for ${card.cardId} part ${part.partIndex}`);
                            }
                        }
                    });
                } catch (error) {
                    this.cardFailCount++;
                    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                    log.error(`Failed to import localization for ${card.cardId} (${card.set} ${card.number}): ${errorMessage}`);
                }

                this.current = i + 1;

                // Small delay between requests to be polite
                if (i < this.total - 1 && !this.shouldStop) {
                    await new Promise(resolve => setTimeout(resolve, 500));
                }
            }

            if (!this.shouldStop) {
                log.info(`Import completed: CardLocalization ${this.cardSuccessCount}/${this.total} (failed: ${this.cardFailCount}), CardPartLocalization ${this.partSuccessCount} (failed: ${this.partFailCount})`);
            } else {
                log.info(`Import stopped: CardLocalization ${this.cardSuccessCount}/${this.current} (failed: ${this.cardFailCount}), CardPartLocalization ${this.partSuccessCount} (failed: ${this.partFailCount})`);
            }
        } catch (error) {
            log.error(`Import failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
            throw error;
        }
    }

    protected stopImpl(): void {
        this.shouldStop = true;
        log.info('Import localization task stop requested');
    }
}
