import { ResultPattern } from './pattern';

import { castArray } from 'lodash';

export type Operator = ':' | '' | '<' | '<=' | '=' | '>' | '>=';
export type Qualifier = '!';

export const defaultOperator = [':', '='] as const;
export const numericOperator = ['=', '<', '<=', '>', '>='] as const;
export const allOperator = [':', ...numericOperator] as const;
export const defaultQualifier = ['!'] as const;

export type DefaultOperator = (typeof defaultOperator)[number];
export type NumericOperator = (typeof numericOperator)[number];
export type AllOperator = (typeof allOperator)[number];
export type DefaultQualifier = (typeof defaultQualifier)[number];

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

export type Command<
    M extends string,
    O extends Operator,
    Q extends Qualifier,
    AR extends boolean,
    P,
> = {
    id: string;
    alt: string[];
    pattern: ResultPattern<P>;
    modifiers?: M[] | Record<M, string>;
    operators: O[];
    qualifiers: Q[];
    allowRegex: AR;
};

export type CommandOption<
    M extends string,
    O extends Operator,
    Q extends Qualifier,
    AR extends boolean,
    P,
> = {
    id: string;
    alt?: string[] | string;
    pattern?: P;
    modifiers?: Record<M, string> | readonly M[];
    operators: readonly O[];
    qualifiers?: readonly Q[];
    allowRegex?: AR;
};

export function defineCommand<
    M extends string,
    O extends Operator,
    Q extends Qualifier,
    AR extends boolean,
    P,
>(options: CommandOption<M, O, Q, AR, P>): Command<M, O, Q, boolean extends AR ? false : AR, P> {
    const {
        id,
        alt,
        pattern,
        modifiers,
        operators,
        qualifiers = [],
        allowRegex = false,
    } = options;

    return {
        id,
        alt:        castArray(alt ?? []),
        pattern:    castArray(pattern ?? []) as ResultPattern<P>,
        modifiers:  modifiers as M[] | Record<M, string>,
        operators:  operators as O[],
        qualifiers: qualifiers as Q[],
        allowRegex: allowRegex as any,
    };
}
