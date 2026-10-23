import { expect, test } from 'bun:test';

import { createDocumentService } from './service';
import { createItemHistoryOperations } from './item-history';
import type { DocumentStore } from './store';
import { memoryStore } from './testing';

test('requires manual preparation and reuses relations for nonnumeric article history', async () => {
  const store = memoryStore();
  const context = { track: 'remote' as const, actorId: 'author' };
  const service = createDocumentService(store, context);
  const document = await service.create({ slug: 'article', title: 'Article', language: 'en' });
  for (const [versionTag, rawText] of [['1', 'Read the first paragraph.'], ['10', 'Read the updated paragraph.'], ['2', 'Read the updated paragraph.']]) {
    const revision = await service.save({ documentId: document.id, title: document.title, nodes: [{ nodeKey: 'intro', rawText: rawText! }] });
    const release = await service.publish({ documentId: document.id, revisionId: revision.id, versionTag: versionTag! });
    // Fixed publication dates make ordering independent of clock resolution.
    await store.putRelease({ ...release, publishedAt: new Date(`2026-10-${versionTag === '1' ? '01' : versionTag === '10' ? '02' : '03'}T00:00:00Z`) });
  }
  const query = { slug: document.slug, itemId: 'intro', locale: 'en' };
  await expect(createItemHistoryOperations(store, context).itemHistory(query)).rejects.toThrow('relations');
  await service.computeRelations({ documentId: document.id });
  await service.computeRelations({ documentId: document.id });
  const page = await createItemHistoryOperations(store, context).itemHistory(query);
  const periods = page.rows.filter(row => row.kind === 'period');
  expect(periods.map(row => [row.versionFrom, row.versionTo])).toEqual([['1', '1'], ['10', '2']]);
  expect(periods[1]!.cells[0]!.text).toBe('Read the updated paragraph.');
  expect(page.entry.lineageCount).toBe(1);
});

test('reads only reachable source and translation nodes after preparation', async () => {
  const store = memoryStore();
  const context = { track: 'remote' as const, actorId: 'author' };
  const service = createDocumentService(store, context);
  const document = await service.create({ slug: 'large-article', title: 'Article', language: 'en' });
  for (let index = 0; index < 3; index++) {
    const revision = await service.save({ documentId: document.id, title: document.title, nodes: [
      { nodeKey: 'intro', rawText: `Read paragraph ${index}.` },
      ...Array.from({ length: 40 }, (_, other) => ({ nodeKey: `other-${other}`, rawText: `Unrelated section ${other}.` })),
    ] });
    const release = await service.publish({ documentId: document.id, revisionId: revision.id, versionTag: String(index) });
    await store.putRelease({ ...release, publishedAt: new Date(Date.UTC(2026, 9, index + 1)) });
    const translated = await service.saveTranslation({ documentId: document.id, sourceRevisionId: revision.id, language: 'zhs', nodes: revision.nodes.map(node => ({
      sourceNodeId: node.id, rawText: node.nodeKey === 'intro' ? `译文${index}` : `其他内容${node.nodeKey}`, translationMethod: 'human' as const,
    })) });
    await service.selectTranslation({ documentId: document.id, releaseId: release.id, revisionId: translated.id });
  }
  await service.computeRelations({ documentId: document.id });
  let readNodes = 0;
  const observed: DocumentStore = { ...store,
    /** Keep query measurements active inside the consistent history read. */
    async transaction(id, operation) { return store.transaction(id, () => operation(observed)); },
    /** Fail if a history read requests a complete revision. */
    async revision() { throw new Error('History must not load a complete revision'); },
    /** Measure actual node payloads across the storage boundary. */
    async selectNodes(input: Parameters<typeof store.selectNodes>[0]) {
      const rows = await store.selectNodes(input);
      readNodes += rows.length;
      return rows;
    },
  };
  const page = await createItemHistoryOperations(observed, context).itemHistory({ slug: document.slug, itemId: 'intro', locale: 'zhs' });
  expect(page.entry.excerpt).toBe('译文2');
  expect(readNodes).toBeLessThanOrEqual(9);
  const latest = (await store.releases(document.id)).sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime())[0]!;
  const source = (await store.revision(latest.sourceRevisionId))!;
  const correction = await service.saveTranslation({ documentId: document.id, sourceRevisionId: source.id, language: 'zhs', nodes: [{
    sourceNodeId: source.nodes.find(node => node.nodeKey === 'intro')!.id, rawText: '修订后的译文', translationMethod: 'human',
  }] });
  await service.selectTranslation({ documentId: document.id, releaseId: latest.id, revisionId: correction.id });
  expect((await createItemHistoryOperations(observed, context).itemHistory({ slug: document.slug, itemId: 'intro', locale: 'zhs' })).entry.excerpt).toBe('修订后的译文');
});

