import type { AnyD1Database } from 'drizzle-orm/d1';

const nodeSqliteD1Marker = Symbol.for('@tcg-cards/search/node-sqlite-d1');

/** Provides the D1 statement shape over Node's synchronous SQLite statements. */
export function nodeSqliteD1Binding(database: unknown): AnyD1Database {
  const client = database as {
    prepare(query: string): {
      all(...values: never[]): unknown[];
      run(...values: never[]): unknown;
    };
  };

  const binding = {
    prepare(query: string) {
      const statement = client.prepare(query);
      let parameters: unknown[] = [];
      const bound = {
        bind(...values: unknown[]) {
          parameters = values;
          return bound;
        },
        async all() {
          return { results: statement.all(...parameters as never[]) };
        },
        async raw() {
          return statement.all(...parameters as never[])
            .map(row => Object.values(row as Record<string, unknown>));
        },
        async run() {
          return statement.run(...parameters as never[]);
        },
      };
      return bound;
    },
  } as unknown as AnyD1Database;
  Object.defineProperty(binding, nodeSqliteD1Marker, { value: true });
  return binding;
}

/** Distinguishes local SQLite snapshots from Cloudflare D1 before release checks. */
export function isNodeSqliteD1Binding(database: unknown): boolean {
  return typeof database === 'object' && database !== null
    && (database as Record<symbol, unknown>)[nodeSqliteD1Marker] === true;
}
