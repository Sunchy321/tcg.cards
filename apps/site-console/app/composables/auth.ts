import { createConsoleAuthClient, isAdminRole } from '@tcg-cards/auth';

export const authClient = createConsoleAuthClient({
  baseURL: import.meta.client ? window.location.origin : (process.env.BETTER_AUTH_URL ?? ''),
});

export type Session = NonNullable<Awaited<ReturnType<typeof authClient.getSession>>['data']>;

export { isAdminRole };
