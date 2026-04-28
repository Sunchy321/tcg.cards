import { Hono } from 'hono';
import { RPCHandler } from '@orpc/server/fetch';
import { onError } from '@orpc/server';

import { getAuth } from './auth';
import { router } from './orpc/service';

import type { InternalServiceEnv } from './env';

const hono = new Hono<{
  Bindings: InternalServiceEnv;
}>();

const rpcHandler = new RPCHandler(router, {
  interceptors: [
    onError(error => {
      console.error('[orpc] error:', error);
    }),
  ],
});

hono.get('/', c => c.json({
  service: 'service-internal',
  status:  'ok',
  auth:    'better-auth',
}));

hono.get('/health', c => c.json({
  service: 'service-internal',
  status:  'ok',
  time:    new Date().toISOString(),
}));

function handleAuthRequest(request: Request, env: InternalServiceEnv) {
  return getAuth(env).handler(request);
}

hono.all('/auth/*', c => {
  return handleAuthRequest(c.req.raw, c.env);
});

hono.all('/rpc/*', async c => {
  const { response } = await rpcHandler.handle(c.req.raw, { prefix: '/rpc' });
  return response ?? c.notFound();
});

export default hono;
