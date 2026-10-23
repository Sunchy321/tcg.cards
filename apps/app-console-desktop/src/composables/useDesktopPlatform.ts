import { useToast } from '@nuxt/ui/composables';
import { createConsoleApiClient, createConsolePlatform, createConsoleSession, createConsoleStorage } from '@tcg-cards/console-platform';

import type { AnyRouter } from '@orpc/server';

/** Rejects unmigrated data requests without touching a remote service or legacy runtime. */
async function request(): Promise<Response> {
  throw new Error('暂时无法访问数据');
}

/** Connects the shared management layout to local Electron navigation and storage. */
export function useDesktopPlatform() {
  const route = useRoute();
  const router = useRouter();
  const toast = useToast();
  return createConsolePlatform({
    api: {
      request,
      createClient<TRouter extends AnyRouter>() {
        return createConsoleApiClient<TRouter>({ url: 'https://desktop.invalid/rpc', fetch: request });
      },
    },
    router: {
      currentPath: () => route.path,
      async push(path) { await router.push(path); },
      async replace(path) { await router.replace(path); },
    },
    session: createConsoleSession({ get: () => null }),
    storage: createConsoleStorage(window.localStorage),
    toast: { show: input => { toast.add(input); } },
  });
}
