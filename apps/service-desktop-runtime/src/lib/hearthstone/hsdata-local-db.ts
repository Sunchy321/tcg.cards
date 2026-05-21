import { ORPCError } from '@orpc/server';

import { createDb } from '@tcg-cards/db';

import { readLocalDatabaseUrl } from '../../runtime-config';

/** Runtime-local Drizzle database shape used by hsdata procedures. */
export type LocalDb = ReturnType<typeof createDb>;

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

/** Builds one Drizzle client bound to the configured desktop local database. */
export const getLocalDb = () => {
  return createDb(requireLocalDatabaseUrl());
};
