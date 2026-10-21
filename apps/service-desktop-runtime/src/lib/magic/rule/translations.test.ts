import { afterEach, expect, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createDocumentService } from '@tcg-cards/console-api/lib/magic/documents/service';
import { createComparisonOperations } from '@tcg-cards/console-api/lib/magic/documents/comparison';
import { publishDocument } from '@tcg-cards/console-api/lib/magic/documents/publish';
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

test('uses the latest source-matched repository translations regardless of filename or import order', async () => {
  const root = await mkdtemp(join(tmpdir(), 'cr-latest-translation-'));
  directories.push(root);
  await mkdir(join(root, 'scripts'));
  const latest = structuredClone(communityTranslation);
  latest.intro.contents[1]!.en = 'These rules are effective as of January 1, 2027.';
  latest.intro.contents[3]!.zh = '最新规则参考文档。';
  const rules = latest.main[0]!.subrules[0]!.subrules;
  rules[0]!.en = 'Pay {U}. See rule 100.2.';
  rules[0]!.zh = '支付 {U}。';
  rules[1]!.chapter = '100.4.';
  rules[1]!.zh = '继续对局。';
  rules[1]!.extras![0]!.zh = '对局照常继续。';
  latest.glossary[0]!.zhname = '团队对抗赛制';
  latest.glossary[0]!.zh = '多人对局的一种玩法。';
  latest.credits.contents[1]!.zh = '编辑：新版编辑。';
  await writeFile(join(root, 'scripts', '20200101.json'), JSON.stringify(latest));
  await writeFile(join(root, 'scripts', '20260925.json'), JSON.stringify(communityTranslation));
  const store = memoryStore();
  const service = createDocumentService(store, { track: 'local' });
  await service.importCr({ content: communitySource });
  const operations = createRuleTranslationOperations({ root, store });
  await operations.importVersion({ version: '2026-09-25' });
  const page = await service.read({ slug: 'magic-cr', locale: 'zhs' });
  expect(page.sections.find(node => node.nodeId === 'intro.content')?.text).toBe('最新规则参考文档。\n\n请参阅最新规则。');
  expect(page.sections.find(node => node.nodeId === '100.1')?.text).toBe('支付 {W}。参见规则100.2。');
  expect(page.sections.find(node => node.nodeId === '100.2')?.text).toBe('继续对局。\n\n对局照常继续。');
  expect(page.sections.find(node => node.nodeId === '100.3')?.localeState.isFallback).toBe(true);
  expect(page.sections.find(node => node.nodeId === 'glossary.team-vs-team-variant')?.text).toBe('团队对抗赛制\n\n多人对局的一种玩法。');
  expect(page.sections.find(node => node.nodeId === 'credits.content')?.text).toBe('编辑：新版编辑。\n\n感谢贡献者。');
  expect(page.sections.find(node => node.nodeId === '100.1')?.markers).toEqual([{ type: 'chapter', anchor: '100.2', start: 11, end: 16 }]);
  await service.importCr({ content: communitySource.replace('September 25, 2026', 'January 1, 2027').replace('Pay {W}.', 'Pay {U}.')
    .replace('100.2. Continue playing.', '100.4. Continue playing.') });
  await operations.importVersion({ version: '2027-01-01' });
  await operations.importVersion({ version: '2026-09-25' });
  expect((await service.read({ slug: 'magic-cr', versionTag: '20260925', locale: 'zhs' })).sections.find(node => node.nodeId === '100.2')?.text).toBe('继续对局。\n\n对局照常继续。');
});

