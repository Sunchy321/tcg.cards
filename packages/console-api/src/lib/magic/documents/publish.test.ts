import { expect, test } from 'bun:test';

import { createDocumentService } from './service';
import { memoryStore } from './testing';
import { publishDocument, publishStaticDocuments } from './publish';
import type { DocumentStore } from './store';

const cr = `Magic: The Gathering Comprehensive Rules

These rules are effective as of October 1, 2026.

Introduction

Example.

Contents

Credits

1. Game Concepts

100. General

100.1. Pay {W} to continue.
`;

/** Adds an ordinary static article independently of the CR importer. */
async function addGuide(store: DocumentStore) {
  const at = new Date('2026-10-01T00:00:00Z');
  await store.putDocument({
    id: 'a-guide', slug: 'a-guide', title: 'A guide', sourceLanguage: 'en', origin: 'static', staticKey: 'a-guide', visibility: 'public',
    settings: { outline: false, compare: false, historyPublic: false, copyable: false }, createdAt: at, updatedAt: at, deletedAt: null,
  });
  await store.putRevision({
    id: 'guide:revision', documentId: 'a-guide', title: 'A guide', language: 'en', translationId: null, sourceRevisionId: null, createdAt: at, deletedAt: null,
    nodes: [{
      id: 'guide:node', revisionId: 'guide:revision', nodeKey: 'one', kind: 'content', anchor: 'one', path: '0001', level: 1,
      parentId: null, siblingOrder: 0, rawText: 'An ordinary static article.', markers: [], sourceNodeId: null, sourceRevisionId: null,
      translationMethod: null, reviewStatus: null,
    }],
  });
  await store.putRelease({
    id: 'guide:release', documentId: 'a-guide', versionTag: '1', sourceRevisionId: 'guide:revision', publishedAt: at, effectiveDate: null, files: [], deletedAt: null,
  });
}

test('publishes all static articles and keeps user articles readable across retries', async () => {
  const source = memoryStore();
  const target = memoryStore();
  await createDocumentService(source, { track: 'local' }).importCr({ content: cr });
  await addGuide(source);
  const owner = createDocumentService(target, { track: 'remote', actorId: 'alice' });
  const article = await owner.create({ slug: 'my-private-article', title: 'My private article', language: 'en' });
  const revision = await owner.save({ documentId: article.id, title: article.title, nodes: [{ nodeKey: 'one', rawText: 'My own content.' }] });
  await owner.publish({ documentId: article.id, revisionId: revision.id, versionTag: '1' });

  const first = await publishStaticDocuments(source, target);
  expect(first.documents).toBe(2);
  expect(first.releases).toBe(2);
  expect(await publishStaticDocuments(source, target)).toEqual(first);
  const reader = createDocumentService(target, { track: 'remote' });
  expect((await reader.read({ slug: 'a-guide' })).sections[0]?.text).toBe('An ordinary static article.');
  expect((await reader.read({ slug: 'magic-cr' })).sections.some(node => node.text === 'Pay {W} to continue.')).toBe(true);
  expect((await owner.read({ slug: article.slug })).sections[0]?.text).toBe('My own content.');
});

test('previews the complete static collection without making any article readable remotely', async () => {
  const source = memoryStore();
  const target = memoryStore();
  await createDocumentService(source, { track: 'local' }).importCr({ content: cr });
  await addGuide(source);
  expect((await publishStaticDocuments(source, target, { dryRun: true })).documents).toBe(2);
  const reader = createDocumentService(target, { track: 'remote' });
  await expect(reader.read({ slug: 'a-guide' })).rejects.toThrow('not found');
  await expect(reader.read({ slug: 'magic-cr' })).rejects.toThrow('not found');
});

test('rolls back the entire collection when a later article collides with a user article', async () => {
  const source = memoryStore();
  const target = memoryStore();
  await createDocumentService(source, { track: 'local' }).importCr({ content: cr });
  await addGuide(source);
  const owner = createDocumentService(target, { track: 'remote', actorId: 'alice' });
  const article = await owner.create({ slug: 'magic-cr', title: 'My article', language: 'en' });
  const revision = await owner.save({ documentId: article.id, title: article.title, nodes: [{ nodeKey: 'one', rawText: 'User-owned content.' }] });
  await owner.publish({ documentId: article.id, revisionId: revision.id, versionTag: '1' });
  await expect(publishStaticDocuments(source, target)).rejects.toThrow('collides');
  await expect(owner.read({ slug: 'a-guide' })).rejects.toThrow('not found');
  expect((await owner.read({ slug: 'magic-cr' })).sections[0]?.text).toBe('User-owned content.');
});

test('rejects an empty static collection with no writes', async () => {
  const target = memoryStore();
  await expect(publishStaticDocuments(memoryStore(), target)).rejects.toThrow('No static documents');
  expect(await target.documents()).toEqual([]);
});

