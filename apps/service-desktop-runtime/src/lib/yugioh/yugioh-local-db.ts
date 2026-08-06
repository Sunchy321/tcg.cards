import { ORPCError } from '@orpc/server';

import { createDb } from '@tcg-cards/db';

import { readLocalDatabaseUrl } from '../../runtime-config';

/** Runtime-local Drizzle database shape used by Yu-Gi-Oh! procedures. */
export type YugiohLocalDb = ReturnType<typeof createDb>;

/** Cached local database client paired with its active connection string. */
interface YugiohLocalDbState {
  connectionString: string;
  db: YugiohLocalDb;
}

let localDbState: YugiohLocalDbState | null = null;

/** Closes a replaced local client after the configured connection changes. */
function disposeLocalDb(db: YugiohLocalDb) {
  void db.$client.end({ timeout: 1 }).catch(() => {
    // The replacement client is already active, so shutdown races are harmless.
  });
}

/** Shared desktop-local database client resolved from the injected runtime config. */
export function getYugiohLocalDb() {
  const connectionString = readLocalDatabaseUrl();

  if (connectionString == null) {
    throw new ORPCError('INTERNAL_SERVER_ERROR', {
      message: 'Local desktop database URL is not configured',
    });
  }

  if (localDbState?.connectionString === connectionString) {
    return localDbState.db;
  }

  const previous = localDbState;
  const next = {
    connectionString,
    db: createDb(connectionString),
  } satisfies YugiohLocalDbState;

  localDbState = next;

  if (previous != null && previous.connectionString !== connectionString) {
    disposeLocalDb(previous.db);
  }

  return next.db;
}
