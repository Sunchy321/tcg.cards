import Task from '@/common/task';

import Card from '@/yugioh/db/card';
import Print from '@/yugioh/db/print';
// import Set from '@/yugioh/db/set';

import { File } from '@interface/yugioh/ygoprodeck/card';
import { Card as ICard } from '@interface/yugioh/card';
import { Print as IPrint } from '@interface/yugioh/print';

import { Status } from '../status';

import { readFileSync } from 'fs';
import { join } from 'path';
import { toBucket, toGenerator } from '@/common/to-bucket';
import { toCard } from './to-card';
import { mergeCard, mergePrint } from './merge';

import { dataPath } from '@/config';
import { bulkUpdation } from '@/lorcana/logger';

const bucketSize = 500;

export default class DataLoader extends Task<Status> {
    async startImpl(): Promise<void> {
        bulkUpdation.info('================ LOAD YGOPRODECK ================');

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

        const path = join(dataPath, 'yugioh', 'ygoprodeck.json');

        const json = JSON.parse(readFileSync(path).toString()) as File;

        type = 'card';
        total = json.data.length;
        count = 0;
        start = Date.now();

        for (const jsons of toBucket(toGenerator(json.data), bucketSize)) {
            if (this.status === 'idle') {
                return;
            }

            const cardPrints = jsons.map(json => toCard(json));

            const cardsToInsert: ICard[] = [];
            const printsToInsert: IPrint[] = [];

            const oldCards = await Card.find({ cardId: { $in: cardPrints.map(c => c.card.cardId) } });
            const oldPrints = await Print.find({ cardId: { $in: cardPrints.map(c => c.card.cardId) } });

            for (const cardPrint of cardPrints) {
                const { card, prints } = cardPrint;

                const oldCard = oldCards.find(c => c.cardId === card.cardId);

                if (oldCard == null) {
                    cardsToInsert.push(card);
                } else {
                    await mergeCard(oldCard, card);
                }

                for (const print of prints) {
                    const oldPrint = oldPrints.find(p => p.cardId === print.cardId && p.set === print.set && p.number === print.number);

                    if (oldPrint == null) {
                        printsToInsert.push(print);
                    } else {
                        await mergePrint(oldPrint, print);
                    }
                }

                count += 1;
            }

            await Card.insertMany(cardsToInsert);
            await Print.insertMany(printsToInsert);
        }

        bulkUpdation.info('=========== LOAD YGOPRODECK COMPLETE ===========');
    }

    stopImpl(): void { /* no-op */ }
}
