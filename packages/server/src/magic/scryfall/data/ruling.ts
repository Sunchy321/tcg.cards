import Task from '@/common/task';

import { Card as ICard } from '@interface/magic/card';
import { RawRuling } from '@interface/magic/scryfall/card';
import Card from '@/magic/db/card';

import LineReader from '@/common/line-reader';
import CardNameExtractor from '@/magic/extract-name';

import { Status } from '../status';

import { join } from 'path';
import { chunk } from 'lodash';
import { convertJson, bulkPath } from './common';

async function assignRuling(id: string, data: RawRuling[], cardNames: { id: string, name: string[] }[]) {
    const card = await Card.findOne({ 'scryfall.oracleId': id });

    if (card == null) {
        return;
    }

    const rulings = data.map(r => {
        const cards = new CardNameExtractor({
            text:     r.comment,
            cardNames,
            thisName: { id: card.cardId, name: card.parts.map(p => p.oracle.name) },
        }).extract();

        return {
            source: r.source,
            date:   r.published_at,
            text:   r.comment,
            cards,
        } as ICard['rulings'][0];
    });

    await Card.updateMany({ cardId: card.cardId }, { rulings });
}

const chunkSize = 20;

export default class RulingLoader extends Task<Status> {
    file: string;
    filePath: string;
    lineReader: LineReader;

    init(fileName: string): void {
        this.file = fileName;
        this.filePath = join(bulkPath, `${fileName}.json`);
        this.lineReader = new LineReader(this.filePath);
    }

    async startImpl(): Promise<void> {
        const cardNames = await CardNameExtractor.names();

        let total = 0;
        let count = 0;

        // start timer
        let start = Date.now();

        this.intervalProgress(500, () => {
            const prog: Status = {
                method: 'load',
                type:   'ruling',

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

        start = Date.now();

        const rulingMap: Record<string, RawRuling[]> = {};

        for await (const ruling of convertJson<RawRuling>(this.lineReader.get())) {
            if (rulingMap[ruling.oracle_id] == null) {
                rulingMap[ruling.oracle_id] = [];
            }

            rulingMap[ruling.oracle_id].push(ruling);

            count += 1;
        }

        total = Object.keys(rulingMap).length;
        count = 0;

        for (const pairs of chunk(Object.entries(rulingMap), chunkSize)) {
            // eslint-disable-next-line no-loop-func
            await Promise.all(pairs.map(async ([id, data]) => {
                await assignRuling(id, data, cardNames);

                count += 1;
            }));
        }
    }

    stopImpl(): void { /* no-op */ }
}
