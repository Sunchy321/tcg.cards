import {
    DBQuery, Options, createSearcher,
} from '@/search/searcher';
import { PostAction, command } from '@/search/command';
import { QueryError } from '@/search/error';

import Card from '@/magic/db/card';

import * as builtin from '@/search/builtin';

import color from './color';
import cost from './cost';
import halfNumber from './half-number';

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

const orderByCommand = command({
    id:         'order',
    postStep:   'order',
    allowRegex: false,
    op:         [':'],
    qual:       [],

    post: ({ param }) => {
        param = param.toLowerCase();

        const [type, dir] = ((): [string, -1 | 1] => {
            if (param.endsWith('+')) {
                return [param.slice(0, -1), 1];
            }

            if (param.endsWith('-')) {
                return [param.slice(0, -1), -1];
            }

            return [param, 1];
        })();

        return agg => {
            switch (type) {
            case 'name':
                agg.sort({ 'part.unified.name': dir });
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

export default createSearcher({
    commands: [
        command({
            id:    '',
            query: ({ param }) => {
                if (typeof param === 'string') {
                    // search stats
                    if (/^[^/]+\/[^/]+$/.test(param)) {
                        const [power, toughness] = param.split('/');

                        return {
                            ...halfNumber.query('parts.power', power, '=', []),
                            ...halfNumber.query('parts.toughness', toughness, '=', []),
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
                                builtin.text.query('parts.oracle.text', param, ':', []),
                                builtin.text.query('parts.unified.text', param, ':', []),
                                builtin.text.query('parts.printed.text', param, ':', []),
                                cost.query(param, ':', []),
                            ],
                        };
                    }
                }

                return {
                    $or: [
                        builtin.text.query('parts.oracle.name', param, ':', []),
                        builtin.text.query('parts.unified.name', param, ':', []),
                    ],
                };
            },
        }),
        command({
            id:         '#',
            allowRegex: false,
            op:         [''],
            query:      ({ param, qual }) => {
                if (!qual.includes('!')) {
                    return {
                        $or: [
                            { tags: param },
                            { localTags: param },
                        ],
                    };
                } else {
                    return {
                        $and: [
                            { tags: { $ne: param } },
                            { localTags: { $ne: param } },
                        ],
                    };
                }
            },
        }),
        builtin.simple({ id: 'layout' }),
        builtin.simple({ id: 'set', alt: ['expansion', 's', 'e'] }),
        builtin.simple({ id: 'number', alt: ['num'] }),
        builtin.simple({ id: 'lang', alt: ['l'] }),
        cost({ id: 'cost', alt: ['mana', 'mana-cost', 'm'] }),
        builtin.number({ id: 'mana-value', alt: ['mv', 'cmc'], key: 'manaValue' }),
        color({ id: 'color', alt: ['c'], key: 'parts.color' }),
        color({ id: 'color-identity', alt: ['cd'], key: 'colorIdentity' }),
        color({ id: 'color-indicator', alt: ['ci'], key: 'parts.colorIndicator' }),
        halfNumber({ id: 'power', alt: ['pow'], key: 'parts.power' }),
        halfNumber({ id: 'toughness', alt: ['tou'], key: 'parts.toughness' }),
        halfNumber({ id: 'loyalty', key: 'parts.loyalty' }),
        builtin.text({ id: 'name.oracle', alt: ['on'], key: 'parts.oracle.name' }),
        builtin.text({ id: 'name.unified', alt: ['un'], key: 'parts.unified.name' }),
        builtin.text({ id: 'name.printed', alt: ['pn'], key: 'parts.printed.name' }),
        command({
            id:    'name',
            alt:   ['n'],
            op:    [':', '='],
            query: ({ param, op, qual }) => ({
                [!qual.includes('!') ? '$or' : '$and']: [
                    builtin.text.query('parts.oracle.name', param, op, qual),
                    builtin.text.query('parts.unified.name', param, op, qual),
                    builtin.text.query('parts.printed.name', param, op, qual),
                ],
            }),
        }),
        command({
            id:    'name',
            alt:   ['n'],
            op:    [':', '='],
            query: ({ param, op, qual }) => ({
                [!qual.includes('!') ? '$or' : '$and']: [
                    builtin.text.query('parts.oracle.name', param, op, qual),
                    builtin.text.query('parts.unified.name', param, op, qual),
                    builtin.text.query('parts.printed.name', param, op, qual),
                ],
            }),
        }),
        builtin.text({ id: 'type.oracle', alt: ['ot'], key: 'parts.oracle.typeline' }),
        builtin.text({ id: 'type.unified', alt: ['ut'], key: 'parts.unified.typeline' }),
        builtin.text({ id: 'type.printed', alt: ['pt'], key: 'parts.printed.typeline' }),
        command({
            id:    'type',
            alt:   ['t'],
            op:    [':', '='],
            query: ({ param, op, qual }) => ({
                [!qual.includes('!') ? '$or' : '$and']: [
                    builtin.text.query('parts.oracle.typeline', param, op, qual),
                    builtin.text.query('parts.unified.typeline', param, op, qual),
                    builtin.text.query('parts.printed.typeline', param, op, qual),
                ],
            }),
        }),
        builtin.text({ id: 'text.oracle', alt: ['ox'], key: 'parts.oracle.text' }),
        builtin.text({ id: 'text.unified', alt: ['ux'], key: 'parts.unified.text' }),
        builtin.text({ id: 'text.printed', alt: ['px'], key: 'parts.printed.text' }),
        command({
            id:    'text',
            alt:   ['x'],
            op:    [':', '='],
            query: ({ param, op, qual }) => ({
                [!qual.includes('!') ? '$or' : '$and']: [
                    builtin.text.query('parts.oracle.text', param, op, qual),
                    builtin.text.query('parts.unified.text', param, op, qual),
                    builtin.text.query('parts.printed.text', param, op, qual),
                ],
            }),
        }),
        command({
            id:    'text.oracle-or-unified',
            alt:   ['o'],
            op:    [':', '='],
            query: ({ param, op, qual }) => ({
                [!qual.includes('!') ? '$or' : '$and']: [
                    builtin.text.query('parts.oracle.text', param, op, qual),
                    builtin.text.query('parts.unified.text', param, op, qual),
                ],
            }),
        }),
        builtin.text({
            id: 'flavor-text', alt: ['flavor', 'ft'], key: 'parts.flavorText', multiline: false,
        }),
        builtin.text({ id: 'flavor-name', alt: ['fn'], key: 'parts.flavorName' }),
        command({
            id:         'rarity',
            alt:        ['r'],
            allowRegex: false,
            op:         [':', '='],
            query:      ({ param, op, qual }) => {
                const rarity = (
                    {
                        c: 'common',
                        u: 'uncommon',
                        r: 'rare',
                        m: 'mythic',
                        s: 'special',
                    } as Record<string, string>
                )[param] || param;

                return builtin.simple.query('rarity', rarity, op, qual);
            },
        }),
        command({
            id:         'release-date',
            alt:        ['date'],
            allowRegex: false,
            op:         ['=', '<', '<=', '>', '>='],
            query:      ({ param, op, qual }) => {
                switch (op) {
                case '=':
                    if (!qual.includes('!')) {
                        return { releaseDate: { $eq: param } };
                    } else {
                        return { releaseDate: { $ne: param } };
                    }
                case '>':
                    return { releaseDate: { $gt: param } };
                case '>=':
                    return { releaseDate: { $gte: param } };
                case '<':
                    return { releaseDate: { $lt: param } };
                case '<=':
                    return { releaseDate: { $lte: param } };
                default:
                    throw new QueryError({ type: 'invalid-query' });
                }
            },
        }),
        command({
            id:         'format',
            alt:        ['f'],
            allowRegex: false,
            op:         [':'],
            query:      ({ param, qual }) => {
                if (param.includes(',')) {
                    const [format, status] = param.split(',');

                    if (!qual.includes('!')) {
                        return { [`legalities.${format}`]: status };
                    } else {
                        return { [`legalities.${format}`]: { $ne: status } };
                    }
                } else {
                    if (!qual.includes('!')) {
                        return {
                            [`legalities.${param}`]: { $in: ['legal', 'restricted'] },
                        };
                    } else {
                        return {
                            [`legalities.${param}`]: { $nin: ['legal', 'restricted'] },
                        };
                    }
                }
            },
        }),
        command({
            id:         'counter',
            allowRegex: false,
            op:         [':'],
            query:      ({ param, qual }) => {
                param = toIdentifier(param);

                if (!qual.includes('!')) {
                    return { counters: param };
                } else {
                    return { counters: { $ne: param } };
                }
            },
        }),
        command({
            id:         'keyword',
            allowRegex: false,
            op:         [':'],
            query:      ({ param, qual }) => {
                param = toIdentifier(param);

                if (!qual.includes('!')) {
                    return { keywords: param };
                } else {
                    return { keywords: { $ne: param } };
                }
            },
        }),

        orderByCommand,
    ],

    search: async (q: DBQuery, p: PostAction[], o: Options) => {
        const groupBy = o['group-by'] ?? 'card';
        const orderBy = o['order-by'] ?? 'id+';
        const page = parseOption(o.page, 1);
        const pageSize = parseOption(o['page-size'], 100);
        const locale = o.locale ?? 'en';

        const aggregate = Card.aggregate()
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

        const orderAction = p.find(v => v.step === 'order');

        if (orderAction != null) {
            orderAction.action(aggregate);
        } else {
            orderByCommand.post!({ param: orderBy, op: ':', qual: [] })(aggregate);
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

    dev: async (q: DBQuery, p: PostAction[], o: Options) => {
        const aggregate = Card.aggregate().allowDiskUse(true).match(q);

        const total = (
            await Card.aggregate(aggregate.pipeline())
                .allowDiskUse(true)
                .group({ _id: null, count: { $sum: 1 } })
        )[0]?.count ?? 0;

        const cards = await Card.aggregate(aggregate.pipeline())
            .sort({ releaseDate: -1, cardId: 1 })
            .limit(o.sample);

        return {
            cards,
            total,
        };
    },

    searchId: async (q: DBQuery) => {
        const result = await Card
            .aggregate()
            .allowDiskUse(true)
            .match(q)
            .group({ _id: '$cardId' });

        return result.map(v => v._id) as string[];
    },
});
