import { SQL } from 'drizzle-orm';

export type ActionHandler<Result, Option> = (query: SQL, post: never[], options: Option) =>
Promise<Result>;

export class ActionBuilder {
    table<T>(table: T) {
        return new ActionBuilderWithTable<T>(table);
    }
}

export interface Action<Table, Result, Option> {
    table:   Table;
    handler: ActionHandler<Result, Option>;
}

export class ActionBuilderWithTable<Table> {
    table: Table;

    constructor(table: Table) {
        this.table = table;
    }

    handler<Option, Result>(handler: ActionHandler<Result, Option>): Action<Table, Result, Option> {
        return {
            table: this.table,
            handler,
        };
    }
}

export const as = new ActionBuilder();
