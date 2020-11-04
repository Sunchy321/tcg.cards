import { ProgressHandler } from '@/common/progress';

import ScryfallRuling, { IRuling as IScryfallRuling } from '../../db/scryfall/ruling';
import Card, { ICard } from '../../db/card';

import { IStatus } from '../interface';

async function mergeWith(data: IScryfallRuling) {
    // TODO
}

export class RulingMerger extends ProgressHandler<IStatus> {
    async action(): Promise<void> {
        let count = 0;

        const total = await ScryfallRuling.estimatedDocumentCount();

        const start = Date.now();

        await ScryfallRuling.find({}).cursor().eachAsync(async r => {
            await mergeWith(r);

            ++count;

            const elapsed = Date.now() - start;

            this.emitProgress({
                method: 'merge',
                type:   'set',

                amount: {
                    total,
                    count,
                },

                time: {
                    elapsed,
                    remaining: elapsed / count * (total - count),
                },
            });
        });
    }

    abort(): void {
        // TODO
    }

    equals(): boolean { return true; }
}
