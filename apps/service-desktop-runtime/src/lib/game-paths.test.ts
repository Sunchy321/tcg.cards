import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, test } from 'bun:test';

import { applyPathOverrides, setPathOverride } from '../runtime-config';
import { resolvePath } from './game-paths';

afterEach(() => {
  applyPathOverrides({});
});

describe('resolvePath', () => {
  test('returns the explicit override when set', () => {
    setPathOverride('magic.data.scryfall', '/explicit/scryfall');
    expect(resolvePath('magic.data.scryfall')).toBe('/explicit/scryfall');
  });

  test('derives a leaf from the data root when the folder exists', () => {
    const root = mkdtempSync(join(tmpdir(), 'gp-'));
    mkdirSync(join(root, 'magic', 'scryfall'), { recursive: true });
    setPathOverride('data', root);

    expect(resolvePath('magic.data')).toBe(join(root, 'magic'));
    expect(resolvePath('magic.data.scryfall')).toBe(join(root, 'magic', 'scryfall'));
  });

  test('returns null for a leaf whose folder does not exist', () => {
    const root = mkdtempSync(join(tmpdir(), 'gp-'));
    setPathOverride('data', root);

    expect(resolvePath('magic.data.scryfall')).toBeNull();
  });

  test('game root override wins over the derived value', () => {
    const root = mkdtempSync(join(tmpdir(), 'gp-'));
    mkdirSync(join(root, 'magic'), { recursive: true });
    mkdirSync(join(root, 'scryfall'), { recursive: true });
    setPathOverride('data', root);
    setPathOverride('magic.data', join(root, 'scryfall'));

    expect(resolvePath('magic.data')).toBe(join(root, 'scryfall'));
  });

  test('global roots only resolve from explicit overrides', () => {
    expect(resolvePath('data')).toBeNull();
    expect(resolvePath('asset')).toBeNull();

    setPathOverride('data', '/data');
    expect(resolvePath('data')).toBe('/data');
  });
});
