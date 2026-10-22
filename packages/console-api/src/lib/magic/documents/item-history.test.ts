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

async function publishedHistory(store: Awaited<ReturnType<typeof memoryStore>>) {
  const document = (await store.documents()).find(row => row.slug === 'magic-cr')!;
  await store.putDocument({ ...document, settings: documentSettings.parse({ outline: true, compare: true, historyPublic: true }) });
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
  const [born, changed, gone] = periods(page.rows);
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
    documentId: 'magic-cr', sourceRevisionId: second.revisionId, language: 'zh-CN',
    nodes: [{ sourceNodeId: (await store.revision(second.revisionId))!.nodes.find(node => node.anchor === '100.1')!.id, rawText: '支付 {U}。', translationMethod: 'machine' }],
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
  const remote = createItemHistoryOperations(store, { track: 'remote' });
  await expect(remote.itemHistory({ slug: 'magic-cr', itemId: '100.1', locale: 'en' })).rejects.toThrow('Document not found');
  const document = (await store.documents()).find(row => row.slug === 'magic-cr')!;
  await store.putDocument({ ...document, settings: documentSettings.parse({ outline: true, compare: true, historyPublic: true }) });
  await expect(remote.itemHistory({ slug: 'magic-cr', itemId: '100.1', locale: 'en' })).resolves.toMatchObject({ entry: { itemId: '100.1' } });
});

test('keeps game symbols atomic and highlights an edit against both neighbours', () => {
  const spans = threeWayTextDiff('Pay {W} now.', 'Pay {U} now.', 'Pay {U} later.');
  expect(spans.some(span => span.type === 'add' && span.value.includes('{U}'))).toBe(true);
  expect(spans.some(span => span.type === 'remove' && span.value.includes('now'))).toBe(true);
  expect(spans.every(span => span.value.length > 0)).toBe(true);
  expect(threeWayTextDiff(null, 'unchanged text', null).every(span => span.type === 'common')).toBe(true);
});
