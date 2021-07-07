import Task from '@/common/task';

import ScryfallRuling, { IRuling as IScryfallRuling } from '../../db/scryfall/ruling';
import Card from '../../db/card';

import { IStatus } from '../interface';

import { cloneDeep } from 'lodash';

async function mergeWith(data: IScryfallRuling) {
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
    }

    stopImpl(): void { /* no-op */ }
}
