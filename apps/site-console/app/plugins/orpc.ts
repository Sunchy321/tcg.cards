import { createConsoleApiClient } from '@tcg-cards/console-platform';

import type { Router } from '~~/server/orpc/service';

export default defineNuxtPlugin(() => {
  const event = useRequestEvent();

  const origin = import.meta.client
    ? window.location.origin
    : useRequestURL().origin;

  const orpc = createConsoleApiClient<Router>({
    url:     `${origin}/rpc`,
    headers: event?.headers,
  });

  return {
    provide: {
      orpc,
    },
  };
});
