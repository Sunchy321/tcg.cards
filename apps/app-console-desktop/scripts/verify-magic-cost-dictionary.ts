import { Database } from 'bun:sqlite';
import { isNull } from 'drizzle-orm';

import { createDb } from '@tcg-cards/db';
import { SearchCardPart, SearchCost } from '@tcg-cards/db/schema/shared/magic/search';

/**
 * Compares the PostgreSQL cost dictionary with the dictionary written into a
 * generated Magic package. The comparison semantics of `cost:` queries live in
 * the website's command module and are covered by its unit tests; this script
 * covers the data the publisher writes, so both sides are compared as plain
 * dictionary rows instead of through a query.
 */

const connection = process.env.DATABASE_URL ?? process.env.DESKTOP_LOCAL_DATABASE_URL;
const packagePath = process.argv[2];
if (connection == null || packagePath == null) {
  throw new Error('Set DATABASE_URL and pass the path to one generated Magic base package.');
}

const database = createDb(connection);
try {
  const [costs, parts] = await Promise.all([
    database.select().from(SearchCost).where(isNull(SearchCost.deletedAt)).orderBy(SearchCost.cost),
    database.select({ cost: SearchCardPart.cost }).from(SearchCardPart).where(isNull(SearchCardPart.deletedAt)),
  ]);
  const usedCosts = new Set(parts.map(part => part.cost).filter((cost): cost is string => cost != null));
  const expected = new Map(costs.map(cost => [cost.cost, {
    generic: cost.generic,
    symbols: countSymbols(cost.specials),
  }]));

  const sqlite = new Database(packagePath, { readonly: true });
  try {
    const stored = sqlite.query('SELECT cost, generic, w, u, b, r, g, c, x FROM magic_search_costs').all() as Array<Record<string, number | string>>;
    const specials = sqlite.query('SELECT cost, symbol, count FROM magic_search_cost_specials').all() as Array<{ cost: string, symbol: string, count: number }>;
    const specialsByCost = new Map<string, Map<string, number>>();
    for (const row of specials) {
      const bucket = specialsByCost.get(row.cost) ?? new Map<string, number>();
      bucket.set(row.symbol, row.count);
      specialsByCost.set(row.cost, bucket);
    }

    const mismatches: Array<Record<string, unknown>> = [];
    for (const row of stored) {
      const cost = String(row.cost);
      const reference = expected.get(cost);
      if (reference == null) {
        mismatches.push({ cost, problem: 'missing from PostgreSQL dictionary' });
        continue;
      }
      const storedSymbols = specialsByCost.get(cost) ?? new Map<string, number>();
      const fixed = { w: row.w, u: row.u, b: row.b, r: row.r, g: row.g, c: row.c, x: row.x } as Record<string, number>;
      for (const [symbol, count] of Object.entries(fixed)) {
        if (count !== (reference.symbols.get(symbol) ?? 0)) {
          mismatches.push({ cost, symbol, postgres: reference.symbols.get(symbol) ?? 0, package: count });
        }
      }
      if (Number(row.generic) !== reference.generic) {
        mismatches.push({ cost, field: 'generic', postgres: reference.generic, package: row.generic });
      }
      const storedSpecials = new Map(storedSymbols);
      for (const [symbol, count] of reference.symbols) {
        if (['w', 'u', 'b', 'r', 'g', 'c', 'x'].includes(symbol)) continue;
        if (storedSpecials.get(symbol) !== count) {
          mismatches.push({ cost, symbol, postgres: count, package: storedSpecials.get(symbol) ?? 0 });
        }
      }
    }

    const storedCosts = new Set(stored.map(row => String(row.cost)));
    for (const cost of usedCosts) {
      if (!storedCosts.has(cost)) mismatches.push({ cost, problem: 'used by a part but absent from the package' });
    }

    console.log(JSON.stringify({
      postgresCosts: costs.length,
      packageCosts:  stored.length,
      usedCosts:     usedCosts.size,
      mismatches,
    }, null, 2));
    if (mismatches.length > 0) throw new Error('The package cost dictionary differs from PostgreSQL.');
  } finally {
    sqlite.close();
  }
} finally {
  await database.$client.end({ timeout: 0 });
}

/** Counts each cost symbol's repetitions from the PostgreSQL specials array. */
function countSymbols(specials: string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const symbol of specials) counts.set(symbol, (counts.get(symbol) ?? 0) + 1);
  return counts;
}
