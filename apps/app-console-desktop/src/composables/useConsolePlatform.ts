import { useToast } from '@nuxt/ui/composables';
import { createConsolePlatform, createConsoleSession, createConsoleStorage } from '@tcg-cards/console-platform';
import { useRoute, useRouter } from 'vue-router';

import { currentAuthState } from '../auth';
import { authFetch, createDesktopApiClient } from './useApiClient';

import type { DesktopAuthState } from '../auth';
import type { AnyRouter } from '@orpc/server';

export function useDesktopConsolePlatform() {
  const route = useRoute();
  const router = useRouter();
  const toast = useToast();

  return createConsolePlatform<DesktopAuthState>({
    api: {
      request(input, init) {
        return authFetch(input, init);
      },
      createClient<TRouter extends AnyRouter>() {
        return createDesktopApiClient<TRouter>();
      },
    },
    router: {
      currentPath() {
        return route.path;
      },
      async push(path) {
        await router.push(path);
      },
      async replace(path) {
        await router.replace(path);
      },
    },
    session: createConsoleSession<DesktopAuthState>({
      get() {
        return currentAuthState.value;
      },
      set(session) {
        currentAuthState.value = session;
      },
    }),
    storage: createConsoleStorage(window.localStorage),
    toast: {
      show(input) {
        toast.add(input);
      },
    },
  });
}
