import { createAuthClient } from 'better-auth/vue';
import { adminClient, usernameClient } from 'better-auth/client/plugins';

import { ac, roles } from '~~/server/lib/auth/perms';

export const authClient = createAuthClient({
  baseURL: import.meta.client ? window.location.origin : process.env.BETTER_AUTH_URL,
  plugins: [
    usernameClient(),
    adminClient({
      ac,
      roles,
      adminRoles:   ['admin', 'owner'],
      adminUserIds: ['Sunchy321'],
    }),
  ],
});

export type Session = NonNullable<Awaited<ReturnType<typeof authClient.getSession>>['data']>;

const ADMIN_ROLES = ['admin', 'owner'] as const;

export function isAdminRole(role: string | null | undefined): boolean {
  return ADMIN_ROLES.includes(role as any) || (role?.startsWith('admin/') ?? false);
}
