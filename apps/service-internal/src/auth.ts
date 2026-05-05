import { createServerAuth } from '@tcg-cards/auth';

import { accounts, db, sessions, users, verifications } from '@tcg-cards/db';

import type { InternalServiceEnv } from './env';

export function getAuth(env: InternalServiceEnv, options?: { baseURL?: string }) {
  return createServerAuth({
    baseURL:  options?.baseURL,
    database: db,
    secret:   env.BETTER_AUTH_SECRET,
    schema:   {
      users,
      accounts,
      sessions,
      verifications,
    },
  });
}
