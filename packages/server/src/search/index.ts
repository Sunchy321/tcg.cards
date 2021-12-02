/* eslint-disable @typescript-eslint/no-explicit-any */
import pegjs from 'pegjs';
import { readFileSync } from 'fs';
import { join } from 'path';

import {
    Searcher, Model, Item, Query,
} from './interface';

import { dataPath } from '@/static';
import { mapValues, omit } from 'lodash';

const parser = pegjs.generate(
    readFileSync(join(dataPath, 'syntax.pegjs')).toString(),
);

export class QueryError extends Error {
    type: string;
    value: string;

    constructor(arg: { type: string, value: string }) {
        super();

        this.type = arg.type;
        this.value = arg.value;
    }
}

export function createSearcher<M extends Model>(model: M): Searcher<M> {
    return mapValues(
        omit(model, 'commands'),
        (queryFunc: Query<any>) => async (text: string, options: Record<string, string> = {}) => {
            const trimmed = text.trim();

            const commands: Item[] = trimmed !== '' ? parser.parse(trimmed) : [];

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
                    const mc = model.commands.find(co => co.id === '');

                    if (mc == null) {
                        errors.push({ type: 'command/unknown', value: '' });
                        continue;
                    }

                    try {
                        queries.push(mc.query({ param, options }));
                    } catch (e) {
                        errors.push({ type: e.type, value: e.value, query: mc.id });
                    }
                } else {
                    const mc = model.commands.find(
                        co => co.id === c.type || (co?.alt?.includes(c.type) ?? false),
                    );

                    if (mc == null) {
                        errors.push({ type: 'command/unknown', value: c.type });
                        continue;
                    }

                    try {
                        queries.push(mc.query({ param, op: c.op, options }));
                    } catch (e) {
                        errors.push({ type: e.type, value: e.value, query: mc.id });
                    }
                }
            }

            const result = queries.length > 0 ? await queryFunc(queries, options) : null;

            return {
                text,
                commands,
                errors,
                result,
            };
        },
    ) as unknown as Searcher<M>;
}
