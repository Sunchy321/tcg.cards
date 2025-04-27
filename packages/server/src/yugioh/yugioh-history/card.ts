import Task from '@/common/task';

import Card from '@/yugioh/db/card';
// import Print from '@/yugioh/db/print';
// import Set from '@/yugioh/db/set';

import { Card as ICard } from '@interface/yugioh/card';

import { Status } from '../status';

import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import internalData from '@/internal-data';
import { toBucket, toGenerator } from '@/common/to-bucket';
import { toCard } from './to-card';
import { mergeCard } from './merge';

import { dataPath } from '@/config';
import { bulkUpdation } from '@/lorcana/logger';

const bucketSize = 500;

export default class DataLoader extends Task<Status> {
    async startImpl(): Promise<void> {
        bulkUpdation.info('=================== LOAD CARD ===================');

        let type = 'card';
        let total = 0;
        let count = 0;

        // start timer
        const start = Date.now();

        this.intervalProgress(500, () => {
            const prog: Status = {
                method: 'load',
                type,

                amount: { total, count },
            };

            const elapsed = Date.now() - start;

            prog.time = {
                elapsed,
                remaining: (elapsed / count) * (total - count),
            };

            return prog;
        });

        const path = join(dataPath, 'yugioh', 'yugioh-card-history');

        const langs = readdirSync(path);

        const langMap = internalData<Record<string, string>>(`yugioh.lang-map`);

        for (const l of langs) {
            const fullPath = join(path, l);

            const files = readdirSync(fullPath).filter(v => v.endsWith('.json'));

            const lang = langMap[l] ?? l;

            type = `card/${lang}`;
            total = files.length;

            for (const fileBucket of toBucket(toGenerator(files), bucketSize)) {
                if (this.status === 'idle') {
                    return;
                }

                const cards = fileBucket.map(f => {
                    const text = readFileSync(join(fullPath, f)).toString();

                    const json = JSON.parse(text);

                    return toCard(json, lang);
                });

                const cardsToInsert: ICard[] = [];

                const oldCards = await Card.find({ cardId: { $in: cards.map(c => c.cardId) } });

                for (const card of cards) {
                    const oldCard = oldCards.find(c => c.cardId === card.cardId);

                    if (oldCard == null) {
                        cardsToInsert.push(card);
                    } else {
                        await mergeCard(oldCard, card);
                    }
                }

                count += 1;
            }
        }

        bulkUpdation.info('============== LOAD CARD COMPLETE ==============');
    }

    stopImpl(): void { /* no-op */ }
}
