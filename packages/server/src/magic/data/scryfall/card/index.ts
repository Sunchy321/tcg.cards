import Task from '@/common/task';

import { db } from '@/drizzle';
import { Card, CardLocalization, CardPart, CardPartLocalization } from '@/magic/schema/card';
import { Print, PrintPart } from '@/magic/schema/print';
import { Set } from '@/magic/schema/set';
import { Scryfall } from '@/magic/schema/scryfall';

import { Status } from '@model/magic/schema/data/status';
import { RawCard } from '@model/magic/schema/data/scryfall/card';

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
import { bulkUpdation } from '@/magic/logger';

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
        bulkUpdation.info('================== MERGE CARD ==================');

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

            await db.insert(Scryfall).values(jsons.map(j => ({
                cardId:     j.id,
                oracleId:   j.oracle_id,
                legalities: j.legalities,
            })));

            const oracleIds = [];

            for (const json of jsons) {
                if (json.oracle_id != null) {
                    oracleIds.push(json.oracle_id);
                }

                if (json.card_faces != null) {
                    for (const face of json.card_faces) {
                        if (face.oracle_id != null) {
                            oracleIds.push(face.oracle_id);
                        }
                    }
                }
            }

            for (const json of jsons) {
                if (json.layout === 'art_series' || frontCardSet.includes(json.set)) {
                    continue;
                }

                const cardPrints = splitDFT(toNSCard(json as RawCardNoArtSeries)).map(c => toCard(c, setCodeMap));

                for (const cp of cardPrints) {
                    await db.transaction(async tx => {
                        // update Card
                        const card = await tx.select()
                            .from(Card)
                            .where(sql`${cp.card.scryfallOracleId} = ANY(${Card.scryfallOracleId})`)
                            .then(rows => rows[0]);

                        if (card == null) {
                            await tx.insert(Card).values(cp.card);
                        } else {
                            await mergeCard(card, cp.card);

                            await tx.update(Card).set(card).where(eq(Card.cardId, card.cardId));
                        }

                        // update CardLocalization
                        const cardLocalization = await tx.select()
                            .from(CardLocalization)
                            .where(and(
                                eq(CardLocalization.cardId, cp.print.cardId),
                                eq(CardLocalization.lang, cp.print.lang),
                            ))
                            .then(rows => rows[0]);

                        let updateActivated: boolean;

                        if (cardLocalization == null) {
                            await tx.insert(CardLocalization).values(cp.cardLocalization);

                            updateActivated = true;
                        } else {
                            if (cardLocalization.lang == 'en' || cardLocalization.__lastDate < cp.cardLocalization.__lastDate) {
                                mergeCardLocalization(cardLocalization, cp.cardLocalization);

                                await tx.update(CardLocalization).set(cardLocalization).where(and(
                                    eq(CardLocalization.cardId, cardLocalization.cardId),
                                    eq(CardLocalization.lang, cardLocalization.lang),
                                ));

                                updateActivated = true;
                            } else {
                                updateActivated = false;
                            }
                        }

                        // update CardPart
                        for (const part of cp.cardPart) {
                            const cardPart = await tx.select()
                                .from(CardPart)
                                .where(eq(CardPart.cardId, part.cardId))
                                .then(rows => rows[0]);

                            if (cardPart == null) {
                                await tx.insert(CardPart).values(part);
                            } else {
                                mergeCardPart(cardPart, part);

                                await tx.update(CardPart).set(cardPart).where(eq(CardPart.cardId, cardPart.cardId));
                            }
                        }

                        // update CardPartLocalization
                        for (const loc of cp.cardPartLocalization) {
                            const cardPartLocalization = await tx.select()
                                .from(CardPartLocalization)
                                .where(and(
                                    eq(CardPartLocalization.cardId, loc.cardId),
                                    eq(CardPartLocalization.partIndex, loc.partIndex),
                                    eq(CardPartLocalization.lang, loc.lang),
                                ))
                                .then(rows => rows[0]);

                            if (cardPartLocalization == null) {
                                await tx.insert(CardPartLocalization).values(loc);
                            } else {
                                if (updateActivated) {
                                    mergeCardPartLocalization(cardPartLocalization, loc);

                                    await tx.update(CardPartLocalization).set(cardPartLocalization).where(and(
                                        eq(CardPartLocalization.cardId, cardPartLocalization.cardId),
                                        eq(CardPartLocalization.partIndex, cardPartLocalization.partIndex),
                                        eq(CardPartLocalization.lang, cardPartLocalization.lang),
                                    ));
                                }
                            }
                        }

                        // update Print
                        const print = await tx.select()
                            .from(Print)
                            .where(and(
                                eq(Print.cardId, cp.print.cardId),
                                eq(Print.set, cp.print.set),
                                eq(Print.number, cp.print.number),
                                eq(Print.lang, cp.print.lang),
                            ))
                            .then(rows => rows[0]);

                        if (print == null) {
                            if (cp.print.lang === 'en') {
                                cp.print.printTags.push('dev:printed');
                            }

                            await tx.insert(Print).values(cp.print);
                        } else {
                            await mergePrint(print, cp.print);

                            await tx.update(Print).set(print).where(and(
                                eq(Print.cardId, cp.print.cardId),
                                eq(Print.set, cp.print.set),
                                eq(Print.number, cp.print.number),
                                eq(Print.lang, cp.print.lang),
                            ));
                        }

                        // update PrintPart
                        for (const part of cp.printPart) {
                            const printPart = await tx.select()
                                .from(PrintPart)
                                .where(and(
                                    eq(PrintPart.cardId, part.cardId),
                                    eq(PrintPart.set, part.set),
                                    eq(PrintPart.number, part.number),
                                    eq(PrintPart.partIndex, part.partIndex),
                                ))
                                .then(rows => rows[0]);

                            if (printPart == null) {
                                await tx.insert(PrintPart).values(part);
                            } else {
                                mergePrintPart(printPart, part);

                                await tx.update(PrintPart).set(printPart).where(and(
                                    eq(PrintPart.cardId, printPart.cardId),
                                    eq(PrintPart.set, printPart.set),
                                    eq(PrintPart.number, printPart.number),
                                    eq(PrintPart.partIndex, printPart.partIndex),
                                ));
                            }
                        }
                    });
                }

                count += 1;
            }
        }

        bulkUpdation.info('============== MERGE CARD COMPLETE =============');
    }

    stopImpl(): void { /* no-op */ }
}
