import Task from '@/common/task';

import Card from '@/magic/db/card';
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
            game: 'magic',

            amount: { count, total },
        }));

        const cardToInsert: IIntergartedCard[] = [];

        await Card.find().cursor().eachAsync(async c => {
            const localization: IIntergartedCard['localization'] = [];

            for (const p of c.parts) {
                for (const l of p.localization) {
                    const loc = localization.find(lo => lo.lang === l.lang);

                    if (loc == null) {
                        localization.push({
                            lang:     l.lang,
                            name:     l.name,
                            typeline: l.typeline,
                            text:     l.text,
                        });
                    } else {
                        loc.name += ' // ' + l.name;
                        loc.typeline += ' // ' + l.typeline;
                        loc.text += '\n------------\n' + l.text;
                    }
                }
            }

            cardToInsert.push({
                cardId: c.cardId,

                game: 'magic',

                name:     c.parts.map(p => p.name).join(' // '),
                typeline: c.parts.map(p => p.typeline).join(' // '),
                text:     c.parts.map(p => p.text).join('\n------------\n'),

                localization,
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
