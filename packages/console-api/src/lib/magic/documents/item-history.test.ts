import { expect, test } from 'bun:test';

import { documentSettings } from '@tcg-cards/model/magic/schema/document-content';
import type { DocumentItemHistoryRow } from '@tcg-cards/model/magic/schema/document-page';

import { createDocumentService } from './service';
import { memoryStore } from './testing';
import { createTranslationOperations } from './translations';
import { createItemHistoryOperations, threeWayTextDiff } from './item-history';

/** Builds a small CR fixture; `rule1001` is the entry whose history is followed. */
function cr(date: string, rule1001: string | null) {
  return `Magic: The Gathering Comprehensive Rules

These rules are effective as of ${date}.

Introduction

Example.

Contents

Credits

1. Game Concepts

100. General

100.2. Example rule.
${rule1001 == null ? '' : `\n100.1. ${rule1001}\n`}`;
}

/** Explicitly prepare formal source relations before reading public history. */
async function publishedHistory(store: Awaited<ReturnType<typeof memoryStore>>) {
  const document = (await store.documents()).find(row => row.slug === 'magic-cr')!;
  await store.putDocument({ ...document, settings: documentSettings.parse({ outline: true, compare: true, historyPublic: true }) });
  await createDocumentService(store, { track: 'local' }).computeRelations({ documentId: document.id });
  return createItemHistoryOperations(store, { track: 'remote' });
}

const periods = (rows: DocumentItemHistoryRow[]) => rows.filter((row): row is Extract<DocumentItemHistoryRow, { kind: 'period' }> => row.kind === 'period');

test('groups unchanged editions into periods and highlights the wording change in both directions', async () => {
  const store = memoryStore();
  const service = createDocumentService(store, { track: 'local' });
  await service.importCr({ content: cr('October 1, 2026', 'Pay {W} to continue.') });
  await service.importCr({ content: cr('November 1, 2026', 'Pay {U} to continue.') });
  await service.importCr({ content: cr('December 1, 2026', 'Pay {U} to continue.') });
  const history = await publishedHistory(store);
  const page = await history.itemHistory({ slug: 'magic-cr', itemId: '100.1', locale: 'en' });

  expect(page.entry.serial).toBe('100.1.');
  expect(page.entry.firstDate).toBe('2026-10-01');
  expect(page.entry.lastDate).toBe(null);
  expect(page.entry.periodCount).toBe(2);
  const [first, second] = periods(page.rows);
  expect(first!.versionFrom).toBe('20261001');
  expect(first!.versionTo).toBe('20261001');
  expect(first!.cells[0]!.state).toBe(null);
  expect(second!.dateTo).toBe(null);
  expect(second!.cells[0]!.text).toBe('Pay {U} to continue.');
  expect(first!.cells[0]!.diff?.some(span => span.type === 'remove' && span.value.includes('{W}'))).toBe(true);
  expect(second!.cells[0]!.diff?.some(span => span.type === 'add' && span.value.includes('{U}'))).toBe(true);
  expect(page.rows.at(-1)).toBe(second);
});

test('keeps a renumbered entry continuous and marks the number change without faking a text change', async () => {
  const store = memoryStore();
  const service = createDocumentService(store, { track: 'local' });
  await service.importCr({ content: cr('October 1, 2026', 'Pay {W} to continue.') });
  await service.importCr({ content: cr('November 1, 2026', 'Pay {W} to continue.').replace('100.1.', '100.4.') });
  const history = await publishedHistory(store);
  const page = await history.itemHistory({ slug: 'magic-cr', itemId: '100.1', locale: 'en' });

  const [first, second] = periods(page.rows);
  expect(second!.cells[0]!.serial).toBe('100.4.');
  expect(second!.cells[0]!.renamedFrom).toBe('100.1.');
  expect(second!.cells[0]!.changed).toBe(false);
  expect(second!.cells[0]!.diff?.every(span => span.type === 'common')).toBe(true);
  expect(first!.cells[0]!.renamedFrom).toBe(null);
});

