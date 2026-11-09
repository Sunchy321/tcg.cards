import { describe, expect, test } from 'bun:test';

import {
  createNameResolver,
  parseItemsYaml,
  serializeItems,
  type CardSearchResult,
  type TextItem,
} from './announcement-yaml';

function card(cardId: string, nameEn: string | null, nameZh: string | null = null): CardSearchResult {
  return { cardId, nameEn, nameZh, set: 'Core', type: 'minion' };
}

describe('serializeItems', () => {
  test('emits a YAML list with non-empty fields', () => {
    const item: TextItem = {
      type:          'card_update', effectiveDate: '', format:        'standard', status:        'nerf', group:         '',
      cardId:        'XXX_123', setId:         '', ruleId:        '', relatedCards:  ['XXX_124'],
      delta:         null, glow:          [{ part: 'attack', type: 'buff' }],
    };
    expect(serializeItems([item])).toBe([
      '- type: card_update',
      '  status: nerf',
      '  format: standard',
      '  cardId: XXX_123',
      '  relatedCards:',
      '    - XXX_124',
      '  glow:',
      '    - part: attack',
      '      type: buff',
      '',
    ].join('\n'));
  });

  test('omits nullish and empty fields', () => {
    const item: TextItem = {
      type:          'format_birth', effectiveDate: '', format:        'twist', status:        '', group:         '',
      cardId:        '', setId:         '', ruleId:        '', relatedCards:  [], delta:         null, glow:          null,
    };
    expect(serializeItems([item])).toBe('- type: format_birth\n  format: twist\n');
  });

  test('serializes an empty list as an empty YAML list', () => {
    expect(serializeItems([])).toBe('[]\n');
  });
});

describe('parseItemsYaml', () => {
  test('parses a list of items', () => {
    const result = parseItemsYaml([
      '- type: card_update',
      '  status: nerf',
      '  cardId: XXX_123',
    ].join('\n'));
    expect(result.errors).toEqual([]);
    expect(result.searches).toEqual([]);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({ type: 'card_update', status: 'nerf', cardId: 'XXX_123' });
  });

  test('treats a single mapping as one item', () => {
    const result = parseItemsYaml('type: format_birth\nformat: twist\n');
    expect(result.errors).toEqual([]);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]!.type).toBe('format_birth');
  });

  test('reports a cardId name: trigger as a pending search', () => {
    const result = parseItemsYaml('- type: card_update\n  cardId: name:Fire\n');
    expect(result.errors).toEqual([]);
    expect(result.items).toEqual([]);
    expect(result.searches).toHaveLength(1);
    expect(result.searches[0]).toMatchObject({ query: 'Fire', expanded: false });
  });

  test('marks an already-expanded cardId name: trigger', () => {
    const result = parseItemsYaml('- type: card_update\n  cardId: name:Fire result:XXX_001,XXX_002\n');
    expect(result.errors).toEqual([]);
    expect(result.items).toEqual([]);
    expect(result.searches[0]).toMatchObject({ query: 'Fire', expanded: true });
  });

  test('marks a single-candidate expansion as expanded to avoid re-search', () => {
    const result = parseItemsYaml('- type: card_update\n  cardId: name:Fire result:XXX_001\n');
    expect(result.errors).toEqual([]);
    expect(result.items).toEqual([]);
    expect(result.searches[0]).toMatchObject({ query: 'Fire', expanded: true });
  });

  test('keeps a multi-word query intact without quoting', () => {
    const result = parseItemsYaml('- type: card_update\n  cardId: name:Fireball Roller\n');
    expect(result.errors).toEqual([]);
    expect(result.items).toEqual([]);
    expect(result.searches[0]).toMatchObject({ query: 'Fireball Roller', expanded: false });
  });

  test('treats content after the result: marker as candidates', () => {
    const result = parseItemsYaml('- type: card_update\n  cardId: name:Fireball Roller result:XXX_001,XXX_002\n');
    expect(result.errors).toEqual([]);
    expect(result.items).toEqual([]);
    expect(result.searches[0]).toMatchObject({ query: 'Fireball Roller', expanded: true });
  });

  test('rejects an empty cardId name: trigger', () => {
    const result = parseItemsYaml('- type: card_update\n  cardId: "name:"\n');
    expect(result.errors[0]?.message).toContain('搜索词');
    expect(result.items).toEqual([]);
  });

  test('rejects a standalone name field as unknown', () => {
    const result = parseItemsYaml('- type: card_update\n  name: Fire\n');
    expect(result.errors[0]?.message).toContain('未知字段');
    expect(result.items).toEqual([]);
  });

  test('reports unknown keys with a line number', () => {
    const result = parseItemsYaml('- type: card_update\n  bogus: 1\n');
    expect(result.errors[0]?.message).toContain('未知字段');
    expect(result.errors[0]?.line).toBe(2);
    expect(result.items).toEqual([]);
  });

  test('rejects an invalid type', () => {
    const result = parseItemsYaml('- type: nonsense\n');
    expect(result.errors[0]?.message).toContain('type 非法');
  });

  test('rejects multiple YAML documents', () => {
    const result = parseItemsYaml('---\n- type: card_update\n---\n- type: card_change\n');
    expect(result.errors[0]?.message).toContain('单个条目列表');
  });

  test('rejects glow entries outside the enums', () => {
    const result = parseItemsYaml([
      '- type: card_update',
      '  cardId: XXX_001',
      '  glow:',
      '    - part: bogus',
      '      type: buff',
    ].join('\n'));
    expect(result.errors[0]?.message).toContain('glow 非法');
    expect(result.items).toEqual([]);
  });

  test('accepts relatedCards as array or comma string', () => {
    const array = parseItemsYaml('- type: card_update\n  cardId: XXX_001\n  relatedCards:\n    - XXX_002\n');
    expect(array.items[0]!.relatedCards).toEqual(['XXX_002']);
    const comma = parseItemsYaml('- type: card_update\n  cardId: XXX_001\n  relatedCards: XXX_002, XXX_003\n');
    expect(comma.items[0]!.relatedCards).toEqual(['XXX_002', 'XXX_003']);
  });

  test('rejects entity ids that contradict the change type', () => {
    const result = parseItemsYaml('- type: card_update\n  setId: SET_1\n');
    expect(result.errors[0]?.message).toContain('card 类型不能设置 setId');
  });

  test('accepts empty text as an empty result', () => {
    const result = parseItemsYaml('');
    expect(result.errors).toEqual([]);
    expect(result.items).toEqual([]);
    expect(result.searches).toEqual([]);
  });
});

describe('createNameResolver', () => {
  test('caches results and dedupes in-flight requests', async () => {
    let calls = 0;
    const resolver = createNameResolver(async () => {
      calls += 1;
      return [card('XXX_001', 'Fireball')];
    });

    const [a, b] = await Promise.all([resolver('Fireball'), resolver('Fireball')]);
    expect(a).toEqual(b);
    expect(calls).toBe(1);
    await resolver('Fireball');
    expect(calls).toBe(1);
  });
});
