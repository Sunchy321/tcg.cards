import { afterEach, describe, expect, test } from 'bun:test';

import {
  applyPathOverrides,
  hasHearthstoneImageOverride,
  hasLocalDatabaseUrl,
  hasPathOverride,
  readAllPathOverrides,
  readHearthstoneImageOverride,
  readLocalDatabaseUrl,
  readPathOverride,
  setHearthstoneImageOverride,
  setLocalDatabaseUrlOverride,
  setPathOverride,
  hasYugiohImageOverride,
  readYugiohImageOverride,
  setYugiohImageOverride,
} from './runtime-config';

const originalLocalDatabaseUrl = process.env.DESKTOP_LOCAL_DATABASE_URL;

afterEach(() => {
  setLocalDatabaseUrlOverride(null);
  applyPathOverrides({});
  setHearthstoneImageOverride(null);
  setYugiohImageOverride(null);

  if (originalLocalDatabaseUrl == null) {
    delete process.env.DESKTOP_LOCAL_DATABASE_URL;
  } else {
    process.env.DESKTOP_LOCAL_DATABASE_URL = originalLocalDatabaseUrl;
  }
});

describe('runtime-config', () => {
  test('prefers the runtime-local database override over the environment fallback', () => {
    process.env.DESKTOP_LOCAL_DATABASE_URL = 'postgres://env-user:env-pass@127.0.0.1:5432/env_db';

    expect(readLocalDatabaseUrl()).toBe('postgres://env-user:env-pass@127.0.0.1:5432/env_db');
    expect(hasLocalDatabaseUrl()).toBe(true);

    setLocalDatabaseUrlOverride('  postgres://override-user:override-pass@127.0.0.1:5432/override_db  ');

    expect(readLocalDatabaseUrl()).toBe('postgres://override-user:override-pass@127.0.0.1:5432/override_db');
    expect(hasLocalDatabaseUrl()).toBe(true);
  });

  test('tracks path overrides keyed by dotted leaf paths', () => {
    expect(readPathOverride('hearthstone.data.hsdata')).toBeNull();
    expect(hasPathOverride('hearthstone.data.hsdata')).toBe(false);

    setPathOverride('hearthstone.data.hsdata', '  /tmp/hsdata  ');

    expect(readPathOverride('hearthstone.data.hsdata')).toBe('/tmp/hsdata');
    expect(hasPathOverride('hearthstone.data.hsdata')).toBe(true);
    expect(readAllPathOverrides()).toEqual({ hearthstone: { data: { hsdata: '/tmp/hsdata' } } });
    expect(readLocalDatabaseUrl()).toBeNull();
  });

  test('applies a nested path tree and re-nests it for transfer', () => {
    applyPathOverrides({
      data:        '/data',
      magic:       { data: { scryfall: '/data/magic/scryfall', mtgch: '/data/magic/mtgch' } },
      hearthstone: { data: { hsdata: '/hsdata' } },
    });

    expect(readPathOverride('data')).toBe('/data');
    expect(readPathOverride('magic.data.scryfall')).toBe('/data/magic/scryfall');
    expect(readPathOverride('magic.data.mtgch')).toBe('/data/magic/mtgch');
    expect(readPathOverride('hearthstone.data.hsdata')).toBe('/hsdata');
    expect(readAllPathOverrides()).toEqual({
      data:        '/data',
      magic:       { data: { scryfall: '/data/magic/scryfall', mtgch: '/data/magic/mtgch' } },
      hearthstone: { data: { hsdata: '/hsdata' } },
    });
  });

  test('tracks the Hearthstone image override independently from other runtime config', () => {
    expect(readHearthstoneImageOverride()).toBeNull();
    expect(hasHearthstoneImageOverride()).toBe(false);

    setHearthstoneImageOverride({
      rendererBaseUrl: '  http://127.0.0.1:58437  ',
      bucketDir:       '  /tmp/hearthstone-assets  ',
    });

    expect(readHearthstoneImageOverride()).toEqual({
      rendererBaseUrl: 'http://127.0.0.1:58437',
      bucketDir:       '/tmp/hearthstone-assets',
    });
    expect(hasHearthstoneImageOverride()).toBe(true);
    expect(readLocalDatabaseUrl()).toBeNull();
  });

  test('tracks the Yu-Gi-Oh! image bucket independently from other runtime config', () => {
    expect(readYugiohImageOverride()).toBeNull();
    expect(hasYugiohImageOverride()).toBe(false);

    setYugiohImageOverride({ bucketDir: '  /tmp/yugioh-assets  ' });

    expect(readYugiohImageOverride()).toEqual({ bucketDir: '/tmp/yugioh-assets' });
    expect(hasYugiohImageOverride()).toBe(true);
    expect(readLocalDatabaseUrl()).toBeNull();
  });
});
