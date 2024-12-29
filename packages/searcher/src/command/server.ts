import {
    Command, CommonCommand, Operator, Qualifier, Argument, CommonArgument,
} from './index';

import { Aggregate } from 'mongoose';

export type DBQuery = any | { '$and': DBQuery[] } | { '$or': DBQuery[] };

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

export type ServerCommand<
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

export type CommonServerCommand = CommonCommand & {
    query: (arg: CommonArgument) => DBQuery;
    phase?: string;
    post?: (arg: CommonArgument)=> ((agg: Aggregate<any>) => void);
};

export type ServerCommandOf<C> = C extends Command<infer M, infer O, infer Q, infer AR, infer P, infer X>
    ? ServerCommand<M, O, Q, AR, P, X>
    : never;

export type ServerCommandOption<
    M extends string,
    O extends Operator,
    Q extends Qualifier,
    AR extends boolean,
    P,
    X,
> = {
    command: Command<M, O, Q, AR, P, X>;
    query: QueryFunc<string extends M ? never : M, O, Q, AR, P, X>;
    phase?: string;
    post?: PostFunc<string extends M ? never : M, O, Q, AR, P, X>;
};

export function defineServerCommand<
    M extends string,
    O extends Operator,
    Q extends Qualifier,
    AR extends boolean,
    P,
    X,
>(options: ServerCommandOption<M, O, Q, AR, P, X>): ServerCommand<M, O, Q, AR, P, X> {
    const {
        command, query, phase, post,
    } = options;

    return {
        ...command, query, phase, post,
    };
}
