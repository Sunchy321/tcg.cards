import { useToast } from '@nuxt/ui/composables';
import { createConsoleApiClient, createConsolePlatform, createConsoleSession, createConsoleStorage } from '@tcg-cards/console-platform';

import type { AnyRouter } from '@orpc/server';
import type { DesktopApiStreamEvent } from '../../electron/contract';

/** Reads one Fetch request body into a cloneable byte array for private IPC. */
async function requestBytes(request: Request): Promise<Uint8Array | null> {
  if (request.body == null || request.method === 'GET' || request.method === 'HEAD') return null;
  return new Uint8Array(await request.arrayBuffer());
}

/** Adapts browser Fetch to the authenticated Electron IPC bridge and preserves streaming responses. */
export async function desktopApiFetch(input: Request | URL | string, init?: ConstructorParameters<typeof Request>[1]): Promise<Response> {
  const source = input instanceof Request
    ? input.clone()
    : new Request(new URL(String(input), window.location.href), init);
  const requestId = crypto.randomUUID();
  const body = await requestBytes(source);
  const chunks: Uint8Array[] = [];
  let controller: ReadableStreamDefaultController<Uint8Array> | null = null;
  let terminal: DesktopApiStreamEvent | null = null;
  let finished = false;
  const bridge = window.desktop.api;

  const unsubscribe = bridge.onStream(event => {
    if (event.requestId !== requestId || finished) return;
    if (event.kind === 'chunk') {
      if (!event.chunk) return;
      if (controller) controller.enqueue(event.chunk);
      else chunks.push(event.chunk);
      return;
    }
    terminal = event;
    if (controller) {
      finished = true;
      if (event.error) controller.error(new Error(event.error));
      else controller.close();
      unsubscribe();
      source.signal.removeEventListener('abort', cancel);
    }
  });

  function cancel() {
    bridge.cancel(requestId);
  }
  source.signal.addEventListener('abort', cancel, { once: true });

  try {
    if (source.signal.aborted) throw new DOMException('The request was aborted.', 'AbortError');
    const response = await bridge.request({
      requestId,
      path:    `${new URL(source.url).pathname}${new URL(source.url).search}`,
      method:  source.method,
      headers: [...source.headers.entries()],
      body,
    });

    if ([204, 205, 304].includes(response.status)) {
      finished = true;
      unsubscribe();
      source.signal.removeEventListener('abort', cancel);
      bridge.cancel(requestId);
      return new Response(null, { status: response.status, headers: response.headers });
    }

    const stream = new ReadableStream<Uint8Array>({
      start(target) {
        controller = target;
        for (const chunk of chunks) target.enqueue(chunk);
        chunks.length = 0;
        if (terminal) {
          finished = true;
          if (terminal.error) target.error(new Error(terminal.error));
          else target.close();
          unsubscribe();
          source.signal.removeEventListener('abort', cancel);
        }
      },
      cancel() {
        finished = true;
        unsubscribe();
        source.signal.removeEventListener('abort', cancel);
        bridge.cancel(requestId);
      },
    });

    return new Response(stream, { status: response.status, headers: response.headers });
  } catch (error) {
    finished = true;
    unsubscribe();
    source.signal.removeEventListener('abort', cancel);
    throw error;
  }
}

/** Connects the shared management layout to local Electron navigation and storage. */
export function useDesktopPlatform() {
  const route = useRoute();
  const router = useRouter();
  const toast = useToast();
  return createConsolePlatform({
    api: {
      request: desktopApiFetch,
      createClient<TRouter extends AnyRouter>() {
        return createConsoleApiClient<TRouter>({
          url:            'https://desktop.invalid/rpc',
          fetch:          desktopApiFetch,
          defaultContext: { meta: { editorRuntime: 'desktop', syncMode: 'local_edit', editorSource: 'manual' } },
        });
      },
    },
    router: {
      currentPath: () => route.path,
      async push(path) { await router.push(path); },
      async replace(path) { await router.replace(path); },
    },
    session: createConsoleSession({ get: () => null }),
    storage: createConsoleStorage(window.localStorage),
    toast:   { show: input => { toast.add(input); } },
  });
}
