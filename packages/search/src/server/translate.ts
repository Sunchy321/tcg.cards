import type { SQL } from 'drizzle-orm';
import { and, or, not } from 'drizzle-orm';

import type { Expression } from '#search/parser';

import type { CommandArgType, CommonCommandInput } from '#search/command/types';
import { QueryError } from '#search/command/error';

import { matchPattern } from '#search/command/match-pattern';
import type { CommonServerCommand, PostAction } from '#search/server/command';
import type { LogicalQuery, QueryRequest, ResolvedCommand } from '#search/logical';
import { resolveQueryRequest } from './logical';

export type TranslatedQuery = {
  query: SQL | undefined;
  post:  PostAction[];
};

/** Compiles one command with static and request-scoped metadata. */
function simpleTranslate<Table>(
  command: CommonServerCommand,
  expr: Expression,
  args: CommonCommandInput,
  table: Table,
  metaOverrides: Record<string, unknown> = {},
): TranslatedQuery {
  const { input } = command.options;

  const { value, operator } = args;

  if (value instanceof RegExp && !input.regex) {
    throw new QueryError({ type: 'invalid-regex' });
  }

  if (!input.operators.includes(operator)) {
    throw new QueryError({ type: 'invalid-operator', payload: { operator } });
  }

  try {
    const meta = command.options.type === 'none'
      ? { ...command.options.meta, ...metaOverrides }
      : command.options.meta;
    const ctx = {
      meta,
      table,
    };

    if (command.is('query')) {
      const query = command.handler(args as any, ctx) as SQL;

      return { query, post: [] };
    } else if (command.is('order-by')) {
      if (!expr.topLevel) {
        throw new QueryError({ type: 'not-toplevel-command' });
      }

      const action = command.call(args as any, ctx);

      return {
        query: undefined,
        post:  [{ phase: 'order-by', action }],
      };
    } else {
      throw new QueryError({ type: 'invalid-command-kind' });
    }
  } catch (e) {
    console.log(e);
    throw new QueryError({ type: (e as any).type });
  }
}

/** Translates the original expression while adding request metadata to command handlers. */
export function translateLegacy<Table>(
  expr: Expression,
  commands: CommonServerCommand[],
  table: Table,
  metaOverrides: Record<string, unknown> = {},
): TranslatedQuery {
  // computed expression
  if (expr.type === 'logic') {
    const value = expr.exprs.map(v => translateLegacy(v, commands, table, metaOverrides));

    const sql: SQL[] = [];
    const post: PostAction[] = [];

    for (const v of value) {
      if (v.query == null) {
        post.push(...v.post);
      } else {
        sql.push(v.query);
      }
    }

    if (sql.length > 0) {
      return {
        query: expr.sep === '|' ? or(...sql) : and(...sql),
        post,
      };
    } else {
      return {
        query: undefined,
        post,
      };
    }
  } else if (expr.type === 'not') {
    const result = translateLegacy(expr.expr, commands, table, metaOverrides);

    return {
      query: result.query != undefined ? not(result.query) : undefined,
      post:  result.post,
    };
  } else if (expr.type === 'paren') {
    return translateLegacy(expr.expr, commands, table, metaOverrides);
  }

  // value
  const value = (() => {
    if (expr.type === 'simple' || expr.type === 'raw') {
      if (expr.argType === 'regex') {
        try {
          return new RegExp(expr.args.slice(1, -1));
        } catch (_e) {
          throw new QueryError({
            type:    'invalid-regex',
            payload: expr.args.slice(1, -1),
          });
        }
      } else if (expr.argType === 'string') {
        return expr.args.slice(1, -1).replace(/\\\\./g, v => v.slice(1));
      } else {
        return expr.args;
      }
    } else {
      return expr.tokens.map(t => t.text).join('');
    }
  })();

  // simple expr, such as cmd:arg or cmd=arg
  if (expr.type === 'simple') {
    const { cmd } = expr;

    const { command, modifier = undefined } = (() => {
      const nameMatched = commands.find(c => c.options.id === cmd || c.options.alternatives?.includes(cmd));

      if (nameMatched != null) {
        return { command: nameMatched };
      }

      for (const c of commands) {
        const id = c.options.id;

        if (id === cmd || c.options.alternatives?.includes(cmd)) {
          return { command: c };
        }

        if (c.options.input.modifiers != null) {
          const modifiers = c.options.input.modifiers;

          if (Array.isArray(modifiers)) {
            for (const m of modifiers) {
              if (cmd === `${id}.${m}`) {
                return { command: c, modifier: m };
              }
            }
          } else {
            for (const [lm, sm] of Object.entries(modifiers)) {
              if (cmd === `${id}.${lm}` || cmd === sm) {
                return { command: c, modifier: lm };
              }
            }
          }
        }
      }

      return { command: undefined };
    })();

    if (command == null) {
      throw new QueryError({ type: 'unknown-command', payload: { name: cmd } });
    }

    const operator = expr.type === 'simple' ? expr.op : '' as const;
    const qualifier = expr.type === 'simple' ? (expr.qual ?? []) : [];

    return simpleTranslate(command, expr, {
      modifier, value, operator, qualifier,
      argType: expr.argType as CommandArgType,
    }, table, metaOverrides);
  }

  // find patterns
  if (!(value instanceof RegExp)) {
    const command = commands.find(c => {
      if (c.options.input.pattern == null) {
        return false;
      }

      for (const p of [c.options.input.pattern]) {
        if (matchPattern(p, value)) {
          return true;
        }
      }

      return false;
    });

    if (command != null) {
      // TODO: multiple patterns
      const pattern = [command.options.input.pattern!]
        .map(p => matchPattern(p, value))
        .find(p => p != null)! as any;

      return simpleTranslate(command, expr, {
        value,
        pattern,
        operator:  '',
        qualifier: expr.qual ?? [],
        argType:   'argType' in expr ? expr.argType as CommandArgType : undefined,
      }, table, metaOverrides);
    }
  }

  const raw = commands.find(c => c.options.type === 'none');

  if (raw == null) {
    throw new QueryError({ type: 'unknown-command', payload: { name: '<raw>' } });
  }

  return simpleTranslate(raw, expr, {
    value,
    operator:  '',
    qualifier: expr.qual ?? [],
    argType:   'argType' in expr ? expr.argType as CommandArgType : undefined,
  }, table, metaOverrides);
}

