import { defineServerModel } from '../../src/model/server';
import { defineServerCommand, DBQuery, CommonServerCommand } from '../../src/command/server';

import { Model } from 'mongoose';

import { PostAction } from '../../src/model/type';
import { SearchOption } from '../../src/search';
import { QueryError } from '../../src/command/error';

import * as builtin from '../../src/command/builtin/server';

import { ICardDatabase } from '@common/model/lorcana/card';
import { IPrintDatabase } from '@common/model/lorcana/print';

import { isEmpty, mapKeys, pickBy } from 'lodash';

import { commands } from './index';

const raw = defineServerCommand({
    command: commands.raw,
    query:   ({ parameter }) => {
        // search mana
        if (typeof parameter === 'string' && /^(\{[^}]+\})+$/.test(parameter)) {
            return {
                $or: [
                    builtin.text.query({
                        key:       'card.text',
                        multiline: false,
                        parameter,
                        operator:  ':',
                        qualifier: [],
                    }),
                    builtin.text.query({
                        key:       'card.localization.text',
                        multiline: false,
                        parameter,
                        operator:  ':',
                        qualifier: [],
                    }),
                    builtin.text.query({
                        key:       'print.text',
                        multiline: false,
                        parameter,
                        operator:  ':',
                        qualifier: [],
                    }),
                ],
            };
        } else {
            return {
                $or: [
                    builtin.text.query({
                        key:       'card.name',
                        multiline: false,
                        parameter,
                        operator:  ':',
                        qualifier: [],
                    }),
                    builtin.text.query({
                        key:       'card.localization.name',
                        multiline: false,
                        parameter,
                        operator:  ':',
                        qualifier: [],
                    }),
                ],
            };
        }
    },
});

const stats = defineServerCommand({
    command: commands.stats,

    query({ pattern, operator, qualifier }) {
        if (pattern == null) {
            throw new QueryError({ type: 'invalid-query' });
        }

        if (operator === '' || operator === ':') {
            operator = '=';
        }

        const { strength, willPower } = pattern;

        if (qualifier?.includes('!')) {
            return {
                $or: [
                    builtin.number.query({
                        key:       'card.strength',
                        parameter: strength,
                        operator:  operator ?? '=',
                        qualifier,
                        meta:      { allowFloat: false },
                    }),
                    builtin.number.query({
                        key:       'card.willPower',
                        parameter: willPower,
                        operator:  operator ?? '=',
                        qualifier,
                        meta:      { allowFloat: false },
                    }),
                ],
            };
        } else {
            return {
                ...builtin.number.query({
                    key:       'card.strength',
                    parameter: strength,
                    operator:  operator ?? '=',
                    qualifier,
                    meta:      { allowFloat: false },
                }),
                ...builtin.number.query({
                    key:       'card.willPower',
                    parameter: willPower,
                    operator:  operator ?? '=',
                    qualifier,
                    meta:      { allowFloat: false },
                }),
            };
        }
    },
});

const fullStats = defineServerCommand({
    command: commands.fullStats,

    query({ pattern, operator, qualifier }) {
        if (pattern == null) {
            throw new QueryError({ type: 'invalid-query' });
        }

        if (operator === '' || operator === ':') {
            operator = '=';
        }

        const { cost, strength, willPower } = pattern;

        if (qualifier?.includes('!')) {
            return {
                $or: [
                    builtin.number.query({
                        key:       'card.cost',
                        parameter: cost,
                        operator:  operator ?? '=',
                        qualifier,
                        meta:      { allowFloat: false },
                    }),
                    builtin.number.query({
                        key:       'card.strength',
                        parameter: strength,
                        operator:  operator ?? '=',
                        qualifier,
                        meta:      { allowFloat: false },
                    }),
                    builtin.number.query({
                        key:       'card.willPower',
                        parameter: willPower,
                        operator:  operator ?? '=',
                        qualifier,
                        meta:      { allowFloat: false },
                    }),
                ],
            };
        } else {
            return {
                ...builtin.number.query({
                    key:       'card.cost',
                    parameter: cost,
                    operator:  operator ?? '=',
                    qualifier,
                    meta:      { allowFloat: false },
                }),
                ...builtin.number.query({
                    key:       'card.strength',
                    parameter: strength,
                    operator:  operator ?? '=',
                    qualifier,
                    meta:      { allowFloat: false },
                }),
                ...builtin.number.query({
                    key:       'card.willPower',
                    parameter: willPower,
                    operator:  operator ?? '=',
                    qualifier,
                    meta:      { allowFloat: false },
                }),
            };
        }
    },
});

const hash = defineServerCommand({
    command: commands.hash,
    query({ pattern, qualifier }) {
        if (pattern == null) {
            throw new QueryError({ type: 'invalid-query' });
        }

        const { tag } = pattern;

        if (!qualifier.includes('!')) {
            return {
                $or: [
                    { 'card.tags': tag },
                    { 'print.tags': tag },
                ],
            };
        } else {
            return {
                $and: [
                    { 'card.tags': { $ne: tag } },
                    { 'print.tags': { $ne: tag } },
                ],
            };
        }
    },
});

