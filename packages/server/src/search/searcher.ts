/* eslint-disable @typescript-eslint/no-explicit-any */
import { Command, PostAction } from './command';
import {
    RawQuery, Query, transformMulti, simplify,
} from './query';

import pegjs from 'pegjs';
import { readFileSync } from 'fs';
import { join } from 'path';

import { mapValues, omit } from 'lodash';
import { QueryError } from './error';

export type Options = Record<string, string>;

export type DBQuery = any | { '$and': DBQuery[] } | { '$or': DBQuery[] };

export type Search<T> = (query: DBQuery, posts: PostAction[], options: Options) => Promise<T>;

export type Model = {
    commands: Command<unknown, unknown, unknown, unknown>[];
    search: Search<any>;
};

export type TranslatedQuery = {
    dbQuery: DBQuery;
    post: PostAction[];
};

export type Result<T> = {
    text: string;
    queries: RawQuery[];
    errors: { type: string, value: string, query?: string }[];
    result: T | null;
};

export type Searcher<M extends Model> = {
    [K in keyof M as Exclude<K, 'commands'>]: M[K] extends (...args: any) => infer R
        ? R extends Promise<infer T>
            ? (text: string, options?: Options) => Promise<Result<T>>
            : (text: string, options?: Options) => Result<R>
        : never;
};

const parser = pegjs.generate(
    readFileSync(join(__dirname, 'syntax.pegjs')).toString(),
);

function translate(
    query: Query,
    commands: Command<unknown, unknown, unknown, unknown>[],
): TranslatedQuery {
    if (query.type === 'and' || query.type === 'or') {
        const value = query.value.map(v => translate(v, commands));

        const dbQuery = [];
        const post = [];

        for (const v of value) {
            if (v.dbQuery == null) {
                post.push(...v.post);
            } else if (v.dbQuery[`$${query.type}`] != null) {
                dbQuery.push(...v.dbQuery[`$${query.type}`]);
            } else {
                dbQuery.push(v.dbQuery);
            }
        }

        if (dbQuery.length > 0) {
            return {
                dbQuery: { [`$${query.type}`]: dbQuery },
                post,
            };
        } else {
            return {
                dbQuery: undefined,
                post,
            };
        }
    }

    const mc = commands.find(
        // eslint-disable-next-line @typescript-eslint/prefer-optional-chain
        co => co.id === query.cmd || (co.alt != null && co.alt.includes(query.cmd)),
    );

    if (mc == null) {
        throw new QueryError({ type: 'unknown-command' });
    }

    const allowRegex: boolean = (mc.allowRegex as boolean) ?? true;

    let param;

    if (query.param.type === 'string') {
        param = query.param.value;
    } else {
        if (!allowRegex) {
            throw new QueryError({ type: 'invalid-regex' });
        }

        try {
            param = new RegExp(query.param.value);
        } catch (e) {
            throw new QueryError({
                type:  'invalid-regex',
                value: query.param.value,
            });
        }
    }

    if (mc.op != null && !mc.op.includes(query.op)) {
        throw new QueryError({ type: 'invalid-operator' });
    }

    if (mc.postStep == null) {
        try {
            return {
                dbQuery: mc.query!({ param, op: query.op, qual: query.qual }),
                post:    [],
            };
        } catch (e) {
            throw new QueryError({ type: e.type });
        }
    } else {
        if (!query.topLevel) {
            throw new QueryError({ type: 'not-toplevel-command' });
        }

        return {
            dbQuery: undefined,
            post:    [{
                step:   mc.postStep as string,
                action: mc.post!({ param, op: query.op, qual: query.qual }),
            }],
        };
    }
}

export function createSearcher<M extends Model>(model: M): Searcher<M> {
    return mapValues(
        omit(model, 'commands'),
        (search: Search<any>) => async (text: string, options: Record<string, string> = {}) => {
            const trimmedText = text.trim();

            if (trimmedText === '') {
                return {
                    text,
                    command: [],
                    errors:  [{ type: 'empty-input' }],
                    result:  [],
                };
            }

            try {
                const rawQuery = parser.parse(trimmedText) as RawQuery;

                const query = transformMulti(rawQuery);

                const command = translate(simplify(query), model.commands);

                if (command.dbQuery == null) {
                    return { text, command };
                }

                const result = await search(command.dbQuery, command.post, options);

                return { text, query, result };
            } catch (e) {
                return { text, error: e };
            }
        },
    ) as unknown as Searcher<M>;
}