/** Compiles a resolved logical request through the existing PostgreSQL handlers. */
export function compileQueryRequest<Table>(request: QueryRequest, commands: CommonServerCommand[], table: Table): TranslatedQuery {
  const metaOverrides = request.result.lang == null ? {} : { lang: request.result.lang };
  const filter = request.filter == null
    ? { query: undefined, post: [] }
    : compileNode(request.filter, commands, table, metaOverrides);
  const post = request.result.sort.flatMap(sort => {
    if (sort.kind !== 'dsl') {
      return [];
    }

    return compileCommand(sort.command, commands, table, metaOverrides).post;
  });

  return {
    query: filter.query,
    post:  [...filter.post, ...post],
  };
}

/** Keeps the historical translator entry point while routing it through logical resolution. */
export function translate<Table>(expr: Expression, commands: CommonServerCommand[], table: Table): TranslatedQuery {
  const request = resolveQueryRequest(expr, commands);

  return compileQueryRequest(request, commands, table);
}

/** Compiles boolean nodes while retaining the old SQL composition behavior. */
function compileNode<Table>(
  query: LogicalQuery,
  commands: CommonServerCommand[],
  table: Table,
  metaOverrides: Record<string, unknown>,
): TranslatedQuery {
  if (query.kind === 'leaf') {
    return compileCommand(query.command, commands, table, metaOverrides);
  }

  if (query.kind === 'not') {
    const child = compileNode(query.expr, commands, table, metaOverrides);

    return {
      query: child.query == null ? undefined : not(child.query),
      post:  child.post,
    };
  }

  const children = query.exprs.map(child => compileNode(child, commands, table, metaOverrides));
  const filters = children.flatMap(child => child.query == null ? [] : [child.query]);
  const post = children.flatMap(child => child.post);

  return {
    query: filters.length === 0
      ? undefined
      : query.kind === 'or'
        ? or(...filters)
        : and(...filters),
    post,
  };
}

/** Compiles a command by its resolved identity and preserves legacy validation. */
function compileCommand<Table>(
  resolved: ResolvedCommand,
  commands: CommonServerCommand[],
  table: Table,
  metaOverrides: Record<string, unknown>,
): TranslatedQuery {
  const command = commands.find(candidate => candidate.options.id === resolved.commandId);

  if (command == null || (resolved.action === 'order-by') !== command.is('order-by')) {
    throw new QueryError({ type: 'unknown-command', payload: { name: resolved.commandId } });
  }

  const value = typeof resolved.value === 'string'
    ? resolved.value
    : new RegExp(resolved.value.source, resolved.value.flags);
  const args = {
    value,
    operator:  resolved.operator,
    qualifier: resolved.qualifier,
    modifier:  resolved.modifier,
    pattern:   resolved.pattern,
    argType:   resolved.argType,
  } as any;

  return simpleTranslate(command, { topLevel: resolved.topLevel } as Expression, args, table, metaOverrides);
}
