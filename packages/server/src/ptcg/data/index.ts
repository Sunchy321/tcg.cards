import Task from '@/common/task';

import Card from '@/ptcg/db/card';
import Print from '@/ptcg/db/print';
import Set from '@/ptcg/db/set';

import { Entry } from '@interface/ptcg/database/entry';
import { Card as ICard } from '@interface/ptcg/card';
import { Print as IPrint } from '@interface/ptcg/print';
import { WithUpdation } from '@common/model/updation';

import { Status } from '../status';

import { readFileSync } from 'fs';
import { join } from 'path';
import { omit, uniq } from 'lodash';
import internalData from '@/internal-data';
import { toBucket, toGenerator } from '@/common/to-bucket';
import { toCard } from './to-card';
import { combineCard, mergeCard, mergePrint } from './merge';

import { dataPath } from '@/config';
import { bulkUpdation } from '@/ptcg/logger';

const path = join(dataPath, 'ptcg', 'PTCG-database');

const bucketSize = 500;

export default class DataLoader extends Task<Status> {
    file:     string;
    filePath: string;

    async startImpl(): Promise<void> {
        bulkUpdation.info('=================== LOAD DATA ===================');

        let sets = await Set.find();

        let type = 'set';
        let total = 0;
        let count = 0;

        // start timer
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

        const data = JSON.parse(readFileSync(this.filePath).toString()) as Entry;

        const lang = data.lang;

        const map = lang === 'en' ? {} : internalData<Record<string, string>>(`ptcg.word-map.${lang}`);

        total = Object.keys(data.sets).length;

        for (const [setId, s] of Object.entries(data.sets)) {
            if (this.status === 'idle') {
                return;
            }

            const set = sets.find(s => s.ptcgJsonId === setId);

            if (set != null) {
                const loc = set.localization.find(l => l.lang === lang);

                if (loc != null) {
                    loc.name = s.name;
                } else {
                    set.localization.push({
                        lang,
                        name:           s.name,
                        isOfficialName: true,
                    });
                }

                await set.save();
            } else {
                const newSet = new Set({
                    setId,
                    number: s.number,

                    cardCount: 0,
                    langs:     [lang],
                    rarities:  [],

                    localization: [{
                        lang,
                        name:           s.name,
                        isOfficialName: true,
                    }],

                    type: s.type,

                    releaseDate:    s.releaseDate,
                    prereleaseDate: s.prereleaseDate,

                    ptcgJsonId: setId,
                });

                await Set.create(newSet);
            }

            count += 1;
        }

        sets = await Set.find();

        type = 'card';
        start = Date.now();
        total = data.cards.length;
        count = 0;

        for await (const jsons of toBucket(
            toGenerator(data.cards),
            bucketSize,
        )) {
            if (this.status === 'idle') {
                return;
            }

            const cards = await Card.find();
            const prints = await Print.find();

            const cardsToInsert: ICard[] = [];
            const printsToInsert: IPrint[] = [];

            for (const json of jsons) {
                const { card, print } = toCard(json, lang, sets, map);

                if (lang !== 'en') {
                    const enPrint = prints.find(p => p.code === print.code);

                    if (enPrint != null) {
                        card.cardId = enPrint.cardId;
                        print.cardId = enPrint.cardId;
                    }
                }

                if (card.cardId === 'vaiana____adventurer_of_land_and_sea') {
                    card.cardId = 'moana____adventurer_of_land_and_sea';
                }

                if (print.cardId === 'vaiana____adventurer_of_land_and_sea') {
                    print.cardId = 'moana____adventurer_of_land_and_sea';
                    print.number += '†';
                }

                const oldCard = cards.find(c => c.cardId === card.cardId);
                const oldPrint = prints.find(
                    p => p.cardId === print.cardId && p.lang === print.lang && p.set === print.set && p.number === print.number,
                );

                if (oldCard == null) {
                    cardsToInsert.push(card);
                } else {
                    await mergeCard(oldCard, card);
                }

                if (oldPrint == null) {
                    printsToInsert.push(print);
                } else {
                    await mergePrint(oldPrint, print);
                }

                count += 1;
            }

            // process duplicate card in once process.
            const cardsToInsertIds = uniq(cardsToInsert.map(c => c.cardId));

            const cardsToInsertUniq = cardsToInsertIds.map(id => {
                const matchedCards = cardsToInsert.filter(c => c.cardId === id);

                const combineResult = matchedCards.map(c => ({
                    ...c,
                    __updations:   [],
                    __lockedPaths: [],
                }) as WithUpdation<ICard>).reduce((prev, curr) => {
                    combineCard(prev, curr);

                    return prev;
                });

                return omit({
                    ...combineResult,
                }, ['__updations', '__lockedPaths']) as ICard;
            });

            cardsToInsert.splice(0, cardsToInsert.length, ...cardsToInsertUniq);

            const dups = await Card.find({ cardId: { $in: cardsToInsert.map(c => c.cardId) } });

            for (const c of cardsToInsert) {
                if (dups.some(d => d.cardId === c.cardId)) {
                    c.cardId += `::dup${Math.round(Math.random() * 1000)}`;
                }
            }

            await Card.insertMany(cardsToInsert);
            await Print.insertMany(printsToInsert);
        }

        bulkUpdation.info('============== LOAD DATA COMPLETE ==============');
    }

    stopImpl(): void { /* no-op */ }
}
