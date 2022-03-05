import Task from '@/common/task';

import { RawRuling } from '@interface/magic/scryfall/card';
import Card from '@/magic/db/card';

import LineReader from '@/common/line-reader';

import { Status } from '../status';

import { join } from 'path';
import { cloneDeep } from 'lodash';
import { toAsyncBucket } from '@/common/to-bucket';
import { convertJson, bulkPath } from './common';

async function mergeWith(data: RawRuling) {
    const card = await Card.findOne({ 'scryfall.oracleId': data.oracle_id });

    if (card == null) {
        return;
    }

    const rulings = cloneDeep(card.rulings);

    if (rulings.some(r => r.source === data.source && r.date === data.published_at && r.text === data.comment)) {
        return;
    }

    rulings.push({
        source: data.source,
        date:   data.published_at,
        text:   data.comment,
    });

    await Card.updateMany({ cardId: card.cardId }, { rulings });
}

const bucketSize = 500;

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

        for await (const rulings of toAsyncBucket(
            convertJson<RawRuling>(this.lineReader.get()),
            bucketSize,
        )) {
            if (this.status === 'idle') {
                return;
            }

            // eslint-disable-next-line no-loop-func
            await Promise.all(rulings.map(async r => {
                await mergeWith(r);

                count += 1;
            }));
        }
    }

    stopImpl(): void { /* no-op */ }
}