test('publishes static content and retries without recreating immutable revisions', async () => {
  const source = memoryStore();
  const target = memoryStore();
  const imported = await createDocumentService(source, { track: 'local' }).importCr({ content: cr });
  const first = await publishDocument(source, target, imported.documentId);
  expect(first.releases).toBe(1);
  expect(first.nodes).toBeGreaterThan(0);
  expect(await publishDocument(source, target, imported.documentId)).toEqual(first);
  const page = await createDocumentService(target, { track: 'remote' }).read({ slug: 'magic-cr' });
  expect(page.sections.some(node => node.text === 'Pay {W} to continue.')).toBe(true);
});

test('dry run validates and counts content without writing anything', async () => {
  const source = memoryStore();
  const target = memoryStore();
  await createDocumentService(source, { track: 'local' }).importCr({ content: cr });
  const counts = await publishDocument(source, target, 'magic-cr', { dryRun: true });
  expect(counts.revisions).toBe(1);
  expect(await target.documents()).toEqual([]);
  expect(await target.revisions('magic-cr')).toEqual([]);
});

test('preserves unrelated user content and rejects user identity or slug collisions', async () => {
  const source = memoryStore();
  const target = memoryStore();
  await createDocumentService(source, { track: 'local' }).importCr({ content: cr });
  const original = (await source.document('magic-cr'))!;
  const user = { ...original, id: 'my-article', slug: 'my-article', origin: 'user' as const, staticKey: null, authorId: 'alice', visibility: 'private' as const };
  await target.putDocument(user);
  await publishDocument(source, target, 'magic-cr');
  expect(await target.document(user.id)).toEqual(user);
  const collision = memoryStore();
  await collision.putDocument({ ...user, id: original.id });
  await expect(publishDocument(source, collision, 'magic-cr')).rejects.toThrow('another source');
  expect(await collision.document(original.id)).toEqual({ ...user, id: original.id });
  const slugCollision = memoryStore();
  await slugCollision.putDocument({ ...user, slug: original.slug });
  await expect(publishDocument(source, slugCollision, 'magic-cr')).rejects.toThrow('slug');
});

test('rejects immutable revision conflicts without partially updating the target', async () => {
  const source = memoryStore();
  const target = memoryStore();
  const result = await createDocumentService(source, { track: 'local' }).importCr({ content: cr });
  await publishDocument(source, target, 'magic-cr');
  const conflictSource = memoryStore();
  await conflictSource.putDocument((await source.document('magic-cr'))!);
  const revision = (await source.revision(result.revisionId))!;
  await conflictSource.putRevision({ ...revision, title: 'Different immutable content' });
  await expect(publishDocument(conflictSource, target, 'magic-cr')).rejects.toThrow('immutable revision');
  expect(await target.revision(result.revisionId)).toEqual(revision);
});

test('publishes translated and hidden referenced revisions with the official edition', async () => {
  const source = memoryStore();
  const target = memoryStore();
  const result = await createDocumentService(source, { track: 'local' }).importCr({ content: cr });
  const original = (await source.revision(result.revisionId))!;
  const translation = { id: 'cr-zh', documentId: 'magic-cr', language: 'zh-CN' };
  await source.putTranslation(translation);
  const translated = {
    ...original, id: 'zh-revision', translationId: translation.id, sourceRevisionId: original.id, language: translation.language,
    nodes: original.nodes.map(node => ({ ...node, id: `zh-${node.id}`, revisionId: 'zh-revision', parentId: node.parentId == null ? null : `zh-${node.parentId}`, sourceRevisionId: original.id, sourceNodeId: node.id, translationMethod: 'machine' as const, reviewStatus: 'unreviewed' as const })),
  };
  await source.putRevision(translated);
  await source.putReleaseTranslation({ releaseId: result.releaseId, documentId: 'magic-cr', sourceRevisionId: original.id, translationId: translation.id, revisionId: translated.id });
  await source.hideRevision(original.id, new Date('2026-10-02'));
  await publishDocument(source, target, 'magic-cr');
  expect((await target.revision(original.id))?.deletedAt).toEqual(new Date('2026-10-02'));
  expect(await target.revision(translated.id)).toEqual(translated);
  expect((await target.releaseTranslations(result.releaseId))[0]?.revisionId).toBe(translated.id);
});

test('rejects replacing the source of an existing official release', async () => {
  const source = memoryStore();
  const target = memoryStore();
  const result = await createDocumentService(source, { track: 'local' }).importCr({ content: cr });
  await publishDocument(source, target, 'magic-cr');
  const revision = (await source.revision(result.revisionId))!;
  await source.putRevision({ ...revision, id: 'replacement', nodes: revision.nodes.map(node => ({ ...node, id: `replacement-${node.id}`, revisionId: 'replacement', parentId: node.parentId == null ? null : `replacement-${node.parentId}` })) });
  const release = (await source.releases('magic-cr'))[0]!;
  await source.putRelease({ ...release, sourceRevisionId: 'replacement' });
  await expect(publishDocument(source, target, 'magic-cr')).rejects.toThrow('existing release source');
  expect((await target.releases('magic-cr'))[0]?.sourceRevisionId).toBe(result.revisionId);
  expect(await target.revision('replacement')).toBeUndefined();
});