test('keeps identical English in separate contexts and retains translations when newer entries are missing', async () => {
  const root = await mkdtemp(join(tmpdir(), 'cr-contextual-translation-'));
  directories.push(root);
  await mkdir(join(root, 'scripts'));
  const current = { ...structuredClone(communityTranslation), main: [...structuredClone(communityTranslation.main), {
    chapter:  '2.', en:       'Card Parts', zh:       '牌面部分', subrules: [{
      chapter:  '200.', en:       'General', zh:       '通则', subrules: [
        { chapter: '200.1.', en: 'Continue playing.', zh: '继续处理牌张。' },
      ],
    }],
  }] };
  const latest = structuredClone(current);
  latest.intro.contents[1]!.en = 'These rules are effective as of January 1, 2027.';
  latest.main[0]!.subrules[0]!.zh = '游戏总则';
  latest.main[0]!.subrules[0]!.subrules[1]!.zh = '';
  latest.main[1]!.subrules[0]!.zh = '牌面通则';
  latest.main[1]!.subrules[0]!.subrules[0]!.zh = '继续处理新版牌张。';
  await writeFile(join(root, 'scripts', '20260925.json'), JSON.stringify(current));
  await writeFile(join(root, 'scripts', '20270101.json'), JSON.stringify(latest));
  const store = memoryStore();
  const service = createDocumentService(store, { track: 'local' });
  const source = communitySource.replace('\nGlossary\n', '\n2. Card Parts\n\n200. General\n\n200.1. Continue playing.\n\nGlossary\n');
  await service.importCr({ content: source });
  const operations = createRuleTranslationOperations({ root, store });
  await operations.importVersion({ version: '2026-09-25' });
  const page = await service.read({ slug: 'magic-cr', locale: 'zhs' });
  expect(page.sections.find(node => node.nodeId === '100')?.text).toBe('游戏总则');
  expect(page.sections.find(node => node.nodeId === '200')?.text).toBe('牌面通则');
  expect(page.sections.find(node => node.nodeId === '100.2')?.text).toBe('继续游戏。\n\n游戏正常继续。');
  expect(page.sections.find(node => node.nodeId === '200.1')?.text).toBe('继续处理新版牌张。');
  await service.importCr({ content: source.replace('September 25, 2026', 'January 1, 2027') });
  await operations.importVersion({ version: '2027-01-01' });
  const remote = memoryStore();
  await publishDocument(store, remote, 'magic-cr');
  const published = await createDocumentService(remote, { track: 'remote' }).read({ slug: 'magic-cr', locale: 'zhs' });
  expect(published.sections.find(node => node.nodeId === '100.2')?.text).toBe('继续游戏。\n\n游戏正常继续。');
  const compared = await createComparisonOperations(remote, { track: 'remote' }).compare({
    slug: 'magic-cr', fromVersionTag: '20260925', toVersionTag: '20270101', locale: 'zhs',
  });
  expect(compared.rows.filter(row => row.kind === 'change')).toEqual([]);
});

test('preserves selected Chinese when any scanned edition contains duplicate rules', async () => {
  const root = await mkdtemp(join(tmpdir(), 'cr-latest-invalid-'));
  directories.push(root);
  await mkdir(join(root, 'scripts'));
  await writeFile(join(root, 'scripts', '20260925.json'), JSON.stringify(communityTranslation));
  const store = memoryStore();
  const service = createDocumentService(store, { track: 'local' });
  await service.importCr({ content: communitySource });
  const operations = createRuleTranslationOperations({ root, store });
  await operations.importVersion({ version: '2026-09-25' });
  const before = await service.read({ slug: 'magic-cr', locale: 'zhs' });
  const revisions = await service.revisions('magic-cr');
  const invalid = structuredClone(communityTranslation);
  invalid.intro.contents[1]!.en = 'These rules are effective as of January 1, 2027.';
  invalid.main.push(invalid.main[0]!);
  await writeFile(join(root, 'scripts', '20270101.json'), JSON.stringify(invalid));
  await expect(operations.importVersion({ version: '2026-09-25' })).rejects.toThrow('重复');
  expect(await service.read({ slug: 'magic-cr', locale: 'zhs' })).toEqual(before);
  expect(await service.revisions('magic-cr')).toEqual(revisions);
});

test('counts untranslated occurrences when deciding whether a cross-context match is unique', async () => {
  const root = await mkdtemp(join(tmpdir(), 'cr-latest-ambiguous-'));
  directories.push(root);
  await mkdir(join(root, 'scripts'));
  const latest = structuredClone(communityTranslation);
  latest.intro.contents[1]!.en = 'These rules are effective as of January 1, 2027.';
  latest.main[0]!.en = 'Reorganized Game Concepts';
  latest.main[0]!.subrules[0]!.subrules[1]!.zh = '';
  latest.main[0]!.subrules[0]!.subrules.push({
    chapter: '100.4.', en:      'A different context.', zh:      '其他情形。', extras:  [
      { en: 'Continue playing.', zh: '另一语境的译文。' },
      { en: 'The game continues normally.', zh: '另一语境的续段。' },
    ],
  });
  // Put the same English in another rule as well, rather than relying on paragraph roles.
  latest.main[0]!.subrules[0]!.subrules.push({ chapter: '100.5.', en: 'Continue playing.', zh: '另一条规则的译文。' });
  await writeFile(join(root, 'scripts', '20260925.json'), JSON.stringify(communityTranslation));
  await writeFile(join(root, 'scripts', '20270101.json'), JSON.stringify(latest));
  const store = memoryStore();
  const service = createDocumentService(store, { track: 'local' });
  await service.importCr({ content: communitySource });
  await createRuleTranslationOperations({ root, store }).importVersion({ version: '2026-09-25' });
  const page = await service.read({ slug: 'magic-cr', locale: 'zhs' });
  expect(page.sections.find(node => node.nodeId === '100.2')?.text).toBe('继续游戏。\n\n游戏正常继续。');
});
