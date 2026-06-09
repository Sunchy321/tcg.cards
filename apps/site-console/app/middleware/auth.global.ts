import { authClient, isAdminRole, type Session } from '~/composables/auth';

export default defineNuxtRouteMiddleware(async to => {
  if (to.path === '/login') return;

  const { data: session } = await authClient.getSession({
    fetchOptions: {
      headers: useRequestHeaders(['cookie']),
    },
  });

  if (!session) {
    return navigateTo('/login');
  }

  if (!isAdminRole((session.user as { role?: string }).role)) {
    return navigateTo('/login');
  }

  // Share session with layout via Nuxt state so SSR and client hydration
  // use the same data, preventing structural hydration mismatches.
  const sessionState = useState<Session | null>('console-auth-session', () => null);
  sessionState.value = session;
});
