import {
  createConsoleApiClient,
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
  const sessionState = useState<Session | null>('console-auth-session', () => null);
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
          url:            `${origin}/rpc`,
          headers:        requestHeaders,
          defaultContext: {
            meta: {
              editorRuntime: 'site',
              syncMode:      'remote_edit',
            },
          },
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
        return sessionState.value;
      },
      set(session) {
        sessionState.value = session;
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
