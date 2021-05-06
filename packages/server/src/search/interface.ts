/* eslint-disable @typescript-eslint/no-explicit-any */

export interface QueryParam {
    type: 'string' | 'regex',
    value: string
}

export interface QueryItem {
    type: string,
    op: string,
    param: QueryParam
}

export interface QueryCommand {
    name: string;
    short?: string;
    query: (arg: {
        param: string|RegExp,
        op?: string,
        options: Record<string, string>
    }) => any;
}

export interface QueryModel<T> {
    commands: QueryCommand[],
    aggregate: (query: any, options: Record<string, string>) => Promise<T>;
}
