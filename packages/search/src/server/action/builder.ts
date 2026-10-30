import type { ServerAction, ServerActionHandler } from './types';
import type { SearchAdapter } from '#search/logical';

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

  handler<Option, Result>(
    handler: ServerActionHandler<Result, Option>,
    options: {
      localAdapter?: SearchAdapter<Result, Option>;
      acceleratedAdapter?: SearchAdapter<Result, Option>;
    } = {},
  ): ServerAction<Table, Result, Option> {
    return {
      table:        this.table,
      handler,
      localAdapter: options.localAdapter,
      acceleratedAdapter: options.acceleratedAdapter,
    };
  }
}

export const as = new ServerActionBuilder();
