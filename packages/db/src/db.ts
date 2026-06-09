import { AsyncLocalStorage } from 'node:async_hooks';
import { drizzle } from 'drizzle-orm/postgres-js';

interface HyperdriveBinding {
  connectionString: string;
}

const localConnectionString = 'postgres://postgres:postgres@127.0.0.1:5432/tcg_cards';

function isDev() {
  return process.env.NODE_ENV === 'development';
}

function getEnvConnectionString() {
  return process.env.DATABASE_URL?.trim() || null;
}

function getHyperdriveConnectionString() {
  const binding = (process.env.HYPERDRIVE as unknown as HyperdriveBinding)
    ?? (globalThis as any).__env__?.HYPERDRIVE
    ?? (globalThis as any).HYPERDRIVE;

  if (typeof binding === 'string') {
    return binding;
  }

  return binding?.connectionString ?? null;
}

type Db = ReturnType<typeof drizzle>;

let _db: Db | null = null;
const dbContext = new AsyncLocalStorage<Db>();

export function getConnectionString(): string {
  const connectionString = getEnvConnectionString()
    ?? getHyperdriveConnectionString()
    ?? (isDev() ? localConnectionString : null);

  if (connectionString == null) {
    throw new Error('[db] database connection string not found');
  }

  return connectionString;
}

export function createDb(connection: string): Db {
  return drizzle({ connection });
}

export function runWithDb<T>(database: Db, handler: () => T): T {
  return dbContext.run(database, handler);
}

function getDb() {
  const requestDb = dbContext.getStore();

  if (requestDb) {
    return requestDb;
  }

  if (isDev()) {
    _db ??= createDb(getConnectionString());
    return _db;
  }

  return createDb(getConnectionString());
}

export const db: Db = new Proxy({} as Db, {
  get(_, prop: string | symbol) {
    return getDb()[prop as keyof Db];
  },
});
