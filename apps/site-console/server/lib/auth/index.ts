import { betterAuth } from 'better-auth';
import { admin, username } from 'better-auth/plugins';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';

import { db } from '~~/server/db/db';
import { accounts, sessions, users, verifications } from '~~/server/db/schema/auth';

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider:  'pg',
    usePlural: true,
    schema:    {
      users,
      accounts,
      sessions,
      verifications,
    },
  }),

  trustedOrigins: ['localhost:*', 'http://*.tcg.cards'],

  emailAndPassword: {
    enabled: true,
  },

  plugins: [
    username(),
    admin({
      adminRoles:   ['admin', 'owner'],
      adminUserIds: ['Sunchy321'],
    }),
  ],
});
