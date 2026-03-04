import { createORPCClient } from '@orpc/client';
import { RPCLink } from '@orpc/client/fetch';

import type { RouterClient } from '@orpc/server';
import type { Router } from '~~/server/orpc/service';

export default defineNuxtPlugin(() => {
  const event = useRequestEvent();

  const origin = import.meta.client
    ? window.location.origin
    : useRequestURL().origin;

  const link = new RPCLink({
    url:     `${origin}/rpc`,
    headers: event?.headers,
  });

  const orpc: RouterClient<Router> = createORPCClient(link);

  return {
    provide: {
      orpc,
    },
  };
});
