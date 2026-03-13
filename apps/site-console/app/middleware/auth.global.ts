import { authClient, isAdminRole } from '~/composables/auth';

export default defineNuxtRouteMiddleware(async (to) => {
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
});
