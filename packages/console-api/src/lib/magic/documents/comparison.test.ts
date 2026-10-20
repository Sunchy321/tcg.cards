import { expect, test } from 'bun:test';

import { createDocumentService } from './service';
import { memoryStore } from './testing';
import { createTranslationOperations } from './translations';
import { createComparisonOperations } from './comparison';

const content = `Magic: The Gathering Comprehensive Rules

These rules are effective as of October 1, 2026.

Introduction

Example.

Contents

Credits

1. Game Concepts

100. General

100.1. Pay {W} to continue.
`;

test('compares published editions and excludes unpublished revision text from node history', async () => {
  const store = memoryStore();
  const service = createDocumentService(store, { track: 'local' });
  const first = await service.importCr({ content });
  await service.importCr({ content: content.replace('October 1', 'November 1').replace('Pay {W}', 'Pay {U}') });
  const comparison = createComparisonOperations(store, { track: 'local' });
  const result = await comparison.compare({ slug: 'magic-cr', fromVersionTag: '20261001', toVersionTag: '20261101' });
  expect(result.stats.modified).toBeGreaterThan(0);
  expect(result.rows.some(row => row.kind === 'change' && row.from?.text?.includes('{W}') && row.to?.text?.includes('{U}'))).toBe(true);
  const original = (await store.revision(first.revisionId))!;
  const nodeKey = original.nodes.find(node => node.anchor === '100.1')!.nodeKey;
  const history = await comparison.nodeHistory({ documentId: 'magic-cr', nodeKey });
  expect(history.timeline.length).toBe(2);
});

test('retains renamed and moved classifications when rule numbers change', async () => {
  const store = memoryStore();
  const service = createDocumentService(store, { track: 'local' });
  await service.importCr({ content });
  await service.importCr({ content: content.replace('October 1', 'November 1').replace('100.1.', '100.2.') });
  const comparison = createComparisonOperations(store, { track: 'local' });
  expect((await comparison.compare({ slug: 'magic-cr', fromVersionTag: '20261001', toVersionTag: '20261101' })).stats.renamed).toBe(1);
});

test('preserves all participants in split and merge comparisons', async () => {
  const store = memoryStore();
  const service = createDocumentService(store, { track: 'remote', actorId: 'alice' });
  const document = await service.create({ slug: 'split-guide', title: 'Guide', language: 'en', visibility: 'public', settings: { compare: true } });
  const first = await service.save({ documentId: document.id, title: 'Guide', nodes: [{ nodeKey: 'combined', rawText: 'alpha beta gamma delta epsilon zeta eta theta' }] });
  await service.publish({ documentId: document.id, revisionId: first.id, versionTag: '1' });
  const second = await service.save({ documentId: document.id, title: 'Guide', nodes: [
    { nodeKey: 'chapter', kind: 'heading', rawText: 'Chapter' },
    { nodeKey: 'left', parentKey: 'chapter', rawText: 'alpha beta gamma delta epsilon' },
    { nodeKey: 'right', parentKey: 'chapter', rawText: 'delta epsilon zeta eta theta' },
  ] });
  await service.publish({ documentId: document.id, revisionId: second.id, versionTag: '2' });
  const comparison = createComparisonOperations(store, { track: 'remote' });
  const split = await comparison.compare({ slug: document.slug, fromVersionTag: '1', toVersionTag: '2' });
  expect(split.stats.split).toBe(1);
  const splitRow = split.rows.find(row => row.kind === 'change' && row.type === 'split');
  expect(splitRow?.kind === 'change' && splitRow.toNodes?.length).toBe(2);
  const merged = await comparison.compare({ slug: document.slug, fromVersionTag: '2', toVersionTag: '1' });
  expect(merged.stats.merged).toBe(1);
  const mergedRow = merged.rows.find(row => row.kind === 'change' && row.type === 'merged');
  expect(mergedRow?.kind === 'change' && mergedRow.fromNodes?.length).toBe(2);
});

