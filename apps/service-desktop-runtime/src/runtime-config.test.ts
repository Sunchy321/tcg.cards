import { afterEach, describe, expect, test } from 'bun:test';

import {
  hasHearthstoneImageOverride,
  hasHsdataRepoPath,
  hasLocalDatabaseUrl,
  readHearthstoneImageOverride,
  readHsdataRepoPath,
  readLocalDatabaseUrl,
  setHearthstoneImageOverride,
  setHsdataRepoPathOverride,
  setLocalDatabaseUrlOverride,
} from './runtime-config';

const originalLocalDatabaseUrl = process.env.DESKTOP_LOCAL_DATABASE_URL;

afterEach(() => {
  setLocalDatabaseUrlOverride(null);
  setHsdataRepoPathOverride(null);
  setHearthstoneImageOverride(null);

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

  test('tracks the hsdata repository override independently from the database URL', () => {
    expect(readHsdataRepoPath()).toBeNull();
    expect(hasHsdataRepoPath()).toBe(false);

    setHsdataRepoPathOverride('  /tmp/hsdata  ');

    expect(readHsdataRepoPath()).toBe('/tmp/hsdata');
    expect(hasHsdataRepoPath()).toBe(true);
    expect(readLocalDatabaseUrl()).toBeNull();
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
});
