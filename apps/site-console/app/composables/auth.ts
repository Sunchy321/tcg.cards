import { createAuthClient } from 'better-auth/vue';
import { adminClient } from 'better-auth/client/plugins';

export const authClient = createAuthClient({
  baseURL: import.meta.client ? window.location.origin : undefined,
  plugins: [
    adminClient(),
  ],
});

export type Session = NonNullable<Awaited<ReturnType<typeof authClient.getSession>>['data']>;

const ADMIN_ROLES = ['admin', 'owner'] as const;

export function isAdminRole(role: string | null | undefined): boolean {
  return ADMIN_ROLES.includes(role as any) || (role?.startsWith('admin/') ?? false);
}
