import { createConsoleApiClient } from '@tcg-cards/app-console';
import {
  createConsolePlatform,
  createConsoleSession,
  createConsoleStorage,
  createMemoryStorage,
} from '@tcg-cards/console-platform';

import { authClient, type Session } from '~/composables/auth';

import type { AnyRouter } from '@orpc/server';

export function useSiteConsolePlatform() {
  const route = useRoute();
  const router = useRouter();
  const toast = useToast();
  const session = authClient.useSession();
  const requestUrl = import.meta.client ? null : useRequestURL();
  const requestHeaders = import.meta.server
    ? useRequestHeaders(['authorization', 'cookie'])
    : undefined;

  const storage = import.meta.client
    ? createConsoleStorage(window.localStorage)
    : createMemoryStorage();

  return createConsolePlatform<Session>({
    api: {
      request(input, init) {
        return fetch(input, init);
      },
      createClient<TRouter extends AnyRouter>() {
        const origin = import.meta.client
          ? window.location.origin
          : requestUrl?.origin ?? '';

        return createConsoleApiClient<TRouter>({
          url: `${origin}/rpc`,
          headers: requestHeaders,
        });
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
    session: createConsoleSession<Session>({
      get() {
        return session.value.data ?? null;
      },
    }),
    storage,
    toast: {
      show(input) {
        toast.add(input);
      },
    },
  });
}
