import { Hono } from 'hono';

import { getAuth } from './auth';

import type { InternalServiceEnv } from './env';

const app = new Hono<{
  Bindings: InternalServiceEnv;
}>();

app.get('/', c => c.json({
  service: 'service-internal',
  status:  'ok',
  auth:    'better-auth',
}));

app.get('/health', c => c.json({
  service: 'service-internal',
  status:  'ok',
  time:    new Date().toISOString(),
}));

app.all('/api/auth/*', c => {
  return getAuth(c.env).handler(c.req.raw);
});

export default app;
