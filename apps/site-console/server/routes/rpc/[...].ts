import { RPCHandler } from '@orpc/server/fetch';
import { onError } from '@orpc/server';
import { DrizzleQueryError } from 'drizzle-orm';

import { webRouter as router } from '@tcg-cards/console-api';
import type { HonoEnv } from '@tcg-cards/console-api';

const handler = new RPCHandler(router, {
  interceptors: [
    onError(error => {
      console.error('[orpc] error:', error);

      if (error instanceof DrizzleQueryError) {
        console.error('[orpc] cause:', error.cause);
      }
    }),
  ],
});

export default defineEventHandler(async event => {
  const request = toWebRequest(event);

  const { response } = await handler.handle(request, {
    prefix:  '/rpc',
    context: {
      env: event.context.cloudflare?.env as HonoEnv['Bindings'],
    },
  });

  if (response) {
    return response;
  }

  setResponseStatus(event, 404, 'Not Found');
  return 'Not found';
});
