import { betterAuth } from 'better-auth';
import { admin, apiKey, openAPI, username } from 'better-auth/plugins';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';

import { db } from '@/drizzle';
import { accounts, sessions, users, verifications } from '@/auth/schema';
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
        },
    }),

    trustedOrigins: ['https://tcg.cards:8080', 'http://tcg.cards'],

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
        openAPI(),
        apiKey(),
    ],
});
