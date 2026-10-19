import { describe, expect, test } from 'bun:test';

import { createDocumentService } from './service';
import { memoryStore } from './testing';

const cr = `Magic: The Gathering Comprehensive Rules

These rules are effective as of October 1, 2026.

Introduction

An example rulebook.

Contents

Credits

1. Game Concepts

100. General

100.1. Pay {W} to continue.
`;

describe('document operations', () => {
  test('imports a static CR release without users and keeps repeated imports idempotent', async () => {
    const documents = createDocumentService(memoryStore(), { track: 'local' });
    const first = await documents.importCr({ content: cr, files: [{ format: 'pdf', language: 'en', sourceUrl: 'https://example.test/CR.pdf' }] });
    const second = await documents.importCr({ content: cr, versionTag: '2026-10-01' });
    expect(second).toEqual(first);
    const page = await documents.read({ slug: 'magic-cr' });
    expect(page.document.origin).toBe('static');
    expect(page.version.versionTag).toBe('20261001');
    expect(page.files[0]?.format).toBe('pdf');
    expect(page.sections.find(node => node.nodeId === '100.1')?.text).toBe('Pay {W} to continue.');
    expect((await documents.revisions('magic-cr')).length).toBe(1);
  });
  test('rejects an empty parsed rulebook without replacing the published release', async () => {
    const documents = createDocumentService(memoryStore(), { track: 'local' });
    await documents.importCr({ content: cr });
    await expect(documents.importCr({ content: 'These rules are effective as of October 1, 2026.' })).rejects.toThrow('no rule nodes');
    expect((await documents.read({ slug: 'magic-cr' })).sections.some(node => node.text === 'Pay {W} to continue.')).toBe(true);
  });
});

test('published articles remain unchanged while owners save and compact intermediate revisions', async () => {
  const store = memoryStore();
  const owner = createDocumentService(store, { track: 'remote', actorId: 'alice' });
  const document = await owner.create({ slug: 'my-guide', title: 'Guide', language: 'en', visibility: 'public' });
  const first = await owner.save({ documentId: document.id, title: 'Guide', nodes: [{ nodeKey: 'intro', rawText: 'Published text.' }] });
  await owner.publish({ documentId: document.id, revisionId: first.id, versionTag: '1' });
  const second = await owner.save({ documentId: document.id, title: 'Guide draft', nodes: [{ nodeKey: 'intro', rawText: 'Unpublished correction.' }] });
  const reader = createDocumentService(store, { track: 'remote' });
  expect((await reader.read({ slug: 'my-guide' })).sections[0]?.text).toBe('Published text.');
  await owner.clearHistory({ documentId: document.id, revisionIds: [first.id, second.id] });
  expect(await owner.revisions(document.id)).toEqual([]);
  expect((await reader.read({ slug: 'my-guide' })).sections[0]?.text).toBe('Published text.');
  const stranger = createDocumentService(store, { track: 'remote', actorId: 'bob' });
  await expect(stranger.save({ documentId: document.id, title: 'Hacked', nodes: [] })).rejects.toThrow('Not allowed');
  await expect(reader.revisions(document.id)).rejects.toThrow('Not allowed');
});

test('serves the selected node translation under its original official release', async () => {
  const documents = createDocumentService(memoryStore(), { track: 'local' });
  const imported = await documents.importCr({ content: cr });
  const translation = await documents.saveTranslation({
    documentId: imported.documentId, sourceRevisionId: imported.revisionId, language: 'zhs',
    nodes: [{ sourceNodeId: `${imported.revisionId}/100.1`, rawText: '支付 {W} 后继续。', translationMethod: 'machine' }],
  });
  await documents.selectTranslation({ documentId: imported.documentId, releaseId: imported.releaseId, revisionId: translation.id });
  const page = await documents.read({ slug: 'magic-cr', locale: 'zhs' });
  const translated = page.sections.find(node => node.nodeId === '100.1');
  expect(translated?.text).toBe('支付 {W} 后继续。');
  expect(translated?.translationMethod).toBe('machine');
  expect(translated?.localeState.isFallback).toBe(false);
  expect(page.sections.find(node => node.nodeId === '100')?.localeState.isFallback).toBe(true);
  expect(page.versions).toHaveLength(1);
});

