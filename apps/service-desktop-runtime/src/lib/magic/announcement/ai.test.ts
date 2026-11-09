import { describe, expect, spyOn, test } from 'bun:test';

import { normalizeAiResult, parseAiResult } from './ai';
import { buildMagicAiParseStreamResponse, extractArticle } from './ai-parse-stream';
import { readAiConfig, setAiConfig } from '../../../runtime-config';

describe('Magic announcement parsing', () => {
  test('uses imported card identity rules for punctuation, accents and complete multi-face names', () => {
    const result = normalizeAiResult({
      header: { date: '2026-10-14', effectiveDateOnline: '2026-10-15', effectiveDateArena: '2026-10-16' },
      items:  [
        { type: 'card_change', status: 'banned', format: 'modern', cardName: 'Nadu, Winged Wisdom', cardId: 'invented' },
        { type: 'card_change', status: 'legal', format: 'legacy', cardName: 'Lim-Dûl\'s Vault' },
        { type: 'card_split', cardName: 'Fire // Ice', relatedNames: ['Fire', 'Ice'] },
      ],
    });
    expect(result.items.map(item => item.cardId)).toEqual(['nadu-winged-wisdom', 'lim-duls-vault', 'fire--ice']);
    expect(result.items[2]!.relatedCards).toEqual(['fire', 'ice']);
    expect(result.header.effectiveDateOnline).toBe('2026-10-15');
    expect(result.header.effectiveDateArena).toBe('2026-10-16');
    expect(result.header.effectiveDateTabletop).toBeNull();
  });

  test('preserves separate format changes, points and item effective dates', () => {
    const result = normalizeAiResult({
      header: {},
      items:  [
        { type: 'card_change', format: 'vintage', status: 'restricted', cardName: 'Sol Ring', effectiveDate: '2026-10-15' },
        { type: 'card_change', format: 'canadian-highlander', status: 'score', score: 4, cardName: 'Sol Ring' },
        { type: 'card_change', format: 'commander', status: 'game_changer', cardName: 'Sol Ring' },
        { type: 'rule_change' },
      ],
    });
    expect(result.items).toHaveLength(4);
    expect(result.items[0]!.effectiveDate).toBe('2026-10-15');
    expect(result.items[1]!.score).toBe(4);
    expect(result.items[3]!.ruleId).toBeNull();
    expect(result.header.date).toBeNull();
  });

  test('rejects malformed changes rather than replacing them with default bans', () => {
    for (const item of [
      { type: 'unknown', status: 'banned' },
      { type: 'card_change', status: 'buff' },
      { type: 'card_change' },
      { type: 'card_change', status: 'score' },
      { type: 'card_change', status: 'banned', effectiveDate: '2026-02-30' },
      { type: 'card_change', status: 'banned', format: 'made-up-format' },
      { type: 'card_change', status: 'banned', cardName: '太阳戒' },
      { type: 'card_change', status: 'banned', cardName: 'Fire // 冰' },
      { type: 'card_split', cardName: 'Fire // Ice', relatedNames: ['Ice 冰'] },
      { type: 'rule_change', status: 'banned' },
    ]) {
      expect(() => normalizeAiResult({ header: {}, items: [item] })).toThrow();
    }
  });

  test('accepts fenced results but rejects truncated or missing item arrays', () => {
    expect(parseAiResult('```json\n{"header":{},"items":[]}\n```').items).toEqual([]);
    expect(() => parseAiResult('{"header":{},"items":[')).toThrow();
    expect(() => normalizeAiResult({ header: {} })).toThrow();
  });

  test('reads article headings and long bodies without page scripts or navigation', () => {
    const article = extractArticle(`<html><body><nav>Ignore this</nav><article><header><h1>Ban announcement</h1></header><p>Effective tomorrow.</p><script>Ignore script</script><p>${'Explanation. '.repeat(900)}</p><h2>Legacy</h2><p>Sol Ring is banned.</p></article><footer>Ignore footer</footer></body></html>`);
    expect(article).toContain('Ban announcement');
    expect(article).toContain('Legacy');
    expect(article).toContain('Sol Ring is banned.');
    expect(article).not.toContain('Ignore');
    expect(article.length).toBeGreaterThan(8000);
  });

  test('streams progress and validated changes without leaking model JSON', async () => {
    let receivedArticle = false;
    const output = JSON.stringify({
      header: { date: '2026-10-14' },
      items:  [{ type: 'card_change', status: 'banned', format: 'commander', cardName: 'Sol Ring' }],
    });
    const fetchMock = spyOn(globalThis, 'fetch').mockImplementation(Object.assign(async (request: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
      const url = request instanceof Request ? request.url : String(request);
      if (new URL(url).pathname === '/article') {
        return new Response('<article><h1>Announcement</h1><p>Sol Ring is banned in Commander.</p></article>');
      }
      const body = String(init?.body ?? '');
      receivedArticle = body.includes('Sol Ring is banned in Commander.');
      const chunk = { id: 'fixture', object: 'chat.completion.chunk', created: 0, model: 'fixture', choices: [{ index: 0, delta: { content: output }, finish_reason: null }] };
      const finish = { ...chunk, choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] };
      return new Response(`data: ${JSON.stringify(chunk)}\n\ndata: ${JSON.stringify(finish)}\n\ndata: [DONE]\n\n`, { headers: { 'content-type': 'text/event-stream' } });
    }, { preconnect: fetch.preconnect }));
    const previous = readAiConfig();
    try {
      setAiConfig({ apiKey: 'fixture', baseUrl: 'https://fixture.example/v1', model: 'fixture' });
      const response = buildMagicAiParseStreamResponse({ links: [{ url: 'https://fixture.example/article' }] });
      const text = await response.text();
      expect(receivedArticle).toBe(true);
      expect(response.headers.get('content-type')).toContain('text/event-stream');
      expect(text).toContain('data-phase');
      expect(text).toContain('"phase":"fetch"');
      expect(text).toContain('"phase":"analyze"');
      expect(text).toContain('data-result');
      expect(text).toContain('"cardId":"sol-ring"');
      expect(text).not.toContain('text-delta');
      expect(text).not.toContain('cardName');
    } finally {
      setAiConfig(previous);
      fetchMock.mockRestore();
    }
  });

  test('HTTP failures emit an error without invoking the model or returning changes', async () => {
    const fetchMock = spyOn(globalThis, 'fetch').mockResolvedValue(new Response('Page missing', { status: 404 }));
    const logMock = spyOn(console, 'error').mockImplementation(() => {});
    try {
      const response = buildMagicAiParseStreamResponse({ links: [{ url: 'https://fixture.example/missing' }] });
      const text = await response.text();
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(text).toContain('"type":"error"');
      expect(text).not.toContain('data-result');
      expect(text).not.toContain('Page missing');
    } finally {
      fetchMock.mockRestore();
      logMock.mockRestore();
    }
  });

  test('cancellation propagates to fetching and never emits a form result', async () => {
    const controller = new AbortController();
    let fetchWasCancelled = false;
    const fetchMock = spyOn(globalThis, 'fetch').mockImplementation(Object.assign(async (_request: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
      controller.abort();
      fetchWasCancelled = Boolean(init?.signal?.aborted);
      init?.signal?.throwIfAborted();
      return new Response('<article>Unexpected result</article>');
    }, { preconnect: fetch.preconnect }));
    const logMock = spyOn(console, 'error').mockImplementation(() => {});
    try {
      const response = buildMagicAiParseStreamResponse({ links: [{ url: 'https://fixture.example/article' }] }, controller.signal);
      const text = await response.text();
      expect(fetchWasCancelled).toBe(true);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(text).not.toContain('data-result');
      expect(text).not.toContain('"phase":"analyze"');
    } finally {
      fetchMock.mockRestore();
      logMock.mockRestore();
    }
  });
});

test('announcement parsing accepts the six additional canonical formats', () => {
  const formats = ['tiny-leader-reborn', 'predh', 'gladiator', 'old-school', 'premodern', 'competitive-brawl'];
  const result = normalizeAiResult({
    header: {},
    items:  formats.map(format => ({ type: 'card_change', status: 'banned', format, cardName: 'Sol Ring' })),
  });
  expect(result.items.map(item => item.format)).toEqual(formats);
});
