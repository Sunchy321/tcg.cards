import { RPCHandler } from '@orpc/server/fetch';
import { onError } from '@orpc/server';

import { router } from '~~/server/orpc/service';
import { auth } from '~~/server/lib/auth';
import type { HearthstoneSearchD1Database } from '~~/server/search/d1/types';

const handler = new RPCHandler(router, {
  interceptors: [
    onError(error => {
      console.error('[orpc] error:', error);
    }),
  ],
});

export default defineEventHandler(async event => {
  const request = toWebRequest(event);
  const cloudflareEnv = event.context.cloudflare?.env as Record<string, unknown> | undefined;
  const searchD1 = cloudflareEnv?.HEARTHSTONE_SEARCH_DB as HearthstoneSearchD1Database | undefined;

  const session = await auth.api.getSession({ headers: request.headers });

  const { response } = await handler.handle(request, {
    prefix:  '/rpc',
    context: {
      user:    session?.user ?? null,
      session: session?.session ?? null,
      searchD1,
    },
  });

  if (response) {
    return response;
  }

  setResponseStatus(event, 404, 'Not Found');
  return 'Not found';
});