test('protects private preparation and history with the existing author permissions', async () => {
  const store = memoryStore();
  const context = { track: 'remote' as const, actorId: 'owner' };
  const owner = createDocumentService(store, context);
  const document = await owner.create({ slug: 'secret', title: 'Private', language: 'en' });
  for (const versionTag of ['1', '2']) {
    const revision = await owner.save({ documentId: document.id, title: 'Private', nodes: [{ nodeKey: 'intro', rawText: `Secret paragraph ${versionTag}.` }] });
    await owner.publish({ documentId: document.id, revisionId: revision.id, versionTag });
  }
  const reader = createDocumentService(store, { track: 'remote', actorId: 'stranger' });
  await expect(reader.computeRelations({ documentId: document.id })).rejects.toThrow('Not allowed');
  await expect(createDocumentService(store, { track: 'remote' }).computeRelations({ documentId: document.id })).rejects.toThrow('Not allowed');
  await owner.computeRelations({ documentId: document.id });
  const query = { slug: document.slug, itemId: 'intro', locale: 'en' };
  await expect(createItemHistoryOperations(store, { track: 'remote', actorId: 'stranger' }).itemHistory(query)).rejects.toThrow('Document not found');
  await expect(createItemHistoryOperations(store, { track: 'remote' }).itemHistory(query)).rejects.toThrow('Document not found');
  expect((await createItemHistoryOperations(store, context).itemHistory(query)).entry.excerpt).toBe('Secret paragraph 2.');
});

test('rejects outdated source structure and adjacency while ordinary reads and publication remain available', async () => {
  const store = memoryStore();
  const service = createDocumentService(store, { track: 'local' });
  const cr = (month: string) => `Magic: The Gathering Comprehensive Rules\n\nThese rules are effective as of ${month} 1, 2026.\n\nIntroduction\n\nExample.\n\nContents\n\nCredits\n\n1. Game Concepts\n\n100. General\n\n100.1. Pay {W} to continue.\n`;
  const first = await service.importCr({ content: cr('October') });
  await service.importCr({ content: cr('December') });
  const history = createItemHistoryOperations(store, { track: 'local' });
  const query = { slug: 'magic-cr', itemId: '100.1', locale: 'en' };
  await service.computeRelations({ documentId: 'magic-cr' });
  const revision = (await store.revision(first.revisionId))!;
  await store.reparseRevision({ ...revision, nodes: revision.nodes.map(node => node.anchor === '100.1' ? { ...node, path: `${node.path}/moved` } : node) });
  await expect(history.itemHistory(query)).rejects.toThrow('relations');
  expect((await service.read({ slug: 'magic-cr' })).sections.length).toBeGreaterThan(0);
  await service.computeRelations({ documentId: 'magic-cr' });
  await expect(history.itemHistory(query)).resolves.toMatchObject({ entry: { itemId: '100.1' } });
  await service.importCr({ content: cr('November') });
  await expect(history.itemHistory(query)).rejects.toThrow('relations');
  await service.computeRelations({ documentId: 'magic-cr' });
  await expect(history.itemHistory(query)).resolves.toMatchObject({ entry: { itemId: '100.1' } });
  const middle = (await store.releases('magic-cr')).find(row => row.versionTag === '20261101')!;
  await service.retireRelease({ documentId: 'magic-cr', releaseId: middle.id });
  // A retained earlier pair must not bypass a changed formal publication sequence.
  await expect(history.itemHistory(query)).rejects.toThrow('relations');
});

