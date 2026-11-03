import type { SearchD1Router } from '@tcg-cards/console-api';
import { createConsoleApiClient } from '@tcg-cards/console-platform';

import { readSearchD1SessionOverride } from '../../runtime-config';
import type { SearchD1SessionOverride } from '../../runtime-config';

/** Per-statement outcome of one remote search D1 batch. */
export type SearchD1StatementResult = {
  success:      boolean;
  durationMs?:  number;
  rowsRead?:    number;
  rowsWritten?: number;
  rows:         Array<Record<string, unknown>>;
};

/** Executed search D1 statements channel used by the publishing task. */
export interface SearchD1Remote {
  execute(game: 'magic' | 'hearthstone', statements: string[]): Promise<SearchD1StatementResult[]>;
  meta(game: 'magic' | 'hearthstone'): Promise<Record<string, string>>;
}

/**
 * Builds the authenticated console-service client that carries search D1
 * statements to the internal backend, mapping transport failures to
 * user-actionable messages the same way the desktop auth calls do.
 */
export function createSearchD1Remote(session: SearchD1SessionOverride): SearchD1Remote {
  let responseStatus: number | null = null;
  const api = createConsoleApiClient<SearchD1Router>({
    url:   new URL('search-d1/rpc', session.baseUrl).toString(),
    fetch: async (request, init) => {
      const headers = new Headers(request instanceof Request ? request.headers : undefined);
      headers.set('cookie', session.cookieHeader);
      const response = await fetch(request, { ...init, headers });
      responseStatus = response.status;
      return response;
    },
  });

  const wrap = async <T>(call: () => Promise<T>): Promise<T> => {
    responseStatus = null;
    try {
      return await call();
    } catch (error) {
      if (responseStatus === 401) throw new Error('登录已失效，请重新登录控制台服务。', { cause: error });
      if (responseStatus === 403) throw new Error('当前账号无权发布搜索数据。', { cause: error });
      if (responseStatus == null) throw new Error('无法连接控制台服务，请检查地址和网络。', { cause: error });
      throw error;
    }
  };

  return {
    async execute(game, statements) {
      const result = await wrap(() => api.searchD1.execute({ game, statements }));
      return result.results;
    },
    async meta(game) {
      const result = await wrap(() => api.searchD1.meta({ game }));
      return result.values;
    },
  };
}

/** Reads the injected console-service session, failing with an actionable message. */
export function requireSearchD1Session(): SearchD1SessionOverride {
  const session = readSearchD1SessionOverride();
  if (session == null || !session.cookieHeader) {
    throw new Error('请先登录控制台服务，再发布搜索数据。');
  }
  return session;
}
