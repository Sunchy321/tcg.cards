import { expect, test } from 'bun:test';

import { createDocumentService } from './service';
import { memoryStore } from './testing';
import { createTranslationOperations } from './translations';
import { beforeMovement, afterMovement } from './movement.fixture';
import { createComparisonOperations as createRawComparisonOperations } from './comparison';

/** Prepare neighboring relations before exercising the public diff operation. */
function createComparisonOperations(store: ReturnType<typeof memoryStore>, context: { track: 'local' | 'remote', actorId?: string }) {
  const operations = createRawComparisonOperations(store, context);
  return {
    ...operations,
    /** Treat explicit preparation as fixture setup while keeping compare itself read-only. */
    async compare(input: Parameters<typeof operations.compare>[0]) {
      const document = (await store.documents()).find(row => row.slug === input.slug);
      if (document == null) throw new Error('Document not found');
      const preparationContext = context.track === 'remote'
        ? { ...context, actorId: context.actorId ?? document.authorId ?? undefined }
        : context;
      await createDocumentService(store, preparationContext).computeRelations({ documentId: document.id });
      return operations.compare(input);
    },
  };
}

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
  let unpreparedBodyReads = 0;
  const observed = { ...store,
    /** A missing relation boundary must fail before complete endpoint bodies are loaded. */
    async revision(id: string) {
      unpreparedBodyReads++;
      return store.revision(id);
    },
  };
  const comparison = createRawComparisonOperations(observed, { track: 'local' });
  const input = { slug: 'magic-cr', fromVersionTag: '20261001', toVersionTag: '20261101' };
  await expect(comparison.compare(input)).rejects.toThrow('relations');
  expect(unpreparedBodyReads).toBe(0);
  await service.computeRelations({ documentId: 'magic-cr' });
  const result = await comparison.compare(input);
  expect(result.stats.modified).toBeGreaterThan(0);
  expect(result.rows.some(row => row.kind === 'change' && row.from?.text?.includes('{W}') && row.to?.text?.includes('{U}'))).toBe(true);
  const original = (await store.revision(first.revisionId))!;
  const nodeKey = original.nodes.find(node => node.anchor === '100.1')!.nodeKey;
  const history = await comparison.nodeHistory({ documentId: 'magic-cr', nodeKey });
  expect(history.timeline.length).toBe(2);
});

test('replays a long publication chain to compare endpoint content after a rule reverts', async () => {
  const store = memoryStore();
  const service = createDocumentService(store, { track: 'remote', actorId: 'alice' });
  const document = await service.create({ slug: 'reverted-article', title: 'Guide', language: 'en', visibility: 'public', settings: { compare: true } });
  for (const [versionTag, text, day] of [
    ['1', 'Original wording.', 1], ['10', 'Changed wording.', 2], ['2', 'Original wording.', 3],
  ] as const) {
    const revision = await service.save({ documentId: document.id, title: document.title, nodes: [{ nodeKey: 'intro', rawText: text }] });
    const release = await service.publish({ documentId: document.id, revisionId: revision.id, versionTag });
    await store.putRelease({ ...release, publishedAt: new Date(Date.UTC(2026, 9, day)) });
  }
  const comparison = createComparisonOperations(store, { track: 'remote', actorId: 'alice' });
  const restored = await comparison.compare({ slug: document.slug, fromVersionTag: '1', toVersionTag: '2' });
  expect(restored.rows.filter(row => row.kind === 'change')).toEqual([]);
  expect(restored.stats.modified).toBe(0);
  const reversed = await comparison.compare({ slug: document.slug, fromVersionTag: '2', toVersionTag: '1' });
  expect(reversed.rows.filter(row => row.kind === 'change')).toEqual([]);
  const intermediate = await comparison.compare({ slug: document.slug, fromVersionTag: '1', toVersionTag: '10' });
  expect(intermediate.rows.find(row => row.kind === 'change' && row.to?.nodeId === 'intro')).toMatchObject({
    type: 'modified', from: { text: 'Original wording.' }, to: { text: 'Changed wording.' },
  });
});

