import { expect, test } from 'bun:test';

import { createDocumentService } from './service';
import { memoryStore } from './testing';
import { createTranslationOperations } from './translations';
import { beforeMovement, afterMovement } from './movement.fixture';
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
  await service.computeRelations({ documentId: 'magic-cr' });
  const original = (await store.revision(first.revisionId))!;
  const nodeKey = original.nodes.find(node => node.anchor === '100.1')!.nodeKey;
  const history = await comparison.nodeHistory({ documentId: 'magic-cr', nodeKey });
  expect(history.timeline.length).toBe(2);
});

test('node history requires prepared relations and reads only the selected identity nodes', async () => {
  const store = memoryStore();
  const service = createDocumentService(store, { track: 'remote', actorId: 'alice' });
  const document = await service.create({ slug: 'prepared-node-history', title: 'Guide', language: 'en', visibility: 'public' });
  for (const [index, text] of ['Original paragraph.', 'Revised paragraph.', 'Final paragraph.'].entries()) {
    const revision = await service.save({ documentId: document.id, title: 'Guide', nodes: [
      { nodeKey: 'intro', rawText: text },
      ...Array.from({ length: 20 }, (_, other) => ({ nodeKey: `unrelated-${other}`, rawText: `Unrelated paragraph ${other}.` })),
    ] });
    const release = await service.publish({ documentId: document.id, revisionId: revision.id, versionTag: String(index + 1) });
    await store.putRelease({ ...release, publishedAt: new Date(Date.UTC(2026, 9, index + 1)) });
  }
  const history = createComparisonOperations(store, { track: 'remote' });
  await expect(history.nodeHistory({ documentId: document.id, nodeKey: 'intro' })).rejects.toThrow('relations');
  await service.computeRelations({ documentId: document.id });
  const observed = { ...store,
    /** A prepared history read must select relation nodes instead of loading revisions. */
    async revision() { throw new Error('Node history must not load complete revisions'); },
  };
  const result = await createComparisonOperations(observed, { track: 'remote' }).nodeHistory({ documentId: document.id, nodeKey: 'intro' });
  expect(result.timeline.map(row => row.content)).toEqual(['Original paragraph.', 'Revised paragraph.', 'Final paragraph.']);
  const releases = (await store.releases(document.id)).sort((left, right) => left.publishedAt.getTime() - right.publishedAt.getTime());
  const boundaries = await store.adjacencies(document.id);
  const missing = boundaries.find(row => row.toReleaseId === releases[2]!.id)!;
  await store.putAdjacency(missing, []);
  await expect(history.nodeHistory({ documentId: document.id, nodeKey: 'intro' })).rejects.toThrow('incomplete');
  await service.computeRelations({ documentId: document.id });
  const boundary = boundaries.find(row => row.fromReleaseId === releases[0]!.id)!;
  const nodes = await store.selectNodes({ revisionIds: releases.slice(0, 2).map(row => row.sourceRevisionId), itemId: 'intro' });
  const participants = await store.nodeRelations({ comparisonIds: [boundary!.id], nodeIds: nodes.map(node => node.id) });
  await store.putAdjacency(boundary!, participants.filter(row => row.side === 'from'));
  await expect(history.nodeHistory({ documentId: document.id, nodeKey: 'intro' })).rejects.toThrow('incomplete');
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
  await service.computeRelations({ documentId: 'magic-cr' });
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
  await owner.computeRelations({ documentId: document.id });
  const comparison = createComparisonOperations(store, { track: 'remote' });
  const old = await comparison.nodeHistory({ documentId: document.id, nodeKey: 'original-identity' });
  expect(old.timeline.map(row => row.state)).toEqual(['present', 'removed', 'removed']);
  const latest = await comparison.nodeHistory({ documentId: document.id, nodeKey: 'replacement-identity' });
  expect(latest.timeline.map(row => row.versionTag)).toEqual(['3']);
});

