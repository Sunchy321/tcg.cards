import { QueryModel } from '@/search/interface';
import { QueryError } from '@/search';
import Card from '@/magic/db/card';

import { escapeRegExp, flatten } from 'lodash';

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

function simpleQuery(
    key: string,
    param: string | RegExp,
    op: string | undefined,
) {
    if (typeof param !== 'string') {
        throw new QueryError({
            type:  'regex/disabled',
            value: '',
        });
    }

    switch (op) {
    case ':':
    case '=':
        return { [key]: param };
    case '!:':
    case '!=':
        return { [key]: { $ne: param } };
    default:
        throw new QueryError({
            type:  'operator/unsupported',
            value: op || '',
        });
    }
}

function textQuery(
    key: string,
    param: string | RegExp,
    op: string | undefined,
    multiline = true,
) {
    const regexSource =
        typeof param === 'string' ? escapeRegExp(param) : param.source;

    switch (op) {
    case ':':
        return {
            [key]: new RegExp(regexSource, multiline ? 'mi' : 'i'),
        };
    case '!:':
        return {
            [key]: {
                $not: new RegExp(regexSource, multiline ? 'mi' : 'i'),
            },
        };
    case '=':
        return {
            [key]: new RegExp('^' + regexSource + '$', 'i'),
        };
    case '!=':
        return {
            [key]: { $not: new RegExp('^' + regexSource + '$', 'i') },
        };
    default:
        throw new QueryError({
            type:  'operator/unsupported',
            value: op || '',
        });
    }
}

function numberQuery(
    key: string,
    param: string | RegExp,
    op: string | undefined,
) {
    if (param instanceof RegExp) {
        throw new QueryError({
            type:  'regex/disabled',
            value: op || '',
        });
    }

    const number = Number.parseInt(param);

    if (Number.isNaN(number)) {
        throw new QueryError({
            type:  'number/nan',
            value: op || '',
        });
    }

    switch (op) {
    case '=':
        return { [key]: { $eq: number } };
    case '!=':
        return { [key]: { $ne: number } };
    case '>':
        return { [key]: { $gt: number } };
    case '>=':
        return { [key]: { $gte: number } };
    case '<':
        return { [key]: { $lt: number } };
    case '<=':
        return { [key]: { $lte: number } };
    default:
        throw new QueryError({
            type:  'operator/unsupported',
            value: op || '',
        });
    }
}

const colorEnums = 'WUBRGOP'.split('');

