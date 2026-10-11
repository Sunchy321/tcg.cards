import { sql } from 'drizzle-orm';
import type { SQL, SQLWrapper } from 'drizzle-orm';

import { QueryError } from '#search/command/error';

import { toAmbit, AMBITS } from '../ambit';
import type { Ambit } from '../ambit';

/** Parses a command value into its ambit level, rejecting anything else. */
export function parseAmbitValue(value: string): Ambit {
  const level = toAmbit(value);

  if (level == null) {
    throw new QueryError({ type: 'invalid-query' });
  }

  return level;
}

/**
 * The ambit-ceiling predicate for one ladder level: a card passes when its
 * ambit sits at or below the level (pg enum comparison order is the ladder
 * order). `full` is vacuously true, i.e. no restriction.
 */
export function ambitCeiling(column: SQLWrapper, level: Ambit): SQL {
  return sql`${column} <= ${level}`;
}

/** One search execution under a ceiling: null means the query's own ambit
 * predicates govern and the runner applies no default ceiling. */
export type AmbitSearchRun<T> = (ceiling: Ambit | null) => Promise<T>;

/**
 * Runs a search under the ambit ceiling semantics shared by every game site
 * (ADR 0015): a query without an ambit command searches from the starting
 * ambit — the primary ambit by default, or the ambit scope selector's level
 * (a URL param, never part of the DSL) — and widens stepwise while it returns
 * nothing; a query that mentions the ambit command never widens and takes the
 * ceiling entirely into its own hands, so the start level only applies to
 * non-explicit queries — when the query pins a level, the query's own
 * predicates govern and the runner applies none (null ceiling).
 *
 * The landing level in the result is the annotation the response reports.
 */
export async function searchWithAmbitCeiling<T extends { total: number }>(options: {
  pinned:   Ambit | null;
  explicit: boolean;
  start?:   Ambit;
  run:      AmbitSearchRun<T>;
}): Promise<{ landing: Ambit; result: T }> {
  if (options.pinned != null) {
    return { landing: options.pinned, result: await options.run(null) };
  }

  let landing: Ambit = options.explicit ? 'primary' : options.start ?? 'primary';
  let result = await options.run(landing);

  if (options.explicit || result.total > 0) {
    return { landing, result };
  }

  for (const level of AMBITS.slice(AMBITS.indexOf(landing) + 1)) {
    landing = level;
    result = await options.run(level);

    if (result.total > 0) {
      break;
    }
  }

  return { landing, result };
}