test('does not combine multiple lifetimes that reuse the same node key', async () => {
  const store = memoryStore();
  const owner = createDocumentService(store, { track: 'remote', actorId: 'alice' });
  const document = await owner.create({ slug: 'reused-key-history', title: 'Guide', language: 'en', visibility: 'public' });
  const old = await owner.save({ documentId: document.id, title: 'Guide', nodes: [{ nodeKey: 'reused', rawText: 'Old meaning.' }] });
  await owner.publish({ documentId: document.id, revisionId: old.id, versionTag: '1' });
  const absent = await owner.save({ documentId: document.id, title: 'Guide', nodes: [] });
  await owner.publish({ documentId: document.id, revisionId: absent.id, versionTag: '2' });
  const fresh = await owner.save({ documentId: document.id, title: 'Guide', nodes: [{ nodeKey: 'reused', rawText: 'New unrelated meaning.' }] });
  await owner.publish({ documentId: document.id, revisionId: fresh.id, versionTag: '3' });
  await owner.computeRelations({ documentId: document.id });
  const history = createComparisonOperations(store, { track: 'remote' });
  await expect(history.nodeHistory({ documentId: document.id, nodeKey: 'reused' })).rejects.toThrow('ambiguous');
  const releases = (await store.releases(document.id)).sort((left, right) => left.publishedAt.getTime() - right.publishedAt.getTime());
  const firstBoundary = (await store.adjacencies(document.id)).find(row => row.fromReleaseId === releases[0]!.id)!;
  await store.putAdjacency(firstBoundary, []);
  await expect(history.nodeHistory({ documentId: document.id, nodeKey: 'reused' })).rejects.toThrow('incomplete');
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
  await owner.computeRelations({ documentId: document.id });
  const comparison = createComparisonOperations(store, { track: 'remote' });
  const original = await comparison.nodeHistory({ documentId: document.id, nodeKey: 'original' });
  expect(original.timeline.map(row => row.state)).toEqual(['present', 'split', 'removed']);
  expect(original.timeline.map(row => row.change?.type ?? null)).toEqual([null, 'split', null]);
  const child = await comparison.nodeHistory({ documentId: document.id, nodeKey: 'left' });
  expect(child.timeline.map(row => row.state)).toEqual(['present', 'merged']);
  expect(child.timeline.at(-1)?.change?.type).toBe('merged');
  const recombined = await comparison.nodeHistory({ documentId: document.id, nodeKey: 'recombined' });
  expect(recombined.timeline.map(row => row.versionTag)).toEqual(['3']);
  expect(recombined.timeline[0]?.change?.type).toBe('merged');
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

test('keeps translation-only differences between surrounding source changes in document order', async () => {
  const store = memoryStore();
  const service = createDocumentService(store, { track: 'local' });
  const original = content + '\n100.2. Keep playing.\n\n100.10. Draw one card.\n';
  const first = await service.importCr({ content: original });
  const second = await service.importCr({ content: original.replace('October 1', 'November 1').replace('{W}', '{U}').replace('Draw one', 'Draw two') });
  await selectChinese(store, first, '继续游戏。', '100.2');
  await selectChinese(store, second, '继续进行游戏。', '100.2');
  const comparison = createComparisonOperations(store, { track: 'local' });
  for (const [fromVersionTag, toVersionTag] of [['20261001', '20261101'], ['20261101', '20261001']]) {
    const result = await comparison.compare({ slug: 'magic-cr', fromVersionTag: fromVersionTag!, toVersionTag: toVersionTag!, locale: 'zhs' });
    const changes = result.rows.filter(row => row.kind === 'change');
    expect(changes.map(row => row.to?.nodeId)).toEqual(['100.1', '100.2', '100.10']);
    expect(changes.map(row => row.translationOnly)).toEqual([false, true, false]);
  }
});

test('places additions and removals alongside translation changes instead of grouping by change kind', async () => {
  const store = memoryStore();
  const service = createDocumentService(store, { track: 'local' });
  const first = await service.importCr({ content: content + '\n100.2. Keep playing.\n\n100.3. Old obsolete procedure.\n\n100.10. Draw one card.\n' });
  const second = await service.importCr({ content: content.replace('October 1', 'November 1') + '\n100.1a A wholly new restriction.\n\n100.2. Keep playing.\n\n100.10. Draw two cards.\n' });
  await selectChinese(store, first, '继续游戏。', '100.2');
  await selectChinese(store, second, '继续进行游戏。', '100.2');
  const result = await createComparisonOperations(store, { track: 'local' }).compare({ slug: 'magic-cr', fromVersionTag: '20261001', toVersionTag: '20261101', locale: 'zhs' });
  expect(result.rows.filter(row => row.kind === 'change').map(row => [row.to?.nodeId ?? row.from?.nodeId, row.type, row.translationOnly])).toEqual([
    ['100.1a', 'added', false], ['100.2', 'modified', true], ['100.3', 'removed', false], ['100.10', 'modified', false],
  ]);
});


test('suppresses renumbering caused by an insertion while retaining actual wording changes', async () => {
  const store = memoryStore();
  const service = createDocumentService(store, { track: 'local' });
  await service.importCr({ content: beforeMovement });
  await service.importCr({ content: afterMovement });
  const result = await createComparisonOperations(store, { track: 'local' }).compare({ slug: 'magic-cr', fromVersionTag: '20260807', toVersionTag: '20260925', locale: 'en' });
  const rows = result.rows.filter(row => row.kind === 'change');
  expect(rows.filter(row => row.from?.nodeId.startsWith('506.') || row.to?.nodeId.startsWith('506.')).map(row => [row.from?.nodeId ?? null, row.to?.nodeId ?? null, row.type])).toEqual([
    [null, '506.6', 'added'], ['506.7c', '506.8c', 'modified'],
  ]);
  expect(rows.some(row => row.to?.nodeId === '506.7' || row.to?.nodeId === '506.8')).toBe(false);
  expect(rows.find(row => row.to?.nodeId === '506.8c')?.textDiff?.blocks.filter(block => block.type !== 'common')).toEqual([
    { type: 'removed', text: '506.7', isMinor: true }, { type: 'added', text: '506.8', isMinor: true },
  ]);
  const reversed = await createComparisonOperations(store, { track: 'local' }).compare({ slug: 'magic-cr', fromVersionTag: '20260925', toVersionTag: '20260807', locale: 'en' });
  expect(reversed.rows.flatMap(row => row.kind === 'change' && (row.from?.nodeId.startsWith('506.') || row.to?.nodeId.startsWith('506.')) ? [[row.from?.nodeId ?? null, row.to?.nodeId ?? null, row.type]] : [])).toEqual([
    ['506.6', null, 'removed'], ['506.8c', '506.7c', 'modified'],
  ]);
});


test('recognizes exchanged occupied numbers and distant edited rules without losing inserted content', async () => {
  const store = memoryStore();
  const service = createDocumentService(store, { track: 'local' });
  const first = content.replace('Pay {W} to continue.', 'A player may pay {W} during their turn to draw exactly one card.') + '\n100.2. Each opponent must discard a card before they can attack.\n';
  const second = content.replace('October 1', 'November 1').replace('Pay {W} to continue.', 'Each opponent must discard a card before they can attack.') + '\n100.2. A wholly unrelated new restriction.\n\n2. Card Types\n\n200. General\n\n200.1. A player may pay {U} during their turn to draw exactly one card.\n';
  await service.importCr({ content: first });
  await service.importCr({ content: second });
  const result = await createComparisonOperations(store, { track: 'local' }).compare({ slug: 'magic-cr', fromVersionTag: '20261001', toVersionTag: '20261101', locale: 'en' });
  const rows = result.rows.filter(row => row.kind === 'change');
  expect(rows.some(row => row.to?.nodeId === '100.1')).toBe(false);
  expect(rows.find(row => row.to?.nodeId === '100.2')).toMatchObject({ type: 'added', from: null });
  expect(rows.find(row => row.to?.nodeId === '200.1')).toMatchObject({ type: 'moved', from: { nodeId: '100.1' }, textDiff: { blocks: [
    { type: 'common', text: 'A player may pay {' }, { type: 'removed', text: 'W' }, { type: 'added', text: 'U' }, { type: 'common', text: '} during their turn to draw exactly one card.' },
  ] } });
});

test('does not mistake a changed chapter title for new content with the same wording at another level', async () => {
  const store = memoryStore();
  const service = createDocumentService(store, { track: 'local' });
  await service.importCr({ content });
  await service.importCr({ content: content.replace('October 1', 'November 1').replace('100. General', '100. Basics') + '\n100.2. General\n' });
  const result = await createComparisonOperations(store, { track: 'local' }).compare({ slug: 'magic-cr', fromVersionTag: '20261001', toVersionTag: '20261101' });
  expect(result.rows.filter(row => row.kind === 'change').map(row => [row.from?.nodeId ?? null, row.to?.nodeId ?? null, row.type])).toEqual([
    ['100', '100', 'modified'], [null, '100.2', 'added'],
  ]);
});

test('retains translation wording changes on passively renumbered rules without marking movement', async () => {
  const store = memoryStore();
  const service = createDocumentService(store, { track: 'local' });
  const first = await service.importCr({ content });
  const second = await service.importCr({ content: content.replace('October 1', 'November 1').replace('100.1. Pay {W} to continue.', '100.1. A new unrelated requirement.\n\n100.2. Pay {W} to continue.') });
  await selectChinese(store, first, '支付 {W} 后继续。');
  await selectChinese(store, second, '支付 {W} 以继续。', '100.2');
  const result = await createComparisonOperations(store, { track: 'local' }).compare({ slug: 'magic-cr', fromVersionTag: '20261001', toVersionTag: '20261101', locale: 'zhs' });
  expect(result.rows.find(row => row.kind === 'change' && row.to?.nodeId === '100.2')).toMatchObject({
    type: 'modified', translationOnly: true, from: { nodeId: '100.1' }, to: { nodeId: '100.2' },
  });
});


test('ignores passive sibling renumbering when another rule moves into or out of the chapter', async () => {
  const store = memoryStore();
  const service = createDocumentService(store, { track: 'local' });
  const first = content + '\n100.2. Each opponent discards a card before attacking.\n';
  const second = content.replace('October 1', 'November 1').replace('Pay {W} to continue.', 'Each opponent discards a card before attacking.') + '\n2. Card Types\n\n200. General\n\n200.1. Pay {W} to continue.\n';
  await service.importCr({ content: first });
  await service.importCr({ content: second });
  const comparison = createComparisonOperations(store, { track: 'local' });
  for (const [fromVersionTag, toVersionTag] of [['20261001', '20261101'], ['20261101', '20261001']]) {
    const result = await comparison.compare({ slug: 'magic-cr', fromVersionTag: fromVersionTag!, toVersionTag: toVersionTag! });
    expect(result.rows.filter(row => row.kind === 'change' && (row.type === 'renamed' || row.type === 'renamed_modified'))).toHaveLength(0);
    expect(result.rows.some(row => row.kind === 'change' && row.type === 'moved' && (row.from?.nodeId === '200.1' || row.to?.nodeId === '200.1'))).toBe(true);
  }
});

test('retains real swaps when both rules remain in the chapter', async () => {
  const store = memoryStore();
  const service = createDocumentService(store, { track: 'local' });
  const first = content + '\n100.2. Each opponent discards a card before attacking.\n';
  const second = content.replace('October 1', 'November 1').replace('Pay {W} to continue.', 'Each opponent discards a card before attacking.') + '\n100.2. Pay {W} to continue.\n';
  await service.importCr({ content: first });
  await service.importCr({ content: second });
  const result = await createComparisonOperations(store, { track: 'local' }).compare({ slug: 'magic-cr', fromVersionTag: '20261001', toVersionTag: '20261101' });
  expect(result.rows.filter(row => row.kind === 'change').map(row => [row.from?.nodeId, row.to?.nodeId, row.type])).toEqual([
    ['100.2', '100.1', 'renamed'], ['100.1', '100.2', 'renamed'],
  ]);
});