const set = builtin.simple(commands.set, { key: 'print.set' });
const num = builtin.simple(commands.num, { key: 'print.number' });
const lang = builtin.simple(commands.lang, { key: 'print.lang' });

const cost = builtin.number(commands.cost, { key: 'card.cost' });

const color = builtin.simpleSet(commands.color, { key: 'card.color' });

const lore = builtin.number(commands.lore, { key: 'card.lore' });
const strength = builtin.number(commands.strength, { key: 'card.strength' });
const willPower = builtin.number(commands.willPower, { key: 'card.willPower' });
const moveCost = builtin.number(commands.moveCost, { key: 'card.moveCost' });

const name = defineServerCommand({
    command: commands.name,
    query({
        modifier, parameter, operator, qualifier,
    }) {
        switch (modifier) {
        case 'unified':
            return builtin.text.query({
                key: 'card.localization.name', parameter, operator, qualifier,
            });
        case 'printed':
            return builtin.text.query({
                key: 'print.name', parameter, operator, qualifier,
            });
        default:
            return {
                [!qualifier.includes('!') ? '$or' : '$and']: [
                    builtin.text.query({
                        key: 'card.name', parameter, operator, qualifier,
                    }),
                    builtin.text.query({
                        key: 'card.localization.name', parameter, operator, qualifier,
                    }),
                    builtin.text.query({
                        key: 'print.name', parameter, operator, qualifier,
                    }),
                ],
            };
        }
    },
});

const type = defineServerCommand({
    command: commands.type,
    query({
        modifier, parameter, operator, qualifier,
    }) {
        switch (modifier) {
        case 'unified':
            return builtin.text.query({
                key: 'card.localization.typeline', parameter, operator, qualifier,
            });
        case 'printed':
            return builtin.text.query({
                key: 'print.typeline', parameter, operator, qualifier,
            });
        default:
            return {
                [!qualifier.includes('!') ? '$or' : '$and']: [
                    builtin.text.query({
                        key: 'card.localization.typeline', parameter, operator, qualifier,
                    }),
                    builtin.text.query({
                        key: 'print.typeline', parameter, operator, qualifier,
                    }),
                ],
            };
        }
    },
});

const text = defineServerCommand({
    command: commands.text,
    query({
        modifier, parameter, operator, qualifier,
    }) {
        switch (modifier) {
        case 'unified':
            return builtin.text.query({
                key: 'card.localization.text', parameter, operator, qualifier,
            });
        case 'printed':
            return builtin.text.query({
                key: 'print.text', parameter, operator, qualifier,
            });
        default:
            return {
                [!qualifier.includes('!') ? '$or' : '$and']: [
                    builtin.text.query({
                        key: 'card.localization.text', parameter, operator, qualifier,
                    }),
                    builtin.text.query({
                        key: 'print.text', parameter, operator, qualifier,
                    }),
                ],
            };
        }
    },
});

const flavorText = builtin.text(commands.flavorText, { key: 'print.flavorText' });
const layout = builtin.simple(commands.layout);

const rarity = defineServerCommand({
    command: commands.rarity,
    query:   ({ parameter, operator, qualifier }) => {
        const rarities = (
            {
                c: 'common',
                u: 'uncommon',
                r: 'rare',
                s: 'super_rare',
                l: 'legendary',
                e: 'enchanted',
            } as Record<string, string>
        )[parameter] ?? parameter;

        return builtin.simple.query({
            key: 'print.rarity', parameter: rarities, operator, qualifier,
        });
    },
});

const order = defineServerCommand({
    command: commands.order,
    query() {},
    phase:   'order',
    post:    ({ parameter }) => {
        parameter = parameter.toLowerCase();

        const [type, dir] = ((): [string, -1 | 1] => {
            if (parameter.endsWith('+')) {
                return [parameter.slice(0, -1), 1];
            }

            if (parameter.endsWith('-')) {
                return [parameter.slice(0, -1), -1];
            }

            return [parameter, 1];
        })();

        return agg => {
            switch (type) {
            case 'name':
                agg.sort({ 'card.name': dir });
                break;
            case 'set':
            case 'number':
                agg.sort({ 'print.set': 1, 'print.number': 1 });
                break;
            case 'date':
                agg.sort({ 'print.releaseDate': dir });
                break;
            case 'id':
                agg.sort({ 'card.cardId': dir });
                break;
            case 'cost':
                agg.sort({ 'card.cost': dir });
                break;
            default:
                throw new QueryError({ type: 'invalid-query' });
            }
        };
    },
});

const backedCommands: Record<string, CommonServerCommand> = {
    raw,
    stats,
    fullStats,
    hash,
    set,
    num,
    lang,
    cost,
    color,
    lore,
    strength,
    willPower,
    moveCost,
    name,
    type,
    text,
    flavorText,
    layout,
    rarity,
    order,
};

function parseOption(optionText: string | undefined, defaultValue: number): number {
    if (optionText == null) {
        return defaultValue;
    }

    const optionNumber = Number.parseInt(optionText, 10);

    if (Number.isNaN(optionNumber)) {
        return defaultValue;
    }

    return optionNumber;
}

