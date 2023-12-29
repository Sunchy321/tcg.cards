import { Command, Operator, Qualifier } from './index';
import { PatternContext } from './pattern';

import { Aggregate } from 'mongoose';

export type DBQuery = any | { '$and': DBQuery[] } | { '$or': DBQuery[] };

export type Argument<
    M extends string,
    O extends Operator,
    Q extends Qualifier,
    AR extends boolean,
    P,
> = [PatternContext<P>] extends [never] ? {
    modifier?: M;
    parameter: AR extends false ? string : (RegExp | string);
    operator: O;
    qualifier: Q[];
} : {
    modifier?: M;
    parameter: AR extends false ? string : (RegExp | string);
    operator: O;
    qualifier: Q[];
    pattern?: PatternContext<P>;
};

export type QueryFunc<
    M extends string,
    O extends Operator,
    Q extends Qualifier,
    AR extends boolean,
    P,
> = (arg: Argument<M, O, Q, AR, P>) => DBQuery;

export type PostFunc<
    M extends string,
    O extends Operator,
    Q extends Qualifier,
    AR extends boolean,
    P,
> = (arg: Argument<M, O, Q, AR, P>) => ((agg: Aggregate<any>) => void);

export type QueryFuncOf<C> = C extends Command<infer M, infer O, infer Q, infer AR, infer P>
    ? QueryFunc<string extends M ? never : M, O, Q, boolean extends AR ? false : AR, P>
    : never;

export type PostFuncOf<C> = C extends Command<infer M, infer O, infer Q, infer AR, infer P>
    ? PostFunc<string extends M ? never : M, O, Q, boolean extends AR ? false : AR, P>
    : never;

export type BackendCommand<
    M extends string,
    O extends Operator,
    Q extends Qualifier,
    AR extends boolean,
    P,
> = Command<M, O, Q, AR, P> & {
    query: QueryFuncOf<Command<M, O, Q, AR, P>>;
    post?: PostFuncOf<Command<M, O, Q, AR, P>>;
};

export type BackendOf<C> = C extends Command<infer M, infer O, infer Q, infer AR, infer P>
    ? BackendCommand<M, O, Q, AR, P>
    : never;

export type BackendCommandOption<
    M extends string,
    O extends Operator,
    Q extends Qualifier,
    AR extends boolean,
    P,
> = {
    command: Command<M, O, Q, AR, P>;
    query: QueryFunc<string extends M ? never : M, O, Q, boolean extends AR ? false : AR, P>;
    post?: PostFunc<string extends M ? never : M, O, Q, boolean extends AR ? false : AR, P>;
};

export function defineBackendCommand<
    M extends string,
    O extends Operator,
    Q extends Qualifier,
    AR extends boolean,
    P,
>(options: BackendCommandOption<M, O, Q, AR, P>): BackendCommand<M, O, Q, AR, P> {
    const {
        command, query, post,
    } = options;

    return { ...command, query, post };
}
