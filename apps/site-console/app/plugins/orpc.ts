import { createConsoleApiClient } from '@tcg-cards/console-platform';

import type { WebRouter } from '@tcg-cards/console-api';

export default defineNuxtPlugin(() => {
  const event = useRequestEvent();

  const origin = import.meta.client
    ? window.location.origin
    : useRequestURL().origin;

  const orpc = createConsoleApiClient<WebRouter>({
    url:     `${origin}/rpc`,
    headers: event?.headers,
  });

  return {
    provide: {
      orpc,
    },
  };
});
