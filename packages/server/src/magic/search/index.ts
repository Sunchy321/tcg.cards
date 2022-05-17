import { Command, DBQuery, Options } from '@/search/interface';

import Card from '@/magic/db/card';

import { QueryError, createSearcher } from '@/search';

import simpleQuery from './simple';
import textQuery from './text';
import numberQuery from './number';
import colorQuery from './color';
import costQuery from './cost';
import halfNumberQuery from './half-number';

import { toIdentifier } from '../util';

function parseOption(text: string | undefined, defaultValue: number): number {
    if (text == null) {
        return defaultValue;
    }

    const num = Number.parseInt(text, 10);

    if (Number.isNaN(num)) {
        return defaultValue;
    }

    return num;
}

const model = {
    commands: [
        {
            id:    '',
            query: ({ param }) => {
                if (typeof param === 'string') {
                    // search stats
                    if (/^[^/]+\/[^/]+$/.test(param)) {
                        const [power, toughness] = param.split('/');

                        return {
                            ...halfNumberQuery('parts.power', power, '='),
                            ...halfNumberQuery('parts.toughness', toughness, '='),
                        };
                    }

                    // search loyalty
                    if (/^\[[^]+\]$/.test(param)) {
                        const loyalty = param.slice(1, -1);

                        return { 'parts.loyalty': loyalty };
                    }

                    // search mana
                    if (/^(\{[^}]+\})+$/.test(param)) {
                        return {
                            $or: [
                                textQuery('parts.oracle.text', param, ':'),
                                textQuery('parts.unified.text', param, ':'),
                                textQuery('parts.printed.text', param, ':'),
                                costQuery(param, ':'),
                            ],
                        };
                    }
                }

                return {
                    $or: [
                        textQuery('parts.oracle.name', param, ':'),
                        textQuery('parts.unified.name', param, ':'),
                    ],
                };
            },
        },
        {
            id:    '#',
            query: ({ param, op }) => {
                if (op === ':') {
                    return { tags: param };
                } else {
                    return { tags: { $ne: param } };
                }
            },
        },
        {
            id:    'layout',
            query: ({ param, op }) => simpleQuery('layout', param, op),
        },
        {
            id:    'set',
            alt:   ['expansion', 's', 'e'],
            query: ({ param, op }) => simpleQuery('set', param, op),
        },
        {
            id:    'number',
            alt:   ['num'],
            query: ({ param, op }) => simpleQuery('number', param, op),
        },
        {
            id:    'lang',
            alt:   ['l'],
            query: ({ param, op }) => simpleQuery('lang', param, op),
        },
        {
            id:    'cost',
            alt:   ['mana', 'mana-cost', 'm'],
            query: ({ param, op }) => costQuery(param, op),
        },
        {
            id:    'mana-value',
            alt:   ['mv', 'cmc'],
            query: ({ param, op }) => numberQuery('manaValue', param, op),
        },
        {
            id:    'color',
            alt:   ['c'],
            query: ({ param, op }) => colorQuery('parts.color', param, op),
        },
        {
            id:    'color-identity',
            alt:   ['cd'],
            query: ({ param, op }) => colorQuery('colorIdentity', param, op),
        },
        {
            id:    'color-indicator',
            alt:   ['ci'],
            query: ({ param, op }) => colorQuery('parts.colorIndicator', param, op),
        },
        {
            id:    'power',
            alt:   ['pow'],
            query: ({ param, op }) => halfNumberQuery('parts.power', param, op),
        },
        {
            id:    'toughness',
            alt:   ['tou'],
            query: ({ param, op }) => halfNumberQuery('parts.toughness', param, op),
        },
        {
            id:    'loyalty',
            query: ({ param, op }) => halfNumberQuery('parts.loyalty', param, op),
        },
        {
            id:    'name.oracle',
            alt:   ['on'],
            query: ({ param, op }) => textQuery('parts.oracle.name', param, op),
        },
        {
            id:    'name.unified',
            alt:   ['un'],
            query: ({ param, op }) => textQuery('parts.unified.name', param, op),
        },
        {
            id:    'name.printed',
            alt:   ['pn'],
            query: ({ param, op }) => textQuery('parts.printed.name', param, op),
        },
        {
            id:    'name',
            alt:   ['n'],
            query: ({ param, op }) => ({
                [op != null && ['!:', '!='].includes(op) ? '$and' : '$or']: [
                    textQuery('parts.oracle.name', param, op),
                    textQuery('parts.unified.name', param, op),
                    textQuery('parts.printed.name', param, op),
                ],
            }),
        },
        {
            id:    'type.oracle',
            alt:   ['ot'],
            query: ({ param, op }) => textQuery('parts.oracle.typeline', param, op),
        },
        {
            id:    'type.unified',
            alt:   ['ut'],
            query: ({ param, op }) => textQuery('parts.unified.typeline', param, op),
        },
        {
            id:    'type.printed',
            alt:   ['pt'],
            query: ({ param, op }) => textQuery('parts.printed.typeline', param, op),
        },
        {
            id:    'type',
            alt:   ['t'],
            query: ({ param, op }) => ({
                [op != null && ['!:', '!='].includes(op) ? '$and' : '$or']: [
                    textQuery('parts.oracle.typeline', param, op),
                    textQuery('parts.unified.typeline', param, op),
                    textQuery('parts.printed.typeline', param, op),
                ],
            }),
        },
        {
            id:    'text.oracle',
            alt:   ['ox'],
            query: ({ param, op }) => textQuery('parts.oracle.text', param, op),
        },
        {
            id:    'text.unified',
            alt:   ['ux'],
            query: ({ param, op }) => textQuery('parts.unified.text', param, op),
        },
        {
            id:    'text.printed',
            alt:   ['px'],
            query: ({ param, op }) => textQuery('parts.printed.text', param, op),
        },
        {
            id:    'text',
            alt:   ['x'],
            query: ({ param, op }) => ({
                [op != null && ['!:', '!='].includes(op) ? '$and' : '$or']: [
                    textQuery('parts.oracle.text', param, op),
                    textQuery('parts.unified.text', param, op),
                    textQuery('parts.printed.text', param, op),
                ],
            }),
        },
        {
            id:    'text.oracle-or-unified',
            alt:   ['o'],
            query: ({ param, op }) => ({
                [op != null && ['!:', '!='].includes(op) ? '$and' : '$or']: [
                    textQuery('parts.oracle.text', param, op),
                    textQuery('parts.unified.text', param, op),
                ],
            }),
        },
        {
            id:    'flavor-text',
            alt:   ['flavor', 'ft'],
            query: ({ param, op }) => textQuery('parts.flavorText', param, op, false),
        },
        {
            id:    'flavor-name',
            alt:   ['fn'],
            query: ({ param, op }) => textQuery('parts.flavorName', param, op),
        },
        {
            id:    'rarity',
            alt:   ['r'],
            query: ({ param, op }) => {
                if (param instanceof RegExp) {
                    throw new QueryError({
                        type:  'regex/disabled',
                        value: '',
                    });
                }

                const rarity = (
                    {
                        c: 'common',
                        u: 'uncommon',
                        r: 'rare',
                        m: 'mythic',
                        s: 'special',
                    } as Record<string, string>
                )[param] || param;

                return simpleQuery('rarity', rarity, op);
            },
        },
        {
            id:    'format',
            alt:   ['f'],
            query: ({ param, op }) => {
                if (param instanceof RegExp) {
                    throw new QueryError({
                        type:  'regex/disabled',
                        value: '',
                    });
                }

                if (param.includes(',')) {
                    const [format, status] = param.split(',');

                    switch (op) {
                    case ':':
                        return {
                            [`legalities.${format}`]: status,
                        };
                    case '!:':
                        return {
                            [`legalities.${format}`]: { $ne: status },
                        };
                    default:
                        throw new QueryError({
                            type:  'operator/unsupported',
                            value: op ?? '',
                        });
                    }
                } else {
                    switch (op) {
                    case ':':
                        return {
                            [`legalities.${param}`]: { $in: ['legal', 'restricted'] },
                        };
                    case '!:':
                        return {
                            [`legalities.${param}`]: { $nin: ['legal', 'restricted'] },
                        };
                    default:
                        throw new QueryError({
                            type:  'operator/unsupported',
                            value: op ?? '',
                        });
                    }
                }
            },
        },
        {
            id:    'counter',
            query: ({ param, op }) => {
                if (param instanceof RegExp) {
                    throw new QueryError({
                        type:  'regex/disabled',
                        value: '',
                    });
                }

                param = toIdentifier(param);

                switch (op) {
                case ':':
                    return {
                        counters: param,
                    };
                case '!:':
                    return {
                        counters: { $ne: param },
                    };
                default:
                    throw new QueryError({
                        type:  'operator/unsupported',
                        value: op ?? '',
                    });
                }
            },
        },
        {
            id:    'keyword',
            query: ({ param, op }) => {
                if (param instanceof RegExp) {
                    throw new QueryError({
                        type:  'regex/disabled',
                        value: '',
                    });
                }

                param = toIdentifier(param);

                switch (op) {
                case ':':
                    return {
                        keywords: param,
                    };
                case '!:':
                    return {
                        keywords: { $ne: param },
                    };
                default:
                    throw new QueryError({
                        type:  'operator/unsupported',
                        value: op ?? '',
                    });
                }
            },
        },

        {
            id:    'rc-none',
            query: ({ param, op }) => {
                if (param instanceof RegExp) {
                    throw new QueryError({
                        type:  'regex/disabled',
                        value: op ?? '',
                    });
                }

                switch (op) {
                case ':':
                    return { relatedCards: { $not: { $elemMatch: { relation: param } } } };
                default:
                    throw new QueryError({
                        type:  'operator/unsupported',
                        value: op ?? '',
                    });
                }
            },
        },
    ] as Command[],

    search: async (q: DBQuery, o: Options) => {
        const groupBy = o['group-by'] || 'card';
        const sortBy = o['sort-by'] || 'id';
        const sortDir = o['sort-dir'] === 'desc' ? -1 : 1;
        const page = parseOption(o.page, 1);
        const pageSize = parseOption(o['page-size'], 100);
        const locale = o.locale || 'en';

        const aggregate = Card.aggregate()
            .allowDiskUse(true)
            .unwind({ path: '$parts', includeArrayIndex: 'partIndex' })
            .match({ $and: q });

        switch (groupBy) {
        case 'print':
            break;
        case 'card':
        default:
            aggregate
                .addFields({
                    langIsLocale:     { $eq: ['$lang', locale] },
                    langIsEnglish:    { $eq: ['$lang', 'en'] },
                    frameEffectCount: { $size: '$frameEffects' },
                })
                .sort({
                    langIsLocale:     -1,
                    langIsEnglish:    -1,
                    releaseDate:      -1,
                    frameEffectCount: 1,
                    number:           1,
                })
                .group({ _id: '$cardId', data: { $first: '$$ROOT' } })
                .replaceRoot('data');
        }

        const total = (
            await Card.aggregate(aggregate.pipeline())
                .allowDiskUse(true)
                .group({ _id: null, count: { $sum: 1 } })
        )[0]?.count ?? 0;

        switch (sortBy) {
        case 'name':
            aggregate
                .addFields({ firstPart: { $first: '$part' } })
                .sort({ 'part.unified.name': sortDir });
            break;
        case 'date':
            aggregate.sort({ releaseDate: sortDir });
            break;
        case 'id':
        default:
            aggregate.sort({ cardId: sortDir });
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

    dev: async (q: DBQuery) => {
        const aggregate = Card.aggregate().allowDiskUse(true).match({ $and: q });

        const total = (
            await Card.aggregate(aggregate.pipeline())
                .allowDiskUse(true)
                .group({ _id: null, count: { $sum: 1 } })
        )[0]?.count ?? 0;

        const cards = await Card.aggregate(aggregate.pipeline()).sample(100);

        return { cards, total };
    },

    searchId: async (q: DBQuery) => {
        const result = await Card.aggregate().allowDiskUse(true).match({ $and: q }).group({ _id: '$cardId' });

        return result.map(v => v._id) as string[];
    },
};

const searcher = createSearcher(model);

export default searcher;
