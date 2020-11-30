/* eslint-disable @typescript-eslint/no-explicit-any */

export type QueryParam = {
    type: 'string' | 'regex',
    value: string
}

export type QueryItem = {
    type: string,
    op: string,
    param: QueryParam
}

export type QueryCommand = {
    name: string;
    short?: string;
    query: (arg: {
        param: string|RegExp,
        op?: string,
        options: Record<string, string>
    }) => any;
}

export type QueryModel<T> = {
    commands: QueryCommand[],
    aggregate: (query: any, options: Record<string, string>) => Promise<T>;
};
