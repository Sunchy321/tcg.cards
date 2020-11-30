import { QueryModel } from '@/search/interface';
import { QueryError } from '@/search';
import Card from '@/magic/db/card';

import { escapeRegExp } from 'lodash';

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

function textQuery(key: string, param: string|RegExp, op: string|undefined) {
    const regexSource = typeof param === 'string' ? escapeRegExp(param) : param.source;

    switch (op) {
    case ':':
        return { [key]: new RegExp(regexSource, 'mi') };
    case '!:':
        return { [key]: { $not: new RegExp(regexSource, 'mi') } };
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
    total: number,
    cards: { cardId: string, set: string, number: string, lang: string, layout: string }[]
}

export default {
    commands: [
        {
            name:  '',
            query: ({ param }) => ({
                $or: [
                    textQuery('parts.oracle.name', param, ':'),
                    textQuery('parts.unified.name', param, ':'),
                    textQuery('parts.printed.name', param, ':'),
                    textQuery('parts.oracle.text', param, ':'),
                    textQuery('parts.unified.text', param, ':'),
                    textQuery('parts.printed.text', param, ':'),
                ],
            }),
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
    ],

    aggregate: async (q, o) => {
        const aggregate = Card.aggregate().match({ $and: q });

        const total = await Card.aggregate(aggregate.pipeline())
            .group({ _id: null, count: { $sum: 1 } });

        if (o.one != null) {
            const cards = await Card.aggregate(aggregate.pipeline())
                .limit(1);

            return { ...cards[0], total: total[0]?.count || 0 };
        } else {
            const cards = await Card.aggregate(aggregate.pipeline())
                .project({
                    _id:    0,
                    cardId: 1,
                    set:    '$setId',
                    number: 1,
                    lang:   1,
                    layout: 1,
                })
                .limit(100);

            return { total: total[0]?.count || 0, cards };
        }
    },
} as QueryModel<QueryResult>;
