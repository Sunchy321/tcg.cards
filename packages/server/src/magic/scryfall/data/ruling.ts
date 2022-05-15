import Task from '@/common/task';

import { Card as ICard } from '@interface/magic/card';
import { RawRuling } from '@interface/magic/scryfall/card';
import Card from '@/magic/db/card';

import LineReader from '@/common/line-reader';
import CardNameExtractor from '@/magic/extract-name';

import { Status } from '../status';

import { join } from 'path';
import { isEqual } from 'lodash';
import { convertJson, bulkPath } from './common';

type OldData = {
    cardId: string;
    names: string[];
    rulings: ICard['rulings'];
};

async function assignRuling(
    data: RawRuling[],
    oldData: OldData,
    cardNames: { id: string, name: string[] }[],
) {
    const rulings = data.map(r => {
        const cards = new CardNameExtractor({
            text:     r.comment,
            cardNames,
            thisName: { id: oldData.cardId, name: oldData.names },
        }).extract();

        return {
            source: r.source,
            date:   r.published_at,
            text:   r.comment,
            ...cards.length > 0 ? { cards } : {},
        } as ICard['rulings'][0];
    });

    if (!isEqual(oldData.rulings, rulings)) {
        await Card.updateMany({ cardId: oldData.cardId }, { rulings });
    }
}

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

        let method = 'load';
        let total = 0;
        let count = 0;

        // start timer
        let start = Date.now();

        this.intervalProgress(500, () => {
            const prog: Status = {
                method,
                type: 'ruling',

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

        const oldRulingMap: Record<string, OldData> = {};

        const dbData = await Card.aggregate([
            {
                $group: {
                    _id:     '$scryfall.oracleId',
                    cardId:  { $first: '$cardId' },
                    names:   { $first: '$parts.oracle.name' },
                    rulings: { $first: '$rulings' },
                },
            },
        ]);

        for (const data of dbData) {
            oldRulingMap[data._id] = {
                cardId:  data.cardId,
                names:   data.names,
                rulings: data.rulings,
            };
        }

        method = 'assign';
        total = Object.keys(rulingMap).length;
        count = 0;

        for (const [oracleId, data] of Object.entries(rulingMap)) {
            const oldData = oldRulingMap[oracleId];

            if (oldData == null) {
                continue;
            }

            await assignRuling(data, oldData, cardNames);

            count += 1;
        }
    }

    stopImpl(): void { /* no-op */ }
}