test('excludes nodes added and removed between endpoints in both comparison directions', async () => {
  const store = memoryStore();
  const service = createDocumentService(store, { track: 'remote', actorId: 'alice' });
  const document = await service.create({ slug: 'transient-article', title: 'Guide', language: 'en', visibility: 'public', settings: { compare: true } });
  for (const [versionTag, nodes, day] of [
    ['1', [{ nodeKey: 'intro', rawText: 'Stable content.' }], 1],
    ['10', [{ nodeKey: 'intro', rawText: 'Stable content.' }, { nodeKey: 'transient', rawText: 'Temporary content.' }], 2],
    ['2', [{ nodeKey: 'intro', rawText: 'Stable content.' }], 3],
  ] as const) {
    const revision = await service.save({ documentId: document.id, title: document.title, nodes: [...nodes] });
    const release = await service.publish({ documentId: document.id, revisionId: revision.id, versionTag });
    await store.putRelease({ ...release, publishedAt: new Date(Date.UTC(2026, 9, day)) });
  }
  const comparison = createComparisonOperations(store, { track: 'remote', actorId: 'alice' });
  for (const [fromVersionTag, toVersionTag] of [['1', '2'], ['2', '1']]) {
    const result = await comparison.compare({ slug: document.slug, fromVersionTag: fromVersionTag!, toVersionTag: toVersionTag! });
    expect(result.rows.filter(row => row.kind === 'change')).toEqual([]);
    expect(result.rows).not.toContainEqual(expect.objectContaining({ kind: 'change', from: expect.objectContaining({ nodeId: 'transient' }) }));
  }
});

test('keeps reused node keys in separate endpoint lifetimes across a gap', async () => {
  const store = memoryStore();
  const service = createDocumentService(store, { track: 'remote', actorId: 'alice' });
  const document = await service.create({ slug: 'reused-key-diff', title: 'Guide', language: 'en', visibility: 'public', settings: { compare: true } });
  for (const [versionTag, nodes] of [
    ['1', [{ nodeKey: 'reused', rawText: 'Original meaning.' }]],
    ['10', []],
    ['2', [{ nodeKey: 'reused', rawText: 'Unrelated new meaning.' }]],
  ] as const) {
    const revision = await service.save({ documentId: document.id, title: document.title, nodes: [...nodes] });
    const release = await service.publish({ documentId: document.id, revisionId: revision.id, versionTag });
    await store.putRelease({ ...release, publishedAt: new Date(Date.UTC(2026, 9, versionTag === '1' ? 1 : versionTag === '10' ? 2 : 3)) });
  }
  const comparison = createComparisonOperations(store, { track: 'remote', actorId: 'alice' });
  const forward = await comparison.compare({ slug: document.slug, fromVersionTag: '1', toVersionTag: '2' });
  expect(forward.rows.filter(row => row.kind === 'change').map(row => [row.type, row.from?.text, row.to?.text])).toEqual([
    ['added', undefined, 'Unrelated new meaning.'], ['removed', 'Original meaning.', undefined],
  ]);
  const reverse = await comparison.compare({ slug: document.slug, fromVersionTag: '2', toVersionTag: '1' });
  expect(reverse.rows.filter(row => row.kind === 'change').map(row => [row.type, row.from?.text, row.to?.text])).toEqual([
    ['added', undefined, 'Original meaning.'], ['removed', 'Unrelated new meaning.', undefined],
  ]);
});