test('rejects private histories and comparison-disabled documents and ignores unpublished drafts', async () => {
  const store = memoryStore();
  const service = createDocumentService(store, { track: 'remote', actorId: 'alice' });
  const document = await service.create({ slug: 'private-guide', title: 'Guide', language: 'en' });
  const first = await service.save({ documentId: document.id, title: 'Guide', nodes: [{ nodeKey: 'intro', rawText: 'Published.' }] });
  await service.publish({ documentId: document.id, revisionId: first.id, versionTag: '1' });
  await service.save({ documentId: document.id, title: 'Draft secret', nodes: [{ nodeKey: 'intro', rawText: 'Secret draft.' }] });
  const reader = createComparisonOperations(store, { track: 'remote' });
  await expect(reader.nodeHistory({ documentId: document.id, nodeKey: 'intro' })).rejects.toThrow('not found');
  const owner = createComparisonOperations(store, { track: 'remote', actorId: 'alice' });
  const history = await owner.nodeHistory({ documentId: document.id, nodeKey: 'intro' });
  expect(history.timeline.map(row => row.content)).toEqual(['Published.']);
  await expect(owner.compare({ slug: document.slug, fromVersionTag: '1', toVersionTag: '1' })).rejects.toThrow('disabled');
});

test('classifies identical content relocated to a different chapter as moved', async () => {
  const store = memoryStore();
  const service = createDocumentService(store, { track: 'local' });
  await service.importCr({ content });
  await service.importCr({ content: content.replace('October 1', 'November 1').replace('1. Game Concepts', '2. Game Concepts').replace('100. General', '200. General').replace('100.1.', '200.1.') });
  const result = await createComparisonOperations(store, { track: 'local' }).compare({ slug: 'magic-cr', fromVersionTag: '20261001', toVersionTag: '20261101' });
  expect(result.stats.moved).toBeGreaterThan(0);
});

test('tracks renamed formal nodes across reverse imports from either saved identity', async () => {
  const store = memoryStore();
  const service = createDocumentService(store, { track: 'local' });
  const newer = await service.importCr({ content: content.replace('October 1', 'November 1').replace('100.1.', '100.2.') });
  const older = await service.importCr({ content });
  const oldKey = (await store.revision(older.revisionId))!.nodes.find(node => node.anchor === '100.1')!.nodeKey;
  const newKey = (await store.revision(newer.revisionId))!.nodes.find(node => node.anchor === '100.2')!.nodeKey;
  const comparison = createComparisonOperations(store, { track: 'local' });
  for (const nodeKey of [oldKey, newKey]) {
    const history = await comparison.nodeHistory({ documentId: 'magic-cr', nodeKey });
    expect(history.timeline.map(row => row.nodeId)).toEqual(['100.1', '100.2']);
    expect(history.timeline.map(row => row.state)).toEqual(['present', 'present']);
    expect(history.entity.currentNodeId).toBe('100.2');
  }
});

test('does not attach a reused displayed rule number to an unrelated removed lineage', async () => {
  const store = memoryStore();
  const owner = createDocumentService(store, { track: 'remote', actorId: 'alice' });
  const document = await owner.create({ slug: 'reused-number', title: 'Guide', language: 'en', visibility: 'public' });
  const first = await owner.save({ documentId: document.id, title: 'Guide', nodes: [{ nodeKey: 'original-identity', anchor: '100.1', rawText: 'Original rule.' }] });
  await owner.publish({ documentId: document.id, revisionId: first.id, versionTag: '1' });
  const empty = await owner.save({ documentId: document.id, title: 'Guide', nodes: [] });
  await owner.publish({ documentId: document.id, revisionId: empty.id, versionTag: '2' });
  const replacement = await owner.save({ documentId: document.id, title: 'Guide', nodes: [{ nodeKey: 'replacement-identity', anchor: '100.1', rawText: 'Completely unrelated replacement.' }] });
  await owner.publish({ documentId: document.id, revisionId: replacement.id, versionTag: '3' });
  const comparison = createComparisonOperations(store, { track: 'remote' });
  const old = await comparison.nodeHistory({ documentId: document.id, nodeKey: 'original-identity' });
  expect(old.timeline.map(row => row.state)).toEqual(['present', 'removed', 'removed']);
  const latest = await comparison.nodeHistory({ documentId: document.id, nodeKey: 'replacement-identity' });
  expect(latest.timeline.map(row => row.versionTag)).toEqual(['3']);
});

