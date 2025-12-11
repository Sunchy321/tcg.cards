import Task from '@/common/task';

import { db } from '@/drizzle';
import { Card, CardLocalization, CardPart, CardPartLocalization } from '@/magic/schema/card';
import { Print, PrintPart } from '@/magic/schema/print';
import { Set } from '@/magic/schema/set';
import { Scryfall } from '@/magic/schema/scryfall';

import { Status } from '@model/magic/schema/data/status';
import { RawCard } from '@model/magic/schema/data/scryfall/card';

import { DrizzleQueryError } from 'drizzle-orm/errors';
import { DatabaseError } from 'pg';
import { ZodError } from 'zod';

import { and, eq, sql } from 'drizzle-orm';
import { join } from 'path';
import internalData from '@/internal-data';
import { toAsyncBucket } from '@/common/to-bucket';
import LineReader from '@/common/line-reader';
import { bulkPath, convertJson } from '../common';

import { toNSCard, RawCardNoArtSeries } from './to-ns-card';
import { splitDFT } from './split-dft';
import { toCard } from './to-card';
import { mergeCard, mergeCardLocalization, mergeCardPart, mergeCardPartLocalization, mergePrint, mergePrintPart } from './merge';

import { bulkUpdation as log } from '@/magic/logger';

const bucketSize = 500;

export class CardLoader extends Task<Status> {
    file:       string;
    filePath:   string;
    lineReader: LineReader;

    constructor(fileName: string) {
        super();

        this.file = fileName;
        this.filePath = join(bulkPath, `${fileName}.json`);
        this.lineReader = new LineReader(this.filePath);
    }