test('compares distant editions without loading intermediate revision bodies', async () => {
  const store = memoryStore();
  const service = createDocumentService(store, { track: 'remote', actorId: 'alice' });
  const document = await service.create({ slug: 'bounded-compare', title: 'Guide', language: 'en', visibility: 'public', settings: { compare: true } });
  const revisions: string[] = [];
  for (const [versionTag, day] of [['1', 1], ['10', 2], ['2', 3]] as const) {
    const revision = await service.save({ documentId: document.id, title:      document.title, nodes:      [
      { nodeKey: 'intro', rawText: `Paragraph ${versionTag}.` },
      ...Array.from({ length: 40 }, (_, index) => ({ nodeKey: `unrelated-${index}`, rawText: `Unrelated ${index}.` })),
    ] });
    revisions.push(revision.id);
    const release = await service.publish({ documentId: document.id, revisionId: revision.id, versionTag });
    await store.putRelease({ ...release, publishedAt: new Date(Date.UTC(2026, 9, day)) });
  }
  await service.computeRelations({ documentId: document.id });
  let middleBodyRead = false;
  const observed = { ...store,
    /** Fail if a comparison loads a non-endpoint revision body. */
    async revision(id: string) {
      if (id === revisions[1]) {
        middleBodyRead = true;
        throw new Error('Intermediate revision content must not be read');
      }
      return store.revision(id);
    },
  };
  const result = await createRawComparisonOperations(observed, { track: 'remote', actorId: 'alice' }).compare({
    slug: document.slug, fromVersionTag: '1', toVersionTag: '2',
  });
  expect(result.rows.filter(row => row.kind === 'change').map(row => [row.from?.text, row.to?.text])).toContainEqual(['Paragraph 1.', 'Paragraph 2.']);
  expect(middleBodyRead).toBe(false);
});

test('replays a long ordinary-article chain from endpoint content only', async () => {
  const store = memoryStore();
  const service = createDocumentService(store, { track: 'remote', actorId: 'alice' });
  const document = await service.create({ slug: 'long-article-chain', title: 'Article', language: 'en', visibility: 'public', settings: { compare: true } });
  const revisions: string[] = [];
  const versionTags = ['1', '10', '2', ...Array.from({ length: 9 }, (_, index) => `article-${index + 3}`)];
  for (const [index, versionTag] of versionTags.entries()) {
    const nodes = [
      { nodeKey: 'article-intro', rawText: `Article wording ${index}.` },
      { nodeKey: 'article-details', rawText: 'This ordinary paragraph remains unchanged.' },
      ...(index >= 4 && index < 8 ? [{ nodeKey: 'temporary-note', rawText: 'This paragraph exists only in intermediate editions.' }] : []),
    ];
    const revision = await service.save({ documentId: document.id, title: document.title, nodes });
    revisions.push(revision.id);
    const release = await service.publish({ documentId: document.id, revisionId: revision.id, versionTag });
    await store.putRelease({ ...release, publishedAt: new Date(Date.UTC(2026, 9, index + 1)) });
  }
  await service.computeRelations({ documentId: document.id });
  const readRevisions: string[] = [];
  const observed = { ...store,
    /** Record full-body reads to ensure path replay touches only endpoint content. */
    async revision(id: string) {
      readRevisions.push(id);
      return store.revision(id);
    },
  };
  const result = await createRawComparisonOperations(observed, { track: 'remote', actorId: 'alice' }).compare({
    slug: document.slug, fromVersionTag: versionTags[0]!, toVersionTag: versionTags.at(-1)!,
  });
  expect(result.rows.find(row => row.kind === 'change' && row.to?.nodeId === 'article-intro')).toMatchObject({
    type: 'modified', from: { text: 'Article wording 0.' }, to: { text: 'Article wording 11.' },
  });
  expect(result.rows.filter(row => row.kind === 'change').some(row => row.from?.nodeId === 'temporary-note' || row.to?.nodeId === 'temporary-note')).toBe(false);
  expect(readRevisions.sort()).toEqual([revisions[0]!, revisions.at(-1)!].sort());
});

