import Task from '@/common/task';

import Card from '@/magic/db/card';
import Print from '@/magic/db/print';
import SCard from '@/magic/db/scryfall-card';
import Set from '@/magic/db/set';

import { RawCard } from '@interface/magic/scryfall/card';
import { Card as ICard } from '@interface/magic/card';
import { Print as IPrint } from '@interface/magic/print';

import { Status } from '../../status';

import { join } from 'path';
import { omit, uniq } from 'lodash';
import internalData from '@/internal-data';
import { toAsyncBucket } from '@/common/to-bucket';
import LineReader from '@/common/line-reader';
import { bulkPath, convertJson } from '../common';

import { toNSCard, RawCardNoArtSeries } from './to-ns-card';
import { splitDFT } from './split-dft';
import { toCard } from './to-card';
import { combineCard, mergeCard, mergePrint } from './merge';
import { ICardDatabase } from 'card-common/src/model/magic/card';
import { bulkUpdation } from '@/magic/logger';

const bucketSize = 500;

export default class CardLoader extends Task<Status> {
    file:       string;
    filePath:   string;
    lineReader: LineReader;

    init(fileName: string): void {
        this.file = fileName;
        this.filePath = join(bulkPath, `${fileName}.json`);
        this.lineReader = new LineReader(this.filePath);
    }

    async startImpl(): Promise<void> {
        bulkUpdation.info('================== MERGE CARD ==================');

        const frontCardSet = internalData<string[]>('magic.front-card-set');

        // initialize set code map
        const setCodeMap: Record<string, string> = {};

        const sets = await Set.find();

        for (const set of sets) {
            if (set.setId !== set.scryfall.code) {
                setCodeMap[set.scryfall.code] = set.setId;
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

        await SCard.deleteMany({});

        start = Date.now();

        for await (const jsons of toAsyncBucket(
            convertJson<RawCard>(this.lineReader.get()),
            bucketSize,
        )) {
            if (this.status === 'idle') {
                return;
            }

            await SCard.insertMany(jsons.map(json => ({
                ...omit(json, 'id'),
                card_id: json.id,
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

            const cards = await Card.find({ 'scryfall.oracleId': { $in: oracleIds } });
            const prints = await Print.find({ 'scryfall.cardId': { $in: jsons.map(j => j.id) } });

            const cardsToInsert: ICard[] = [];
            const printsToInsert: IPrint[] = [];

            for (const json of jsons) {
                if (json.layout === 'art_series' || frontCardSet.includes(json.set)) {
                    continue;
                }

                const cardPrints = splitDFT(toNSCard(json as RawCardNoArtSeries)).map(c => toCard(c, setCodeMap));

                const oldCards = cards.filter(c => {
                    if (json.oracle_id != null) {
                        return c.scryfall.oracleId.includes(json.oracle_id);
                    } else if (json.card_faces?.every(f => f.oracle_id === json.card_faces![0].oracle_id)) {
                        return c.scryfall.oracleId.includes(json.card_faces![0].oracle_id!);
                    } else {
                        throw new Error('Unknown oracle Id');
                    }
                });

                const oldPrints = prints.filter(p => p.scryfall.cardId === json.id
                  || (p.set === json.set && p.number === json.collector_number && p.lang === json.lang));

                if (cardPrints.length === 1) {
                    // a single card
                    if (oldCards.length === 0) {
                        cardsToInsert.push(...cardPrints.map(v => v.card));
                    } else if (oldCards.length === 1) {
                        await mergeCard(oldCards[0], cardPrints[0].card);
                    } else {
                        // Scryfall mowu is bugged. ignore.
                        if (json.id !== 'b10441dd-9029-4f95-9566-d3771ebd36bd') {
                            bulkUpdation.warn(`mismatch object count: ${json.id}`);
                        }
                    }

                    if (oldPrints.length === 0) {
                        printsToInsert.push(...cardPrints.map(v => v.print));
                    } else if (oldPrints.length === 1) {
                        await mergePrint(oldPrints[0], cardPrints[0].print);
                    } else {
                        // Scryfall mowu is bugged. ignore.
                        if (json.id === 'b10441dd-9029-4f95-9566-d3771ebd36bd') {
                            continue;
                        }

                        bulkUpdation.warn(`mismatch object count: ${json.id}`);
                    }
                } else if (cardPrints.length === 2) {
                    if (oldCards.length === 0) {
                        cardsToInsert.push(...cardPrints.map(c => c.card));
                    } else if (oldCards.length === 1 || oldCards.length === 2) {
                        for (const n of cardPrints) {
                            if (n.print.scryfall.face != null) {
                                const oldPrint = oldPrints.find(p => p.scryfall.face === n.print.scryfall.face);
                                const oldCard = oldCards.find(c => c.cardId === oldPrint?.cardId);

                                if (oldCard != null) {
                                    await mergeCard(oldCard, n.card);
                                } else {
                                    cardsToInsert.push(n.card);
                                }

                                if (oldPrint != null) {
                                    await mergePrint(oldPrint, n.print);
                                } else {
                                    printsToInsert.push(n.print);
                                }
                            } else {
                                // eslint-disable-next-line no-debugger
                                debugger;
                            }
                        }
                    } else {
                        bulkUpdation.warn(`mismatch object count: ${json.id}`);
                    }
                }

                count += 1;
            }

            for (const print of printsToInsert) {
                if (print.lang !== 'en') {
                    continue;
                }

                if (print.set === 'plst' || print.set === 'pagl') {
                    print.tags.push('dev:printed');
                    continue;
                }

                if (print.parts.some(p => /[(（)）]/.test(p.text ?? ''))) {
                    print.tags.push('dev:printed');
                    continue;
                }

                if (print.parts.some(p => p.flavorName != null)) {
                    print.tags.push('dev:printed');
                    continue;
                }
            }

            // process duplicate card in once process.
            const cardsToInsertIds = uniq(cardsToInsert.map(c => c.cardId));

            const cardsToInsertUniq = cardsToInsertIds.map(id => {
                const matchedCards = cardsToInsert.filter(c => c.cardId === id);

                const combineResult = matchedCards.map(c => ({
                    ...c,
                    parts:         c.parts.map(p => ({ ...p, __costMap: {} })),
                    __updations:   [],
                    __lockedPaths: [],
                }) as ICardDatabase).reduce((prev, curr) => {
                    combineCard(prev, curr);

                    return prev;
                });

                return omit({
                    ...combineResult,
                    parts: combineResult.parts.map(p => omit(p, '__costMap')),
                }, ['__updations', '__lockedPaths']) as ICard;
            });

            cardsToInsert.splice(0, cardsToInsert.length, ...cardsToInsertUniq);

            const dups = await Card.find({ cardId: { $in: cardsToInsert.map(c => c.cardId) } });

            for (const c of cardsToInsert) {
                if (dups.some(d => d.cardId === c.cardId)) {
                    c.cardId += `::dup${Math.round(Math.random() * 1000)}`;

                    for (const p of printsToInsert) {
                        if (c.scryfall.oracleId.includes(p.scryfall.oracleId)) {
                            p.cardId = c.cardId;
                        }
                    }
                }
            }

            await Card.insertMany(cardsToInsert);
            await Print.insertMany(printsToInsert);
        }

        bulkUpdation.info('============== MERGE CARD COMPLETE =============');
    }

    stopImpl(): void { /* no-op */ }
}
