/* eslint-disable camelcase */
import Task from '@/common/task';

import Card, { ICard } from '@/magic/db/card-temp';
import SCard from '@/magic/db/scryfall-card';
import Set from '@/magic/db/set';

import { RawCard } from '@interface/magic/scryfall/card';

import { Status } from '../../status';

import { join } from 'path';
import { omit } from 'lodash';
import { toAsyncBucket } from '@/common/to-bucket';
import LineReader from '@/common/line-reader';
import { bulkPath, convertJson } from '../common';

import { toNSCard, RawCardNoArtSeries } from './to-ns-card';
import { splitDFT } from './split-dft';
import { toCard } from './to-card';
import { merge } from './merge';

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

            const cards = await Card.find({ 'scryfall.cardId': { $in: jsons.map(j => j.id) } });

            const cardsToInsert: ICard[] = [];

            for (const json of jsons) {
                if (json.layout === 'art_series') {
                    continue;
                }

                const newCards = splitDFT(toNSCard(json as RawCardNoArtSeries));

                const oldCards = cards.filter(c => c.scryfall.cardId === json.id
                    || (c.set === json.set && c.number === json.collector_number && c.lang === json.lang));

                if (newCards.length === 1) {
                    // a single card
                    if (oldCards.length === 0) {
                        cardsToInsert.push(...newCards.map(c => toCard(c, setCodeMap)));
                    } else if (oldCards.length === 1) {
                        merge(oldCards[0], toCard(newCards[0], setCodeMap));
                    } else {
                        // Scryfall mowu is bugged. ignore.
                        if (newCards[0].id === 'b10441dd-9029-4f95-9566-d3771ebd36bd') {
                            continue;
                        }

                        console.log(`mismatch object count: ${newCards[0].id}`);
                    }
                } else if (newCards.length === 2) {
                    if (oldCards.length === 0) {
                        cardsToInsert.push(...newCards.map(c => toCard(c, setCodeMap)));
                    } else if (oldCards.length === 1 || oldCards.length === 2) {
                        for (const n of newCards) {
                            if (n.face != null) {
                                const old = oldCards.find(c => c.scryfall.face === n.face);

                                if (old != null) {
                                    merge(old, toCard(n, setCodeMap));
                                } else {
                                    cardsToInsert.push(toCard(n, setCodeMap));
                                }
                            } else {
                                // eslint-disable-next-line no-debugger
                                debugger;
                            }
                        }
                    } else {
                        console.log(`mismatch object count: ${newCards[0].id}, ${newCards[1].id}`);
                    }
                }

                count += 1;
            }

            for (const card of cardsToInsert) {
                if (card.lang !== 'en') {
                    continue;
                }

                if (card.set === 'plst' || card.set === 'pagl') {
                    card.localTags.push('dev:printed');
                    continue;
                }

                if (card.parts.some(p => /[(（)）]/.test(p.oracle.text ?? '')
                    || /[(（)）]/.test(p.printed.text ?? ''))
                ) {
                    card.localTags.push('dev:printed');
                }
            }

            await Card.insertMany(cardsToInsert);
        }
    }

    stopImpl(): void { /* no-op */ }
}
