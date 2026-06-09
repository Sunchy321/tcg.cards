import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { betterAuth } from 'better-auth';
import { admin, username } from 'better-auth/plugins';

import { ac, roles } from './permissions';

export interface CreateServerAuthOptions {
  adminUserIds?: string[];
  baseURL?: string;
  database: Parameters<typeof drizzleAdapter>[0];
  schema: {
    accounts: any;
    sessions: any;
    users: any;
    verifications: any;
  };
  secret?: string;
  trustedOrigins?: string[];
}

export function createServerAuth(options: CreateServerAuthOptions) {
  const nodeProcess = (globalThis as {
    process?: {
      env?: Record<string, string | undefined>;
    };
  }).process;

  return betterAuth({
    basePath: '/auth',
    baseURL: options.baseURL
      ?? nodeProcess?.env?.BETTER_AUTH_URL
      ?? nodeProcess?.env?.BETTER_AUTH_BASE_URL,
    secret: options.secret ?? nodeProcess?.env?.BETTER_AUTH_SECRET,

    database: drizzleAdapter(options.database, {
      provider:  'pg',
      usePlural: true,
      schema:    options.schema,
    }),

    trustedOrigins: options.trustedOrigins ?? [
      'localhost:*',
      'http://*.tcg.cards',
      'https://*.tcg.cards',
    ],

    emailAndPassword: {
      enabled: true,
    },

    plugins: [
      username(),
      admin({
        ac,
        roles,
        adminRoles:   ['admin', 'owner'],
        adminUserIds: options.adminUserIds ?? ['Sunchy321'],
      }),
    ],
  });
}
