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

export function createDb(connection: string): Db {
  return drizzle({ connection });
}

export function runWithDb<T>(database: Db, handler: () => T): T {
  return dbContext.run(database, handler);
}

function shouldCacheDb() {
  const runtimeGlobal = globalThis as typeof globalThis & {
    __env__?:    { HYPERDRIVE?: HyperdriveBinding };
    HYPERDRIVE?: HyperdriveBinding;
  };

  const hasWorkerBinding = runtimeGlobal.__env__?.HYPERDRIVE != null
    || runtimeGlobal.HYPERDRIVE != null;

  return process.env.NODE_ENV === 'development' && !hasWorkerBinding;
}

function getDb() {
  const requestDb = dbContext.getStore();

  if (requestDb) {
    return requestDb;
  }

  if (shouldCacheDb()) {
    _db ??= createDb(getHyperdrive().connectionString);
    return _db;
  } else {
    return createDb(getHyperdrive().connectionString);
  }
}

export const db: Db = new Proxy({} as Db, {
  get(_, prop: string | symbol) {
    return getDb()[prop as keyof Db];
  },
});
