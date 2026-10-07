import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, test } from 'bun:test';

import { cnocgDetailUrl, fetchCnocgDetail } from './cnocg-api';

const detailJson = readFileSync(join(import.meta.dir, 'fixtures', 'cnocg-detail-4007.json'), 'utf8');
const linkDetailJson = readFileSync(join(import.meta.dir, 'fixtures', 'cnocg-detail-13036.json'), 'utf8');
const notFoundJson = readFileSync(join(import.meta.dir, 'fixtures', 'cnocg-detail-notfound.json'), 'utf8');

function fetchReturning(body: string): typeof fetch {
  return (async () => Promise.resolve(new Response(body, { status: 200 }))) as typeof fetch;
}

describe('fetchCnocgDetail', () => {
  test('parses the captured detail payload for Blue-Eyes White Dragon', async () => {
    let requestedUrl = '';
    const fetchImpl = ((input: URL | RequestInfo) => {
      requestedUrl = String(input);
      return Promise.resolve(new Response(detailJson, { status: 200 }));
    }) as typeof fetch;

    const result = await fetchCnocgDetail(4007, { fetchImpl });

    expect(result).not.toBeNull();
    expect(requestedUrl).toBe(cnocgDetailUrl(4007));
    expect(result!.url).toBe(cnocgDetailUrl(4007));
    expect(result!.data.cardId).toBe(4007);
    expect(result!.data.cardName).toBe('青眼白龙');
    expect(result!.data.cardText).toContain('传说之龙');
    expect(result!.data.packList.length).toBeGreaterThan(0);
    expect(result!.data.packList[0]!.cardNo).toBe('QCAC-SC024');
    expect(result!.data.packList[0]!.rarity).toBe('金闪稀有');
    expect(result!.data.packList[0]!.packName).toBe('25周年艺画典藏包');
  });

  test('returns null for a card missing from the CN database', async () => {
    const result = await fetchCnocgDetail(20000, { fetchImpl: fetchReturning(notFoundJson) });
    expect(result).toBeNull();
  });

  test('reads the link-marker encoding of a link monster', async () => {
    const result = await fetchCnocgDetail(13036, { fetchImpl: fetchReturning(linkDetailJson) });
    expect(result?.data.cardName).toBe('解码语者');
    expect(result?.data.linkMarker).toBe('813');
    expect(result?.data.linkMarkerCount).toBe(3);
  });

  test('throws on unexpected result codes so they are retried instead of cached as a miss', async () => {
    const payload = JSON.stringify({ result: { code: 500000, message: 'SERVER_ERROR' }, response: null });
    expect(fetchCnocgDetail(4007, { fetchImpl: fetchReturning(payload) })).rejects.toThrow('unexpected result code 500000');
  });

  test('tolerates unknown fields from the v0 API', async () => {
    const payload = JSON.parse(detailJson);
    payload.response.brandNewField = { whatever: 1 };
    const result = await fetchCnocgDetail(4007, { fetchImpl: fetchReturning(JSON.stringify(payload)) });
    expect(result?.data.cardId).toBe(4007);
  });

  test('throws on a malformed envelope instead of storing junk', async () => {
    expect(fetchCnocgDetail(4007, { fetchImpl: fetchReturning('{"result":{"code":200000}}') })).rejects.toThrow();
  });
});
