import type { CommandArgType, CommonCommandInput } from '#search/command/types';
import { QueryError } from '#search/command/error';
import { matchPattern } from '#search/command/match-pattern';
import { describeLogicalCommand } from '#search/command/semantics';
import type { LogicalQuery, LogicalValue, QueryRequest, QueryResultRequest, ResolvedCommand, SortSpec } from '#search/logical';
import type { Expression } from '#search/parser';

import type { CommonServerCommand } from './command';

/** Carries a filter subtree separately from its extracted sort commands. */
type ResolvedNode = {
  filter: LogicalQuery | null;
  sort:   ResolvedCommand[];
};

/** Resolves one parsed DSL into portable command data and result inputs. */
export function resolveQueryRequest(
  expr: Expression,
  commands: CommonServerCommand[],
  result: Partial<Omit<QueryResultRequest, 'sort'>> & { sort?: SortSpec[] } = {},
): QueryRequest {
  const resolved = resolveNode(expr, commands);
  const sort = resolved.sort.length > 0
    ? resolved.sort.map(command => ({ kind: 'dsl', command }) satisfies SortSpec)
    : result.sort ?? [{ kind: 'action-default' } satisfies SortSpec];

  return {
    filter: resolved.filter,
    result: {
      sort,
      group:    result.group ?? null,
      page:     result.page ?? null,
      pageSize: result.pageSize ?? null,
      total:    result.total ?? true,
      ambit:    result.ambit ?? null,
      lang:     result.lang ?? null,
    },
  };
}

/** Resolves boolean nodes while lifting order commands into result metadata. */
function resolveNode(expr: Expression, commands: CommonServerCommand[]): ResolvedNode {
  if (expr.type === 'logic') {
    const children = expr.exprs.map(child => resolveNode(child, commands));
    const filters = children.flatMap(child => child.filter == null ? [] : [child.filter]);
    const filter = filters.length === 0
      ? null
      : filters.length === 1
        ? filters[0]!
        : { kind: expr.sep === '|' ? 'or' as const : 'and' as const, exprs: filters };

    return {
      filter,
      sort: children.flatMap(child => child.sort),
    };
  }

  if (expr.type === 'not') {
    const child = resolveNode(expr.expr, commands);

    return {
      filter: child.filter == null ? null : { kind: 'not', expr: child.filter },
      sort:   child.sort,
    };
  }

  if (expr.type === 'paren') {
    return resolveNode(expr.expr, commands);
  }

  const value = parseValue(expr);
  const matched = resolveCommand(expr, value, commands);

  if (matched.command == null) {
    throw new QueryError({ type: 'unknown-command', payload: { name: matched.name } });
  }

  const { command, input } = matched;
  const options = command.options;

  if (value instanceof RegExp && !options.input.regex) {
    throw new QueryError({ type: 'invalid-regex' });
  }

  if (!options.input.operators.includes(input.operator)) {
    throw new QueryError({ type: 'invalid-operator', payload: { operator: input.operator } });
  }

  if (command.is('order-by') && !expr.topLevel) {
    throw new QueryError({ type: 'not-toplevel-command' });
  }

  const descriptor = describeLogicalCommand(
    options,
    options.id ?? matched.name,
    options.logical?.witness ?? [],
  );
  const resolved: ResolvedCommand = {
    commandId: options.id ?? descriptor.field,
    action:    command.is('order-by') ? 'order-by' : 'query',
    descriptor,
    operator:  input.operator,
    qualifier: [...input.qualifier],
    value:     serializeValue(input.value),
    argType:   input.argType,
    modifier:  'modifier' in input ? input.modifier : undefined,
    pattern:   'pattern' in input ? input.pattern as Record<string, string> | undefined : undefined,
    topLevel:  expr.topLevel === true,
  };

  if (resolved.action === 'order-by') {
    return { filter: null, sort: [resolved] };
  }

  return {
    filter: { kind: 'leaf', command: resolved },
    sort:   [],
  };
}

/** Resolves aliases, modifiers, patterns, and raw search commands consistently. */
function resolveCommand(
  expr: Expression,
  value: string | RegExp,
  commands: CommonServerCommand[],
): { command: CommonServerCommand | undefined, input: CommonCommandInput, name: string } {
  if (expr.type === 'simple') {
    const { command, modifier } = (() => {
      const direct = commands.find(command => command.options.id === expr.cmd || command.options.alternatives?.includes(expr.cmd));

      if (direct != null) {
        return { command: direct, modifier: undefined };
      }

      for (const candidate of commands) {
        const id = candidate.options.id;
        const modifiers = candidate.options.input.modifiers;

        if (id == null || modifiers == null) {
          continue;
        }

        if (Array.isArray(modifiers)) {
          if (modifiers.some(modifier => expr.cmd === `${id}.${modifier}`)) {
            return { command: candidate, modifier: expr.cmd.slice(id.length + 1) };
          }
        } else {
          for (const [long, short] of Object.entries(modifiers)) {
            if (expr.cmd === `${id}.${long}` || expr.cmd === short) {
              return { command: candidate, modifier: long };
            }
          }
        }
      }

      return { command: undefined, modifier: undefined };
    })();

    return {
      command,
      input: {
        modifier,
        value,
        operator:  expr.op,
        qualifier: expr.qual ?? [],
        argType:   expr.argType as CommandArgType,
      },
      name: expr.cmd,
    };
  }

  if (!(value instanceof RegExp)) {
    const command = commands.find(candidate => {
      const pattern = candidate.options.input.pattern;
      return pattern != null && matchPattern(pattern, value) != null;
    });

    if (command != null) {
      const pattern = matchPattern(command.options.input.pattern!, value)!;

      return {
        command,
        input: {
          value,
          pattern,
          operator:  '',
          qualifier: expr.qual ?? [],
          argType:   'argType' in expr ? expr.argType as CommandArgType : undefined,
        },
        name: command.options.id ?? '',
      };
    }
  }

  const raw = commands.find(command => command.options.type === 'none');

  return {
    command: raw,
    input:   {
      value,
      operator:  '',
      qualifier: expr.qual ?? [],
      argType:   'argType' in expr ? expr.argType as CommandArgType : undefined,
    },
    name: '<raw>',
  };
}

/** Parses the same literal forms accepted by the existing SQL translator. */
function parseValue(expr: Expression): string | RegExp {
  if (expr.type === 'simple' || expr.type === 'raw') {
    if (expr.argType === 'regex') {
      try {
        return new RegExp(expr.args.slice(1, -1));
      } catch (_error) {
        throw new QueryError({
          type:    'invalid-regex',
          payload: expr.args.slice(1, -1),
        });
      }
    }

    if (expr.argType === 'string') {
      return expr.args.slice(1, -1).replace(/\\./g, value => value.slice(1));
    }

    return expr.args;
  }

  return expr.tokens.map(token => token.text).join('');
}

/** Serializes regular expressions so the logical request contains data only. */
function serializeValue(value: string | RegExp): LogicalValue {
  return value instanceof RegExp
    ? { kind: 'regex', source: value.source, flags: value.flags }
    : value;
}
