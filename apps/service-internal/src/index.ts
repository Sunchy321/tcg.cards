import { Hono } from 'hono';

import { getAuth } from './auth';

import type { InternalServiceEnv } from './env';

const hono = new Hono<{
  Bindings: InternalServiceEnv;
}>();

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

export default hono;
