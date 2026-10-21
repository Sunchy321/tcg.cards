import { describe, expect, test } from 'bun:test';

import { createDocumentService } from './service';
import { memoryStore } from './testing';
import type { SourceFile } from '@tcg-cards/model/magic/schema/document-content';

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
  test('fills missing original files on reimport without changing the release or saved text', async () => {
    const store = memoryStore();
    const documents = createDocumentService(store, { track: 'local' });
    await documents.importCr({ content: cr });
    const [before] = await store.releases('magic-cr');
    if (before == null) throw new Error('Expected an imported CR release');
    const files: SourceFile[] = [{ format: 'pdf', language: 'en', storageKey: 'magic/rule/pdf/2026-10-01.pdf' }];
    await documents.importCr({ content: cr, files });
    expect((await store.releases('magic-cr'))[0]).toEqual({ ...before, files });
    await expect(documents.importCr({ content: cr.replace('Pay {W}', 'Pay {U}'), files: [{ format: 'txt', language: 'en', storageKey: 'other.txt' }] })).rejects.toThrow('different content');
    expect((await store.releases('magic-cr'))[0]).toEqual({ ...before, files });
  });

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

test('keeps multi-letter rules and punctuated glossary terms individually addressable', async () => {
  const documents = createDocumentService(memoryStore(), { track: 'local' });
  await documents.importCr({ content: cr + `
7. Additional Rules

704. State-Based Actions

704.5. State-based actions follow.

704.5z Roles are checked.

704.5aa If a player controls a permanent with start your engines! and that player has no speed, that player’s speed becomes 1.

Glossary

Banding, “Bands with Other”
A keyword ability.

Partner, “Partner—[text],” “Partner with [name]”
A partner ability.

Team vs. Team Variant
A multiplayer variant.

Start Your Engines!
A keyword ability that increases speed.

Credits

Editing: Test editor.
` });
  const page = await documents.read({ slug: 'magic-cr' });
  expect(page.sections.find(node => node.nodeId === '704.5aa')).toMatchObject({
    serial: '704.5aa', parentNodeId: '704.5', level: 3, path: '7/704/5/aa',
  });
  expect(page.sections.filter(node => node.parentNodeId === 'glossary').map(node => node.text)).toEqual([
    'Banding, “Bands with Other”\n\nA keyword ability.',
    'Partner, “Partner—[text],” “Partner with [name]”\n\nA partner ability.',
    'Team vs. Team Variant\n\nA multiplayer variant.',
    'Start Your Engines!\n\nA keyword ability that increases speed.',
  ]);
});

test('imports official TXT line separators and missing rule-number punctuation without merging adjacent rules', async () => {
  const documents = createDocumentService(memoryStore(), { track: 'local' });
  await documents.importCr({ content: cr + `
2. Parts of a Card

205. Type Line

205.4. Supertypes

205.4b An object's supertype is independent of its card type.
Example: Legendary lands stay legendary.
\u00a0
205.4c Any land with the supertype “basic” is a basic land.\u2028\u00a0\u00a0 Cards printed before Eighth Edition did not use “basic”.

5. Turn Structure

509. Declare Blockers Step

509.1. The defending player declares blockers.

509.1a The defending player chooses creatures.
\u00a0
509.1b The defending player checks restrictions.\u2028\u00a0\u00a0 A restriction may be created by an evasion ability.
Example: Check flying and shadow.

6. Spells, Abilities, and Effects

606. Loyalty Abilities

606.4. Loyalty ability costs may be modified by other effects.
\u00a0
606.5 Multiple loyalty costs are combined into a single cost.
Example: Combine the additional cost.
` });
  const page = await documents.read({ slug: 'magic-cr' });
  expect(page.sections.find(node => node.nodeId === '205.4c')).toMatchObject({
    text: 'Any land with the supertype “basic” is a basic land.\n\nCards printed before Eighth Edition did not use “basic”.', parentNodeId: '205.4',
  });
  expect(page.sections.find(node => node.nodeId === '205.4b.example.1')?.text).toBe('Example: Legendary lands stay legendary.');
  expect(page.sections.find(node => node.nodeId === '509.1a')?.text).toBe('The defending player chooses creatures.');
  expect(page.sections.find(node => node.nodeId === '509.1b')).toMatchObject({
    text: 'The defending player checks restrictions.\n\nA restriction may be created by an evasion ability.', parentNodeId: '509.1',
  });
  expect(page.sections.find(node => node.nodeId === '509.1b.example.1')?.text).toBe('Example: Check flying and shadow.');
  expect(page.sections.find(node => node.nodeId === '606.4')?.text).toBe('Loyalty ability costs may be modified by other effects.');
  expect(page.sections.find(node => node.nodeId === '606.5')).toMatchObject({
    text: 'Multiple loyalty costs are combined into a single cost.', parentNodeId: '606',
  });
  expect(page.sections.find(node => node.nodeId === '606.5.example.1')?.text).toBe('Example: Combine the additional cost.');
});

