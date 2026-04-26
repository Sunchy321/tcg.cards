import { createServerAuth } from '@tcg-cards/auth';

import { db } from '@tcg-cards/db';
import { accounts, sessions, users, verifications } from '@tcg-cards/db';

import type { InternalServiceEnv } from './env';

let auth: ReturnType<typeof createServerAuth> | null = null;

export function getAuth(env: InternalServiceEnv) {
  (globalThis as { HYPERDRIVE?: InternalServiceEnv['HYPERDRIVE'] }).HYPERDRIVE = env.HYPERDRIVE;

  auth ??= createServerAuth({
    database: db,
    secret:   env.BETTER_AUTH_SECRET,
    schema:   {
      users,
      accounts,
      sessions,
      verifications,
    },
  });

  return auth;
}
