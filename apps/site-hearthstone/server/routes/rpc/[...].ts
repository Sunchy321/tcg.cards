import { RPCHandler } from '@orpc/server/fetch';
import { onError } from '@orpc/server';

import { router } from '~~/server/orpc/service';
import { auth } from '~~/server/lib/auth';

const handler = new RPCHandler(router, {
  interceptors: [
    onError(error => {
      console.error('[orpc] error:', error);
    }),
  ],
});

export default defineEventHandler(async event => {
  const request = toWebRequest(event);

  const session = await auth.api.getSession({ headers: request.headers });

  const { response } = await handler.handle(request, {
    prefix:  '/rpc',
    context: {
      user:    session?.user ?? null,
      session: session?.session ?? null,
    },
  });

  if (response) {
    return response;
  }

  setResponseStatus(event, 404, 'Not Found');
  return 'Not found';
});