test('manually reimporting the same file repairs its public parsing without creating an editing revision', async () => {
  const content = cr + '\n100.2. Keep playing.\n';
  const prepared = memoryStore();
  const imported = await createDocumentService(prepared, { track: 'local' }).importCr({ content });
  const source = (await prepared.revision(imported.revisionId))!;
  const store = memoryStore();
  await store.putDocument((await prepared.document('magic-cr'))!);
  // Reproduce an edition saved by a parser that merged the following rule into 100.1.
  await store.putRevision({ ...source, nodes: source.nodes.filter(node => node.anchor !== '100.2').map(node => node.anchor === '100.1'
    ? { ...node, rawText: 'Pay {W} to continue.\n\n100.2. Keep playing.' } : node) });
  await store.putRelease((await prepared.releases('magic-cr'))[0]!);
  const documents = createDocumentService(store, { track: 'local' });
  expect((await documents.read({ slug: 'magic-cr' })).sections.some(node => node.nodeId === '100.2')).toBe(false);
  const repaired = await documents.importCr({ content });
  expect(repaired.revisionId).toBe(imported.revisionId);
  expect((await documents.read({ slug: 'magic-cr' })).sections.find(node => node.nodeId === '100.2')?.text).toBe('Keep playing.');
  expect(await documents.revisions('magic-cr')).toHaveLength(1);
  expect(await store.releases('magic-cr')).toHaveLength(1);
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

test('keeps adjoining prose in its paragraph when a rule number has neither punctuation nor whitespace', async () => {
  const documents = createDocumentService(memoryStore(), { track: 'local' });
  await documents.importCr({ content: cr + '\n100.2Continue playing without a valid number separator.\n' });
  const page = await documents.read({ slug: 'magic-cr' });
  expect(page.sections.some(node => node.nodeId === '100.2')).toBe(false);
  expect(page.sections.find(node => node.nodeId === '100.1')?.text).toContain('100.2Continue playing without a valid number separator.');
});


test('keeps historical CR releases in official chronology with legacy or unpunctuated date headers', async () => {
  const store = memoryStore();
  const documents = createDocumentService(store, { track: 'local' });
  await documents.importCr({ content: cr });
  const legacy = await documents.importCr({ content: cr.replace('effective as of October 1, 2026.', 'current as of October 1, 2006.'), versionTag: '20061001' });
  expect(legacy.effectiveDate).toBe('2006-10-01');
  const unpunctuated = await documents.importCr({ content: cr.replace('October 1, 2026.', 'October 1, 2024'), versionTag: '20241001' });
  expect(unpunctuated.effectiveDate).toBe('2024-10-01');
  expect((await documents.read({ slug: 'magic-cr' })).version.versionTag).toBe('20261001');
  expect((await store.releases('magic-cr')).find(release => release.id === legacy.releaseId)?.publishedAt.toISOString()).toBe('2006-10-01T00:00:00.000Z');
});

test('treats blank-line whitespace as identical CR content and keeps the saved revision', async () => {
  const store = memoryStore();
  const documents = createDocumentService(store, { track: 'local' });
  const first = await documents.importCr({ content: cr });
  const padded = cr.replace('\n\n100.1.', '\n \n100.1.');
  expect(padded).not.toBe(cr);
  const second = await documents.importCr({ content: padded });
  expect(second.revisionId).toBe(first.revisionId);
  expect((await store.releases('magic-cr'))[0]?.sourceRevisionId).toBe(first.revisionId);
  await expect(documents.importCr({ content: cr.replace('Pay {W} to continue.', 'Changed rule text.') })).rejects.toThrow('different content');
  expect((await store.releases('magic-cr'))[0]?.sourceRevisionId).toBe(first.revisionId);
  expect(await store.revisions('magic-cr')).toHaveLength(1);
});
