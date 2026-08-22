import { apiKeyClient } from '@better-auth/api-key/client';
import { createAuthClient } from 'better-auth/vue';

export const authClient = createAuthClient({
  baseURL: import.meta.client ? window.location.origin : undefined,
  plugins: [apiKeyClient()],
});

export type Session = NonNullable<Awaited<ReturnType<typeof authClient.getSession>>['data']>;
