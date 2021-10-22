/* eslint-disable @typescript-eslint/no-explicit-any */

export interface Parameter {
    type: 'string' | 'regex',
    value: string
}

export interface Item {
    type: string,
    op: string,
    param: Parameter
}

export interface Command {
    id: string;
    alt?: string[];
    query: (arg: {
        param: string|RegExp,
        op?: string,
        options: Record<string, string>
    }) => any;
}

export type Options = Record<string, string>

export type DBQuery = any;

export type Query<T> = (query: DBQuery, options: Options) => Promise<T>;

export type Model = {
    commands: Command[];
    search: Query<any>;
}

export type Result<T> = {
    text: string;
    commands: Item[];
    errors: { type: string; value: string, query?: string }[];
    result: T | null
};

export type Searcher<M extends Model> ={
    [K in keyof M as Exclude<K, 'commands'>]:
        M[K] extends (...args: any) => infer R
            ? R extends Promise<infer T>
                ? (text: string, options?: Options) => Promise<Result<T>>
                : (text: string, options?: Options) => Result<R>
        : never;
};
