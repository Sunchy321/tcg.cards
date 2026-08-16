import { createAuthClient } from 'better-auth/vue';
import { adminClient } from 'better-auth/client/plugins';

import { ac, roles } from '~~/server/lib/auth/perms';

export const authClient = createAuthClient({
  baseURL: import.meta.client ? window.location.origin : undefined,

  plugins: [
    adminClient({
      ac,
      roles,
      adminRoles:   ['admin', 'owner'],
      adminUserIds: ['Sunchy321'],
    }),
  ],
});

export type Session = NonNullable<Awaited<ReturnType<typeof authClient.getSession>>['data']>;