function colorQuery(
    key: string,
    param: string | RegExp,
    op: string | undefined,
) {
    if (param instanceof RegExp) {
        throw new QueryError({
            type:  'regex/disabled',
            value: op || '',
        });
    }

    const text = param.toLowerCase();

    if (text === 'c' || text === 'colorless') {
        switch (op) {
        case ':':
            return { [key]: '' };
        case '!:':
            return { [key]: { $ne: '' } };
        default:
            throw new QueryError({
                type:  'operator/unsupported',
                value: op || '',
            });
        }
    } else if (text === 'm' || text === 'multicolor') {
        switch (op) {
        case ':':
            return { [key]: /../ };
        case '!:':
            return { [key]: { $not: /../ } };
        default:
            throw new QueryError({
                type:  'operator/unsupported',
                value: op || '',
            });
        }
    }

    // count of color
    if (/^\d+$/.test(text)) {
        const count = Number.parseInt(text);

        switch (op) {
        case '=':
            return { [key]: new RegExp(`^.{${count}}$`) };
        case '!=':
            return { [key]: { $not: new RegExp(`^.{${count}}$`) } };
        case '>':
            return { [key]: new RegExp(`^.{${count + 1},}$`) };
        case '>=':
            return { [key]: new RegExp(`^.{${count},}$`) };
        case '<':
            return { [key]: new RegExp(`^.{0,${count - 1}}$`) };
        case '<=':
            return { [key]: new RegExp(`^.{0,${count}}$`) };
        default:
            throw new QueryError({
                type:  'operator/unsupported',
                value: op || '',
            });
        }
    }

    const colors = (() => {
        switch (text) {
        case 'white':
            return ['W'];
        case 'blue':
            return ['U'];
        case 'black':
            return ['B'];
        case 'red':
            return ['R'];
        case 'green':
            return ['G'];
        case 'gold':
            return ['O'];
        case 'pink':
            return ['P'];
        case 'azorius':
            return ['W', 'U'];
        case 'dimir':
            return ['U', 'B'];
        case 'rakdos':
            return ['B', 'R'];
        case 'gruul':
            return ['R', 'G'];
        case 'selesyna':
            return ['W', 'G'];
        case 'orzhov':
            return ['W', 'B'];
        case 'izzet':
            return ['U', 'R'];
        case 'golgari':
            return ['B', 'G'];
        case 'boros':
            return ['W', 'R'];
        case 'simic':
            return ['U', 'G'];
        case 'bant':
            return ['W', 'U', 'G'];
        case 'esper':
            return ['W', 'U', 'B'];
        case 'grixis':
            return ['U', 'B', 'R'];
        case 'jund':
            return ['B', 'R', 'G'];
        case 'naya':
            return ['W', 'R', 'G'];
        case 'mardu':
            return ['W', 'B', 'R'];
        case 'temur':
            return ['U', 'R', 'G'];
        case 'abzan':
            return ['W', 'B', 'G'];
        case 'jeskai':
            return ['W', 'U', 'R'];
        case 'sultai':
            return ['U', 'B', 'G'];
        case 'chaos':
            return ['U', 'B', 'R', 'G'];
        case 'aggression':
            return ['W', 'B', 'R', 'G'];
        case 'altruism':
            return ['W', 'U', 'R', 'G'];
        case 'growth':
            return ['W', 'U', 'B', 'G'];
        case 'artifice':
            return ['W', 'U', 'B', 'R'];
        }

        const chars = text.toUpperCase().split('');

        if (chars.some(c => !colorEnums.includes(c))) {
            throw new QueryError({
                type:  'color/unsupported',
                value: op || '',
            });
        }

        return colorEnums.filter(c => chars.includes(c));
    })();

    switch (op) {
    case ':':
    case '>=':
        return {
            [key]: new RegExp(`^${colorEnums.map(c => (colors.includes(c) ? c : c + '?')).join('')}$`),
        };
    case '!:':
        return {
            [key]: {
                $not: new RegExp(`^${colorEnums.map(c => (colors.includes(c) ? c : c + '?')).join('')}$`),
            },
        };
    case '=':
        return {
            [key]: new RegExp(`^${colorEnums.map(c => colors.includes(c) ? c : '').join('')}$`),
        };
    case '!=':
        return {
            [key]: {
                $not: new RegExp(`^${colorEnums.map(c => colors.includes(c) ? c : '').join('')}$`),
            },
        };
    case '>':
        return {
            [key]: new RegExp(
                `^(?=.{${colors.length + 1}})${colorEnums.map(c => (colors.includes(c) ? c : c + '?')).join('')}$`,
            ),
        };
    case '<':
        return {
            [key]: new RegExp(
                `^(?!.{${colors.length}})${colorEnums.map(c => (colors.includes(c) ? c + '?' : '')).join('')}$`,
            ),
        };
    case '<=':
        return {
            [key]: new RegExp(
                `^${colorEnums.map(c => colors.includes(c) ? c + '?' : '').join('')}$`,

            ),
        };
    default:
        throw new QueryError({
            type:  'operator/unsupported',
            value: op || '',
        });
    }
}