test('validates only required boundaries and never repairs a missing comparison during a read', async () => {
  const store = memoryStore();
  const service = createDocumentService(store, { track: 'remote', actorId: 'alice' });
  const document = await service.create({ slug: 'partial-path', title: 'Guide', language: 'en', visibility: 'public', settings: { compare: true } });
  for (const [versionTag, day] of [['1', 1], ['10', 2], ['2', 3]] as const) {
    const revision = await service.save({ documentId: document.id, title: document.title, nodes: [{ nodeKey: 'intro', rawText: `Edition ${versionTag}.` }] });
    const release = await service.publish({ documentId: document.id, revisionId: revision.id, versionTag });
    await store.putRelease({ ...release, publishedAt: new Date(Date.UTC(2026, 9, day)) });
  }
  await service.computeRelations({ documentId: document.id });
  const releases = (await store.releases(document.id)).sort((a, b) => a.publishedAt.getTime() - b.publishedAt.getTime());
  const boundaries = await store.adjacencies(document.id);
  const laterBoundary = boundaries.find(row => row.fromReleaseId === releases[1]!.id)!;
  await store.putAdjacency(laterBoundary, []);
  let writes = 0;
  const observed = { ...store,
    /** Read-only compare must not attempt background repair. */
    async putAdjacency(comparison: Parameters<typeof store.putAdjacency>[0], relations: Parameters<typeof store.putAdjacency>[1]) {
      writes++;
      return store.putAdjacency(comparison, relations);
    },
  };
  const comparison = createRawComparisonOperations(observed, { track: 'remote', actorId: 'alice' });
  await expect(comparison.compare({ slug: document.slug, fromVersionTag: '1', toVersionTag: '10' })).resolves.toBeDefined();
  await expect(comparison.compare({ slug: document.slug, fromVersionTag: '1', toVersionTag: '2' })).rejects.toThrow('relations');
  expect(writes).toBe(0);
  const middle = (await store.revision(releases[1]!.sourceRevisionId))!.nodes[0]!;
  expect(await store.nodeRelations({ comparisonIds: [laterBoundary.id], nodeIds: [middle.id] })).toEqual([]);
});

