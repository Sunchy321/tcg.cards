import { ServerAction, ServerActionHandler } from './types';

export class ServerActionBuilder {
    table<T>(table: T) {
        return new ServerActionBuilderWithTable<T>(table);
    }
}

export class ServerActionBuilderWithTable<Table> {
    table: Table;

    constructor(table: Table) {
        this.table = table;
    }

    handler<Option, Result>(handler: ServerActionHandler<Result, Option>): ServerAction<Table, Result, Option> {
        return {
            table: this.table,
            handler,
        };
    }
}

export const as = new ServerActionBuilder();
