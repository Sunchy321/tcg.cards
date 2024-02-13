import Task from '@/common/task';

import Set from '@/magic/db/set';

import { Booster as IBooster } from '@interface/magic/set';
import { Set as MTGJSONSet } from '@interface/magic/mtgjson';

import * as fs from 'fs';
import { join } from 'path';

import internalData from '@/internal-data';

import { toIdentifier } from '@/magic/util';
import sorter from '@common/util/sorter';
import { kebabCase } from 'lodash';

import { dataPath } from '@/config';

interface Status {
    method: 'fix' | 'load';

    amount: {
        total: number;
        count: number;
    };

    time: {
        elapsed: number;
        remaining: number;
    };
}

const bulkPath = join(dataPath, 'magic/mtgjson');

const setPath = join(bulkPath, 'set');

const boosterIdMap: Record<string, string> = {
    default: 'draft',
    jp:      'draft-jp',
};

export default class SetLoader extends Task<Status> {
    async startImpl(): Promise<void> {
        const files = fs.readdirSync(setPath).filter(f => f.endsWith('.json'));

        const boosterOrder = internalData<string[]>('magic.booster.booster-order');
        const typeOrder = internalData<string[]>('magic.booster.type-order');

        let method: Status['method'] = 'load';
        let total = files.length;
        let count = 0;
        let start = Date.now();

        this.intervalProgress(500, () => {
            const elapsed = Date.now() - start;

            return {
                method,

                amount: { total, count },

                time: {
                    elapsed,
                    remaining: (elapsed / count) * (total - count),
                },
            };
        });

        for (const file of files) {
            const json = JSON.parse(fs.readFileSync(join(setPath, file), 'utf8')).data as MTGJSONSet;

            const set = await Set.findOne({ setId: json.code.toLowerCase() });

            if (set == null) {
                count += 1;
                continue;
            }

            if (json.booster != null) {
                set.boosters = Object.entries(json.booster).map(([boosterId, booster]) => ({
                    boosterId: boosterIdMap[kebabCase(boosterId)] ?? kebabCase(boosterId),

                    packs: booster.boosters.map(({ contents, weight }) => ({
                        contents: Object.entries(contents)
                            .map(([type, itemCount]) => ({ type: kebabCase(type), count: itemCount }))
                            .sort(sorter.pick('type', sorter.arrayIndex(typeOrder).or(sorter.string))),
                        weight,
                    })).sort(sorter.reverse(sorter.pick('weight', sorter.number))),

                    totalWeight: booster.boostersTotalWeight,

                    sheets: Object.entries(booster.sheets).map(([typeId, sheet]) => ({
                        typeId: kebabCase(typeId),

                        cards: Object.entries(sheet.cards).map(([uuid, weight]) => {
                            const card = json.cards.find(c => c.uuid === uuid);

                            if (card == null) {
                                return {
                                    cardId:  uuid,
                                    version: { set: '#fix', number: '#fix' },
                                    weight,
                                };
                            }

                            return {
                                cardId:  toIdentifier(card.name),
                                version: { set: card.setCode.toLowerCase(), number: card.number },
                                weight,
                            };
                        }),

                        totalWeight: sheet.totalWeight,

                        allowDuplicates: sheet.allowDuplicates,
                        balanceColors:   sheet.balanceColors,
                        isFoil:          sheet.foil,
                        isFixed:         sheet.fixed,
                    })).sort(sorter.pick('typeId', sorter.arrayIndex(typeOrder).or(sorter.string))),
                })).sort(
                    sorter.pick<IBooster, 'boosterId'>('boosterId', sorter.arrayIndex(boosterOrder))
                        .or(sorter.map<IBooster, number>(b => b.packs.reduce((a, c) => a + c.weight, 0), sorter.reverse(sorter.number))),
                );
            }

            await set.save();

            count += 1;
        }

        const sets = await Set.find({ 'boosters.sheets.cards.version.set': '#fix' });

        const fixCards: string[] = [];

        for (const s of sets) {
            if (s.boosters == null) {
                continue;
            }

            for (const b of s.boosters) {
                for (const sh of b.sheets) {
                    for (const c of sh.cards) {
                        if (c.version.set === '#fix' && !fixCards.includes(c.cardId)) {
                            fixCards.push(c.cardId);
                        }
                    }
                }
            }
        }

        method = 'fix';
        total = Object.keys(fixCards).length;
        count = 0;
        start = Date.now();

        for (const file of files) {
            const json = JSON.parse(fs.readFileSync(join(setPath, file), 'utf8')).data as MTGJSONSet;

            for (const card of json.cards) {
                if (!fixCards.includes(card.uuid)) {
                    continue;
                }

                await Set.updateMany({ 'boosters.sheets.cards.cardId': card.uuid }, {
                    $set: {
                        'boosters.$[].sheets.$[].cards.$[card].cardId':         toIdentifier(card.name),
                        'boosters.$[].sheets.$[].cards.$[card].version.set':    card.setCode.toLowerCase(),
                        'boosters.$[].sheets.$[].cards.$[card].version.number': card.number,
                    },
                }, {
                    arrayFilters: [{
                        'card.cardId': card.uuid,
                    }],
                });

                count += 1;
            }
        }
    }

    stopImpl(): void { /* no-op */ }
}
