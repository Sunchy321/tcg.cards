import { afterEach, expect, test } from 'bun:test';
import { call } from '@orpc/server';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { applyPathOverrides, setPathOverride } from '../../runtime-config';
import { unpackImportRouter } from './unpack-import';

const roots: string[] = [];

afterEach(() => {
  applyPathOverrides({});
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

test('lists unpack archives from the configured data root and follows directory changes', async () => {
  for (const buildNumber of [240397, 240398]) {
    const root = mkdtempSync(join(tmpdir(), 'unpack-import-'));
    roots.push(root);
    const directory = join(root, 'hearthstone', 'unpack');
    mkdirSync(directory, { recursive: true });
    writeFileSync(join(directory, `${buildNumber}.zip`), 'fixture');
    setPathOverride('data', root);

    expect(await call(unpackImportRouter.listUnpackBuilds, undefined)).toEqual([
      { buildNumber, fileName: `${buildNumber}.zip`, size: 7 },
    ]);
  }
});

test('honors an unpack directory override and sorts valid build archives', async () => {
  const root = mkdtempSync(join(tmpdir(), 'unpack-import-'));
  roots.push(root);
  for (const name of ['240397.zip', '240398.zip', 'notes.zip', '0.zip', '240399.json']) {
    writeFileSync(join(root, name), 'fixture');
  }
  setPathOverride('hearthstone.data.unpack', root);

  expect(await call(unpackImportRouter.listUnpackBuilds, undefined)).toEqual([
    { buildNumber: 240398, fileName: '240398.zip', size: 7 },
    { buildNumber: 240397, fileName: '240397.zip', size: 7 },
  ]);
});

test('returns no archives when the unpack directory is unavailable', async () => {
  expect(await call(unpackImportRouter.listUnpackBuilds, undefined)).toEqual([]);
  const root = mkdtempSync(join(tmpdir(), 'unpack-import-'));
  roots.push(root);
  setPathOverride('hearthstone.data.unpack', join(root, 'missing'));
  expect(await call(unpackImportRouter.listUnpackBuilds, undefined)).toEqual([]);
});
