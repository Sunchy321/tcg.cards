import { RPCHandler } from '@orpc/server/fetch';
import { onError } from '@orpc/server';

import { router } from '~~/server/orpc/service';

const handler = new RPCHandler(router, {
  interceptors: [
    onError(error => {
      console.error('[orpc] error:', error);
      if (error.cause) {
        console.error('[orpc] cause:', error.cause);
      }
      if (error instanceof Error && 'issues' in error) {
        console.error('[orpc] validation issues:', (error as any).issues);
      }
    }),
  ],
});

export default defineEventHandler(async event => {
  const request = toWebRequest(event);

  // Debug: log request details
  console.log('[rpc] Method:', request.method);
  console.log('[rpc] URL:', request.url);
  console.log('[rpc] Headers:', Object.fromEntries(request.headers.entries()));
  
  // Try to read body for POST requests
  if (request.method === 'POST') {
    try {
      const body = await request.text();
      console.log('[rpc] Body:', body);
      // Re-create request with body since we consumed it
      const newRequest = new Request(request.url, {
        method: request.method,
        headers: request.headers,
        body,
      });
      const { response } = await handler.handle(newRequest, {
        prefix:  '/rpc',
        context: {},
      });

      if (response) {
        return response;
      }
    } catch (e) {
      console.error('[rpc] Error reading body:', e);
    }
  } else {
    const { response } = await handler.handle(request, {
      prefix:  '/rpc',
      context: {},
    });

    if (response) {
      return response;
    }
  }

  setResponseStatus(event, 404, 'Not Found');
  return 'Not found';
});
