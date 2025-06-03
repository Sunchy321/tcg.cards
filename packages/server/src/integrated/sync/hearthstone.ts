import Task from '@/common/task';

import Entity from '@/hearthstone/db/entity';
import IntegratedCard from '@/integrated/db/card';

import { Card as IIntergartedCard } from '@interface/integrated/card';

import { GameStatus } from './index';
import internalData from '@/internal-data';

const filter = {
    isCurrent: true,
    type:      {
        $exists: true,
        $nin:    [
            'enchantment',
            'mercenary_ability',
            'move_minion_hover_target',
            'buddy_meter',
            'game_mode_button',
        ],
    },
};

export class GameTask extends Task<GameStatus> {
    static async count(): Promise<number> {
        return await Entity.count(filter);
    }

    async startImpl() {
        let count = 0;
        const total = await GameTask.count();

        this.intervalProgress(200, () => ({
            game: 'hearthstone',

            amount: { count, total },
        }));

        const typeLoc = internalData<Record<string, Record<string, string>>>('hearthstone.localization.type');

        const cardToInsert: IIntergartedCard[] = [];

        await Entity.find(filter).cursor().eachAsync(async c => {
            const enLoc = c.localization.find(l => l.lang === 'en')!;

            cardToInsert.push({
                cardId: c.cardId,

                game: 'hearthstone',

                name:     enLoc.name,
                typeline: typeLoc[c.type]['en'],
                text:     enLoc.text,

                localization: c.localization.map(l => ({
                    ...l,
                    typeline: typeLoc[c.type][l.lang],
                })),
            });

            if (cardToInsert.length > 500) {
                await IntegratedCard.insertMany(cardToInsert);
                cardToInsert.length = 0;

                count += 500;
            }
        });

        if (cardToInsert.length > 0) {
            await IntegratedCard.insertMany(cardToInsert);

            count += cardToInsert.length;
        }
    }

    stopImpl(): void { /* no-op */ }
}
