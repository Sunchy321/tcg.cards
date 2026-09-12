import { RPCHandler } from '@orpc/server/fetch';
import { onError } from '@orpc/server';
import { DrizzleQueryError } from 'drizzle-orm';

import { router } from '~~/server/orpc/service';
import { auth } from '~~/server/lib/auth';

const handler = new RPCHandler(router, {
  interceptors: [
    onError(error => {
      console.error('[orpc] error:', error);

      if (error instanceof DrizzleQueryError) {
        console.error('[orpc] cause:', error.cause);
      }

      // Probe: dump every layer of the failure (zod issues, error data) so
      // validation rejections identify the exact offending field/path.
      const seen = new Set<unknown>();
      let current: unknown = error;
      while (current != null && typeof current === 'object' && !seen.has(current)) {
        seen.add(current);
        const e = current as { name?: string, message?: string, issues?: unknown, data?: unknown, cause?: unknown };
        if (e.name !== 'Error' && e.name != null) console.error('[orpc] error layer:', e.name, '|', e.message);
        if (e.issues != null) {
          console.error('[orpc] zod issues:', JSON.stringify(e.issues));
          break;
        }
        if (e.data !== undefined) console.error('[orpc] error data:', JSON.stringify(e.data));
        current = e.cause;
      }
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
