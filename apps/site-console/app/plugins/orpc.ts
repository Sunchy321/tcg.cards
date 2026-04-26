import { createConsoleApiClient } from '@tcg-cards/app-console';

import type { RouterClient } from '@orpc/server';
import type { Router } from '~~/server/orpc/service';

export default defineNuxtPlugin(() => {
  const event = useRequestEvent();

  const origin = import.meta.client
    ? window.location.origin
    : useRequestURL().origin;

  const orpc: RouterClient<Router> = createConsoleApiClient<Router>({
    url:     `${origin}/rpc`,
    headers: event?.headers,
  });

  return {
    provide: {
      orpc,
    },
  };
});
