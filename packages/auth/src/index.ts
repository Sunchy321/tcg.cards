import { usernameClient } from 'better-auth/client/plugins';
import { createAuthClient } from 'better-auth/vue';

export interface CreateConsoleAuthClientOptions {
  baseURL: string;
}

export function createConsoleAuthClient(options: CreateConsoleAuthClientOptions) {
  return createAuthClient({
    baseURL: options.baseURL,
    plugins: [usernameClient()],
  });
}

const adminRoles = new Set(['admin', 'owner']);

export function isAdminRole(role: string | null | undefined): boolean {
  return adminRoles.has(role ?? '') || (role?.startsWith('admin/') ?? false);
}
