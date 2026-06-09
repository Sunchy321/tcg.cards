import { authClient, type Session } from '~/composables/auth';

export function useSiteConsoleAdminHost() {
  const sessionState = useState<Session | null>('console-auth-session', () => null);

  return createConsoleAdminHost({
    async signOut() {
      await authClient.signOut();
      sessionState.value = null;
      await navigateTo('/login');
    },
  });
}
