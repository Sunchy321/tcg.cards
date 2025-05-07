import { defineServerModel } from '../../src/model/server';
import { defineServerCommand, DBQuery, CommonServerCommand } from '../../src/command/server';

import { Model } from 'mongoose';

import { PostAction } from '../../src/model/type';
import { SearchOption } from '../../src/search';
import { QueryError } from '../../src/command/error';

import { ICardDatabase } from '@common/model/magic/card';
import { IPrintDatabase } from '@common/model/magic/print';

import * as builtin from '../../src/command/builtin/server';
import * as magic from './command/server';

import { isEmpty, mapKeys, pickBy } from 'lodash';
import { toIdentifier } from '@common/util/id';

import { commands } from './index';

const raw = defineServerCommand({
    command: commands.raw,
    query:   ({ parameter }) => {
        // search mana
        if (typeof parameter === 'string' && /^(\{[^}]+\})+$/.test(parameter)) {
            return {
                $or: [
                    builtin.text.query({
                        key:       'card.parts.text',
                        multiline: false,
                        parameter,
                        operator:  ':',
                        qualifier: [],
                    }),
                    builtin.text.query({
                        key:       'card.parts.localization.text',
                        multiline: false,
                        parameter,
                        operator:  ':',
                        qualifier: [],
                    }),
                    magic.cost.query({
                        key:       'card.parts.cost',
                        parameter,
                        operator:  ':',
                        qualifier: [] as '!'[],
                    }),
                ],
            };
        } else {
            return {
                $or: [
                    builtin.text.query({
                        key:       'card.parts.name',
                        multiline: false,
                        parameter,
                        operator:  ':',
                        qualifier: [],
                    }),
                    builtin.text.query({
                        key:       'card.parts.localization.name',
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

        if (operator === '') {
            operator = '=';
        }

        const { power, toughness } = pattern;

        if (qualifier?.includes('!')) {
            return {
                $or: [
                    magic.halfNumber.query({
                        key:       'card.parts.power',
                        parameter: power,
                        operator:  operator ?? '=',
                        qualifier,
                    }),
                    magic.halfNumber.query({
                        key:       'card.parts.toughness',
                        parameter: toughness,
                        operator:  operator ?? '=',
                        qualifier,
                    }),
                ],
            };
        } else {
            return {
                ...magic.halfNumber.query({
                    key:       'card.parts.power',
                    parameter: power,
                    operator:  operator ?? '=',
                    qualifier: qualifier ?? [],
                }),
                ...magic.halfNumber.query({
                    key:       'card.parts.toughness',
                    parameter: toughness,
                    operator:  operator ?? '=',
                    qualifier: qualifier ?? [],
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

const cost = magic.cost(commands.cost, { key: 'card.parts.cost' });
const manaValue = builtin.number(commands.manaValue, { key: 'card.manaValue' });

const color = magic.color(commands.color, { key: 'card.parts.color' });
const colorIdentity = magic.color(commands.colorIdentity, { key: 'card.colorIdentity' });
const colorIndicator = magic.color(commands.colorIndicator, { key: 'card.parts.colorIndicator' });

const power = magic.halfNumber(commands.power, { key: 'card.parts.power' });
const toughness = magic.halfNumber(commands.toughness, { key: 'card.parts.toughness' });

const loyalty = defineServerCommand({
    command: commands.loyalty,
    query({
        pattern, parameter, operator, qualifier,
    }) {
        return magic.halfNumber.query({
            key:       'card.parts.loyalty',
            parameter: pattern?.loyalty ?? parameter,
            operator:  operator === '' ? '=' : operator,
            qualifier: qualifier ?? [],
        });
    },
});

const defense = defineServerCommand({
    command: commands.defense,
    query({
        pattern, parameter, operator, qualifier,
    }) {
        return magic.halfNumber.query({
            key:       'card.parts.defense',
            parameter: pattern?.defense ?? parameter,
            operator:  operator === '' ? '=' : operator,
            qualifier,
        });
    },
});

const name = defineServerCommand({
    command: commands.name,
    query({
        modifier, parameter, operator, qualifier,
    }) {
        switch (modifier) {
        case 'oracle':
            return builtin.text.query({
                key: 'card.parts.name', parameter, operator, qualifier,
            });
        case 'unified':
            return builtin.text.query({
                key: 'card.parts.localization.name', parameter, operator, qualifier,
            });
        case 'printed':
            return builtin.text.query({
                key: 'print.parts.name', parameter, operator, qualifier,
            });
        default:
            return {
                [!qualifier.includes('!') ? '$or' : '$and']: [
                    builtin.text.query({
                        key: 'card.parts.name', parameter, operator, qualifier,
                    }),
                    builtin.text.query({
                        key: 'card.parts.localization.name', parameter, operator, qualifier,
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
        case 'oracle':
            return builtin.text.query({
                key: 'card.parts.typeline', parameter, operator, qualifier,
            });
        case 'unified':
            return builtin.text.query({
                key: 'card.parts.localization.typeline', parameter, operator, qualifier,
            });
        case 'printed':
            return builtin.text.query({
                key: 'print.parts.typeline', parameter, operator, qualifier,
            });
        default:
            return {
                [!qualifier.includes('!') ? '$or' : '$and']: [
                    builtin.text.query({
                        key: 'card.parts.typeline', parameter, operator, qualifier,
                    }),
                    builtin.text.query({
                        key: 'card.parts.localization.typeline', parameter, operator, qualifier,
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
        case 'oracle':
            return builtin.text.query({
                key: 'card.parts.text', parameter, operator, qualifier,
            });
        case 'unified':
            return builtin.text.query({
                key: 'card.parts.localization.text', parameter, operator, qualifier,
            });
        case 'printed':
            return builtin.text.query({
                key: 'print.parts.text', parameter, operator, qualifier,
            });
        default:
            return {
                [!qualifier.includes('!') ? '$or' : '$and']: [
                    builtin.text.query({
                        key: 'card.parts.text', parameter, operator, qualifier,
                    }),
                    builtin.text.query({
                        key: 'card.parts.localization.text', parameter, operator, qualifier,
                    }),
                ],
            };
        }
    },
});

const oracle = defineServerCommand({
    command: commands.oracle,
    query:   ({ parameter, operator, qualifier }) => ({
        [!qualifier.includes('!') ? '$or' : '$and']: [
            builtin.text.query({
                key: 'card.parts.text', parameter, operator, qualifier,
            }),
            builtin.text.query({
                key: 'card.parts.localization.text', parameter, operator, qualifier,
            }),
        ],
    }),
});

const flavorText = builtin.text(commands.flavorText, { key: 'print.parts.flavorText' });
const flavorName = builtin.text(commands.flavorName, { key: 'print.parts.flavorName' });
const layout = builtin.simple(commands.layout);

const rarity = defineServerCommand({
    command: commands.rarity,
    query:   ({ parameter, operator, qualifier }) => {
        const rarities = (
            {
                c: 'common',
                u: 'uncommon',
                r: 'rare',
                m: 'mythic',
                s: 'special',
            } as Record<string, string>
        )[parameter] ?? parameter;

        return builtin.simple.query({
            key: 'print.rarity', parameter: rarities, operator, qualifier,
        });
    },
});

const date = defineServerCommand({
    command: commands.date,
    query:   ({ parameter, operator, qualifier }) => {
        switch (operator) {
        case '=':
        case ':':
            if (!qualifier.includes('!')) {
                return { 'print.releaseDate': { $eq: parameter } };
            } else {
                return { 'print.releaseDate': { $ne: parameter } };
            }
        case '>':
            return { 'print.releaseDate': { $gt: parameter } };
        case '>=':
            return { 'print.releaseDate': { $gte: parameter } };
        case '<':
            return { 'print.releaseDate': { $lt: parameter } };
        case '<=':
            return { 'print.releaseDate': { $lte: parameter } };
        default:
            throw new QueryError({ type: 'invalid-query' });
        }
    },
});

const format = defineServerCommand({
    command: commands.format,
    query:   ({ parameter, qualifier }) => {
        if (parameter.includes(',')) {
            const [format, status] = parameter.split(',');

            if (!qualifier.includes('!')) {
                return { [`card.legalities.${format}`]: status };
            } else {
                return { [`card.legalities.${format}`]: { $ne: status } };
            }
        } else {
            if (!qualifier.includes('!')) {
                return {
                    [`card.legalities.${parameter}`]: { $in: ['legal', 'restricted'] },
                };
            } else {
                return {
                    [`card.legalities.${parameter}`]: { $nin: ['legal', 'restricted'] },
                };
            }
        }
    },
});

const counter = defineServerCommand({
    command: commands.counter,
    query:   ({ parameter, qualifier }) => {
        parameter = toIdentifier(parameter);

        if (!qualifier.includes('!')) {
            return { 'card.counters': parameter };
        } else {
            return { 'card.counters': { $ne: parameter } };
        }
    },
});

const keyword = defineServerCommand({
    command: commands.keyword,
    query:   ({ parameter, qualifier }) => {
        parameter = toIdentifier(parameter);

        if (!qualifier.includes('!')) {
            return { 'card.keywords': parameter };
        } else {
            return { 'card.keywords': { $ne: parameter } };
        }
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
                agg.sort({ 'card.parts.name': dir });
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
            case 'cmc':
            case 'mv':
            case 'cost':
                agg.sort({ 'card.manaValue': dir });
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
    hash,
    set,
    num,
    lang,
    cost,
    manaValue,
    color,
    colorIdentity,
    colorIndicator,
    power,
    toughness,
    loyalty,
    defense,
    name,
    type,
    text,
    oracle,
    flavorText,
    flavorName,
    layout,
    rarity,
    date,
    format,
    counter,
    keyword,
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
                    .unwind({ path: '$parts', includeArrayIndex: 'partIndex' })
                    .unwind('parts.localization')
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
                            cardId:    '$cardId',
                            lang:      '$card.parts.localization.lang',
                            partIndex: '$card.partIndex',
                        },
                        pipeline: [
                            { $unwind: { path: '$parts', includeArrayIndex: 'partIndex' } },
                            ...isEmpty(printQuery) ? [] : [{ $match: printQuery }],
                            {
                                $match: {
                                    $expr: {
                                        $and: [
                                            { $eq: ['$cardId', '$$cardId'] },
                                            { $eq: ['$lang', '$$lang'] },
                                            { $eq: ['$partIndex', '$$partIndex'] },
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
                    'card._id':            0,
                    'card.__v':            0,
                    'card.__updations':    0,
                    'card.__lockedPaths':  0,
                    'print._id':           0,
                    'print.__v':           0,
                    'print.__updations':   0,
                    'print.__lockedPaths': 0,
                    'langIsLocale':        0,
                    'langIsEn':            0,
                });

            // const explain = await aggregate.explain('executionStats');

            const cards = await aggregate;

            return {
                countElapsed,
                elapsed: Date.now() - start,
                total,
                page,
                // explain,
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
                .project({
                    'card.relatedCards': false,
                })
                .lookup({
                    from: 'card_relations',
                    let:  {
                        cardId: '$card.cardId',
                    },
                    pipeline: [
                        {
                            $match: {
                                $expr: { $eq: ['$sourceId', '$$cardId'] },
                            },
                        },
                        {
                            $project: {
                                relation: '$relation',
                                cardId:   '$targetId',
                            },
                        },
                    ],
                    as: 'relatedCards',
                })
                .sort({ 'print.releaseDate': -1, 'card.cardId': 1 })
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
