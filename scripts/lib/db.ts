import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

let _client: ReturnType<typeof postgres> | null = null;

/** Returns a drizzle instance connected to the local database. */
export function getDb(databaseUrl?: string) {
  const url = databaseUrl ?? process.env.DATABASE_URL ?? getHyperdriveUrl();
  if (!url) {
    throw new Error(
      'No database URL found. Set DATABASE_URL or HYPERDRIVE environment variable.',
    );
  }

  _client ??= postgres(url, { max: 1 });
  return drizzle({ client: _client });
}

function getHyperdriveUrl(): string | undefined {
  const hd = process.env.HYPERDRIVE as { connectionString?: string } | undefined;
  return hd?.connectionString;
}
