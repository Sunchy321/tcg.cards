import Task from '@/common/task';

import Card from '@/yugioh/db/card';

import { Status } from '../../status';

import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
import internalData from '@/internal-data';
import { toBucket, toGenerator } from '@/common/to-bucket';
import { toCard } from './to-card';
import { mergeCard } from '../merge';

import { dataPath } from '@/config';
import { bulkUpdation } from '@/yugioh/logger';

const bucketSize = 500;

export default class DataLoader extends Task<Status> {
    async startImpl(): Promise<void> {
        bulkUpdation.info('=================== LOAD CARD ===================');

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

        const path = join(dataPath, 'yugioh', 'yugioh-card-history');

        const langs = readdirSync(path).filter(l =>
            !l.startsWith('.')
            && statSync(join(path, l)).isDirectory(),
        ).sort((a, b) => a === 'en' ? -1 : b === 'en' ? 1 : 0);

        const langMap = internalData<Record<string, string>>(`yugioh.lang-map`);

        for (const l of langs) {
            const fullPath = join(path, l);

            const files = readdirSync(fullPath).filter(v => v.endsWith('.json'));

            const lang = langMap[l] ?? l;

            type = `card/${lang}`;
            total = files.length;
            count = 0;
            start = Date.now();

            for (const fileBucket of toBucket(toGenerator(files), bucketSize)) {
                if (this.status === 'idle') {
                    return;
                }

                const cards = fileBucket.map(f => {
                    const text = readFileSync(join(fullPath, f)).toString();

                    const json = JSON.parse(text);

                    return toCard(json, lang);
                });

                const oldCards = lang === 'en'
                    ? await Card.find({ 'localization.name': { $in: cards.map(c => c.localization[0].name) } })
                    : await Card.find({ code: { $in: cards.map(c => c.code) } });

                for (const card of cards) {
                    const oldCard = lang === 'en'
                        ? oldCards.find(c => c.localization.find(l => l.lang === 'en')?.name === card.localization[0].name)
                        : oldCards.find(c => c.code === card.code);

                    if (oldCard == null) {
                        bulkUpdation.error(`Unknown card: ${card.code} (${card.localization[0].name})`);
                    } else {
                        card.cardId = oldCard.cardId;
                        card.type = oldCard.type;
                        card.race = oldCard.race;

                        await mergeCard(oldCard, card);
                    }

                    count += 1;
                }
            }
        }

        bulkUpdation.info('============== LOAD CARD COMPLETE ==============');
    }

    stopImpl(): void { /* no-op */ }
}