type ServerModel = {
    card:  ICardDatabase;
    print: IPrintDatabase;
};

type ServerActions = {
    search:   { cards: ServerModel[], total: number, page: number };
    dev:      { cards: ServerModel[], total: number };
    searchId: string[];
};

export default defineServerModel<ServerActions, Model<ICardDatabase>>({
    commands: Object.values(backedCommands),

    actions: {
        search: async (gen, q: DBQuery, p: PostAction[], o: SearchOption) => {
            const groupBy = o['group-by'] ?? 'card';
            const orderBy = o['order-by'] ?? 'id+';
            const page = parseOption(o.page, 1);
            const pageSize = parseOption(o['page-size'], 100);
            const locale = o.locale ?? 'en';

            const start = Date.now();

            const cardQuery = pickBy(q, (v, k) => k.startsWith('card.'));
            const printQuery = mapKeys(pickBy(q, (v, k) => k.startsWith('print.')), (v, k) => k.replace(/^print\./, ''));

            const fullGen = <T>(justCount = false) => {
                const aggregate = gen<T>();

                aggregate
                    .collation({ locale: 'en', numericOrdering: true })
                    .allowDiskUse(true)
                    .unwind('localization')
                    .replaceRoot({ card: '$$ROOT' });

                if (!isEmpty(cardQuery)) {
                    aggregate.match(cardQuery);
                }

                aggregate
                    .addFields({
                        cardId: '$card.cardId',
                    })
                    .lookup({
                        from: 'prints',
                        let:  {
                            cardId: '$cardId',
                            lang:   '$card.localization.lang',
                        },
                        pipeline: [
                            ...isEmpty(printQuery) ? [] : [{ $match: printQuery }],
                            {
                                $match: {
                                    $expr: {
                                        $and: [
                                            { $eq: ['$cardId', '$$cardId'] },
                                            { $eq: ['$lang', '$$lang'] },
                                        ],
                                    },
                                },
                            },
                        ],
                        as: 'print',
                    })
                    .unwind('print')
                    .match(q);

                if (groupBy === 'card') {
                    if (!justCount) {
                        aggregate
                            .addFields({
                                langIsLocale:  { $eq: ['$print.lang', locale] },
                                langIsEnglish: { $eq: ['$print.lang', 'en'] },
                            })
                            .group({
                                _id:   '$cardId',
                                value: {
                                    $top: {
                                        sortBy: {
                                            'langIsLocale':      -1,
                                            'langIsEnglish':     -1,
                                            'print.releaseDate': -1,
                                            'print.number':      1,
                                        },

                                        output: '$$ROOT',
                                    },
                                } as any,
                            })
                            .replaceRoot('$value');
                    } else {
                        aggregate.group({ _id: '$cardId' });
                    }
                }

                return aggregate;
            };

            const aggregate = fullGen<ServerModel>();

            const total = (
                await fullGen<{ count: number }>(true)
                    .group({ _id: null, count: { $sum: 1 } })
            )[0]?.count ?? 0;

            const countElapsed = Date.now() - start;

            const orderAction = p.find(v => v.phase === 'order');

            if (orderAction != null) {
                orderAction.action(aggregate);
            } else {
                order.post!({ parameter: orderBy, operator: ':', qualifier: [] })(aggregate);
            }

            aggregate
                .skip((page - 1) * pageSize)
                .limit(pageSize)
                .project({
                    'card._id':           0,
                    'card.__v':           0,
                    'print.langIsLocale': 0,
                    'print.langIsEn':     0,
                });

            const explain = await aggregate.explain('executionStats');

            const cards = await aggregate;

            return {
                countElapsed,
                elapsed: Date.now() - start,
                total,
                page,
                explain,
                cards,
            };
        },

        dev: async (gen, q: DBQuery, p: PostAction[], o: SearchOption) => {
            const fullGen = <T>() => {
                const aggregate = gen<T>();

                aggregate
                    .allowDiskUse(true)
                    .unwind('print')
                    .match(q);

                return aggregate;
            };

            const total = (
                await fullGen<{ count: number }>()
                    .group({ _id: null, count: { $sum: 1 } })
            )[0]?.count ?? 0;

            const cards = await fullGen<ServerModel>()
                .sort({ 'card.cardId': 1 })
                .limit(o.sample);

            return {
                cards,
                total,
            };
        },

        searchId: async (generator, q: DBQuery) => {
            const result = await generator<{ _id: string }>()
                .allowDiskUse(true)
                .match(q)
                .group({ _id: '$cardId' });

            return result.map(v => v._id) as string[];
        },
    },
}, card => ({
    search: <V> () => card.aggregate<V>(),

    dev: <V>() => card.aggregate<V>()
        .replaceRoot({ card: '$$ROOT' })
        .lookup({
            from:         'prints',
            as:           'print',
            localField:   'card.cardId',
            foreignField: 'cardId',
        }),

    searchId: <V>() => card.aggregate<V>()
        .lookup({
            from:         'prints',
            as:           'print',
            localField:   'cardId',
            foreignField: 'cardId',
        }),
}));
