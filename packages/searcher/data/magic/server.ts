import { defineServerModel } from '../../src/model/server';
import { defineServerCommand, DBQuery, CommonServerCommand } from '../../src/command/server';

import { PostAction } from '../../src/model/type';
import { SearchOption } from '../../src/search';
import { QueryError } from '../../src/command/error';

import { ICardDatabase } from '@common/model/magic/card';
import { IPrintDatabase } from '@common/model/magic/print';

import * as builtin from '../../src/command/builtin/server';
import * as magic from './command/backend';

import { commands } from './index';

import { deburr } from 'lodash';
import { Model } from 'mongoose';

function toIdentifier(text: string): string {
    return deburr(text)
        .trim()
        .toLowerCase()
        .replace(' // ', '____')
        .replace('/', '____')
        .replace(/[^a-z0-9]/g, '_');
}

const raw = defineServerCommand({
    command: commands.raw,
    query:   ({ parameter }) => {
        // search mana
        if (typeof parameter === 'string' && /^(\{[^}]+\})+$/.test(parameter)) {
            return {
                $or: [
                    builtin.text.query({
                        key:       'parts.oracle.text',
                        multiline: false,
                        parameter,
                        operator:  ':',
                        qualifier: [],
                    }),
                    builtin.text.query({
                        key:       'parts.unified.text',
                        multiline: false,
                        parameter,
                        operator:  ':',
                        qualifier: [],
                    }),
                    builtin.text.query({
                        key:       'parts.printed.text',
                        multiline: false,
                        parameter,
                        operator:  ':',
                        qualifier: [],
                    }),
                    magic.cost.query({
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
                        key:       'parts.oracle.name',
                        multiline: false,
                        parameter,
                        operator:  ':',
                        qualifier: [],
                    }),
                    builtin.text.query({
                        key:       'parts.unified.name',
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
                        key:       'parts.power',
                        parameter: power,
                        operator:  operator ?? '=',
                        qualifier,
                    }),
                    magic.halfNumber.query({
                        key:       'parts.toughness',
                        parameter: toughness,
                        operator:  operator ?? '=',
                        qualifier,
                    }),
                ],
            };
        } else {
            return {
                ...magic.halfNumber.query({
                    key:       'parts.power',
                    parameter: power,
                    operator:  operator ?? '=',
                    qualifier: qualifier ?? [],
                }),
                ...magic.halfNumber.query({
                    key:       'parts.toughness',
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
            switch (tag) {
            case 'dev:on-eq-un':
                return { $expr: { $eq: ['$parts.oracle.name', '$parts.unified.name'] } };
            case 'dev:on-eq-pn':
                return { $expr: { $eq: ['$parts.oracle.name', '$parts.printed.name'] } };
            default:
                break;
            }

            return {
                $or: [
                    { tags: tag },
                    { localTags: tag },
                ],
            };
        } else {
            switch (tag) {
            case 'dev:on-eq-un':
                return { $expr: { $ne: ['$parts.oracle.name', '$parts.unified.name'] } };
            case 'dev:on-eq-pn':
                return { $expr: { $ne: ['$parts.oracle.name', '$parts.printed.name'] } };
            default:
                break;
            }

            return {
                $and: [
                    { tags: { $ne: tag } },
                    { localTags: { $ne: tag } },
                ],
            };
        }
    },
});

const set = builtin.simple(commands.set);
const num = builtin.simple(commands.num);
const lang = builtin.simple(commands.lang);

const cost = magic.cost(commands.cost);
const manaValue = builtin.number(commands.manaValue, { key: 'manaValue' });

const color = magic.color(commands.color, { key: 'parts.color' });
const colorIdentity = magic.color(commands.colorIdentity, { key: 'colorIdentity' });
const colorIndicator = magic.color(commands.colorIndicator, { key: 'parts.colorIndicator' });

const power = magic.halfNumber(commands.power, { key: 'parts.power' });
const toughness = magic.halfNumber(commands.toughness, { key: 'parts.toughness' });

const loyalty = defineServerCommand({
    command: commands.loyalty,
    query({
        pattern, parameter, operator, qualifier,
    }) {
        return magic.halfNumber.query({
            key:       'parts.loyalty',
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
            key:       'parts.defense',
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
        case 'unified':
        case 'printed':
            return builtin.text.query({
                key: `parts.${modifier}.name`, parameter, operator, qualifier,
            });
        default:
            return {
                [!qualifier.includes('!') ? '$or' : '$and']: [
                    builtin.text.query({
                        key: 'parts.oracle.name', parameter, operator, qualifier,
                    }),
                    builtin.text.query({
                        key: 'parts.unified.name', parameter, operator, qualifier,
                    }),
                    builtin.text.query({
                        key: 'parts.printed.name', parameter, operator, qualifier,
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
        case 'unified':
        case 'printed':
            return builtin.text.query({
                key: `parts.${modifier}.typeline`, parameter, operator, qualifier,
            });
        default:
            return {
                [!qualifier.includes('!') ? '$or' : '$and']: [
                    builtin.text.query({
                        key: 'parts.oracle.typeline', parameter, operator, qualifier,
                    }),
                    builtin.text.query({
                        key: 'parts.unified.typeline', parameter, operator, qualifier,
                    }),
                    builtin.text.query({
                        key: 'parts.printed.typeline', parameter, operator, qualifier,
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
        case 'unified':
        case 'printed':
            return builtin.text.query({
                key: `parts.${modifier}.text`, parameter, operator, qualifier, multiline: true,
            });
        default:
            return {
                [!qualifier.includes('!') ? '$or' : '$and']: [
                    builtin.text.query({
                        key: 'parts.oracle.text', parameter, operator, qualifier, multiline: true,
                    }),
                    builtin.text.query({
                        key: 'parts.unified.text', parameter, operator, qualifier, multiline: true,
                    }),
                    builtin.text.query({
                        key: 'parts.printed.text', parameter, operator, qualifier, multiline: true,
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
                key: 'parts.oracle.text', parameter, operator, qualifier,
            }),
            builtin.text.query({
                key: 'parts.unified.text', parameter, operator, qualifier,
            }),
        ],
    }),
});

const flavorText = builtin.text(commands.flavorText, { key: 'parts.flavorText' });
const flavorName = builtin.text(commands.flavorName, { key: 'parts.flavorName' });
const layout = builtin.simple(commands.layout);

const rarity = defineServerCommand({
    command: commands.rarity,
    query:   ({ parameter, operator, qualifier }) => {
        // eslint-disable-next-line @typescript-eslint/no-shadow
        const rarity = (
            {
                c: 'common',
                u: 'uncommon',
                r: 'rare',
                m: 'mythic',
                s: 'special',
            } as Record<string, string>
        )[parameter] ?? parameter;

        return builtin.simple.query({
            key: 'rarity', parameter: rarity, operator, qualifier,
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
                return { releaseDate: { $eq: parameter } };
            } else {
                return { releaseDate: { $ne: parameter } };
            }
        case '>':
            return { releaseDate: { $gt: parameter } };
        case '>=':
            return { releaseDate: { $gte: parameter } };
        case '<':
            return { releaseDate: { $lt: parameter } };
        case '<=':
            return { releaseDate: { $lte: parameter } };
        default:
            throw new QueryError({ type: 'invalid-query' });
        }
    },
});

const format = defineServerCommand({
    command: commands.format,
    query:   ({ parameter, qualifier }) => {
        if (parameter.includes(',')) {
            // eslint-disable-next-line @typescript-eslint/no-shadow
            const [format, status] = parameter.split(',');

            if (!qualifier.includes('!')) {
                return { [`legalities.${format}`]: status };
            } else {
                return { [`legalities.${format}`]: { $ne: status } };
            }
        } else {
            if (!qualifier.includes('!')) {
                return {
                    [`legalities.${parameter}`]: { $in: ['legal', 'restricted'] },
                };
            } else {
                return {
                    [`legalities.${parameter}`]: { $nin: ['legal', 'restricted'] },
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
            return { counters: parameter };
        } else {
            return { counters: { $ne: parameter } };
        }
    },
});

const keyword = defineServerCommand({
    command: commands.keyword,
    query:   ({ parameter, qualifier }) => {
        parameter = toIdentifier(parameter);

        if (!qualifier.includes('!')) {
            return { keywords: parameter };
        } else {
            return { keywords: { $ne: parameter } };
        }
    },
});

const order = defineServerCommand({
    command: commands.order,
    query() {},
    phase:   'order',
    post:    ({ parameter }) => {
        parameter = parameter.toLowerCase();

        // eslint-disable-next-line @typescript-eslint/no-shadow
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
                agg.sort({ 'parts.unified.name': dir });
                break;
            case 'date':
                agg.sort({ releaseDate: dir });
                break;
            case 'id':
                agg.sort({ cardId: dir });
                break;
            case 'cmc':
            case 'mv':
            case 'cost':
                agg.sort({ manaValue: dir });
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
    card: ICardDatabase;
    print: IPrintDatabase;
};

type ServerActions = {
    search: { cards: ServerModel[], total: number, page: number };
    dev: { cards: ServerModel[], total: number };
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

            const fullGen = <T>() => {
                const aggregate = gen<T>();

                aggregate
                    .allowDiskUse(true)
                    .unwind({ path: '$parts', includeArrayIndex: 'partIndex' })
                    .match(q);

                switch (groupBy) {
                case 'print':
                    break;
                case 'card':
                default:
                    aggregate
                        .addFields({
                            langIsLocale:  { $eq: ['$lang', locale] },
                            langIsEnglish: { $eq: ['$lang', 'en'] },
                        })
                        .sort({
                            langIsLocale:  -1,
                            langIsEnglish: -1,
                            releaseDate:   -1,
                            number:        1,
                        })
                        .collation({ locale: 'en', numericOrdering: true })
                        .group({ _id: '$cardId', data: { $first: '$$ROOT' } })
                        .replaceRoot('data');
                }

                return aggregate;
            };

            const aggregate = fullGen<ServerModel>();

            const total = (
                await fullGen<{ count: number }>()
                    .group({ _id: null, count: { $sum: 1 } })
            )[0]?.count ?? 0;

            const orderAction = p.find(v => v.phase === 'order');

            if (orderAction != null) {
                orderAction.action(aggregate);
            } else {
                order.post!({ parameter: orderBy, operator: ':', qualifier: [] })(aggregate);
            }

            aggregate.skip((page - 1) * pageSize);
            aggregate.limit(pageSize);
            aggregate.project({
                _id:          0,
                __v:          0,
                langIsLocale: 0,
                langIsEn:     0,
            });

            const cards = await aggregate;

            return { cards, total, page };
        },

        dev: async (gen, q: DBQuery, p: PostAction[], o: SearchOption) => {
            const fullGen = <T>() => {
                const aggregate = gen<T>();

                aggregate.allowDiskUse(true).match(q);

                return aggregate;
            };

            const aggregate = fullGen<ServerModel>();

            const total = (
                await fullGen<{ count: number }>()
                    .allowDiskUse(true)
                    .group({ _id: null, count: { $sum: 1 } })
            )[0]?.count ?? 0;

            const cards = await aggregate
                .sort({ releaseDate: -1, cardId: 1 })
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
}, card => {
    const gen = <V>() => card.aggregate<V>()
        .lookup({
            from:         'prints',
            as:           'print',
            localField:   'cardId',
            foreignField: 'cardId',
        })
        .unwind('parts');

    return {
        search:   gen,
        dev:      gen,
        searchId: gen,
    };
});
