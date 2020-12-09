/* eslint-disable @typescript-eslint/no-explicit-any */
import pegjs from 'pegjs';
import { readFileSync } from 'fs';

import { QueryItem, QueryModel } from './interface';

const parser = pegjs.generate(
    readFileSync('./src/search/syntax.pegjs').toString(),
);

export type SearchResult<T> = {
    commands: QueryItem[];
    queries: any[];
    errors: { type: string; value: string, query?: string }[];
    result: T | null
}

export class QueryError extends Error {
    type: string;
    value: string;

    constructor(arg: { type: string, value:string }) {
        super();

        this.type = arg.type;
        this.value = arg.value;
    }
}

export class Searcher<T> {
    model: QueryModel<T>;

    constructor(model: QueryModel<T>) {
        this.model = model;
    }

    async search(text: string, options: Record<string, string>): Promise<SearchResult<T>> {
        const commands: QueryItem[] = text.trim() !== '' ? parser.parse(text.trim()) : [];

        const queries = [];
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

            if (c.type == null) {
                const mc = this.model.commands.find(co => co.name === '');

                if (mc == null) {
                    errors.push({ type: 'command/unknown', value: '' });
                    continue;
                }

                try {
                    queries.push(mc.query({ param, options }));
                } catch (e) {
                    errors.push({ type: e.type, value: e.value, query: mc.name });
                }
            } else {
                const mc = this.model.commands.find(
                    co => co.name === c.type || co.short === c.type,
                );

                if (mc == null) {
                    errors.push({ type: 'command/unknown', value: c.type });
                    continue;
                }

                try {
                    queries.push(mc.query({ param, op: c.op, options }));
                } catch (e) {
                    errors.push({ type: e.type, value: e.value, query: mc.name });
                }
            }
        }

        const result = queries.length > 0 ? await this.model.aggregate(queries, options) : null;

        return {
            commands,
            queries,
            errors,
            result,
        };
    }
}
