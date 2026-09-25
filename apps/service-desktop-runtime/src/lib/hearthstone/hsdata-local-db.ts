import { ORPCError } from '@orpc/server';

import { createDb } from '@tcg-cards/db';

import { readLocalDatabaseUrl } from '../../runtime-config';

/** Runtime-local Drizzle database shape used by hsdata procedures. */
export type LocalDb = ReturnType<typeof createDb>;

/** One cached desktop-local database client paired with its connection string. */
interface LocalDbState {
  connectionString: string;
  db: LocalDb;
}

let localDbState: LocalDbState | null = null;

/** Resolves the configured local PostgreSQL connection string for hsdata procedures. */
export const requireLocalDatabaseUrl = () => {
  const connection = readLocalDatabaseUrl();

  if (!connection) {
    throw new ORPCError('INTERNAL_SERVER_ERROR', {
      message: 'Local desktop database URL is not configured',
    });
  }

  return connection;
};

/** Closes one replaced desktop-local client after the runtime switches connection strings. */
function disposeLocalDb(db: LocalDb) {
  void db.$client.end({ timeout: 1 }).catch(() => {
    // Ignore shutdown races because the replacement client is already active.
  });
}

/** Closes the cached desktop-local client and clears the cache, so the next getLocalDb call reconnects from scratch. */
export const closeLocalDb = async () => {
  const previous = localDbState;
  localDbState = null;

  if (!previous) return;

  // Awaited so callers that are about to exit can rely on the sockets being gone;
  // the timeout bounds the wait if a query is still holding a connection.
  await previous.db.$client.end({ timeout: 1 }).catch(() => {
    // Shutdown races are harmless: the client is being discarded either way.
  });
};

/** Returns the shared desktop-local database client for the current configured connection. */
export const getLocalDb = () => {
  const connectionString = requireLocalDatabaseUrl();

  if (localDbState?.connectionString === connectionString) {
    return localDbState.db;
  }

  const next = {
    connectionString,
    db: createDb(connectionString),
  } satisfies LocalDbState;
  const previous = localDbState;

  localDbState = next;

  if (previous && previous.connectionString !== connectionString) {
    disposeLocalDb(previous.db);
  }

  return next.db;
};
