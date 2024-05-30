/* eslint-disable camelcase */
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
import { omit } from 'lodash';
import { toAsyncBucket } from '@/common/to-bucket';
import LineReader from '@/common/line-reader';
import { bulkPath, convertJson } from '../common';

import { toNSCard, RawCardNoArtSeries } from './to-ns-card';
import { splitDFT } from './split-dft';
import { toCard } from './to-card';
import { mergeCard, mergePrint } from './merge';

const bucketSize = 500;

export default class CardLoader extends Task<Status> {
    file: string;
    filePath: string;
    lineReader: LineReader;

    init(fileName: string): void {
        this.file = fileName;
        this.filePath = join(bulkPath, `${fileName}.json`);
        this.lineReader = new LineReader(this.filePath);
    }

    async startImpl(): Promise<void> {
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

            const cards = await Card.find({ 'scryfall.oracle': { $in: jsons.map(j => j.oracle_id) } });
            const prints = await Print.find({ 'scryfall.cardId': { $in: jsons.map(j => j.id) } });

            const cardsToInsert: ICard[] = [];
            const printsToInsert: IPrint[] = [];

            for (const json of jsons) {
                if (json.layout === 'art_series') {
                    continue;
                }

                const cardPrints = splitDFT(toNSCard(json as RawCardNoArtSeries)).map(c => toCard(c, setCodeMap));

                const oldCards = cards.filter(c => c.scryfall.oracleId.includes(json.oracle_id));

                const oldPrints = prints.filter(p => p.scryfall.cardId === json.id
                    || (p.set === json.set && p.number === json.collector_number && p.lang === json.lang));

                if (cardPrints.length === 1) {
                    // a single card
                    if (oldCards.length === 0) {
                        cardsToInsert.push(...cardPrints.map(v => v.card));
                    } else if (oldCards.length === 1) {
                        mergeCard(oldCards[0], cardPrints[0].card);
                    } else {
                        // Scryfall mowu is bugged. ignore.
                        if (json.id !== 'b10441dd-9029-4f95-9566-d3771ebd36bd') {
                            console.log(`mismatch object count: ${json.id}`);
                        }
                    }

                    if (oldPrints.length === 0) {
                        printsToInsert.push(...cardPrints.map(v => v.print));
                    } else if (oldPrints.length === 1) {
                        mergePrint(oldPrints[0], cardPrints[0].print);
                    } else {
                        // Scryfall mowu is bugged. ignore.
                        if (json.id === 'b10441dd-9029-4f95-9566-d3771ebd36bd') {
                            continue;
                        }

                        console.log(`mismatch object count: ${json.id}`);
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
                                    mergeCard(oldCard, n.card);
                                } else {
                                    cardsToInsert.push(n.card);
                                }

                                if (oldPrint != null) {
                                    mergePrint(oldPrint, n.print);
                                } else {
                                    printsToInsert.push(n.print);
                                }
                            } else {
                                // eslint-disable-next-line no-debugger
                                debugger;
                            }
                        }
                    } else {
                        console.log(`mismatch object count: ${json.id}`);
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
                }
            }

            await Card.insertMany(cardsToInsert);
            await Print.insertMany(printsToInsert);
        }
    }

    stopImpl(): void { /* no-op */ }
}