test('node history requires prepared relations and reads only the selected identity nodes', async () => {
  const store = memoryStore();
  const service = createDocumentService(store, { track: 'remote', actorId: 'alice' });
  const document = await service.create({ slug: 'prepared-node-history', title: 'Guide', language: 'en', visibility: 'public' });
  for (const [index, text] of ['Original paragraph.', 'Revised paragraph.', 'Final paragraph.'].entries()) {
    const revision = await service.save({ documentId: document.id, title:      'Guide', nodes:      [
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
  const second = await service.save({ documentId: document.id, title:      'Guide', nodes:      [
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

test('collapses a split followed by a merge into the actual endpoint change', async () => {
  const store = memoryStore();
  const service = createDocumentService(store, { track: 'remote', actorId: 'alice' });
  const document = await service.create({ slug: 'split-then-merge', title: 'Guide', language: 'en', visibility: 'public', settings: { compare: true } });
  const original = 'alpha beta gamma delta epsilon zeta eta theta';
  /** Save and publish one edition in the chosen formal order. */
  async function publish(versionTag: string, day: number, nodes: Parameters<typeof service.save>[0]['nodes']) {
    const revision = await service.save({ documentId: document.id, title: document.title, nodes });
    const release = await service.publish({ documentId: document.id, revisionId: revision.id, versionTag });
    await store.putRelease({ ...release, publishedAt: new Date(Date.UTC(2026, 9, day)) });
  }
  await publish('1', 1, [{ nodeKey: 'original', rawText: original }]);
  await publish('10', 2, [
    { nodeKey: 'chapter', kind: 'heading', rawText: 'Chapter' },
    { nodeKey: 'left', parentKey: 'chapter', rawText: 'alpha beta gamma delta epsilon' },
    { nodeKey: 'right', parentKey: 'chapter', rawText: 'delta epsilon zeta eta theta' },
  ]);
  await publish('2', 3, [{ nodeKey: 'recombined', rawText: original }]);
  const result = await createComparisonOperations(store, { track: 'remote', actorId: 'alice' }).compare({
    slug: document.slug, fromVersionTag: '1', toVersionTag: '2',
  });
  expect(result.rows.filter(row => row.kind === 'change').map(row => row.type)).toEqual(['renamed']);
  expect(result.rows.find(row => row.kind === 'change')).toMatchObject({
    from: { text: original }, to: { text: original },
  });
  expect(result.stats).toMatchObject({ split: 0, merged: 0, renamed: 1 });
});

test('collapses a merge followed by a split and keeps an intervening identity break', async () => {
  const store = memoryStore();
  const service = createDocumentService(store, { track: 'remote', actorId: 'alice' });
  const document = await service.create({ slug: 'merge-then-split', title: 'Guide', language: 'en', visibility: 'public', settings: { compare: true } });
  const left = 'alpha beta gamma delta epsilon';
  const right = 'delta epsilon zeta eta theta';
  /** Save and publish one edition in the chosen formal order. */
  async function publish(versionTag: string, day: number, nodes: Parameters<typeof service.save>[0]['nodes']) {
    const revision = await service.save({ documentId: document.id, title: document.title, nodes });
    const release = await service.publish({ documentId: document.id, revisionId: revision.id, versionTag });
    await store.putRelease({ ...release, publishedAt: new Date(Date.UTC(2026, 9, day)) });
  }
  const splitNodes = [
    { nodeKey: 'chapter', kind: 'heading' as const, rawText: 'Chapter' },
    { nodeKey: 'left', parentKey: 'chapter', rawText: left },
    { nodeKey: 'right', parentKey: 'chapter', rawText: right },
  ];
  await publish('1', 1, splitNodes);
  await publish('10', 2, [{ nodeKey: 'combined', rawText: 'alpha beta gamma delta epsilon zeta eta theta' }]);
  await publish('2', 3, splitNodes);
  const result = await createComparisonOperations(store, { track: 'remote', actorId: 'alice' }).compare({
    slug: document.slug, fromVersionTag: '1', toVersionTag: '2',
  });
  expect(result.rows.filter(row => row.kind === 'change').map(row => [row.type, row.from?.nodeId ?? null, row.to?.nodeId ?? null])).toEqual([
    ['added', null, 'chapter'], ['removed', 'chapter', null],
  ]);
  expect(result.stats).toMatchObject({ split: 0, merged: 0, modified: 0, added: 1, removed: 1 });
});

test('keeps an external branch in the endpoint relation group after a split and merge', async () => {
  const store = memoryStore();
  const service = createDocumentService(store, { track: 'remote', actorId: 'alice' });
  const document = await service.create({ slug: 'external-merge-branch', title: 'Guide', language: 'en', visibility: 'public', settings: { compare: true } });
  const original = 'alpha beta gamma delta epsilon zeta eta theta';
  const branch = 'red orange yellow green blue violet';
  const left = 'alpha beta gamma delta epsilon';
  const right = 'delta epsilon zeta eta theta';
  const merged = `${right} ${branch}`;
  /** Save and publish one edition in the chosen formal order. */
  async function publish(versionTag: string, day: number, nodes: Parameters<typeof service.save>[0]['nodes']) {
    const revision = await service.save({ documentId: document.id, title: document.title, nodes });
    const release = await service.publish({ documentId: document.id, revisionId: revision.id, versionTag });
    await store.putRelease({ ...release, publishedAt: new Date(Date.UTC(2026, 9, day)) });
  }
  await publish('1', 1, [{ nodeKey: 'original', rawText: original }, { nodeKey: 'branch', rawText: branch }]);
  await publish('10', 2, [
    { nodeKey: 'chapter', kind: 'heading', rawText: 'Chapter' },
    { nodeKey: 'left', parentKey: 'chapter', rawText: left },
    { nodeKey: 'right', parentKey: 'chapter', rawText: right },
    { nodeKey: 'branch', rawText: branch },
  ]);
  await publish('2', 3, [{ nodeKey: 'left', rawText: left }, { nodeKey: 'combined', rawText: merged }]);
  await service.computeRelations({ documentId: document.id });
  const releases = (await store.releases(document.id)).sort((a, b) => a.publishedAt.getTime() - b.publishedAt.getTime());
  const firstAdjacency = (await store.adjacencies(document.id)).find(row => row.fromReleaseId === releases[0]!.id)!;
  const secondAdjacency = (await store.adjacencies(document.id)).find(row => row.fromReleaseId === releases[1]!.id)!;
  const middleRevision = (await store.revision(releases[1]!.sourceRevisionId))!;
  const finalRevision = (await store.revision(releases[2]!.sourceRevisionId))!;
  const sourceRevision = (await store.revision(releases[0]!.sourceRevisionId))!;
  const firstRows = await store.nodeRelations({ comparisonIds: [firstAdjacency.id], nodeIds:       [
    ...sourceRevision.nodes.map(node => node.id), ...middleRevision.nodes.map(node => node.id),
  ] });
  /** Retain the middle edition's persisted identity for a source node key. */
  const identity = (nodeKey: string) => firstRows.find(row => row.side === 'to'
    && middleRevision.nodes.find(node => node.id === row.nodeId)?.nodeKey === nodeKey)?.identity;
  /** Describe one exact participant in the prepared second boundary. */
  function participant(groupId: string, kind: 'unchanged' | 'moved' | 'merged' | 'removed', side: 'from' | 'to', node: typeof middleRevision.nodes[number] | typeof finalRevision.nodes[number], nodeIdentity: string, position: number) {
    return { comparisonId: secondAdjacency.id, groupId, kind, side, nodeId: node.id, identity: nodeIdentity, itemId: node.nodeKey, position };
  }
  await store.putAdjacency(secondAdjacency, [
    participant('left', 'moved', 'from', middleRevision.nodes.find(node => node.nodeKey === 'left')!, identity('left')!, 0),
    participant('left', 'moved', 'to', finalRevision.nodes.find(node => node.nodeKey === 'left')!, identity('left')!, 0),
    participant('merge', 'merged', 'from', middleRevision.nodes.find(node => node.nodeKey === 'right')!, identity('right')!, 0),
    participant('merge', 'merged', 'from', middleRevision.nodes.find(node => node.nodeKey === 'branch')!, identity('branch')!, 1),
    participant('merge', 'merged', 'to', finalRevision.nodes.find(node => node.nodeKey === 'combined')!, finalRevision.nodes.find(node => node.nodeKey === 'combined')!.id, 0),
    participant('chapter', 'removed', 'from', middleRevision.nodes.find(node => node.nodeKey === 'chapter')!, identity('chapter')!, 0),
  ]);
  const result = await createRawComparisonOperations(store, { track: 'remote', actorId: 'alice' }).compare({
    slug: document.slug, fromVersionTag: '1', toVersionTag: '2',
  });
  const row = result.rows.find(row => row.kind === 'change' && row.fromNodes?.length === 2);
  expect(row).toMatchObject({ kind: 'change', type: 'modified' });
  expect(row?.kind === 'change' && row.fromNodes?.map(node => node.text)).toEqual([original, branch]);
  expect(row?.kind === 'change' && row.toNodes?.map(node => node.text)).toEqual([left, merged]);
  expect(result.stats).toMatchObject({ split: 0, merged: 0, modified: 1 });
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
  let unauthorizedBodyReads = 0;
  let unauthorizedRelationReads = 0;
  const observed = { ...store,
    /** Private comparison access must fail before reading any saved body. */
    async revision(id: string) {
      unauthorizedBodyReads++;
      return store.revision(id);
    },
    /** Private comparison access must fail before examining relation identities. */
    async nodeRelations(query: Parameters<typeof store.nodeRelations>[0]) {
      unauthorizedRelationReads++;
      return store.nodeRelations(query);
    },
  };
  await expect(createRawComparisonOperations(observed, { track: 'remote' }).compare({
    slug: document.slug, fromVersionTag: '1', toVersionTag: '1',
  })).rejects.toThrow('not found');
  expect(unauthorizedBodyReads).toBe(0);
  expect(unauthorizedRelationReads).toBe(0);
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
  const split = await owner.save({ documentId: document.id, title:      'Guide', nodes:      [
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
    const translated = await translations.saveTranslation({ documentId:       'magic-cr', sourceRevisionId: source.id, language:         'zhs',
      nodes:            [{ sourceNodeId: source.nodes.find(node => node.anchor === '100.1')!.id, rawText: text, translationMethod: 'human' }] });
    await translations.selectTranslation({ documentId: 'magic-cr', releaseId: edition.releaseId, revisionId: translated.id });
  }
  const comparison = createComparisonOperations(store, { track: 'local' });
  const result = await comparison.compare({ slug: 'magic-cr', fromVersionTag: '20261001', toVersionTag: '20261101', locale: 'zhs' });
  expect(result.rows.find(row => row.kind === 'change' && row.from?.nodeId === '100.1')).toMatchObject({
    type:            'modified', translationOnly: true,
    from:            { text: '支付 {W} 后继续。', localeState: { locale: 'zhs', isFallback: false } },
    to:              { text: '支付 {W} 以继续。', localeState: { locale: 'zhs', isFallback: false } },
    textDiff:        { blocks: [{ type: 'common', text: '支付 {W} ' }, { type: 'removed', text: '后' }, { type: 'added', text: '以' }, { type: 'common', text: '继续。' }] },
  });
  expect((await comparison.compare({ slug: 'magic-cr', fromVersionTag: '20261001', toVersionTag: '20261101', locale: 'en' })).rows.filter(row => row.kind === 'change')).toHaveLength(0);
});

/** Select a minimal translation through the same operations used by import. */
async function selectChinese(store: ReturnType<typeof memoryStore>, edition: { revisionId: string, releaseId: string }, text: string, anchor = '100.1') {
  const source = (await store.revision(edition.revisionId))!;
  const translations = createTranslationOperations(store, { track: 'local' });
  const revision = await translations.saveTranslation({ documentId:       'magic-cr', sourceRevisionId: source.id, language:         'zhs',
    nodes:            [{ sourceNodeId: source.nodes.find(node => node.anchor === anchor)!.id, rawText: text, translationMethod: 'human' }] });
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
    from:            { text: '支付 {W} 以继续。', localeState: { isFallback: false } },
    to:              { text: 'Pay {U} to continue.', localeState: { locale: 'en', isFallback: true } } });
  await selectChinese(store, second, '支付 {U} 以继续。');
  const source = (await store.revision(second.revisionId))!;
  await createTranslationOperations(store, { track: 'local' }).saveTranslation({ documentId:       'magic-cr', sourceRevisionId: source.id, language:         'zhs',
    nodes:            [{ sourceNodeId: source.nodes.find(node => node.anchor === '100.1')!.id, rawText: '未选择的秘密译文', translationMethod: 'human' }] });
  const translated = await comparison.compare(input);
  expect(translated.rows.find(row => row.kind === 'change' && row.from?.nodeId === '100.1')).toMatchObject({ translationOnly: false,
    to:              { text: '支付 {U} 以继续。', localeState: { isFallback: false } } });
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
  const second = await service.save({ documentId: document.id, title:      'Guide', nodes:      [
    { nodeKey: 'chapter', kind: 'heading', rawText: 'Chapter' },
    { nodeKey: 'left', parentKey: 'chapter', rawText: 'alpha beta gamma delta epsilon' },
    { nodeKey: 'right', parentKey: 'chapter', rawText: 'delta epsilon zeta eta theta' },
  ] });
  const to = await service.publish({ documentId: document.id, revisionId: second.id, versionTag: '2' });
  for (const [source, release, texts] of [[first, from, ['原先合在一起的规则。']], [second, to, ['章节', '第一段独立表述。', '第二段另一表述。']]] as const) {
    const translation = await translations.saveTranslation({ documentId:       document.id, sourceRevisionId: source.id, language:         'zhs',
      nodes:            source.nodes.map((node, index) => ({ sourceNodeId: node.id, rawText: texts[index]!, translationMethod: 'human' })) });
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
  expect(rows.find(row => row.to?.nodeId === '200.1')).toMatchObject({ type:     'moved', from:     { nodeId: '100.1' }, textDiff: { blocks: [
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
