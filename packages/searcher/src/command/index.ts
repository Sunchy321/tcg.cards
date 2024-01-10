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
    X,
> = {
    id: string;
    alt?: string[];
    pattern: P;
    modifiers?: M[] | Record<M, string>;
    operators: O[];
    qualifiers: Q[];
    allowRegex: AR;
    meta: X;
};

export type CommonCommand = {
    id: string;
    alt?: string[];
    pattern?: string[];
    modifiers?: Record<string, string> | string[];
    operators: Operator[];
    qualifiers: Qualifier[];
    allowRegex: boolean;
    meta: any;
};

export type CommandOption<
    M extends string,
    O extends Operator,
    Q extends Qualifier,
    AR extends boolean,
    P,
    X,
> = {
    id: string;
    alt?: string[] | string;
    pattern?: P;
    modifiers?: Record<M, string> | readonly M[];
    operators: readonly O[];
    qualifiers?: readonly Q[];
    allowRegex?: AR;
    meta?: X;
};

export function defineCommand<
    M extends string,
    O extends Operator,
    Q extends Qualifier,
    AR extends boolean,
    P,
    X,
>(
    options: CommandOption<M, O, Q, AR, P, X>,
): Command<M, O, Q, boolean extends AR ? false : AR, ResultPattern<P>, X extends unknown ? never : X> {
    type R = Command<M, O, Q, boolean extends AR ? false : AR, ResultPattern<P>, X extends unknown ? never : X>;

    const {
        id,
        alt,
        pattern,
        modifiers,
        operators,
        qualifiers = [],
        allowRegex = false,
        meta,
    } = options;

    return {
        id,
        alt:        castArray(alt ?? []),
        pattern:    (pattern != null ? castArray(pattern) : pattern) as R['pattern'],
        modifiers:  modifiers as R['modifiers'],
        operators:  operators as R['operators'],
        qualifiers: qualifiers as R['qualifiers'],
        allowRegex: allowRegex as any,
        meta:       meta as R['meta'],
    };
}
