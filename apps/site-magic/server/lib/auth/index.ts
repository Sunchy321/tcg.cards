import { betterAuth } from 'better-auth';
import { admin, openAPI, username } from 'better-auth/plugins';
import { apiKey } from '@better-auth/api-key';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';

import { db } from '#server/db/db';
import { accounts, apikeys, sessions, users, verifications } from '~~/server/db/schema/auth';
import { ac, roles } from './perms';

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider:  'pg',
    usePlural: true,
    schema:    {
      users,
      accounts,
      sessions,
      verifications,
      apikeys,
    },
  }),

  trustedOrigins: ['localhost:*', 'http://*.tcg.cards'],

  emailAndPassword: {
    enabled: true,
  },

  plugins: [
    username(),
    admin({
      ac,
      roles,
      adminRoles:   ['admin', 'owner'],
      adminUserIds: ['Sunchy321'],
    }),
    openAPI({ disableDefaultReference: true }),
    apiKey({
      rateLimit: {
        enabled:     true,
        timeWindow:  1000,
        maxRequests: 100,
      },
    }),
  ],
});