test('retains split and merged ancestry without treating their children as the original identity', async () => {
  const store = memoryStore();
  const owner = createDocumentService(store, { track: 'remote', actorId: 'alice' });
  const document = await owner.create({ slug: 'lineage', title: 'Guide', language: 'en', visibility: 'public' });
  const originalText = 'alpha beta gamma delta epsilon zeta eta theta';
  const first = await owner.save({ documentId: document.id, title: 'Guide', nodes: [{ nodeKey: 'original', rawText: originalText }] });
  await owner.publish({ documentId: document.id, revisionId: first.id, versionTag: '1' });
  const split = await owner.save({ documentId: document.id, title: 'Guide', nodes: [
    { nodeKey: 'chapter', kind: 'heading', rawText: 'Chapter' },
    { nodeKey: 'left', parentKey: 'chapter', rawText: 'alpha beta gamma delta epsilon' },
    { nodeKey: 'right', parentKey: 'chapter', rawText: 'delta epsilon zeta eta theta' },
  ] });
  await owner.publish({ documentId: document.id, revisionId: split.id, versionTag: '2' });
  const merged = await owner.save({ documentId: document.id, title: 'Guide', nodes: [{ nodeKey: 'recombined', rawText: originalText }] });
  await owner.publish({ documentId: document.id, revisionId: merged.id, versionTag: '3' });
  const comparison = createComparisonOperations(store, { track: 'remote' });
  const original = await comparison.nodeHistory({ documentId: document.id, nodeKey: 'original' });
  expect(original.timeline.map(row => row.state)).toEqual(['present', 'split', 'removed']);
  const child = await comparison.nodeHistory({ documentId: document.id, nodeKey: 'left' });
  expect(child.timeline.map(row => row.state)).toEqual(['present', 'merged']);
  const recombined = await comparison.nodeHistory({ documentId: document.id, nodeKey: 'recombined' });
  expect(recombined.timeline.map(row => row.versionTag)).toEqual(['3']);
});


test('compares selected Chinese wording on unchanged English and marks translation-only differences', async () => {
  const store = memoryStore();
  const service = createDocumentService(store, { track: 'local' });
  const translations = createTranslationOperations(store, { track: 'local' });
  const first = await service.importCr({ content });
  const second = await service.importCr({ content: content.replace('October 1', 'November 1') });
  for (const [edition, text] of [[first, '支付 {W} 后继续。'], [second, '支付 {W} 以继续。']] as const) {
    const source = (await store.revision(edition.revisionId))!;
    const translated = await translations.saveTranslation({ documentId: 'magic-cr', sourceRevisionId: source.id, language: 'zhs',
      nodes: [{ sourceNodeId: source.nodes.find(node => node.anchor === '100.1')!.id, rawText: text, translationMethod: 'human' }] });
    await translations.selectTranslation({ documentId: 'magic-cr', releaseId: edition.releaseId, revisionId: translated.id });
  }
  const comparison = createComparisonOperations(store, { track: 'local' });
  const result = await comparison.compare({ slug: 'magic-cr', fromVersionTag: '20261001', toVersionTag: '20261101', locale: 'zhs' });
  expect(result.rows.find(row => row.kind === 'change' && row.from?.nodeId === '100.1')).toMatchObject({
    type: 'modified', translationOnly: true,
    from: { text: '支付 {W} 后继续。', localeState: { locale: 'zhs', isFallback: false } },
    to: { text: '支付 {W} 以继续。', localeState: { locale: 'zhs', isFallback: false } },
    textDiff: { blocks: [{ type: 'common', text: '支付 {W} ' }, { type: 'removed', text: '后' }, { type: 'added', text: '以' }, { type: 'common', text: '继续。' }] },
  });
  expect((await comparison.compare({ slug: 'magic-cr', fromVersionTag: '20261001', toVersionTag: '20261101', locale: 'en' })).rows.filter(row => row.kind === 'change')).toHaveLength(0);
});