function costQuery(
    param: string | RegExp,
    op: string | undefined,
) {
    if (param instanceof RegExp) {
        throw new QueryError({
            type:  'regex/disabled',
            value: op || '',
        });
    }

    if (param === 'null') {
        switch (op) {
        case ':':
            return {
                parts: { $elemMatch: { cost: { $exists: false } } },
            };
        case '!:':
            return {
                parts: { $elemMatch: { cost: { $exists: true } } },
            };
        default:
            throw new QueryError({
                type:  'operator/unsupported',
                value: op || '',
            });
        }
    }

    const costs = param
        .toUpperCase()
        .split(/\{([^{}]*)\}|(\d{2,})|(.(?:\/.)?)/)
        .filter(v => v !== '' && v != null);

    const costMap: Record<string, number> = {};

    for (const c of costs) {
        if (/^\d+$/.test(c)) {
            costMap[''] = (costMap[''] ?? 0) + Number.parseInt(c);
        } else {
            costMap[c] = (costMap[c] ?? 0) + 1;
        }
    }

    switch (op) {
    case ':':
        return Object.fromEntries(
            Object.entries(costMap)
                .map(([k, v]) => ['parts.__costMap.' + k, k === '' ? v : { $gte: v }]),
        );
    case '!:':
        return {
            $or: flatten(
                Object.entries(costMap)
                    .map(([k, v]) => [
                        { ['parts.__costMap.' + k]: { $lt: v } },
                        { ['parts.__costMap.' + k]: { $exists: false } },
                    ]),
            ),
        };
    case '=':
        return { 'parts.__costMap': costMap };
    case '!=':
        return { 'parts.__costMap': { $ne: costMap } };
    case '>=':
        return Object.fromEntries(
            Object.entries(costMap)
                .map(([k, v]) => ['parts.__costMap.' + k, { $gte: v }]),
        );
    case '>':
        return {
            $and: [
                Object.fromEntries(
                    Object.entries(costMap)
                        .map(([k, v]) => ['parts.__costMap.' + k, { $gte: v }]),
                ),
                { 'parts.__costMap': { $ne: costMap } },
            ],
        };
    case '<':
    case '<=': {
        const symbols = Object.keys(costMap).filter(v => v !== '');

        // a cost {0} always less than any other cost
        symbols.push('0');

        if (costMap[''] != null) {
            symbols.push(
                '1', '2', '3', '4', '5', '6', '7', '8', '9',
                '10', '11', '12', '13', '14', '15', '16', '17', '18', '19', '20',
                '1000000',
            );
        }

        return {
            $and: [
                { 'parts.cost': { $exists: true } },

                // cost can only contains specific symbol
                { 'parts.cost': { $not: { $elemMatch: { $nin: symbols } } } },

                // symbol count restriction
                ...Object.entries(costMap).map(([k, v]) => ({
                    $or: [
                        { ['parts.__costMap.' + k]: { $lte: v } },
                        { ['parts.__costMap.' + k]: { $exists: false } },
                    ],
                })),

                ...op === '<' ? [{ 'parts.__costMap': { $ne: costMap } }] : [],
            ],
        };
    }
    default:
        throw new QueryError({
            type:  'operator/unsupported',
            value: op || '',
        });
    }
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
                            'parts.power':     power,
                            'parts.toughness': toughness,
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
                        textQuery('parts.printed.name', param, ':'),
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
            alt:   ['n'],
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
            id:    'name.oracle',
            alt:   ['on'],
            query: ({ param, op }) => textQuery('parts.oracle.name', param, op),
        },
        {
            id:    'name.unified',
            alt:   ['un'],
            query: ({ param, op }) =>
                textQuery('parts.unified.name', param, op),
        },
        {
            id:    'name.printed',
            alt:   ['pn'],
            query: ({ param, op }) =>
                textQuery('parts.printed.name', param, op),
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
            query: ({ param, op }) =>
                textQuery('parts.oracle.typeline', param, op),
        },
        {
            id:    'type.unified',
            alt:   ['ut'],
            query: ({ param, op }) =>
                textQuery('parts.unified.typeline', param, op),
        },
        {
            id:    'type.printed',
            alt:   ['pt'],
            query: ({ param, op }) =>
                textQuery('parts.printed.typeline', param, op),
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
            query: ({ param, op }) =>
                textQuery('parts.unified.text', param, op),
        },
        {
            id:    'text.printed',
            alt:   ['px'],
            query: ({ param, op }) =>
                textQuery('parts.printed.text', param, op),
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
            query: ({ param, op }) =>
                textQuery('parts.flavorText', param, op, false),
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
                        } as Record<string, string>
                    )[param] || param;

                return simpleQuery('rarity', rarity, op);
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
