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

test('finds a repository file by its English effective date instead of its filename or version field', async () => {
  const root = await mkdtemp(join(tmpdir(), 'cr-effective-date-'));
  directories.push(root);
  await mkdir(join(root, 'scripts'));
  const content = { ...communityTranslation, version: '20240917', intro:   { contents: communityTranslation.intro.contents.map((entry, index) => index === 1
    ? { ...entry, en: 'These rules are effective as of September 20, 2024.' }
    : entry) } };
  await writeFile(join(root, 'scripts', '20240917.json'), JSON.stringify(content));
  const store = memoryStore();
  const operations = createRuleTranslationOperations({ root, store });
  expect((await operations.list()).versions).toEqual([{ date: '2024-09-20', available: true, imported: false }]);
  await createDocumentService(store, { track: 'local' }).importCr({ content: communitySource.replace('September 25, 2026', 'September 20, 2024') });
  await operations.importVersion({ version: '2024-09-20' });
  expect((await operations.list()).versions).toEqual([{ date: '2024-09-20', available: true, imported: true }]);
  expect((await createDocumentService(store, { track: 'local' }).read({ slug: 'magic-cr', versionTag: '20240920', locale: 'zhs' })).sections.find(node => node.nodeId === '100.1')?.text).toBe('支付 {W}。参见规则100.2。');
  await expect(operations.importVersion({ version: '2024-09-17' })).rejects.toThrow('未找到');
});

test('rejects duplicate effective dates before importing either repository file', async () => {
  const root = await mkdtemp(join(tmpdir(), 'cr-effective-conflict-'));
  directories.push(root);
  await mkdir(join(root, 'scripts'));
  for (const file of ['20260924.json', '20260925.json']) await writeFile(join(root, 'scripts', file), JSON.stringify(communityTranslation));
  const store = memoryStore();
  const operations = createRuleTranslationOperations({ root, store });
  await expect(operations.list()).rejects.toThrow('多个');
  await expect(operations.importVersion({ version: '2026-09-25' })).rejects.toThrow('多个');
  expect(await store.documents()).toEqual([]);
});

test('accepts an effective-date sentence without its final period and rejects impossible dates', async () => {
  const root = await mkdtemp(join(tmpdir(), 'cr-effective-format-'));
  directories.push(root);
  await mkdir(join(root, 'scripts'));
  const file = join(root, 'scripts', '20260924.json');
  const contents = communityTranslation.intro.contents.map((entry, index) => index === 1
    ? { ...entry, en: 'These rules are effective as of September 25, 2026' }
    : entry);
  await writeFile(file, JSON.stringify({ ...communityTranslation, intro: { contents } }));
  const store = memoryStore();
  const operations = createRuleTranslationOperations({ root, store });
  expect((await operations.list()).versions[0]?.date).toBe('2026-09-25');
  await createDocumentService(store, { track: 'local' }).importCr({ content: communitySource });
  await operations.importVersion({ version: '2026-09-25' });
  await writeFile(file, JSON.stringify({ ...communityTranslation, intro: { contents: contents.map((entry, index) => index === 1
    ? { ...entry, en: 'These rules are effective as of February 30, 2026.' }
    : entry) } }));
  await expect(operations.list()).rejects.toThrow('生效日期');
});