/** Select a minimal translation through the same operations used by import. */
async function selectChinese(store: ReturnType<typeof memoryStore>, edition: { revisionId: string; releaseId: string }, text: string, anchor = '100.1') {
  const source = (await store.revision(edition.revisionId))!;
  const translations = createTranslationOperations(store, { track: 'local' });
  const revision = await translations.saveTranslation({ documentId: 'magic-cr', sourceRevisionId: source.id, language: 'zhs',
    nodes: [{ sourceNodeId: source.nodes.find(node => node.anchor === anchor)!.id, rawText: text, translationMethod: 'human' }] });
  await translations.selectTranslation({ documentId: 'magic-cr', releaseId: edition.releaseId, revisionId: revision.id });
  return revision;
}

test('keeps source renumbering and movement when the two Chinese wordings are unrelated', async () => {
  for (const [heading, chapter, anchor, type] of [
    ['1. Game Concepts', '100. General', '100.2', 'renamed'],
    ['2. Game Concepts', '200. General', '200.1', 'moved'],
  ] as const) {
    const store = memoryStore();
    const service = createDocumentService(store, { track: 'local' });
    const first = await service.importCr({ content });
    const second = await service.importCr({ content: content.replace('October 1', 'November 1').replace('1. Game Concepts', heading).replace('100. General', chapter).replace('100.1.', `${anchor}.`) });
    await selectChinese(store, first, '甲方的表述。');
    await selectChinese(store, second, '完全不同的乙方措辞。', anchor);
    const result = await createComparisonOperations(store, { track: 'local' }).compare({ slug: 'magic-cr', fromVersionTag: '20261001', toVersionTag: '20261101', locale: 'zhs' });
    expect(result.rows.find(row => row.kind === 'change' && row.from?.nodeId === '100.1')).toMatchObject({ type,
      from: { nodeId: '100.1', text: '甲方的表述。' }, to: { nodeId: anchor, text: '完全不同的乙方措辞。' } });
  }
});

test('uses only each release selected translation and distinguishes source changes and missing translations', async () => {
  const store = memoryStore();
  const service = createDocumentService(store, { track: 'local' });
  const first = await service.importCr({ content });
  const second = await service.importCr({ content: content.replace('October 1', 'November 1').replace('{W}', '{U}') });
  await selectChinese(store, first, '支付 {W} 以继续。');
  const comparison = createComparisonOperations(store, { track: 'local' });
  const input = { slug: 'magic-cr', fromVersionTag: '20261001', toVersionTag: '20261101', locale: 'zhs' };
  const fallback = await comparison.compare(input);
  expect(fallback.rows.find(row => row.kind === 'change' && row.from?.nodeId === '100.1')).toMatchObject({ translationOnly: false,
    from: { text: '支付 {W} 以继续。', localeState: { isFallback: false } },
    to: { text: 'Pay {U} to continue.', localeState: { locale: 'en', isFallback: true } } });
  await selectChinese(store, second, '支付 {U} 以继续。');
  const source = (await store.revision(second.revisionId))!;
  await createTranslationOperations(store, { track: 'local' }).saveTranslation({ documentId: 'magic-cr', sourceRevisionId: source.id, language: 'zhs',
    nodes: [{ sourceNodeId: source.nodes.find(node => node.anchor === '100.1')!.id, rawText: '未选择的秘密译文', translationMethod: 'human' }] });
  const translated = await comparison.compare(input);
  expect(translated.rows.find(row => row.kind === 'change' && row.from?.nodeId === '100.1')).toMatchObject({ translationOnly: false,
    to: { text: '支付 {U} 以继续。', localeState: { isFallback: false } } });
  expect(JSON.stringify(translated)).not.toContain('秘密');
  // A blank selected entry is missing content, not a translated empty paragraph.
  await selectChinese(store, second, '   ');
  expect((await comparison.compare(input)).rows.find(row => row.kind === 'change' && row.to?.nodeId === '100.1')).toMatchObject({
    translationOnly: false, to: { text: 'Pay {U} to continue.', localeState: { isFallback: true } },
  });
  const absent = await comparison.compare({ ...input, locale: 'zht' });
  expect(absent.rows.find(row => row.kind === 'change' && row.to?.nodeId === '100.1')).toMatchObject({
    translationOnly: false, from: { localeState: { isFallback: true } }, to: { localeState: { isFallback: true } },
  });
});

