import { and, Column, eq, gt, gte, isNotNull, isNull, lt, lte, ne, SQL, sql } from 'drizzle-orm';

import { ServerCommandOf, QueryOption } from '@/search/command';
import { QueryError } from '@search/command/error';

import { NumericCommand } from '@model/magic/search/command/numeric';

import _ from 'lodash';

export type NumericServerCommand = ServerCommandOf<NumericCommand>;

export type NumericServerOption = {
    column: Column;
};

export type HalfNumberQueryOption = QueryOption<NumericCommand, NumericServerOption>;

function query(options: HalfNumberQueryOption): SQL {
    const { column, parameter: rawParameter, operator, qualifier } = options;

    // special case for [X]
    const parameter = (() => {
        if (rawParameter === 'x') {
            return rawParameter.toUpperCase();
        }

        return rawParameter;
    })();

    const num = Number.parseFloat(parameter);

    switch (operator) {
    case ':':
        if (parameter === 'nan') {
            if (!qualifier.includes('!')) {
                return and(
                    isNotNull(column),
                    isNull(sql`string_to_double(${column})`),
                )!;
            } else {
                return and(
                    isNotNull(column),
                    isNotNull(sql`string_to_double(${column})`),
                )!;
            }
        } else {
            if (!qualifier.includes('!')) {
                return eq(column, parameter);
            } else {
                return ne(column, parameter);
            }
        }
    case '=':
        if (!qualifier.includes('!')) {
            if (Number.isNaN(num)) {
                return eq(column, parameter);
            } else {
                return eq(sql`string_to_double(${column})`, num);
            }
        } else {
            if (Number.isNaN(num)) {
                return ne(column, parameter);
            } else {
                return ne(sql`string_to_double(${column})`, num);
            }
        }
    case '>':
        if (Number.isNaN(num)) {
            throw new QueryError({ type: 'invalid-query' });
        } else {
            return gt(sql`string_to_double(${column})`, num);
        }
    case '>=':
        if (Number.isNaN(num)) {
            throw new QueryError({ type: 'invalid-query' });
        } else {
            return gte(sql`string_to_double(${column})`, num);
        }
    case '<':
        if (Number.isNaN(num)) {
            throw new QueryError({ type: 'invalid-query' });
        } else {
            return lt(sql`string_to_double(${column})`, num);
        }
    case '<=':
        if (Number.isNaN(num)) {
            throw new QueryError({ type: 'invalid-query' });
        } else {
            return lte(sql`string_to_double(${column})`, num);
        }
    default:
        throw new QueryError({ type: 'invalid-query' });
    }
}

export default function numeric(command: NumericCommand, options: NumericServerOption): NumericServerCommand {
    const { column } = options ?? {};

    return {
        ...command,
        query: args => query({ column, ...args }),
    };
}

numeric.query = query;
