import { describe, expect, test } from 'bun:test';

import type { DatasetDescriptor, LogicalQuery, QueryRequest, ResolvedCommand } from './logical';
import { planCoverage } from './logical';
import type { LogicalCommandDescriptor } from './command/types';

/** Creates one ordinary text command descriptor for planner assertions. */
function descriptor(field: string): LogicalCommandDescriptor {
  return {
    field,
    valueClass:          'text',
    nullSemantics:       'empty-matches-null-or-empty',
    textSemantics:       'substring-exact-regex',
    collectionSemantics: 'not-applicable',
    witness:             ['same-record'],
    operators:           [':', '='],
    qualifiers:          ['!'],
    modifiers:           [],
    pattern:             null,
    allowsRegex:         true,
    expansion:           [],
  };
}

/** Creates a leaf request using the supplied logical descriptor. */
function leaf(commandDescriptor: LogicalCommandDescriptor, value = 'ember'): LogicalQuery {
  const command: ResolvedCommand = {
    commandId:  commandDescriptor.field,
    action:     'query',
    descriptor: commandDescriptor,
    operator:   ':',
    qualifier:  [],
    value,
    argType:    'id',
    topLevel:   true,
  };

  return { kind: 'leaf', command };
}

/** Creates a request with result operations already handled by the target. */
function request(filter: LogicalQuery): QueryRequest {
  return {
    filter,
    result: {
      sort:     [],
      group:    null,
      page:     null,
      pageSize: null,
      total:    false,
      ambit:    null,
      lang:     null,
    },
  };
}

/** Creates a target descriptor with a configurable command and result set. */
function dataset(commands: LogicalCommandDescriptor[], result = true): DatasetDescriptor {
  return {
    commands,
    result: {
      sort:  result,
      group: result,
      page:  result,
      total: result,
      ambit: result,
      lang:  result,
    },
  };
}

describe('static logical query planning', () => {
  test('marks a fully supported filter and result request exact', () => {
    const filter = leaf(descriptor('name'));

    expect(planCoverage(request(filter), dataset([descriptor('name')]))).toEqual({ type: 'exact' });
  });

  test('keeps only supported AND branches as a safe candidate and retains the full residual', () => {
    const name = leaf(descriptor('name'));
    const cost = leaf(descriptor('cost'), '3');
    const filter: LogicalQuery = { kind: 'and', exprs: [name, cost] };
    const plan = planCoverage(request(filter), dataset([descriptor('name')]));

    expect(plan).toEqual({
      type:      'candidate',
      candidate: name,
      residual:  filter,
      uncovered: [{ kind: 'field', field: 'cost', detail: 'Field is not available.' }],
    });
  });

  test('falls back when an OR branch has no safe candidate', () => {
    const filter: LogicalQuery = {
      kind:  'or',
      exprs: [leaf(descriptor('name')), leaf(descriptor('cost'), '3')],
    };

    expect(planCoverage(request(filter), dataset([descriptor('name')]))).toEqual({
      type:   'original',
      reason: [{ kind: 'field', field: 'cost', detail: 'Field is not available.' }],
    });
  });

  test('does not negate a partial candidate', () => {
    const filter: LogicalQuery = { kind: 'not', expr: leaf(descriptor('cost'), '3') };

    expect(planCoverage(request(filter), dataset([]))).toEqual({
      type:   'original',
      reason: [{ kind: 'field', field: 'cost', detail: 'Field is not available.' }],
    });
  });

  test('falls back when result processing is unsupported', () => {
    const query = request(leaf(descriptor('name')));
    query.result.sort = [{ kind: 'action-default' }];

    expect(planCoverage(query, dataset([descriptor('name')], false))).toEqual({
      type:   'original',
      reason: [{ kind: 'result', field: 'sort', detail: 'Sorting is unsupported.' }],
    });
  });

  test('separates semantic and operator gaps from missing fields', () => {
    const name: LogicalCommandDescriptor = { ...descriptor('name'), operators: [':', '=', '>'] };
    const target = { ...name, nullSemantics: 'sql-unknown' as const, operators: [':'] as const } as LogicalCommandDescriptor;
    const filter = leaf(name);

    if (filter.kind !== 'leaf') {
      throw new Error('Expected a leaf query.');
    }

    filter.command.operator = '>';
    const plan = planCoverage(request(filter), dataset([target]));

    expect(plan.type).toBe('original');
    if (plan.type === 'original') {
      expect(plan.reason.map(gap => gap.kind)).toEqual(['operator', 'null-semantics']);
    }
  });
});
