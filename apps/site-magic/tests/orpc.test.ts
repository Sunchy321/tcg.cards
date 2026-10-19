import { expect, mock, spyOn, test } from 'bun:test';

// Compile the actual plugin with Nuxt's SSR flags and request-scoped auto-imports.
const build = await Bun.build({
  entrypoints: [new URL('../app/plugins/orpc.ts', import.meta.url).pathname],
  target:      'bun',
  define:      {
    'import.meta.server': 'true',
    'import.meta.client': 'false',
  },
  banner: `
    let requestEvent;
    const defineNuxtPlugin = setup => setup;
    const useRequestEvent = () => requestEvent;
    const useRequestURL = () => new URL('https://magic.tcg.cards');
  `,
  footer: 'export const setRequestEvent = event => { requestEvent = event; };',
});

if (!build.success) throw new AggregateError(build.logs, 'Cannot compile the RPC plugin');
const source = await build.outputs[0]!.text();
const plugin = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);

test('SSR card requests use the internal dispatcher and preserve session headers and input', async () => {
  const input = { cardId: 'pristine-talisman', locale: 'zhs', set: 'nph', number: '151', partIndex: '0' };
  const card = { cardId: input.cardId, name: 'Pristine Talisman' };
  const dispatch = mock(async (_path: string, _init: RequestInit) => Response.json({ json: card }));
  const network = spyOn(globalThis, 'fetch').mockImplementation(async () => {
    throw new Error('Public self-request timed out (522)');
  });

  try {
    plugin.setRequestEvent({ headers: new Headers({ cookie: 'session=test' }), fetch: dispatch });
    const { provide: { orpc } } = plugin.default();
    expect(await orpc.magic.card.fuzzy(input)).toEqual(card);
    expect(network).not.toHaveBeenCalled();
    expect(dispatch).toHaveBeenCalledTimes(1);
    const [path, init] = dispatch.mock.calls[0]!;
    expect(path).toBe('/rpc/magic/card/fuzzy');
    expect(init.method).toBe('POST');
    expect(new Headers(init.headers).get('cookie')).toBe('session=test');
    expect(JSON.parse(new TextDecoder().decode(init.body as ArrayBuffer))).toEqual({ json: input });
  } finally {
    network.mockRestore();
  }
});
