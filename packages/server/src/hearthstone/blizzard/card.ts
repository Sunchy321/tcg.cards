import Task from '@/common/task';

import Entity from '@/hearthstone/db/entity';
import { ICard } from '@interface/hearthstone/blizzard';

import blzApi from './api';
import Patch from '../db/patch';

interface ICardResponse {
    cards:     ICard[];
    cardCount: number;
    pageCount: number;
    page:      number;
}

interface ICardStatus {
    method: 'get';
    type:   'card';
    count:  number;
    total:  number;
}

export class CardGetter extends Task<ICardStatus> {
    async startImpl(): Promise<void> {
        let data: ICardResponse;
        let page = 1;

        let count = 0;
        let total = 0;

        this.intervalProgress(500, () => ({
            method: 'get',
            type:   'card',
            count,
            total,
        }));

        do {
            if (this.status === 'idle') {
                return;
            }

            data = await blzApi('/hearthstone/cards', {
                collectible: '0,1',
                page,
                pageSize:    200,
            });

            total = data.cardCount;

            const ids: number[] = [];

            for (const c of data.cards) {
                ids.push(c.id);
                if (c.parentId != null) { ids.push(c.parentId); }
                if (c.childIds != null) { ids.push(...c.childIds); }
            }

            const patches = await Patch.find().sort({ number: -1 });

            const entities = await Entity.find({ dbfId: { $in: ids }, version: patches[0].number });

            for (const c of data.cards) {
                const entity = entities.find(e => e.dbfId === c.id);

                if (entity == null) {
                    continue;
                }

                entity.slug = c.slug;

                // if (c.parentId != null) {
                //     const parent = entities.find(e => e.dbfId === c.parentId);

                //     if (parent != null) {
                //         entity.parentCard = parent.cardId;
                //     }
                // }

                // if (c.childIds != null) {
                //     entity.childrenCard = entities
                //         .filter(e => c.childIds?.includes(e.dbfId))
                //         .sort((a, b) => a.dbfId - b.dbfId)
                //         .map(c => c.cardId);
                // }

                await entity.save();

                count += 1;
            }

            page += 1;
        } while (data.pageCount !== data.page);
    }

    stopImpl(): void { /* no-op */ }
}
