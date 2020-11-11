import Task from '@/common/task';

import ScryfallRuling, { IRuling as IScryfallRuling } from '../../db/scryfall/ruling';
import Card, { ICard } from '../../db/card';

import { IStatus } from '../interface';

async function mergeWith(data: IScryfallRuling) {
    // TODO
}

export class RulingMerger extends Task<IStatus> {
    async startImpl(): Promise<void> {
        let count = 0;

        const total = await ScryfallRuling.estimatedDocumentCount();

        const start = Date.now();

        for await (const ruling of await ScryfallRuling.find()) {
            if (this.status === 'idle') {
                return;
            }

            await mergeWith(ruling);

            ++count;

            const elapsed = Date.now() - start;

            this.emit('progress', {
                method: 'merge',
                type:   'ruling',

                amount: {
                    total,
                    count,
                },

                time: {
                    elapsed,
                    remaining: elapsed / count * (total - count),
                },
            });
        }

        this.emit('end');
    }

    stopImpl(): void { /* no-op */ }
}
