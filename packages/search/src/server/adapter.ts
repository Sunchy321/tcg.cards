import type { SQL } from 'drizzle-orm';

import { describeLogicalCommand } from '#search/command/semantics';
import type { CommonServerCommand, PostAction } from '#search/server/command';
import type { DatasetDescriptor, QueryRequest, SearchAdapter } from '#search/logical';
import { planCoverage as planLogicalCoverage } from '#search/logical';

import { compileQueryRequest } from './translate';

/** Signals that an accelerated snapshot changed between planning and execution. */
export class AcceleratedSearchFallbackError extends Error {
  constructor() {
    super('The accelerated search snapshot is not active.');
    this.name = 'AcceleratedSearchFallbackError';
  }
}

/** Runs one compiled PostgreSQL query through the configured search action. */
export type PgActionRunner<Result, Options> = (
  query: SQL,
  post: PostAction[],
  options: Options,
) => Promise<Result>;

/** Adapts resolved requests to the existing PostgreSQL command and action handlers. */
export class PgSearchAdapter<Result, Options, Table> implements SearchAdapter<Result, Options> {
  commands: CommonServerCommand[];
  table:    Table;
  run:      PgActionRunner<Result, Options>;

  /** Binds game commands, a query table, and the action that runs compiled SQL. */
  constructor(commands: CommonServerCommand[], table: Table, run: PgActionRunner<Result, Options>) {
    this.commands = commands;
    this.table = table;
    this.run = run;
  }

  /** Describes exactly the command bindings and result operations available to PG. */
  descriptor(): DatasetDescriptor {
    return {
      commands: this.commands.map(command => describeLogicalCommand(
        command.options,
        command.options.id ?? '',
        command.options.logical?.witness ?? [],
      )),
      result: {
        sort:  true,
        group: true,
        page:  true,
        total: true,
        ambit: true,
        lang:  true,
      },
    };
  }

  /** Plans against the same command descriptors used by the PG compiler. */
  plan(request: QueryRequest) {
    return planLogicalCoverage(request, this.descriptor());
  }

  /** Compiles a fully covered request and forwards it to the configured search action. */
  async execute(request: QueryRequest, options: Options): Promise<Result> {
    const compiled = compileQueryRequest(request, this.commands, this.table);

    if (compiled.query == null) {
      throw new Error('A PostgreSQL search request must include a filter.');
    }

    return this.run(compiled.query, compiled.post, options);
  }
}
