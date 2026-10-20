import { afterEach, expect, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createDocumentService } from '@tcg-cards/console-api/lib/magic/documents/service';
import { memoryStore } from '@tcg-cards/console-api/lib/magic/documents/testing';
import { communitySource, communityTranslation } from '@tcg-cards/console-api/lib/magic/documents/community.fixture';
import { createRuleTranslationOperations } from './translations';

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(directories.splice(0).map(path => rm(path, { recursive: true, force: true })));
});

test('imports a local paired edition and restores Chinese status after reopening the rule page', async () => {
  const root = await mkdtemp(join(tmpdir(), 'cr-translation-'));
  directories.push(root);
  await mkdir(join(root, 'scripts'));
  await writeFile(join(root, 'scripts', '20260925.json'), JSON.stringify(communityTranslation));
  await writeFile(join(root, 'scripts', '20250606_plain.json'), '[]');
  const store = memoryStore();
  const operations = createRuleTranslationOperations({ root, store });
  expect(await operations.list()).toEqual({ configured: true, versions: [{ date: '2026-09-25', available: true, imported: false }] });
  await expect(operations.importVersion({ version: '2026-09-25' })).rejects.toThrow('请先');
  await createDocumentService(store, { track: 'local' }).importCr({ content: communitySource });
  const result = await operations.importVersion({ version: '2026-09-25' });
  expect(result.totalNodes).toBeGreaterThan(0);
  expect(await createRuleTranslationOperations({ root, store }).list()).toEqual({
    configured: true, versions: [{ date: '2026-09-25', available: true, imported: true }],
  });
  await rm(join(root, 'scripts', '20260925.json'));
  expect((await operations.list()).versions).toEqual([{ date: '2026-09-25', available: false, imported: true }]);
  await expect(operations.importVersion({ version: '../../outside' })).rejects.toThrow();
});
