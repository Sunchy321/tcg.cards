import { QueryModel } from '@/search/interface';

import Card from '@/magic/db/card';

import { QueryError } from '@/search';

import simpleQuery from './simple';
import textQuery from './text';
import numberQuery from './number';
import colorQuery from './color';
import costQuery from './cost';
import halfNumberQuery from './half-number';

function parseOption(text: string | undefined, defaultValue: number): number {
    if (text == null) {
        return defaultValue;
    }

    const num = Number.parseInt(text);

    if (Number.isNaN(num)) {
        return defaultValue;
    }

    return num;
}

export type QueryResult =
    | {
          onlyId: false;
          total: number;
          cards: {
              cardId: string;
              set: string;
              number: string;
              lang: string;
              layout: string;
          }[];
      }
    | {
          onlyId: true;
          total: number;
          cards: string[];
      };

export default {
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

                const rarity =
                    (
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
                            ['legalities.' + format]: status,
                        };
                    case '!:':
                        return {
                            ['legalities.' + format]: { $ne: status },
                        };
                    default:
                        throw new QueryError({
                            type:  'operator/unsupported',
                            value: op || '',
                        });
                    }
                } else {
                    switch (op) {
                    case ':':
                        return {
                            ['legalities.' + param]: { $in: ['legal', 'restricted'] },
                        };
                    case '!:':
                        return {
                            ['legalities.' + param]: { $nin: ['legal', 'restricted'] },
                        };
                    default:
                        throw new QueryError({
                            type:  'operator/unsupported',
                            value: op || '',
                        });
                    }
                }
            },
        },
    ],

    aggregate: async (q, o) => {
        const dev = o.dev != null;
        const onlyId = o['only-id'] != null;
        const groupBy = o['group-by'] || 'card';
        const sortBy = o['sort-by'] || 'id';
        const sortDir = o['sort-dir'] === 'desc' ? -1 : 1;
        const page = parseOption(o.page, 1);
        const pageSize = parseOption(o['page-size'], 100);
        const locale = o.locale || 'en';

        const aggregate = Card.aggregate().allowDiskUse(true);

        if (!dev && !onlyId) {
            aggregate.unwind({ path: '$parts', includeArrayIndex: 'partIndex' });
        }

        aggregate.match({ $and: q });

        if (!dev && !onlyId) {
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
        }

        const total =
            (
                await Card.aggregate(aggregate.pipeline())
                    .allowDiskUse(true)
                    .group({ _id: null, count: { $sum: 1 } })
            )[0]?.count ?? 0;

        if (onlyId) {
            const result = await aggregate.group({ _id: '$cardId' });

            return { total, cards: result.map((v) => v._id) };
        } else if (dev) {
            const cards = await Card.aggregate(aggregate.pipeline()).limit(1);

            return { ...cards[0], total };
        } else {
            switch (sortBy) {
            case 'name':
                aggregate
                    .addFields({ firstPart: { $first: '$part' } })
                    .sort({ 'part.unified.name': sortDir });
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
        }
    },
} as QueryModel<QueryResult>;
