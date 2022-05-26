/* eslint-disable @typescript-eslint/no-explicit-any */
import { Command, PostAction } from './command';
import { Query } from './query';

import pegjs from 'pegjs';
import { readFileSync } from 'fs';
import { join } from 'path';

import { mapValues, omit } from 'lodash';

export type Options = Record<string, string>;

export type DBQuery = any;

export type Search<T> = (query: DBQuery, posts: PostAction[], options: Options) => Promise<T>;

export type Model = {
    commands: Command<unknown, unknown, unknown, unknown>[];
    search: Search<any>;
};

export type Result<T> = {
    text: string;
    queries: Query[];
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

export class QueryError extends Error {
    type: string;
    value?: any;

    constructor(arg: { type: string, value?: any }) {
        super();

        this.type = arg.type;
        this.value = arg.value;
    }
}

export function createSearcher<M extends Model>(model: M): Searcher<M> {
    return mapValues(
        omit(model, 'commands'),
        (search: Search<any>) => async (text: string, options: Record<string, string> = {}) => {
            const trimmed = text.trim();

            const commands: Query[] = trimmed !== '' ? parser.parse(trimmed) : [];

            const queries = [];
            const posts = [];
            const errors = [];

            for (const c of commands) {
                let param;

                if (c.param.type === 'string') {
                    param = c.param.value;
                } else {
                    try {
                        param = new RegExp(c.param.value);
                    } catch (e) {
                        errors.push({
                            type:  'regex/invalid',
                            value: c.param.value,
                        });

                        continue;
                    }
                }

                const mc = model.commands.find(
                    // eslint-disable-next-line @typescript-eslint/prefer-optional-chain
                    co => co.id === c.cmd || (co.alt != null && co.alt.includes(c.cmd)),
                );

                if (mc == null) {
                    errors.push({ type: 'unknown-command', query: c });
                    continue;
                }

                // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
                if (!mc.allowRegex) {
                    errors.push({ type: 'invalid-regex', query: c });
                }

                if (mc.op != null && !mc.op.includes(c.op)) {
                    errors.push({ type: 'invalid-operator', query: c });
                }

                if (mc.postStep == null) {
                    try {
                        queries.push(mc.query!({ param, op: c.op, qual: c.qual }));
                    } catch (e) {
                        errors.push({ type: e.type, query: c });
                    }
                } else {
                    posts.push({
                        step:   mc.postStep as string,
                        action: mc.post!({ param, op: c.op, qual: c.qual }),
                    });
                }
            }

            const result = queries.length > 0 ? await search(queries, posts, options) : null;

            return {
                text,
                commands,
                errors,
                result,
            };
        },
    ) as unknown as Searcher<M>;
}
