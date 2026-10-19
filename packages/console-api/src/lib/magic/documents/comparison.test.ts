import { expect, test } from 'bun:test';

import { createDocumentService } from './service';
import { memoryStore } from './testing';
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