test('marks an entry that enters and later leaves the published editions', async () => {
  const store = memoryStore();
  const service = createDocumentService(store, { track: 'local' });
  await service.importCr({ content: cr('October 1, 2026', null) });
  const second = await service.importCr({ content: cr('November 1, 2026', 'Pay {W} to continue.') });
  await service.importCr({ content: cr('December 1, 2026', 'Pay {U} to continue.') });
  await service.importCr({ content: cr('January 1, 2027', null) });
  const revision = await store.revision(second.revisionId);
  const itemId = revision!.nodes.find(node => node.anchor === '100.1')!.nodeKey;
  const history = await publishedHistory(store);
  const page = await history.itemHistory({ slug: 'magic-cr', itemId, locale: 'en' });

  expect(page.entry.firstDate).toBe('2026-11-01');
  expect(page.entry.lastDate).toBe('2026-12-01');
  const [born, changed] = periods(page.rows);
  expect(born!.dateFrom).toBe('2026-11-01');
  expect(born!.cells[0]!.state).toBe('added');
  expect(changed!.cells[0]!.diff?.some(span => span.type === 'add' && span.value.includes('{U}'))).toBe(true);
  expect(page.rows.at(-1)).toEqual({ kind: 'event', event: { kind: 'removed', date: '2027-01-01', from: [{ itemId, serial: '100.1.' }], to: [] } });
});

test('follows the reading language with an English fallback and no cross-language highlighting', async () => {
  const store = memoryStore();
  const service = createDocumentService(store, { track: 'local' });
  const first = await service.importCr({ content: cr('October 1, 2026', 'Pay {W} to continue.') });
  const second = await service.importCr({ content: cr('November 1, 2026', 'Pay {U} to continue.') });
  const operations = createTranslationOperations(store, { track: 'local' });
  const revision = await operations.saveTranslation({
    documentId:       'magic-cr', sourceRevisionId: second.revisionId, language:         'zh-CN',
    nodes:            [{ sourceNodeId: (await store.revision(second.revisionId))!.nodes.find(node => node.anchor === '100.1')!.id, rawText: '支付 {U}。', translationMethod: 'machine' }],
  });
  await operations.selectTranslation({ documentId: 'magic-cr', releaseId: second.releaseId, revisionId: revision.id });
  void first;
  const history = await publishedHistory(store);
  const localized = await history.itemHistory({ slug: 'magic-cr', itemId: '100.1', locale: 'zh-CN' });

  const [en, zh] = periods(localized.rows);
  expect(en!.cells[0]!.lang).toBe('en');
  expect(en!.cells[0]!.isFallback).toBe(true);
  expect(zh!.cells[0]!.lang).toBe('zh-CN');
  expect(zh!.cells[0]!.isFallback).toBe(false);
  expect(zh!.cells[0]!.text).toBe('支付 {U}。');
  expect(zh!.cells[0]!.diff?.every(span => span.type === 'common')).toBe(true);
  expect(en!.cells[0]!.diff?.every(span => span.type === 'common')).toBe(true);
});

test('is hidden behind the publication gate on the remote track and open on the local track', async () => {
  const store = memoryStore();
  const service = createDocumentService(store, { track: 'local' });
  await service.importCr({ content: cr('October 1, 2026', 'Pay {W} to continue.') });
  const document = (await store.documents()).find(row => row.slug === 'magic-cr')!;
  await store.putDocument({ ...document, settings: documentSettings.parse({ outline: true, compare: true, historyPublic: false }) });
  await expect(createItemHistoryOperations(store, { track: 'remote' }).itemHistory({ slug: 'magic-cr', itemId: '100.1', locale: 'en' })).rejects.toThrow('Document not found');
  await expect(createItemHistoryOperations(store, { track: 'local' }).itemHistory({ slug: 'magic-cr', itemId: '100.1', locale: 'en' })).resolves.toMatchObject({ entry: { itemId: '100.1' } });
  await store.putDocument({ ...document, settings: documentSettings.parse({ outline: true, compare: true, historyPublic: true }) });
  await expect(createItemHistoryOperations(store, { track: 'remote' }).itemHistory({ slug: 'magic-cr', itemId: '100.1', locale: 'en' })).resolves.toMatchObject({ entry: { itemId: '100.1' } });
});

