import { Operator, Qualifier } from './command';

import { uniq } from 'lodash';
import { QueryError } from './error';

export interface QueryParam {
    type: 'regex' | 'string';
    value: string;
}

export type PrimaryQuery = {
    type: undefined;
    cmd: string;
    op: Operator;
    qual: Qualifier[];
    param: QueryParam;
};

export type RawNotQuery = { type: 'not', value: RawQuery };
export type RawMultiQuery = { type: 'multi', seps: ('' | 'and' | 'or')[], value: RawQuery[] };
export type RawQuery = PrimaryQuery | RawMultiQuery | RawNotQuery;

export type Step1NotQuery = { type: 'not', value: Step1Query };
export type Step1AndQuery = { type: 'and', value: Step1Query[] };
export type Step1OrQuery = { type: 'or', value: Step1Query[] };
export type Step1Query = {
    topLevel: boolean;
} & (PrimaryQuery | Step1AndQuery | Step1NotQuery | Step1OrQuery);

export type AndQuery = { type: 'and', value: Query[] };
export type OrQuery = { type: 'or', value: Query[] };
export type Query = {
    topLevel: boolean;
} & (AndQuery | OrQuery | PrimaryQuery);

export function transformMulti(query: RawQuery, topLevel = true): Step1Query {
    if (query.type === 'multi') {
        if (uniq(query.seps).length > 1) {
            throw new QueryError({ type: 'mixed operator' });
        }

        if (query.value.length === 1) {
            return transformMulti(query.value[0]);
        }

        const type = query.seps[0] !== '' ? query.seps[0] : 'and';

        return {
            type,
            value: query.value.map(v => transformMulti(v, topLevel)),
            topLevel,
        };
    }

    if (query.type === 'not') {
        return {
            type:  'not',
            value: transformMulti(query.value, false),
            topLevel,
        };
    }

    return { ...query, topLevel };
}

export function simplify(query: Step1Query): Query {
    if (query.type === 'not') {
        if (query.value.type === 'not') {
            return {
                ...simplify(query.value.value),

                topLevel: false,
            };
        }

        const value = simplify(query.value);

        if (value.type === 'and' || value.type === 'or') {
            return simplify({
                type:  value.type === 'and' ? 'or' : 'and',
                value: value.value.map(v => ({
                    type:     'not',
                    value:    v,
                    topLevel: v.topLevel,
                })),
                topLevel: query.topLevel,
            });
        } else {
            return {
                type: undefined,
                cmd:  value.cmd,
                op:   value.op,
                qual: value.qual.includes('!')
                    ? value.qual.filter(v => v !== '!')
                    : ['!', ...value.qual],
                param:    value.param,
                topLevel: query.topLevel,
            };
        }
    } else if (query.type === 'and' || query.type === 'or') {
        const simplifiedValue = [];

        for (const v of query.value) {
            const value = simplify(v);

            if (value.type === query.type) {
                simplifiedValue.push(...value.value);
            } else {
                simplifiedValue.push(value);
            }
        }

        return {
            type:     query.type,
            value:    simplifiedValue,
            topLevel: query.topLevel,
        };
    } else {
        return query;
    }
}
