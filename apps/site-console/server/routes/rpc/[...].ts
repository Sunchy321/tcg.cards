import { RPCHandler } from '@orpc/server/fetch';
import { onError } from '@orpc/server';
import { DrizzleQueryError } from 'drizzle-orm';

import { webRouter as router } from '@tcg-cards/console-api';
import type { HonoEnv } from '@tcg-cards/console-api';
import type { ConsoleApiRequestMeta } from '@tcg-cards/console-api/request-meta';

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

/** Decodes caller-provided commit metadata from transport headers. */
function readRequestMeta(request: Request): ConsoleApiRequestMeta {
  return {
    editorRuntime:  request.headers.get('x-tcg-editor-runtime') as ConsoleApiRequestMeta['editorRuntime'] ?? undefined,
    syncMode:       request.headers.get('x-tcg-sync-mode') as ConsoleApiRequestMeta['syncMode'] ?? undefined,
    editorIdentity: request.headers.get('x-tcg-editor-identity') ?? undefined,
    editorSource:   request.headers.get('x-tcg-editor-source') ?? undefined,
  };
}

export default defineEventHandler(async event => {
  const request = toWebRequest(event);

  const { response } = await handler.handle(request, {
    prefix:  '/rpc',
    // Per-procedure contexts (rule env, tag commit meta) are invisible to the
    // merged router type, so the supplied context is wider than the inferred one.
    context: {
      env:  event.context.cloudflare?.env as HonoEnv['Bindings'],
      meta: readRequestMeta(request),
    } as any,
  });

  if (response) {
    return response;
  }

  setResponseStatus(event, 404, 'Not Found');
  return 'Not found';
});
