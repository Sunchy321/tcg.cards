import type { CommandMapBase, ModelOptions } from '#search/index';
import type { SearchResult } from '#search/schema';
import Parser from '#search/parser';
import { simplify } from '#search/parser/simplify';

import type { ServerCommand } from './command';
import type { ServerAction } from './action';
import type { ServerActionOption, ServerActionResult } from './action/types';
import { AcceleratedSearchFallbackError, PgSearchAdapter } from './adapter';
import { executeLocalExactOrRemote } from './router';
import type { SearchTimingRecorder } from './timing';
import { resolveQueryRequest } from './logical';
import type { QueryResultRequest, SortSpec } from '#search/logical';
import { translateLegacy } from './translate';

export type ServerCommandMapBase<Table> = Record<string, ServerCommand<any, any, any, any, Table>>;

export class ServerModelBuilder {
  from<M extends ModelOptions<CommandMapBase>>(model: M) {
    return new ServerModelBuilderWithSchema<M>(model);
  }
}

export class ServerModelBuilderWithSchema<
  M extends ModelOptions<CommandMapBase>
> {
  model: M;

  constructor(model: M) {
    this.model = model;
  }

  table<Table>(tables: Table[]) {
    return new ServerModelBuilderWithTable<M, Table>(this.model, tables);
  }
}

export class ServerModelBuilderWithTable<
  M extends ModelOptions<CommandMapBase>,
  Table
> {
  model:  M;
  tables: Table[];

  constructor(model: M, tables: Table[]) {
    this.model = model;
    this.tables = tables;
  }

  command<C extends Record<keyof M['commands'], ServerCommand<any, any, any, any, Table>>>(commands: C) {
    return new ServerModelBuilderWithCommands<M, Table, C>(
      this.model,
      this.tables,
      commands,
    );
  }
}

export class ServerModelBuilderWithCommands<
  M extends ModelOptions<CommandMapBase>,
  Table,
  C extends Record<keyof M['commands'], ServerCommand<any, any, any, any, Table>>> {
  model:    M;
  tables:   Table[];
  commands: C;

  constructor(model: M, tables: Table[], commands: C) {
    this.model = model;
    this.tables = tables;
    this.commands = commands;
  }

  action<A extends Record<string, ServerAction<Table, any, any>>>(actions: A) {
    return new ServerModel<M, Table, C, A>(
      this.model,
      this.tables,
      this.commands,
      actions,
    );
  }
}

export class ServerModel<
  M extends ModelOptions<CommandMapBase>,
  Table,
  C extends Record<keyof M['commands'], ServerCommand<any, any, any, any, Table>>,
  A extends Record<string, ServerAction<Table, any, any>>
> {
  model:    M;
  tables:   Table[];
  commands: C;
  actions:  A;

  constructor(model: M, tables: Table[], commands: C, actions: A) {
    this.model = model;
    this.tables = tables;
    this.commands = commands;
    this.actions = actions;
  }

  async search<K extends string & keyof A>(
    actionKey: K,
    text: string,
    options: ServerActionOption<A[K]> & { timing?: SearchTimingRecorder },
  ): Promise<SearchResult<ServerActionResult<A[K]>>> {
    const action = this.actions[actionKey];

    if (action == null) {
      return {
        text,
        errors: [{ type: 'unknown-action' }],
      };
    }

    const trimmedText = text.trim();

    if (trimmedText === '') {
      return {
        text,
        errors: [{ type: 'empty-input' }],
      };
    }

    try {
      /** Parses and resolves the submitted search into its logical request. */
      const prepareRequest = () => {
        const expr = new Parser(trimmedText).parse();
        const simplified = simplify(expr);
        const commands = Object.values(this.commands);
        const resultOptionsValue = resultOptions(options);
        const request = resolveQueryRequest(simplified, commands, resultOptionsValue);

        return { simplified, commands, resultOptionsValue, request };
      };
      const prepared = options.timing == null
        ? prepareRequest()
        : options.timing.measureSync('query-preparation', prepareRequest);
      const { simplified, commands, resultOptionsValue, request } = prepared;

      if (request.filter == null) {
        return { text, errors: [] };
      }

      const executeOriginal = async () => {
        const metaOverrides = resultOptionsValue.lang == null ? {} : { lang: resultOptionsValue.lang };
        /** Translates the parsed request into the original PostgreSQL command format. */
        const translate = () => translateLegacy(simplified, commands, action.table, metaOverrides);
        const translated = options.timing == null
          ? translate()
          : options.timing.measureSync('legacy-translation', translate);

        if (translated.query == null) {
          return undefined;
        }

        return action.handler(translated.query, translated.post, options);
      };

      const remoteAdapter = new PgSearchAdapter(
        commands,
        action.table,
        (query, post, actionOptions: ServerActionOption<A[K]>) => action.handler(query, post, actionOptions),
        options.timing,
      );
      /** Plans the remote and accelerated routes before local execution is checked. */
      const prepareRoutes = () => ({
        remotePlan:      remoteAdapter.plan(request),
        acceleratedPlan: action.acceleratedAdapter?.plan(request),
      });
      const routes = options.timing == null
        ? prepareRoutes()
        : options.timing.measureSync('route-selection', prepareRoutes);
      const { remotePlan, acceleratedPlan } = routes;
      let result;
      try {
        result = await executeLocalExactOrRemote({
          request,
          options,
          localAdapter: action.localAdapter,
          timing:       options.timing,
          remote: () => acceleratedPlan?.type === 'exact'
            ? action.acceleratedAdapter!.execute(request, options)
            : remotePlan.type === 'exact'
              ? remoteAdapter.execute(request, options)
              : executeOriginal(),
        });
      } catch (error) {
        if (!(error instanceof AcceleratedSearchFallbackError)) throw error;
        result = await executeOriginal();
      }

      if (result == null) {
        return { text, errors: [] };
      }

      return { text, errors: [], result };
    } catch (e) {
      console.log(e);

      return { text, errors: [e] };
    }
  }
}

/** Extracts the generic result inputs used by the static query planner. */
function resultOptions(options: unknown): Partial<Omit<QueryResultRequest, 'sort'>> & { sort: SortSpec[] } {
  const values = options != null && typeof options === 'object'
    ? options as Record<string, unknown>
    : {};
  const sort: SortSpec[] = typeof values.orderBy === 'string'
    ? [{ kind: 'request', field: 'order', value: values.orderBy }]
    : [{ kind: 'action-default' }];

  return {
    sort,
    group:    typeof values.groupBy === 'string' ? values.groupBy : null,
    page:     typeof values.page === 'number' ? values.page : null,
    pageSize: typeof values.pageSize === 'number' ? values.pageSize : null,
    total:    values.total !== false,
    ambit:    typeof values.ambit === 'string' ? values.ambit : null,
    lang:     typeof values.lang === 'string' ? values.lang : null,
  };
}

export const ss = new ServerModelBuilder();
