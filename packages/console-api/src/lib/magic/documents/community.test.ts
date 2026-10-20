import { expect, test } from 'bun:test';
import { fileURLToPath } from 'node:url';

import { createDocumentService } from './service';
import { publishDocument } from './publish';
import { memoryStore } from './testing';
import { communitySource, communityTranslation } from './community.fixture';

test('imports a human community translation and publishes source-aligned Chinese reading', async () => {
  const local = memoryStore();
  const documents = createDocumentService(local, { track: 'local' });
  await documents.importCr({ content: communitySource });
  await documents.importCrTranslation({ versionTag: '20260925', content: communityTranslation });
  const remote = memoryStore();
  await publishDocument(local, remote, 'magic-cr');
  const page = await createDocumentService(remote, { track: 'remote' }).read({ slug: 'magic-cr', locale: 'zhs' });
  expect(page.outline.find(node => node.nodeId === '1')?.label).toBe('1. 游戏概念');
  expect(page.sections.find(node => node.nodeId === 'intro.content')?.text).toBe('一本规则参考文档。\n\n请参阅最新规则。');
  expect(page.sections.find(node => node.nodeId === '100.1')).toMatchObject({
    text: '支付 {W}。参见规则100.2。', translationMethod: 'human', reviewStatus: 'unreviewed',
    markers: [{ type: 'chapter', anchor: '100.2', start: 11, end: 16 }],
  });
  expect(page.sections.filter(node => node.kind === 'example').map(node => node.text)).toEqual([
    '例如：支付一点白色法术力。', '例如：不要支付两次。',
  ]);
  expect(page.sections.find(node => node.nodeId === '100.2')?.text).toBe('继续游戏。\n\n游戏正常继续。');
  expect(page.sections.find(node => node.nodeId === 'glossary.team-vs-team-variant')?.text).toBe('团队对抗玩法\n\n一种多人玩法。');
  expect(page.sections.find(node => node.nodeId === 'credits.content')?.text).toBe('编辑：测试编辑。\n\n感谢贡献者。');
  expect(page.sections.find(node => node.nodeId === '100.3')?.localeState).toMatchObject({ locale: 'en', isFallback: true });
  expect(page.sections.some(node => node.text?.includes('Repository introduction'))).toBe(false);
  expect(page.versions).toHaveLength(1);
  expect((await documents.read({ slug: 'magic-cr', locale: 'en' })).sections.find(node => node.nodeId === '100.1')?.text).toBe('Pay {W}. See rule 100.2.');
});

test('requires an existing English edition and preserves selected Chinese on alignment failures', async () => {
  const store = memoryStore();
  const documents = createDocumentService(store, { track: 'local' });
  await expect(documents.importCrTranslation({ versionTag: '20260925', content: communityTranslation })).rejects.toThrow('请先');
  expect(await store.documents()).toEqual([]);
  await documents.importCr({ content: communitySource });
  await documents.importCrTranslation({ versionTag: '20260925', content: communityTranslation });
  const before = await documents.read({ slug: 'magic-cr', locale: 'zhs' });
  const revisions = await documents.revisions('magic-cr');
  for (const changed of [
    { ...communityTranslation, version: '20260807' },
    { ...communityTranslation, main: [communityTranslation.main[0], communityTranslation.main[0]] },
    { ...communityTranslation, glossary: [{ ...communityTranslation.glossary[0], en: 'A different source definition.' }] },
    { ...communityTranslation, main: [{ ...communityTranslation.main[0], subrules: [] }] },
    { ...communityTranslation, main: [{ ...communityTranslation.main[0], subrules: [] }, communityTranslation.main[0]!.subrules[0]!] },
    { ...communityTranslation, main: [{ ...communityTranslation.main[0], subrules: [{ ...communityTranslation.main[0]!.subrules[0]!, subrules: [...communityTranslation.main[0]!.subrules[0]!.subrules].reverse() }] }] },
  ]) {
    await expect(documents.importCrTranslation({ versionTag: '20260925', content: changed })).rejects.toThrow();
    expect(await documents.read({ slug: 'magic-cr', locale: 'zhs' })).toEqual(before);
    expect(await documents.revisions('magic-cr')).toEqual(revisions);
  }
});

test('rolls back saved translation content when selecting the edition fails', async () => {
  const store = memoryStore();
  const documents = createDocumentService(store, { track: 'local' });
  await documents.importCr({ content: communitySource });
  const original = store.putReleaseTranslation;
  store.putReleaseTranslation = async () => { throw new Error('Selection unavailable'); };
  await expect(documents.importCrTranslation({ versionTag: '20260925', content: communityTranslation })).rejects.toThrow('Selection unavailable');
  expect(await store.translations('magic-cr')).toEqual([]);
  expect(await documents.revisions('magic-cr')).toHaveLength(1);
  store.putReleaseTranslation = original;
  await documents.importCrTranslation({ versionTag: '20260925', content: communityTranslation });
  expect((await documents.read({ slug: 'magic-cr', locale: 'zhs' })).sections.find(node => node.nodeId === '100.1')?.localeState.isFallback).toBe(false);
});

// Isolate real SQL operations from unrelated tests that replace the database module.
test.skipIf(!process.env.DOCUMENT_TEST_LOCAL_URL || !process.env.DOCUMENT_TEST_REMOTE_URL)('PostgreSQL community translation import and publication', async () => {
  const child = Bun.spawn([process.execPath, 'test', fileURLToPath(new URL('./community.integration.ts', import.meta.url))], { stdout: 'pipe', stderr: 'pipe' });
  const [stdout, stderr, code] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
  expect(code, `${stdout}\n${stderr}`).toBe(0);
}, 30000);
