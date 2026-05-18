import { drizzle } from 'drizzle-orm/postgres-js';

interface HyperdriveBinding {
  connectionString: string;
}

export function getConnectionString(): string {
  const binding = (process.env.HYPERDRIVE
    ?? (globalThis as any).__env__?.HYPERDRIVE
    ?? (globalThis as any).HYPERDRIVE) as unknown;

  if (process.env.DATABASE_URL != null && process.env.DATABASE_URL.length > 0) {
    return process.env.DATABASE_URL;
  }

  if (typeof binding === 'string' && binding.length > 0) {
    return binding;
  }

  if (isHyperdriveBinding(binding)) {
    return binding.connectionString;
  }

  throw new Error('[db] database connection not found');
}

function isHyperdriveBinding(value: unknown): value is HyperdriveBinding {
  return typeof value === 'object'
    && value != null
    && 'connectionString' in value
    && typeof value.connectionString === 'string';
}

type Db = ReturnType<typeof drizzle>;

let _db: Db | null = null;

function createDb() {
  if (process.env.NODE_ENV === 'development') {
    _db ??= drizzle({ connection: getConnectionString() });
    return _db;
  } else {
    return drizzle({ connection: getConnectionString() });
  }
}

export const db: Db = new Proxy({} as Db, {
  get(_, prop: string | symbol) {
    return createDb()[prop as keyof Db];
  },
});
