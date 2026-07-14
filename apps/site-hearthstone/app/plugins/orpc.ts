import { createORPCClient } from '@orpc/client';
import { RPCLink } from '@orpc/client/fetch';

import type { RouterClient } from '@orpc/server';
import type { Router } from '~~/server/orpc/service';

export default defineNuxtPlugin(() => {
  const event = useRequestEvent();
  const localFetch = import.meta.server
    ? (event as (typeof event & { fetch: typeof globalThis.fetch }) | undefined)?.fetch
    : undefined;

  const origin = import.meta.client ? window.location.origin : 'http://localhost';

  const rpcFetch = localFetch == null
    ? undefined
    : async (request: Request) => {
      const url = new URL(request.url);
      const body = request.body == null ? undefined : await request.arrayBuffer();

      return localFetch(`${url.pathname}${url.search}`, {
        method:  request.method,
        headers: request.headers,
        body,
        signal:  request.signal,
      });
    };

  const link = new RPCLink({
    url:     `${origin}/rpc`,
    headers: event?.headers,
    fetch:   rpcFetch,
  });

  const orpc: RouterClient<Router> = createORPCClient(link);

  return {
    provide: {
      orpc,
    },
  };
});
