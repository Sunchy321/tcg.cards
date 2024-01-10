import {
    Command, CommonCommand, Operator, Qualifier,
} from './index';
import { PatternContext } from './pattern';

import { Aggregate } from 'mongoose';

export type DBQuery = any | { '$and': DBQuery[] } | { '$or': DBQuery[] };

type Select<B, T, F> = B extends true ? T : F;

type OmitNever<T> = {
    [K in keyof T as [T[K]] extends [never] ? never : K]: T[K]
};

export type Argument<
    M extends string,
    O extends Operator,
    Q extends Qualifier,
    AR extends boolean,
    P,
    X,
> = OmitNever<{
    modifier?: M;
    parameter: Select<AR, (RegExp | string), string>;
    operator: O;
    qualifier: Q[];
    pattern: PatternContext<P>;
    meta: X;
}>;

export type CommonArgument = {
    modifier?: string;
    parameter: RegExp | string;
    operator: Operator;
    qualifier: Qualifier[];
    pattern?: Record<string, string>;
    meta?: any;
};

export type QueryFunc<
    M extends string,
    O extends Operator,
    Q extends Qualifier,
    AR extends boolean,
    P,
    X,
> = (arg: Argument<M, O, Q, AR, P, X>) => DBQuery;

export type PostFunc<
    M extends string,
    O extends Operator,
    Q extends Qualifier,
    AR extends boolean,
    P,
    X,
> = (arg: Argument<M, O, Q, AR, P, X>) => ((agg: Aggregate<any>) => void);

export type QueryFuncOf<C> = C extends Command<infer M, infer O, infer Q, infer AR, infer P, infer X>
    ? QueryFunc<string extends M ? never : M, O, Q, AR, P, X>
    : never;

export type PostFuncOf<C> = C extends Command<infer M, infer O, infer Q, infer AR, infer P, infer X>
    ? PostFunc<string extends M ? never : M, O, Q, AR, P, X>
    : never;

export type QueryOption<C, O> = [O] extends [never]
    ? Parameters<QueryFuncOf<C>>[0]
    : Parameters<QueryFuncOf<C>>[0] & Required<O>;

export type BackendCommand<
    M extends string,
    O extends Operator,
    Q extends Qualifier,
    AR extends boolean,
    P,
    X,
> = Command<M, O, Q, AR, P, X> & {
    query: QueryFuncOf<Command<M, O, Q, AR, P, X>>;
    phase?: string;
    post?: PostFuncOf<Command<M, O, Q, AR, P, X>>;
};

export type CommonBackendCommand = CommonCommand & {
    query: (arg: CommonArgument) => DBQuery;
    phase?: string;
    post?: (arg: CommonArgument)=> ((agg: Aggregate<any>) => void);
};

export type BackendOf<C> = C extends Command<infer M, infer O, infer Q, infer AR, infer P, infer X>
    ? BackendCommand<M, O, Q, AR, P, X>
    : never;

export type BackendCommandOption<
    M extends string,
    O extends Operator,
    Q extends Qualifier,
    AR extends boolean,
    P,
    X,
> = {
    command: Command<M, O, Q, AR, P, X>;
    query: QueryFunc<string extends M ? never : M, O, Q, AR, P, X>;
    post?: PostFunc<string extends M ? never : M, O, Q, AR, P, X>;
};

export function defineBackendCommand<
    M extends string,
    O extends Operator,
    Q extends Qualifier,
    AR extends boolean,
    P,
    X,
>(options: BackendCommandOption<M, O, Q, AR, P, X>): BackendCommand<M, O, Q, AR, P, X> {
    const {
        command, query, post,
    } = options;

    return { ...command, query, post };
}
