import { createServerAuth } from '@tcg-cards/auth';

import { db } from '@tcg-cards/db';
import { accounts, apikeys, sessions, users, verifications } from '@tcg-cards/db/schema/remote/auth';

import type { ApiServiceEnv } from './env';

export function getAuth(env: ApiServiceEnv, options?: { baseURL?: string }) {
  return createServerAuth({
    baseURL:  options?.baseURL,
    database: db,
    secret:   env.BETTER_AUTH_SECRET,
    schema:   {
      users,
      accounts,
      sessions,
      verifications,
      apikeys,
    },
  });
}
