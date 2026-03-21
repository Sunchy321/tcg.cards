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

function createDb() {
  if (process.env.NODE_ENV === 'development') {
    _db ??= drizzle({ connection: getHyperdrive().connectionString });
    return _db;
  } else {
    return drizzle({ connection: getHyperdrive().connectionString });
  }
}

export const db: Db = new Proxy({} as Db, {
  get(_, prop: string | symbol) {
    return createDb()[prop as keyof Db];
  },
});