test('keeps game symbols atomic and highlights an edit against both neighbours', () => {
  const spans = threeWayTextDiff('Pay {W} now.', 'Pay {U} now.', 'Pay {U} later.');
  expect(spans.some(span => span.type === 'add' && span.value.includes('{U}'))).toBe(true);
  expect(spans.some(span => span.type === 'remove' && span.value.includes('now'))).toBe(true);
  expect(spans.every(span => span.value.length > 0)).toBe(true);
  expect(threeWayTextDiff(null, 'unchanged text', null).every(span => span.type === 'common')).toBe(true);
});

test('opens the same complete split lineage from either side and repeats unchanged siblings', async () => {
  const store = memoryStore();
  const owner = createDocumentService(store, { track: 'remote', actorId: 'alice' });
  const document = await owner.create({ slug: 'split-history', title: 'Guide', language: 'en', visibility: 'public', settings: { compare: true, historyPublic: true } });
  const original = await owner.save({ documentId: document.id, title: 'Guide', nodes: [{ nodeKey: 'original', rawText: 'alpha beta gamma delta epsilon zeta eta theta' }] });
  await owner.publish({ documentId: document.id, revisionId: original.id, versionTag: '1' });
  const children = [
    { nodeKey: 'chapter', kind: 'heading' as const, rawText: 'Chapter' },
    { nodeKey: 'left', parentKey: 'chapter', rawText: 'alpha beta gamma delta epsilon' },
    { nodeKey: 'right', parentKey: 'chapter', rawText: 'delta epsilon zeta eta theta' },
  ];
  const split = await owner.save({ documentId: document.id, title: 'Guide', nodes: children });
  await owner.publish({ documentId: document.id, revisionId: split.id, versionTag: '2' });
  const edited = await owner.save({ documentId: document.id, title: 'Guide', nodes: children.map(node => node.nodeKey === 'left' ? { ...node, rawText: `${node.rawText} iota` } : node) });
  await owner.publish({ documentId: document.id, revisionId: edited.id, versionTag: '3' });
  await owner.computeRelations({ documentId: document.id });
  const history = createItemHistoryOperations(store, { track: 'remote' });
  const parent = await history.itemHistory({ slug: document.slug, itemId: 'original', locale: 'en' });
  const child = await history.itemHistory({ slug: document.slug, itemId: 'left', locale: 'en' });
  expect(parent.rows).toEqual(child.rows);
  expect(parent.entry.lineageCount).toBe(3);
  expect(parent.rows.some(row => row.kind === 'event' && row.event.kind === 'split' && row.event.to.length === 2)).toBe(true);
  const rows = periods(parent.rows);
  expect(rows.map(row => row.cells.length)).toEqual([1, 2, 2]);
  expect(rows[1]!.cells.every(cell => cell.state === 'split')).toBe(true);
  expect(rows[2]!.cells.find(cell => cell.itemId === 'right')?.changed).toBe(false);
});

test('shows every merge source immediately before the merge without importing external earlier history', async () => {
  const store = memoryStore();
  const owner = createDocumentService(store, { track: 'remote', actorId: 'alice' });
  const document = await owner.create({ slug: 'merge-history', title: 'Guide', language: 'en', visibility: 'public', settings: { compare: true, historyPublic: true } });
  const children = [
    { nodeKey: 'chapter', kind: 'heading' as const, rawText: 'Chapter' },
    { nodeKey: 'left', parentKey: 'chapter', rawText: 'alpha beta gamma delta epsilon' },
    { nodeKey: 'right', parentKey: 'chapter', rawText: 'delta epsilon zeta eta theta' },
  ];
  const earlier = await owner.save({ documentId: document.id, title: 'Guide', nodes: children.map(node => node.nodeKey === 'right' ? { ...node, rawText: 'Earlier unrelated wording.' } : node) });
  await owner.publish({ documentId: document.id, revisionId: earlier.id, versionTag: '1' });
  const sources = await owner.save({ documentId: document.id, title: 'Guide', nodes: children });
  await owner.publish({ documentId: document.id, revisionId: sources.id, versionTag: '2' });
  const merged = await owner.save({ documentId: document.id, title: 'Guide', nodes: [{ nodeKey: 'combined', rawText: 'alpha beta gamma delta epsilon zeta eta theta' }] });
  await owner.publish({ documentId: document.id, revisionId: merged.id, versionTag: '3' });
  await owner.computeRelations({ documentId: document.id });
  const history = createItemHistoryOperations(store, { track: 'remote' });
  const source = await history.itemHistory({ slug: document.slug, itemId: 'left', locale: 'en' });
  expect(source.entry.lineageCount).toBe(2);
  expect(periods(source.rows).at(-1)?.cells[0]?.itemId).toBe('combined');
  expect(source.rows.some(row => row.kind === 'event' && row.event.kind === 'removed')).toBe(false);
  expect(source.rows.some(row => row.kind === 'event' && row.event.kind === 'merged' && row.event.from.length === 2 && row.event.versionTo === '3')).toBe(true);
  const target = await history.itemHistory({ slug: document.slug, itemId: 'combined', locale: 'en' });
  expect(target.entry.lineageCount).toBe(1);
  expect(periods(target.rows).map(row => row.versionFrom)).toEqual(['2', '3']);
  const before = periods(target.rows)[0]!;
  expect(before.cells.map(cell => cell.text)).toEqual(children.slice(1).map(node => node.rawText));
  expect(before.cells.every(cell => cell.state === 'merged' && cell.isSnapshot)).toBe(true);
  expect(JSON.stringify(target)).not.toContain('Earlier unrelated wording.');
});