    async startImpl(): Promise<void> {
        log.info('================== MERGE CARD ==================');

        const frontCardSet = internalData<string[]>('magic.front-card-set');

        // initialize set code map
        const setCodeMap: Record<string, string> = {};

        const sets = await db.select().from(Set);

        for (const set of sets) {
            if (set.setId !== set.scryfallCode) {
                setCodeMap[set.scryfallCode] = set.setId;
            }
        }

        let total = 0;
        let count = 0;

        // start timer
        let start = Date.now();

        this.intervalProgress(500, () => {
            const prog: Status = {
                method: 'load',
                type:   'card',

                amount: { total, count },
            };

            const elapsed = Date.now() - start;

            prog.time = {
                elapsed,
                remaining: (elapsed / count) * (total - count),
            };

            return prog;
        });

        // evaluate total card count
        for await (const line of this.lineReader.get()) {
            if (line !== '[' && line !== ']') {
                total += 1;
            }
        }

        this.lineReader.reset();

        await db.delete(Scryfall);

        start = Date.now();

        for await (const jsons of toAsyncBucket(
            convertJson<RawCard>(this.lineReader.get()),
            bucketSize,
        )) {
            if (this.status === 'idle') {
                return;
            }

            try {
                await db.insert(Scryfall).values(jsons.map(j => {
                    let oracleId = j.oracle_id;

                    // process reversible_cards without oracle ID
                    if (oracleId == null) {
                        if (j.card_faces == null) {
                            throw new Error(`Card ${j.id} has no oracle ID and no card faces`);
                        }

                        for (const face of j.card_faces) {
                            if (face.oracle_id == null) {
                                throw new Error(`Card face of card ${j.id} has no oracle ID`);
                            } else if (face.oracle_id != j.card_faces[0].oracle_id) {
                                throw new Error(`Card face of card ${j.id} has different oracle ID`);
                            }
                        }

                        oracleId = j.card_faces[0].oracle_id!;
                    }

                    return {
                        cardId:     j.id,
                        oracleId:   oracleId,
                        legalities: j.legalities,
                    };
                }));
            } catch (e) {
                log.error('Error inserting Scryfall data:');

                if (e instanceof DrizzleQueryError) {
                    log.error('Drizzle error details: ' + JSON.stringify({
                        query:   e.query,
                        message: e.message,
                        cause:   e.cause,
                    }));
                }

                throw e;
            }

            // 预处理所有卡片数据
            const allCardPrints: Awaited<ReturnType<typeof toCard>>[] = [];
            const processedJsons: RawCard[] = [];

            for (const json of jsons) {
                if (json.layout === 'art_series' || frontCardSet.includes(json.set)) {
                    continue;
                }

                try {
                    const cardPrints = splitDFT(toNSCard(json as RawCardNoArtSeries))
                        .map(c => toCard(c, setCodeMap));

                    allCardPrints.push(...cardPrints);
                    processedJsons.push(json);
                } catch (e) {
                    // 立即处理预处理错误
                    if (e instanceof ZodError) {
                        log.error(`Zod validation error for card ${json.id} / ${json.name}:` + JSON.stringify({
                            cardId:   json.id,
                            cardName: json.name,
                            errors:   e.issues.map(err => ({
                                path:    err.path.join('.'),
                                message: err.message,
                                code:    err.code,
                            })),
                        }));
                    }
                    throw e;
                }
            }

            // 批量收集需要查询的ID
            const oracleIds = new globalThis.Set<string>();
            const cardIds = new globalThis.Set<string>();
            const printKeys = new globalThis.Set<string>();

            for (const cp of allCardPrints) {
                cp.card.scryfallOracleId.forEach(id => oracleIds.add(id));
                cardIds.add(cp.print.cardId);
                printKeys.add(`${cp.print.cardId}:${cp.print.set}:${cp.print.number}:${cp.print.lang}`);
            }

            // 批量查询现有数据
            const [existingCards, existingCardLocalizations, existingCardParts, existingCardPartLocalizations, existingPrints, existingPrintParts] = await Promise.all([
                db.select().from(Card).where(sql`${Card.scryfallOracleId} && ${sql.raw(`'{${Array.from(oracleIds).join(',')}}'`)}`),
                db.select().from(CardLocalization).where(sql`${CardLocalization.cardId} = ANY(${sql.raw(`'{${Array.from(cardIds).join(',')}}'`)})`),
                db.select().from(CardPart).where(sql`${CardPart.cardId} = ANY(${sql.raw(`'{${Array.from(cardIds).join(',')}}'`)})`),
                db.select().from(CardPartLocalization).where(sql`${CardPartLocalization.cardId} = ANY(${sql.raw(`'{${Array.from(cardIds).join(',')}}'`)})`),
                db.select().from(Print).where(sql`${Print.cardId} = ANY(${sql.raw(`'{${Array.from(cardIds).join(',')}}'`)})`),
                db.select().from(PrintPart).where(sql`${PrintPart.cardId} = ANY(${sql.raw(`'{${Array.from(cardIds).join(',')}}'`)})`),
            ]);

            // 创建查找映射
            const cardMap = new Map<string, typeof existingCards[0]>();
            existingCards.forEach(card => {
                card.scryfallOracleId.forEach(id => cardMap.set(id, card));
            });

            const cardLocalizationMap = new Map<string, typeof existingCardLocalizations[0]>();
            existingCardLocalizations.forEach(loc => {
                cardLocalizationMap.set(`${loc.cardId}:${loc.lang}`, loc);
            });

            const cardPartMap = new Map<string, typeof existingCardParts[0]>();
            existingCardParts.forEach(part => {
                cardPartMap.set(`${part.cardId}:${part.partIndex}`, part);
            });

            const cardPartLocalizationMap = new Map<string, typeof existingCardPartLocalizations[0]>();
            existingCardPartLocalizations.forEach(loc => {
                cardPartLocalizationMap.set(`${loc.cardId}:${loc.partIndex}:${loc.lang}`, loc);
            });

            const printMap = new Map<string, typeof existingPrints[0]>();
            existingPrints.forEach(print => {
                printMap.set(`${print.cardId}:${print.set}:${print.number}:${print.lang}`, print);
            });

            const printPartMap = new Map<string, typeof existingPrintParts[0]>();
            existingPrintParts.forEach(part => {
                printPartMap.set(`${part.cardId}:${part.set}:${part.number}:${part.lang}:${part.partIndex}`, part);
            });

            // 使用单个事务处理整个批次
            await db.transaction(async tx => {
                for (let i = 0; i < allCardPrints.length; i++) {
                    const cp = allCardPrints[i];
                    const json = processedJsons[Math.floor(i / allCardPrints.length * processedJsons.length)];

                    try {
                        // 查找现有 Card
                        const existingCard = cp.card.scryfallOracleId.map(id => cardMap.get(id)).find(Boolean);

                        if (!existingCard) {
                            const [insertedCard] = await tx.insert(Card).values(cp.card).returning();
                            insertedCard.scryfallOracleId.forEach(id => cardMap.set(id, insertedCard));
                        } else {
                            await mergeCard(existingCard, cp.card);
                            await tx.update(Card).set(existingCard).where(eq(Card.cardId, existingCard.cardId));
                        }

                        // 处理 CardLocalization
                        const existingCardLocalization = cardLocalizationMap.get(`${cp.cardLocalization.cardId}:${cp.cardLocalization.lang}`);
                        let updateActivated: boolean;

                        if (!existingCardLocalization) {
                            const [insertedCardLocalization] = await tx.insert(CardLocalization).values(cp.cardLocalization).returning();
                            cardLocalizationMap.set(`${insertedCardLocalization.cardId}:${insertedCardLocalization.lang}`, insertedCardLocalization);
                            updateActivated = true;
                        } else {
                            if (existingCardLocalization.lang === 'en' || existingCardLocalization.__lastDate < cp.cardLocalization.__lastDate) {
                                mergeCardLocalization(existingCardLocalization, cp.cardLocalization);
                                await tx.update(CardLocalization).set(existingCardLocalization).where(and(
                                    eq(CardLocalization.cardId, existingCardLocalization.cardId),
                                    eq(CardLocalization.lang, existingCardLocalization.lang),
                                ));
                                updateActivated = true;
                            } else {
                                updateActivated = false;
                            }
                        }

                        // 处理 CardPart
                        for (const part of cp.cardPart) {
                            const existingCardPart = cardPartMap.get(`${part.cardId}:${part.partIndex}`);

                            if (!existingCardPart) {
                                const [insertedCardPart] = await tx.insert(CardPart).values(part).returning();
                                cardPartMap.set(`${insertedCardPart.cardId}:${insertedCardPart.partIndex}`, insertedCardPart);
                            } else {
                                mergeCardPart(existingCardPart, part);
                                await tx.update(CardPart).set(existingCardPart).where(and(
                                    eq(CardPart.cardId, existingCardPart.cardId),
                                    eq(CardPart.partIndex, existingCardPart.partIndex),
                                ));
                            }
                        }

                        // 处理 CardPartLocalization
                        for (const loc of cp.cardPartLocalization) {
                            const existingCardPartLocalization = cardPartLocalizationMap.get(`${loc.cardId}:${loc.partIndex}:${loc.lang}`);

                            if (!existingCardPartLocalization) {
                                const [insertedCardPartLocalization] = await tx.insert(CardPartLocalization).values(loc).returning();
                                // 使用返回的数据添加到映射中
                                cardPartLocalizationMap.set(`${insertedCardPartLocalization.cardId}:${insertedCardPartLocalization.partIndex}:${insertedCardPartLocalization.lang}`, insertedCardPartLocalization);
                            } else if (updateActivated) {
                                mergeCardPartLocalization(existingCardPartLocalization, loc);
                                await tx.update(CardPartLocalization).set(existingCardPartLocalization).where(and(
                                    eq(CardPartLocalization.cardId, existingCardPartLocalization.cardId),
                                    eq(CardPartLocalization.partIndex, existingCardPartLocalization.partIndex),
                                    eq(CardPartLocalization.lang, existingCardPartLocalization.lang),
                                ));
                            }
                        }

                        // 处理 Print
                        const printKey = `${cp.print.cardId}:${cp.print.set}:${cp.print.number}:${cp.print.lang}`;
                        const existingPrint = printMap.get(printKey);

                        if (!existingPrint) {
                            if (cp.print.lang === 'en') {
                                cp.print.printTags.push('dev:printed');
                            }
                            const [insertedPrint] = await tx.insert(Print).values(cp.print).returning();
                            const insertedPrintKey = `${insertedPrint.cardId}:${insertedPrint.set}:${insertedPrint.number}:${insertedPrint.lang}`;
                            printMap.set(insertedPrintKey, insertedPrint);
                        } else {
                            await mergePrint(existingPrint, cp.print);
                            await tx.update(Print).set(existingPrint).where(and(
                                eq(Print.cardId, existingPrint.cardId),
                                eq(Print.set, existingPrint.set),
                                eq(Print.number, existingPrint.number),
                                eq(Print.lang, existingPrint.lang),
                            ));
                        }

                        // 处理 PrintPart
                        for (const part of cp.printPart) {
                            const printPartKey = `${part.cardId}:${part.set}:${part.number}:${part.lang}:${part.partIndex}`;
                            const existingPrintPart = printPartMap.get(printPartKey);

                            if (!existingPrintPart) {
                                const [insertedPrintPart] = await tx.insert(PrintPart).values(part).returning();
                                const insertedPrintPartKey = `${insertedPrintPart.cardId}:${insertedPrintPart.set}:${insertedPrintPart.number}:${insertedPrintPart.lang}:${insertedPrintPart.partIndex}`;
                                printPartMap.set(insertedPrintPartKey, insertedPrintPart);
                            } else {
                                mergePrintPart(existingPrintPart, part);
                                await tx.update(PrintPart).set(existingPrintPart).where(and(
                                    eq(PrintPart.cardId, existingPrintPart.cardId),
                                    eq(PrintPart.set, existingPrintPart.set),
                                    eq(PrintPart.number, existingPrintPart.number),
                                    eq(PrintPart.lang, existingPrintPart.lang),
                                    eq(PrintPart.partIndex, existingPrintPart.partIndex),
                                ));
                            }
                        }
                    } catch (e) {
                        if (e instanceof DrizzleQueryError) {
                            log.error(`Drizzle error for card ${json.id} / ${json.name}:` + JSON.stringify({
                                cardId:   json.id,
                                cardName: json.name,
                                message:  e.message,
                                cause:    e.cause,
                            }));

                            if (e.cause instanceof DatabaseError) {
                                log.error('Database error details:' + JSON.stringify({
                                    code:             e.cause.code,
                                    detail:           e.cause.detail,
                                    hint:             e.cause.hint,
                                    position:         e.cause.position,
                                    internalPosition: e.cause.internalPosition,
                                    internalQuery:    e.cause.internalQuery,
                                    where:            e.cause.where,
                                    schema:           e.cause.schema,
                                    table:            e.cause.table,
                                    column:           e.cause.column,
                                    dataType:         e.cause.dataType,
                                    constraint:       e.cause.constraint,
                                }));
                            }
                        } else if (e instanceof Error) {
                            log.error(`Unknown error (${e.constructor.name}) for card ${json.id} / ${json.name}:` + JSON.stringify({
                                cardId:   json.id,
                                cardName: json.name,
                                message:  e.message,
                                stack:    e.stack,
                            }));
                        } else {
                            log.error(`Unexpected error for card ${json.id} / ${json.name}:` + JSON.stringify({
                                cardId:   json.id,
                                cardName: json.name,
                                error:    String(e),
                            }));
                        }

                        throw e;
                    }
                }
            });

            count += processedJsons.length;
        }

        log.info('============== MERGE CARD COMPLETE =============');
    }

    stopImpl(): void { /* no-op */ }
}