test('searches readable public text and literals without indexing marker IDs or drafts', async () => {
  const store = memoryStore();
  const local = createDocumentService(store, { track: 'local' });
  await local.importCr({ content: cr.replace('Pay {W} to continue.', '**Pay** {W}; see rule 100.1 and @card(internal-secret-card){Example Card}.') });
  const reader = createDocumentService(store, { track: 'remote' });
  const page = await reader.read({ slug: 'magic-cr' });
  const node = page.sections.find(node => node.nodeId === '100.1');
  expect(node?.text).toBe('Pay {W}; see rule 100.1 and Example Card.');
  expect(node?.markers.map(marker => marker.type)).toContain('chapter');
  expect((await reader.search({ query: '{W}' })).some(hit => hit.anchor === '100.1')).toBe(true);
  expect(await reader.search({ query: 'internal-secret-card' })).toEqual([]);
  const author = createDocumentService(store, { track: 'remote', actorId: 'alice' });
  const privateDoc = await author.create({ slug: 'private-notes', title: 'Private', language: 'en' });
  const revision = await author.save({ documentId: privateDoc.id, title: 'Private', nodes: [{ nodeKey: 'one', rawText: 'Not searchable.' }] });
  await author.publish({ documentId: privateDoc.id, revisionId: revision.id, versionTag: '1' });
  expect(await reader.search({ query: 'searchable' })).toEqual([]);
});

test('retires a local edition without destroying its saved content', async () => {
  const documents = createDocumentService(memoryStore(), { track: 'local' });
  const release = await documents.importCr({ content: cr });
  await documents.retireRelease({ documentId: release.documentId, releaseId: release.releaseId });
  await expect(documents.read({ slug: 'magic-cr' })).rejects.toThrow('Release not found');
  expect(await documents.revisions(release.documentId)).toHaveLength(1);
});

test('rejects authored markers that cut a Unicode character in half', async () => {
  const owner = createDocumentService(memoryStore(), { track: 'remote', actorId: 'alice' });
  const document = await owner.create({ slug: 'unicode', title: 'Unicode', language: 'en' });
  await expect(owner.save({ documentId: document.id, title: document.title, nodes: [
    { nodeKey: 'one', rawText: '😀', markers: [{ type: 'emphasis', style: 'strong', start: 1, end: 2 }] },
  ] })).rejects.toThrow('character');
});

test('keeps the official calendar date when the runtime uses Asia/Shanghai', async () => {
  const script = `import { createDocumentService } from ${JSON.stringify(new URL('./service.ts', import.meta.url).pathname)};
    import { memoryStore } from ${JSON.stringify(new URL('./testing.ts', import.meta.url).pathname)};
    const result = await createDocumentService(memoryStore(), {track:'local'}).importCr({content:${JSON.stringify(cr)},versionTag:'20261001'});
    console.log(result.effectiveDate);`;
  const child = Bun.spawn([process.execPath, '-e', script], { env: { ...process.env, TZ: 'Asia/Shanghai' }, stdout: 'pipe', stderr: 'pipe' });
  const [out, error, code] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
  expect(code, error).toBe(0);
  expect(out.trim()).toBe('2026-10-01');
});

test('exposes saved revision contents only while their history is public and not cleared', async () => {
  const store = memoryStore();
  const owner = createDocumentService(store, { track: 'remote', actorId: 'alice' });
  const document = await owner.create({ slug: 'public-history', title: 'History', language: 'en', visibility: 'public', settings: { historyPublic: true } });
  const revision = await owner.save({ documentId: document.id, title: 'Saved state', nodes: [{ nodeKey: 'one', rawText: 'An intentionally public revision.' }] });
  const reader = createDocumentService(store, { track: 'remote' });
  expect((await reader.revision({ documentId: document.id, revisionId: revision.id })).nodes[0]?.rawText).toBe('An intentionally public revision.');
  await owner.clearHistory({ documentId: document.id, revisionIds: [revision.id] });
  await expect(reader.revision({ documentId: document.id, revisionId: revision.id })).rejects.toThrow('not found');
});