test('replays multiple split and merge rounds across the complete entry history', async () => {
  const store = memoryStore();
  const owner = createDocumentService(store, { track: 'remote', actorId: 'alice' });
  const document = await owner.create({ slug: 'multi-round-history', title: 'Guide', language: 'en', visibility: 'public', settings: { historyPublic: true } });
  const originalText = 'alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu nu xi omicron pi rho sigma';
  const rightText = 'theta iota kappa lambda mu nu xi omicron pi rho';
  const editions = [
    [{ nodeKey: 'original', rawText: originalText }],
    [
      { nodeKey: 'chapter', kind: 'heading' as const, rawText: 'Chapter' },
      { nodeKey: 'left', parentKey: 'chapter', rawText: 'alpha beta gamma delta epsilon zeta eta theta iota' },
      { nodeKey: 'right', parentKey: 'chapter', rawText: rightText },
    ],
    [
      { nodeKey: 'chapter', kind: 'heading' as const, rawText: 'Chapter' },
      { nodeKey: 'subchapter', kind: 'heading' as const, parentKey: 'chapter', rawText: 'Subchapter' },
      { nodeKey: 'left', parentKey: 'chapter', rawText: 'alpha beta gamma delta epsilon zeta eta theta iota' },
      { nodeKey: 'right-top', parentKey: 'subchapter', rawText: 'theta iota kappa lambda mu nu' },
      { nodeKey: 'right-bottom', parentKey: 'subchapter', rawText: 'mu nu xi omicron pi rho' },
    ],
    [
      { nodeKey: 'chapter', kind: 'heading' as const, rawText: 'Chapter' },
      { nodeKey: 'left', parentKey: 'chapter', rawText: 'alpha beta gamma delta epsilon zeta eta theta iota' },
      { nodeKey: 'right-again', parentKey: 'chapter', rawText: rightText },
    ],
    [{ nodeKey: 'combined', rawText: originalText }],
  ];
  for (const [index, nodes] of editions.entries()) {
    const revision = await owner.save({ documentId: document.id, title: 'Guide', nodes });
    const release = await owner.publish({ documentId: document.id, revisionId: revision.id, versionTag: String(index + 1) });
    await store.putRelease({ ...release, publishedAt: new Date(Date.UTC(2026, 9, index + 1)) });
  }
  await owner.computeRelations({ documentId: document.id });
  const page = await createItemHistoryOperations(store, { track: 'remote' }).itemHistory({
    slug: document.slug, itemId: 'original', locale: 'en',
  });
  const events = page.rows.filter(row => row.kind === 'event').map(row => row.kind === 'event' ? row.event.kind : null);
  expect(events).toEqual(['split', 'split', 'merged', 'merged']);
  expect(periods(page.rows).map(row => row.versionFrom)).toEqual(['1', '2', '3', '4', '5']);
  expect(periods(page.rows).map(row => row.cells.length)).toEqual([1, 2, 3, 2, 1]);
  expect(periods(page.rows).at(-1)?.cells[0]?.itemId).toBe('combined');
});

