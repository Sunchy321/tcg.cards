import { AsyncLocalStorage } from 'node:async_hooks';
import { drizzle } from 'drizzle-orm/postgres-js';

interface HyperdriveBinding {
  connectionString: string;
}

function getHyperdrive(): HyperdriveBinding {
  const binding = (process.env.HYPERDRIVE as unknown as HyperdriveBinding)
    ?? (globalThis as any).__env__?.HYPERDRIVE
    ?? (globalThis as any).HYPERDRIVE;

  if (binding == null) {
    throw new Error('[db] HYPERDRIVE binding not found');
  }

  return binding;
}

type Db = ReturnType<typeof drizzle>;

let _db: Db | null = null;
const dbContext = new AsyncLocalStorage<Db>();

export function getConnectionString(): string {
  return getHyperdrive().connectionString;
}

export function createDb(connection: string): Db {
  return drizzle({ connection });
}

export function runWithDb<T>(database: Db, handler: () => T): T {
  return dbContext.run(database, handler);
}

function isDev() {
  return process.env.NODE_ENV === 'development';
}

function getDb() {
  const requestDb = dbContext.getStore();

  if (requestDb) {
    return requestDb;
  }

  if (isDev()) {
    _db ??= createDb(getHyperdrive().connectionString);
    return _db;
  }

  return createDb(getHyperdrive().connectionString);
}

export const db: Db = new Proxy({} as Db, {
  get(_, prop: string | symbol) {
    return getDb()[prop as keyof Db];
  },
});
