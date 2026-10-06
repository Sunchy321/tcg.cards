import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, test } from 'bun:test';

import {
  fetchNeuronIndexPage,
  neuronIndexPageUrl,
  parseNeuronIndexCids,
  parseNeuronIndexTotal,
} from './neuron-index';

const indexPage = readFileSync(join(import.meta.dir, 'fixtures', 'neuron-index-page.html'), 'utf8');

describe('parseNeuronIndexCids', () => {
  test('reads the captured index page slice in page order', () => {
    expect(parseNeuronIndexCids(indexPage)).toEqual([8610, 6959]);
  });

  test('deduplicates repeated cids while keeping first-seen order', () => {
    const html = [
      '<input type="hidden" class="link_value" value="/yugiohdb/card_search.action?ope=2&cid=4007">',
      '<input type="hidden" class="link_value" value="/yugiohdb/card_search.action?ope=2&cid=8610">',
      '<input type="hidden" class="link_value" value="/yugiohdb/card_search.action?ope=2&cid=4007">',
    ].join('\n');
    expect(parseNeuronIndexCids(html)).toEqual([4007, 8610]);
  });

  test('ignores the jQuery references to link_value elsewhere on the page', () => {
    const html = 'window.open($(\\\'.link_value\\\', this).val());'
      + '<input type="hidden" class="link_value" value="/yugiohdb/card_search.action?ope=2&cid=1">';
    expect(parseNeuronIndexCids(html)).toEqual([1]);
  });

  test('returns empty for a page without card rows', () => {
    expect(parseNeuronIndexCids('<html><body>該当データがありません</body></html>')).toEqual([]);
  });
});

describe('parseNeuronIndexTotal', () => {
  test('reads the hit count from the results header', () => {
    const html = '<div class="sort_set"><div class="text">検索結果 14,305件中 1～100件を表示</div></div>';
    expect(parseNeuronIndexTotal(html)).toBe(14305);
  });

  test('returns null when the page has no results header', () => {
    expect(parseNeuronIndexCids('<html><body>該当データがありません</body></html>')).toEqual([]);
    expect(parseNeuronIndexTotal('<html><body>該当データがありません</body></html>')).toBeNull();
  });

  test('is not fooled by card texts containing 件', () => {
    const html = '<dd class="box_card_text">1件のみ特殊召唤できる。</dd>'
      + '<input type="hidden" class="link_value" value="/yugiohdb/card_search.action?ope=2&cid=1">';
    expect(parseNeuronIndexTotal(html)).toBeNull();
  });
});

describe('neuronIndexPageUrl', () => {
  test('builds the 100-row list URL for a 1-based page', () => {
    expect(neuronIndexPageUrl(3)).toContain('rp=100');
    expect(neuronIndexPageUrl(3)).toContain('page=3');
    expect(neuronIndexPageUrl(3)).toContain('request_locale=ja');
  });
});

describe('fetchNeuronIndexPage', () => {
  const okBody = '<div class="text">検索結果 2件中 1～2件を表示</div>'
    + '<input type="hidden" class="link_value" value="/yugiohdb/card_search.action?ope=2&cid=4007">'
    + '<input type="hidden" class="link_value" value="/yugiohdb/card_search.action?ope=2&cid=8610">';

  test('fetches and parses one page', async () => {
    let requestedUrl = '';
    const fetchImpl = ((input: URL | RequestInfo) => {
      requestedUrl = String(input);
      return Promise.resolve(new Response(okBody, { status: 200 }));
    }) as typeof fetch;

    const page = await fetchNeuronIndexPage(1, { fetchImpl, retryBackoffMs: 0 });

    expect(requestedUrl).toBe(neuronIndexPageUrl(1));
    expect(page.cids).toEqual([4007, 8610]);
    expect(page.total).toBe(2);
  });

  test('retries a page that times out or errors and continues when a later attempt succeeds', async () => {
    let calls = 0;
    const fetchImpl = (() => {
      calls++;
      if (calls < 3) return Promise.reject(new Error('The operation timed out.'));
      return Promise.resolve(new Response(okBody, { status: 200 }));
    }) as typeof fetch;

    const page = await fetchNeuronIndexPage(1, { fetchImpl, retryBackoffMs: 0 });

    expect(page.cids).toEqual([4007, 8610]);
    expect(calls).toBe(3);
  });

  test('retries an error status and succeeds on a later attempt', async () => {
    let calls = 0;
    const fetchImpl = (() => {
      calls++;
      if (calls === 1) return Promise.resolve(new Response('boom', { status: 500 }));
      return Promise.resolve(new Response(okBody, { status: 200 }));
    }) as typeof fetch;

    const page = await fetchNeuronIndexPage(7, { fetchImpl, retryBackoffMs: 0 });
    expect(page.total).toBe(2);
    expect(calls).toBe(2);
  });

  test('gives up after all attempts and names the page that failed', async () => {
    let calls = 0;
    const fetchImpl = (() => {
      calls++;
      return Promise.reject(new Error('The operation timed out.'));
    }) as typeof fetch;

    expect(fetchNeuronIndexPage(42, { fetchImpl, retryBackoffMs: 0 }))
      .rejects.toThrow('Neuron index page 42 failed after 3 attempts: The operation timed out.');
    expect(calls).toBe(3);
  });
});