test('prepares the same public history when formal releases arrive in reverse order', async () => {
  const editions = [
    { versionTag: '1', nodes: [{ nodeKey: 'original', rawText: 'alpha beta gamma delta epsilon zeta eta theta' }] },
    { versionTag: '2', nodes:      [
      { nodeKey: 'chapter', kind: 'heading' as const, rawText: 'Chapter' },
      { nodeKey: 'left', parentKey: 'chapter', rawText: 'alpha beta gamma delta epsilon' },
      { nodeKey: 'right', parentKey: 'chapter', rawText: 'delta epsilon zeta eta theta' },
    ] },
    { versionTag: '3', nodes:      [
      { nodeKey: 'chapter', kind: 'heading' as const, rawText: 'Chapter' },
      { nodeKey: 'left', parentKey: 'chapter', rawText: 'alpha beta gamma delta epsilon iota' },
      { nodeKey: 'right', parentKey: 'chapter', rawText: 'delta epsilon zeta eta theta' },
    ] },
  ];
  /** Builds one public history after importing and preparing releases in the given order. */
  async function prepare(order: number[], slug: string) {
    const store = memoryStore();
    const owner = createDocumentService(store, { track: 'remote', actorId: 'alice' });
    const document = await owner.create({ slug, title: 'Guide', language: 'en', visibility: 'public', settings: { historyPublic: true } });
    for (const index of order) {
      const edition = editions[index]!;
      const revision = await owner.save({ documentId: document.id, title: 'Guide', nodes: edition.nodes });
      const release = await owner.publish({ documentId: document.id, revisionId: revision.id, versionTag: edition.versionTag });
      await store.putRelease({ ...release, publishedAt: new Date(Date.UTC(2026, 9, Number(edition.versionTag))) });
    }
    await owner.computeRelations({ documentId: document.id });
    return createItemHistoryOperations(store, { track: 'remote' }).itemHistory({ slug, itemId: 'original', locale: 'en' });
  }
  const chronological = await prepare([0, 1, 2], 'chronological-import');
  const reverse = await prepare([2, 1, 0], 'reverse-import');
  expect(reverse.entry).toEqual(chronological.entry);
  expect(reverse.rows).toEqual(chronological.rows);
});

test('does not reconnect an imported key reused after an entry disappeared', async () => {
  const store = memoryStore();
  const owner = createDocumentService(store, { track: 'remote', actorId: 'alice' });
  const document = await owner.create({ slug: 'reused-history', title: 'Guide', language: 'en', visibility: 'public', settings: { historyPublic: true } });
  const old = await owner.save({ documentId: document.id, title: 'Guide', nodes: [{ nodeKey: 'reused', rawText: 'Old rule about losing the game.' }] });
  await owner.publish({ documentId: document.id, revisionId: old.id, versionTag: '1' });
  const absent = await owner.save({ documentId: document.id, title: 'Guide', nodes: [] });
  await owner.publish({ documentId: document.id, revisionId: absent.id, versionTag: '2' });
  const fresh = await owner.save({ documentId: document.id, title: 'Guide', nodes: [{ nodeKey: 'reused', rawText: 'Unrelated new definition of player.' }] });
  await owner.publish({ documentId: document.id, revisionId: fresh.id, versionTag: '3' });
  await owner.computeRelations({ documentId: document.id });
  const history = createItemHistoryOperations(store, { track: 'remote' });
  const current = await history.itemHistory({ slug: document.slug, itemId: 'reused', locale: 'en' });
  expect(periods(current.rows).map(row => row.versionFrom)).toEqual(['3']);
  const previous = await history.itemHistory({ slug: document.slug, itemId: old.nodes[0]!.id, locale: 'en' });
  expect(periods(previous.rows).map(row => row.versionFrom)).toEqual(['1']);
  expect(JSON.stringify(previous)).not.toContain('Unrelated new definition');
  const fromOldReader = await history.itemHistory({ slug: document.slug, itemId: 'reused', versionTag: '1', locale: 'en' });
  expect(fromOldReader.rows).toEqual(previous.rows);
  await expect(history.itemHistory({ slug: document.slug, itemId: 'reused', versionTag: '2', locale: 'en' })).rejects.toThrow('Item not found');
});
