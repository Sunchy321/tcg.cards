import { ORPCError } from '@orpc/server';

import { createDb } from '@tcg-cards/db';

import { readLocalDatabaseUrl } from '../../runtime-config';

/** Runtime-local Drizzle database shape used by Shadowverse Evolve procedures. */
export type ShadowverseEvolveLocalDb = ReturnType<typeof createDb>;

/** Cached local database client paired with its active connection string. */
interface ShadowverseEvolveLocalDbState {
  connectionString: string;
  db: ShadowverseEvolveLocalDb;
}

let localDbState: ShadowverseEvolveLocalDbState | null = null;

/** Closes a replaced local client after the configured connection changes. */
function disposeLocalDb(db: ShadowverseEvolveLocalDb) {
  void db.$client.end({ timeout: 1 }).catch(() => {
    // The replacement client is already active, so shutdown races are harmless.
  });
}

/** Shared desktop-local database client resolved from the injected runtime config. */
export function getShadowverseEvolveLocalDb() {
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
  } satisfies ShadowverseEvolveLocalDbState;

  localDbState = next;

  if (previous != null && previous.connectionString !== connectionString) {
    disposeLocalDb(previous.db);
  }

  return next.db;
}
