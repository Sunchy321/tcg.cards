import { createServerAuth } from '@tcg-cards/auth';

import { createDb } from '@tcg-cards/db';
import { accounts, sessions, users, verifications } from '@tcg-cards/db';

import type { InternalServiceEnv } from './env';

export function getAuth(env: InternalServiceEnv) {
  return createServerAuth({
    database: createDb(env.HYPERDRIVE.connectionString),
    secret:   env.BETTER_AUTH_SECRET,
    schema:   {
      users,
      accounts,
      sessions,
      verifications,
    },
  });
}
