import { PostAction } from '../command';

import { SQL } from 'drizzle-orm';

export type ServerActionHandler<Result, Option> = (query: SQL, post: PostAction[], options: Option) =>
Promise<Result>;

export interface ServerAction<Table, Result, Option> {
    table:   Table;
    handler: ServerActionHandler<Result, Option>;
}

export type ServerActionOption<A extends ServerAction<any, any, any>> = A extends ServerAction<infer _1, infer _2, infer Option>
    ? Option : never;

export type ServerActionResult<A extends ServerAction<any, any, any>> = A extends ServerAction<infer _1, infer Result, infer _2>
    ? Result : never;
