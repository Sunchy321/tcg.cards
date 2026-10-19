import { expect, test } from 'bun:test';

import { createDocumentService } from './service';
import { memoryStore } from './testing';
import { createTranslationOperations } from './translations';

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

/** Prepare an imported edition and its exact translatable rule. */
async function fixture() {
  const store = memoryStore();
  const imported = await createDocumentService(store, { track: 'local' }).importCr({ content });
  const source = (await store.revision(imported.revisionId))!;
  const node = source.nodes.find(row => row.nodeKey === '100.1')!;
  return { store, imported, source, node, operations: createTranslationOperations(store, { track: 'local' }) };
}

test('saves exact node translation provenance and selects it for the official release', async () => {
  const { store, imported, source, node, operations } = await fixture();
  const revision = await operations.saveTranslation({ documentId: imported.documentId, sourceRevisionId: source.id, language: 'zh-CN', nodes: [{ sourceNodeId: node.id, rawText: '支付 {W}。', translationMethod: 'machine' }] });
  expect(revision.sourceRevisionId).toBe(source.id);
  expect(revision.nodes[0]?.sourceNodeId).toBe(node.id);
  expect(revision.nodes[0]?.translationMethod).toBe('machine');
  await operations.selectTranslation({ documentId: imported.documentId, releaseId: imported.releaseId, revisionId: revision.id });
  expect((await store.releaseTranslations(imported.releaseId))[0]?.revisionId).toBe(revision.id);
  expect((await store.releases(imported.documentId)).length).toBe(1);
});

test('keeps one translation identity while retaining independently saved content states', async () => {
  const { store, imported, source, node, operations } = await fixture();
  const input = { documentId: imported.documentId, sourceRevisionId: source.id, language: 'zh-CN', nodes: [{ sourceNodeId: node.id, rawText: '人工译文 {W}', translationMethod: 'human' as const }] };
  const first = await operations.saveTranslation(input);
  const second = await operations.saveTranslation({ ...input, nodes: [{ ...input.nodes[0]!, rawText: '修订译文 {W}', translationMethod: 'machine_edited', reviewStatus: 'reviewed' }] });
  expect(first.id).not.toBe(second.id);
  expect(first.translationId).toBe(second.translationId);
  expect((await store.translations(imported.documentId)).length).toBe(1);
  expect((await store.revision(first.id))?.nodes[0]?.translationMethod).toBe('human');
  expect(second.nodes[0]?.reviewStatus).toBe('reviewed');
});

test('rejects mismatched nodes, duplicate sources, source-language targets and invalid ranges before saving', async () => {
  const { store, imported, source, node, operations } = await fixture();
  const entry = { sourceNodeId: node.id, rawText: '中文', translationMethod: 'machine' as const };
  const input = { documentId: imported.documentId, sourceRevisionId: source.id, language: 'zh-CN', nodes: [entry] };
  await expect(operations.saveTranslation({ ...input, nodes: [{ ...entry, sourceNodeId: 'other-revision-node' }] })).rejects.toThrow('does not belong');
  await expect(operations.saveTranslation({ ...input, nodes: [entry, entry] })).rejects.toThrow('once');
  await expect(operations.saveTranslation({ ...input, language: 'en' })).rejects.toThrow('differ');
  await expect(operations.saveTranslation({ ...input, nodes: [{ ...entry, markers: [{ type: 'emphasis', style: 'strong', start: 0, end: 9 }] }] })).rejects.toThrow('marker range');
  await expect(operations.saveTranslation({ ...input, nodes: [{ ...entry, rawText: '😀', markers: [{ type: 'emphasis', style: 'strong', start: 0, end: 1 }] }] })).rejects.toThrow('splits');
  expect(await store.translations(imported.documentId)).toEqual([]);
  expect((await store.revisions(imported.documentId)).length).toBe(1);
});

test('rejects using translated content as source and bindings for another official edition', async () => {
  const { store, imported, source, node, operations } = await fixture();
  const translated = await operations.saveTranslation({ documentId: imported.documentId, sourceRevisionId: source.id, language: 'zh-CN', nodes: [{ sourceNodeId: node.id, rawText: '中文', translationMethod: 'machine' }] });
  await expect(operations.saveTranslation({ documentId: imported.documentId, sourceRevisionId: translated.id, language: 'fr', nodes: [] })).rejects.toThrow('original revision');
  const another = await createDocumentService(store, { track: 'local' }).importCr({ content: content.replace('October 1', 'November 1') });
  await expect(operations.selectTranslation({ documentId: imported.documentId, releaseId: another.releaseId, revisionId: translated.id })).rejects.toThrow('does not match');
  expect(await store.releaseTranslations(another.releaseId)).toEqual([]);
});

test('allows only owners to create user translations and rejects editing remote static content', async () => {
  const { store, imported, source, node } = await fixture();
  const input = { documentId: imported.documentId, sourceRevisionId: source.id, language: 'zh-CN', nodes: [{ sourceNodeId: node.id, rawText: '中文', translationMethod: 'machine' as const }] };
  await expect(createTranslationOperations(store, { track: 'remote', actorId: 'alice' }).saveTranslation(input)).rejects.toThrow('owner');
  const document = (await store.document(imported.documentId))!;
  await store.putDocument({ ...document, origin: 'user', staticKey: null, authorId: 'alice' });
  await expect(createTranslationOperations(store, { track: 'remote', actorId: 'bob' }).saveTranslation(input)).rejects.toThrow('owner');
  const revision = await createTranslationOperations(store, { track: 'remote', actorId: 'alice' }).saveTranslation(input);
  expect(revision.language).toBe('zh-CN');
});
