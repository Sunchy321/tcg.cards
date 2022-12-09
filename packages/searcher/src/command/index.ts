import { Aggregate } from 'mongoose';

import { castArray } from 'lodash';

export type Operator = ':' | '<' | '<=' | '=' | '>' | '>=';
export type Qualifier = '!';

export const defaultOperator = [':', '='] as const;
export const numericOperator = ['=', '<', '<=', '>', '>='] as const;
export const allOperator = [':', ...numericOperator] as const;
export const defaultQualifier = ['!'] as const;

export type DefaultOperator = (typeof defaultOperator)[number];
export type NumericOperator = (typeof numericOperator)[number];
export type AllOperator = (typeof allOperator)[number];
export type DefaultQualifier = (typeof defaultQualifier)[number];

export type DBQuery = any | { '$and': DBQuery[] } | { '$or': DBQuery[] };

export type Argument<
    M extends string,
    O extends Operator,
    Q extends Qualifier,
    AR extends boolean,
> = {
    modifier?: M;
    parameter: AR extends false ? string : (RegExp | string);
    operator: O;
    qualifier: Q[];
};

export type Context = {
    pattern: string;
};

export type QueryFunc<
    M extends string,
    O extends Operator,
    Q extends Qualifier,
    AR extends boolean,
> = (arg: Argument<M, O, Q, AR>, ctx: Context) => DBQuery;

export type PostFunc<
    M extends string,
    O extends Operator,
    Q extends Qualifier,
    AR extends boolean,
> = (arg: Argument<M, O, Q, AR>, ctx: Context) => ((agg: Aggregate<any>) => void);

export interface Command<
    M extends string,
    O extends Operator,
    Q extends Qualifier,
    AR extends boolean,
> {
    id: string;
    alt: string[];
    pattern: string[];
    modifiers: M[] | Record<M, string>;
    operators: O[];
    qualifiers: Q[];
    allowRegex: boolean extends AR ? false : AR;
    query: QueryFunc<string extends M ? never : M, O, Q, boolean extends AR ? false : AR>;
    post?: PostFunc<string extends M ? never : M, O, Q, boolean extends AR ? false : AR>;
}

export interface CommandOption<
    M extends string,
    O extends Operator,
    Q extends Qualifier,
    AR extends boolean,
> {
    id: string;
    alt?: string[] | string;
    pattern?: string[] | string;
    modifiers?: Record<M, string> | readonly M[];
    operators?: readonly O[];
    qualifiers?: readonly Q[];
    allowRegex?: AR;
    query: QueryFunc<string extends M ? never : M, O, Q, boolean extends AR ? false : AR>;
    post?: PostFunc<string extends M ? never : M, O, Q, boolean extends AR ? false : AR> ;
}

export function createCommand<
    M extends string,
    O extends Operator,
    Q extends Qualifier,
    AR extends boolean,
>(options: CommandOption<M, O, Q, AR>): Command<M, O, Q, AR> {
    const {
        id, alt, pattern, modifiers, operators, qualifiers, allowRegex, query, post,
    } = options;

    return {
        id,
        alt:        castArray(alt ?? []),
        pattern:    castArray(pattern ?? []),
        modifiers:  modifiers as M[] | Record<M, string>,
        operators:  operators as O[],
        qualifiers: qualifiers as Q[],
        allowRegex: (allowRegex ?? false) as Command<M, O, Q, AR>['allowRegex'],
        query,
        post,
    };
}
