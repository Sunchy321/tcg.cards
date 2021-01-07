import { QueryModel } from '@/search/interface';
import { QueryError } from '@/search';
import Card from '@/magic/db/card';

import { escapeRegExp } from 'lodash';

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

function simpleQuery(key: string, param: string|RegExp, op:string|undefined) {
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

function textQuery(key: string, param: string|RegExp, op: string|undefined, multiline = true) {
    const regexSource = typeof param === 'string' ? escapeRegExp(param) : param.source;

    switch (op) {
    case ':':
        return { [key]: new RegExp(regexSource, multiline ? 'mi' : 'i') };
    case '!:':
        return { [key]: { $not: new RegExp(regexSource, multiline ? 'mi' : 'i') } };
    case '=':
        return { [key]: new RegExp('^' + regexSource + '$', 'i') };
    case '!=':
        return { [key]: { $not: new RegExp('^' + regexSource + '$', 'i') } };
    default:
        throw new QueryError({
            type:  'operator/unsupported',
            value: op || '',
        });
    }
}

export type QueryResult = {
    onlyId: false,
    total: number,
    cards: { cardId: string, set: string, number: string, lang: string, layout: string }[]
} | {
    onlyId: true,
    total: number,
    cards: string[]
}

export default {
    commands: [
        {
            name:  '',
            query: ({ param }) => {
                if (
                    (typeof param === 'string' && /^\{[^}]+\}$/.test(param)) ||
                    (typeof param !== 'string' && /^\\\{[^}]+\\\}$/.test(param.source))
                ) {
                    return {
                        $or: [
                            textQuery('parts.oracle.text', param, ':'),
                            textQuery('parts.unified.text', param, ':'),
                            textQuery('parts.printed.text', param, ':'),
                            {
                                'parts.cost': typeof param === 'string'
                                    ? param.slice(1, -1).toUpperCase()
                                    : new RegExp('^' + param.source.slice(2, -2).toUpperCase() + '$'),
                            },
                        ],
                    };
                }

                return {
                    $or: [
                        textQuery('parts.oracle.name', param, ':'),
                        textQuery('parts.unified.name', param, ':'),
                        textQuery('parts.printed.name', param, ':'),
                        textQuery('parts.oracle.text', param, ':'),
                        textQuery('parts.unified.text', param, ':'),
                        textQuery('parts.printed.text', param, ':'),
                    ],
                };
            },
        },
        {
            name:  'layout',
            query: ({ param, op }) => simpleQuery('layout', param, op),
        },
        {
            name:  'set',
            short: 's',
            query: ({ param, op }) => simpleQuery('setId', param, op),
        },
        {
            name:  'lang',
            short: 'l',
            query: ({ param, op }) => simpleQuery('lang', param, op),
        },
        {
            name:  'name.oracle',
            short: 'on',
            query: ({ param, op }) => textQuery('parts.oracle.name', param, op),
        },
        {
            name:  'name.unified',
            short: 'un',
            query: ({ param, op }) => textQuery('parts.unified.name', param, op),
        },
        {
            name:  'name.printed',
            short: 'pn',
            query: ({ param, op }) => textQuery('parts.printed.name', param, op),
        },
        {
            name:  'name',
            short: 'n',
            query: ({ param, op }) => ({
                $or: [
                    textQuery('parts.oracle.name', param, op),
                    textQuery('parts.unified.name', param, op),
                    textQuery('parts.printed.name', param, op),
                ],
            }),
        },
        {
            name:  'text.oracle',
            short: 'ox',
            query: ({ param, op }) => textQuery('parts.oracle.text', param, op),
        },
        {
            name:  'text.unified',
            short: 'ux',
            query: ({ param, op }) => textQuery('parts.unified.text', param, op),
        },
        {
            name:  'text.printed',
            short: 'px',
            query: ({ param, op }) => textQuery('parts.printed.text', param, op),
        },
        {
            name:  'text',
            short: 'x',
            query: ({ param, op }) => ({
                $or: [
                    textQuery('parts.oracle.text', param, op),
                    textQuery('parts.unified.text', param, op),
                    textQuery('parts.printed.text', param, op),
                ],
            }),
        },
        {
            name:  'type.oracle',
            short: 'ot',
            query: ({ param, op }) => textQuery('parts.oracle.typeline', param, op),
        },
        {
            name:  'type.unified',
            short: 'ut',
            query: ({ param, op }) => textQuery('parts.unified.typeline', param, op),
        },
        {
            name:  'type.printed',
            short: 'pt',
            query: ({ param, op }) => textQuery('parts.printed.typeline', param, op),
        },
        {
            name:  'type',
            short: 't',
            query: ({ param, op }) => ({
                $or: [
                    textQuery('parts.oracle.typeline', param, op),
                    textQuery('parts.unified.typeline', param, op),
                    textQuery('parts.printed.typeline', param, op),
                ],
            }),
        },
        {
            name:  'flavor',
            short: 'fv',
            query: ({ param, op }) => textQuery('parts.flavorText', param, op, false),
        },
        {
            name:  ' rarity',
            short: 'r',
            query: ({ param, op }) => {
                if (param instanceof RegExp) {
                    throw new QueryError({
                        type:  'regex/disabled',
                        value: '',
                    });
                }

                const rarity = ({
                    c: 'common',
                    u: 'uncommon',
                    r: 'rare',
                    m: 'mythic',
                } as Record<string, string>)[param] || param;

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

        const aggregate = Card.aggregate().allowDiskUse(true).match({ $and: q });

        if (!dev && !onlyId) {
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
                    .sort({ langIsLocale: -1, langIsEnglish: -1, releaseDate: -1 })
                    .group({ _id: '$cardId', data: { $first: '$$ROOT' } })
                    .replaceRoot('data');
            }
        }

        const total = (
            await Card.aggregate(aggregate.pipeline())
                .allowDiskUse(true)
                .group({ _id: null, count: { $sum: 1 } })
        )[0]?.count ?? 0;

        if (onlyId) {
            const result = await aggregate.group({ _id: '$cardId' });

            return { total, cards: result.map(v => v._id) };
        } else if (dev) {
            const cards = await Card.aggregate(aggregate.pipeline())
                .limit(1);

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

            const cards = await aggregate;

            return { cards, total, page };
        }
    },
} as QueryModel<QueryResult>;