test('keeps a paragraph continuous when it moves between chapters', async () => {
  const store = memoryStore();
  const context = { track: 'remote' as const, actorId: 'author' };
  const service = createDocumentService(store, context);
  const document = await service.create({ slug: 'moved-paragraph', title: 'Guide', language: 'en' });
  for (const [index, parentKey] of ['first', 'second'].entries()) {
    const revision = await service.save({ documentId: document.id, title: document.title, nodes: [
      { nodeKey: 'first', kind: 'heading', rawText: 'First chapter' },
      { nodeKey: 'second', kind: 'heading', rawText: 'Second chapter' },
      { nodeKey: 'paragraph', parentKey, rawText: 'A paragraph that remains unchanged.' },
    ] });
    const release = await service.publish({ documentId: document.id, revisionId: revision.id, versionTag: String(index + 1) });
    await store.putRelease({ ...release, publishedAt: new Date(Date.UTC(2026, 9, index + 1)) });
  }
  await service.computeRelations({ documentId: document.id });
  const page = await createItemHistoryOperations(store, context).itemHistory({ slug: document.slug, itemId: 'paragraph', locale: 'en' });
  expect(page.entry.lineageCount).toBe(1);
  expect(page.rows.filter(row => row.kind === 'period').map(row => [row.versionFrom, row.versionTo])).toEqual([['1', '2']]);
  expect(page.entry.excerpt).toBe('A paragraph that remains unchanged.');
});

test('failed manual rebuilds leave no partial relations and recover on explicit retry', async () => {
  const store = memoryStore();
  const service = createDocumentService(store, { track: 'local' });
  const cr = (month: string, symbol: string) => `Magic: The Gathering Comprehensive Rules\n\nThese rules are effective as of ${month} 1, 2026.\n\nIntroduction\n\nExample.\n\nContents\n\nCredits\n\n1. Game Concepts\n\n100. General\n\n100.1. Pay {${symbol}} to continue.\n`;
  await service.importCr({ content: cr('October', 'W') });
  await service.importCr({ content: cr('November', 'U') });
  const history = createItemHistoryOperations(store, { track: 'local' });
  const query = { slug: 'magic-cr', itemId: '100.1', locale: 'en' };

  await expect(service.computeRelations({ documentId: 'magic-cr' }, { onProgress: progress => {
    if (progress.phase === 'saving' && progress.done === 1) throw new Error('cancelled rebuild');
  } })).rejects.toThrow('cancelled rebuild');
  expect(await store.adjacencies('magic-cr')).toEqual([]);
  await expect(history.itemHistory(query)).rejects.toThrow('relations');

  await service.computeRelations({ documentId: 'magic-cr' });
  await expect(history.itemHistory(query)).resolves.toMatchObject({ entry: { itemId: '100.1' } });
});

test('reports manual progress and distinguishes missing, ready and outdated formal relations', async () => {
  const store = memoryStore();
  const service = createDocumentService(store, { track: 'local' });
  const cr = (month: string) => `Magic: The Gathering Comprehensive Rules\n\nThese rules are effective as of ${month} 1, 2026.\n\nIntroduction\n\nExample.\n\nContents\n\nCredits\n\n1. Game Concepts\n\n100. General\n\n100.1. Pay {W} to continue.\n`;
  await service.importCr({ content: cr('October') });
  await service.importCr({ content: cr('November') });
  const before = await service.relationStatus({ documentId: 'magic-cr' });
  expect(before.versions.map(row => row.status)).toEqual(['not_needed', 'unprepared']);
  const progress: { phase: string; done: number; total: number }[] = [];
  await service.computeRelations({ documentId: 'magic-cr' }, { onProgress: update => { progress.push(update); } });
  expect(progress[0]).toMatchObject({ phase: 'comparing', done: 0, total: 1 });
  expect(progress.some(row => row.phase === 'saving' && row.done === 1)).toBe(true);
  expect(progress.at(-1)).toMatchObject({ phase: 'completed', done: 1, total: 1 });
  expect((await service.relationStatus({ documentId: 'magic-cr' })).versions.map(row => row.status)).toEqual(['not_needed', 'ready']);
  await service.importCr({ content: cr('December') });
  expect((await service.relationStatus({ documentId: 'magic-cr' })).versions.map(row => row.status)).toEqual(['not_needed', 'outdated', 'unprepared']);
});
