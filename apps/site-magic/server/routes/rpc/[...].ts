import { RPCHandler } from '@orpc/server/fetch';
import { onError } from '@orpc/server';
import { DrizzleQueryError } from 'drizzle-orm';

import { router } from '~~/server/orpc/service';

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
    context: {}, // Provide initial context if needed
  });

  if (response) {
    return response;
  }

  setResponseStatus(event, 404, 'Not Found');
  return 'Not found';
});
