import { Aggregate } from 'mongoose';

export type Operator = ':' | '' | '<' | '<=' | '=' | '>' | '>=';
export type Qualifier = '!';

export type PostAction = {
    step: string;
    action: (agg: Aggregate<any>) => void;
};

export type Command<P, AR, O, Q> = {
    id: string;
    alt?: string[];
    postStep?: P;
    allowRegex?: AR;
    op?: O[];
    qual?: Q[];

    query?: (ctx: {
        param: AR extends false ? string : (RegExp | string);
        op: O;
        qual: Q[];
    }) => any;

    post?: (ctx: {
        param: AR extends false ? string : (RegExp | string);
        op: O;
        qual: Q[];
    }) => ((agg: Aggregate<any>) => void);
};

export function command<
    P extends string,
    AR extends boolean,
    O extends Operator,
    Q extends Qualifier,
>(cmd: Command<P, AR, O, Q>): Command<P, AR, O, Q> {
    return cmd;
}
