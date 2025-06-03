import Task from '@/common/task';

import Card from '@/yugioh/db/card';
import IntegratedCard from '@/integrated/db/card';

import { Card as IIntergartedCard } from '@interface/integrated/card';

import { GameStatus } from './index';

export class GameTask extends Task<GameStatus> {
    static async count(): Promise<number> {
        return await Card.count();
    }

    async startImpl() {
        let count = 0;
        const total = await GameTask.count();

        this.intervalProgress(200, () => ({
            game: 'yugioh',

            amount: { count, total },
        }));

        const cardToInsert: IIntergartedCard[] = [];

        await Card.find().cursor().eachAsync(async c => {
            const defaultLoc = c.localization.find(l => l.lang === 'ja')
              ?? c.localization.find(l => l.lang === 'en')
              ?? c.localization[0];

            cardToInsert.push({
                cardId: c.cardId,

                game: 'yugioh',

                name:     defaultLoc.name,
                typeline: defaultLoc.typeline,
                text:     defaultLoc.text,

                localization: c.localization,
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
