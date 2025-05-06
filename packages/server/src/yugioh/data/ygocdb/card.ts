import Task from '@/common/task';

import Card from '@/yugioh/db/card';

import { File } from '@interface/yugioh/ygocdb/card';
import { Card as ICard } from '@interface/yugioh/card';

import { Status } from '../../status';

import { readFileSync } from 'fs';
import { join } from 'path';
import { toBucket, toGenerator } from '@/common/to-bucket';
import { toCard } from './to-card';
import { mergeCard } from './merge';

import { dataPath } from '@/config';
import { bulkUpdation } from '@/yugioh/logger';

const bucketSize = 500;

export default class DataLoader extends Task<Status> {
    async startImpl(): Promise<void> {
        bulkUpdation.info('================== LOAD YGOCDB ==================');

        let type = 'card';
        let total = 0;
        let count = 0;
        let start = Date.now();

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

        const path = join(dataPath, 'yugioh', 'ygocdb.json');

        const json = JSON.parse(readFileSync(path).toString()) as File;

        type = 'card';
        total = Object.values(json).length;
        count = 0;
        start = Date.now();

        for (const jsons of toBucket(toGenerator(Object.values(json)), bucketSize)) {
            if (this.status === 'idle') {
                return;
            }

            const cards = jsons.map(json => toCard(json));

            const cardsToInsert: ICard[] = [];

            const oldCards = await Card.find({ cardId: { $in: cards.map(c => c.cardId) } });

            for (const card of cards) {
                const oldCard = oldCards.find(c => c.cardId === card.cardId);

                if (oldCard == null) {
                    bulkUpdation.error(`Card ${card.cardId} not found in database`);
                } else {
                    await mergeCard(oldCard, card);
                }

                count += 1;
            }

            await Card.insertMany(cardsToInsert);
        }

        bulkUpdation.info('============= LOAD YGOCDB COMPLETE =============');
    }

    stopImpl(): void { /* no-op */ }
}
