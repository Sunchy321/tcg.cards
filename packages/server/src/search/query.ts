import { Operator, Qualifier } from './command';

export interface QueryParam {
    type: 'regex' | 'string';
    value: string;
}

export type Query = {
    cmd: string;
    op: Operator;
    qual: Qualifier[];
    param: QueryParam;
};