test('omits equal Chinese text and equal sources without borrowing another release translation', async () => {
  const store = memoryStore();
  const service = createDocumentService(store, { track: 'local' });
  const first = await service.importCr({ content });
  const second = await service.importCr({ content: content.replace('October 1', 'November 1') });
  await selectChinese(store, first, '支付 {W}。');
  await selectChinese(store, second, '支付 {W}。');
  const comparison = createComparisonOperations(store, { track: 'local' });
  expect((await comparison.compare({ slug: 'magic-cr', fromVersionTag: '20261001', toVersionTag: '20261101', locale: 'zhs' })).rows.filter(row => row.kind === 'change')).toEqual([]);
});

test('preserves English split and merge participants while rendering unrelated Chinese text', async () => {
  const store = memoryStore();
  const service = createDocumentService(store, { track: 'remote', actorId: 'alice' });
  const translations = createTranslationOperations(store, { track: 'remote', actorId: 'alice' });
  const document = await service.create({ slug: 'chinese-split', title: 'Guide', language: 'en', visibility: 'public', settings: { compare: true } });
  const first = await service.save({ documentId: document.id, title: 'Guide', nodes: [{ nodeKey: 'combined', rawText: 'alpha beta gamma delta epsilon zeta eta theta' }] });
  const from = await service.publish({ documentId: document.id, revisionId: first.id, versionTag: '1' });
  const second = await service.save({ documentId: document.id, title: 'Guide', nodes: [
    { nodeKey: 'chapter', kind: 'heading', rawText: 'Chapter' },
    { nodeKey: 'left', parentKey: 'chapter', rawText: 'alpha beta gamma delta epsilon' },
    { nodeKey: 'right', parentKey: 'chapter', rawText: 'delta epsilon zeta eta theta' },
  ] });
  const to = await service.publish({ documentId: document.id, revisionId: second.id, versionTag: '2' });
  for (const [source, release, texts] of [[first, from, ['原先合在一起的规则。']], [second, to, ['章节', '第一段独立表述。', '第二段另一表述。']]] as const) {
    const translation = await translations.saveTranslation({ documentId: document.id, sourceRevisionId: source.id, language: 'zhs',
      nodes: source.nodes.map((node, index) => ({ sourceNodeId: node.id, rawText: texts[index]!, translationMethod: 'human' })) });
    await translations.selectTranslation({ documentId: document.id, releaseId: release.id, revisionId: translation.id });
  }
  const comparison = createComparisonOperations(store, { track: 'remote' });
  const split = await comparison.compare({ slug: document.slug, fromVersionTag: '1', toVersionTag: '2', locale: 'zhs' });
  const row = split.rows.find(row => row.kind === 'change' && row.type === 'split');
  expect(row?.kind === 'change' && row.fromNodes?.map(node => node.text)).toEqual(['原先合在一起的规则。']);
  expect(row?.kind === 'change' && row.toNodes?.map(node => node.text)).toEqual(['第一段独立表述。', '第二段另一表述。']);
  expect(row?.kind === 'change' && row.translationOnly).toBe(false);
  const merge = await comparison.compare({ slug: document.slug, fromVersionTag: '2', toVersionTag: '1', locale: 'zhs' });
  const merged = merge.rows.find(row => row.kind === 'change' && row.type === 'merged');
  expect(merged?.kind === 'change' && merged.fromNodes?.map(node => node.text)).toEqual(['第一段独立表述。', '第二段另一表述。']);
  expect(merged?.kind === 'change' && merged.toNodes?.map(node => node.text)).toEqual(['原先合在一起的规则。']);
});
