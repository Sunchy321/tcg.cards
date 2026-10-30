import { describe, expect, test } from 'bun:test';

import type { DatasetDescriptor, LogicalQuery, QueryRequest, SearchAdapter } from '#search/logical';
import { executeLocalExactOrRemote } from './router';

const descriptor: DatasetDescriptor = {
  commands: [],
  result: {
    sort:  true,
    group: true,
    page:  true,
    total: true,
    ambit: true,
    lang:  true,
  },
};

const request: QueryRequest = {
  filter: null,
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

function adapterWithPlan(plan: ReturnType<SearchAdapter<string, void>['plan']>, calls: { execute: number }): SearchAdapter<string, void> {
  return {
    descriptor: () => descriptor,
    plan:       () => plan,
    execute:    async () => {
      calls.execute++;
      return 'local';
    },
  };
}

describe('local-first exact search routing', () => {
  test('runs a local exact plan without calling remote', async () => {
    const calls = { execute: 0, remote: 0 };
    const result = await executeLocalExactOrRemote({
      request,
      options:      undefined,
      localAdapter: adapterWithPlan({ type: 'exact' }, calls),
      remote:       async () => {
        calls.remote++;
        return 'remote';
      },
    });

    expect(result).toBe('local');
    expect(calls).toEqual({ execute: 1, remote: 0 });
  });

  test('routes a candidate plan directly to remote without reading local data', async () => {
    const calls = { execute: 0, remote: 0 };
    const query: LogicalQuery = { kind: 'and', exprs: [] };
    const result = await executeLocalExactOrRemote({
      request,
      options:      undefined,
      localAdapter: adapterWithPlan({ type: 'candidate', candidate: query, residual: query, uncovered: [] }, calls),
      remote:       async () => {
        calls.remote++;
        return 'remote';
      },
    });

    expect(result).toBe('remote');
    expect(calls).toEqual({ execute: 0, remote: 1 });
  });

  test('routes an unsupported plan directly to remote', async () => {
    const calls = { execute: 0, remote: 0 };
    const result = await executeLocalExactOrRemote({
      request,
      options:      undefined,
      localAdapter: adapterWithPlan({ type: 'original', reason: [] }, calls),
      remote:       async () => {
        calls.remote++;
        return 'remote';
      },
    });

    expect(result).toBe('remote');
    expect(calls).toEqual({ execute: 0, remote: 1 });
  });

  test('uses remote when no local adapter is available', async () => {
    const result = await executeLocalExactOrRemote({
      request,
      options:      undefined,
      localAdapter: undefined,
      remote:       async () => 'remote',
    });

    expect(result).toBe('remote');
  });
});
