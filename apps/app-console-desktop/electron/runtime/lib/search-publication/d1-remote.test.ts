import { afterEach, describe, expect, test } from 'bun:test';

import { createSearchD1Remote } from './d1-remote';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

/** Installs a fetch stub that answers every RPC call with one status and body. */
function stubFetch(status: number, body: unknown): { urls: string[] } {
  const urls: string[] = [];
  globalThis.fetch = (async (input: Request | string | URL) => {
    urls.push(typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url);
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch;
  return { urls };
}

describe('search D1 remote client', () => {
  test('maps an expired session to an actionable login message', async () => {
    stubFetch(401, { message: '请先登录控制台服务。' });
    const remote = createSearchD1Remote({ baseUrl: 'https://console-api.tcg.cards/', cookieHeader: 'session=abc' });
    await expect(remote.execute('magic', ['SELECT 1;'])).rejects.toThrow('登录已失效，请重新登录控制台服务。');
  });

  test('maps a forbidden account to a permission message', async () => {
    stubFetch(403, { message: 'forbidden' });
    const remote = createSearchD1Remote({ baseUrl: 'https://console-api.tcg.cards/', cookieHeader: 'session=abc' });
    await expect(remote.meta('hearthstone')).rejects.toThrow('当前账号无权发布搜索数据。');
  });

  test('maps a transport failure to a connection message', async () => {
    globalThis.fetch = (async () => {
      throw new TypeError('failed to fetch');
    }) as unknown as typeof fetch;
    const remote = createSearchD1Remote({ baseUrl: 'https://console-api.tcg.cards/', cookieHeader: 'session=abc' });
    await expect(remote.execute('magic', ['SELECT 1;'])).rejects.toThrow('无法连接控制台服务，请检查地址和网络。');
  });

  test('addresses the search D1 route below the console service base', async () => {
    const { urls } = stubFetch(200, { json: { results: [] } });
    const remote = createSearchD1Remote({ baseUrl: 'https://console-api.tcg.cards/', cookieHeader: 'session=abc' });
    await remote.execute('magic', ['SELECT 1;']).catch(() => {});
    expect(urls[0]).toBe('https://console-api.tcg.cards/search-d1/rpc/searchD1/execute');
  });
});
