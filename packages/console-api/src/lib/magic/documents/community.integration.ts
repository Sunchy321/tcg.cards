import { expect, test } from 'bun:test';
import { sql } from 'drizzle-orm';

import { createDb, runWithDb } from '@tcg-cards/db/db';
import { createDocumentStore } from './database';
import { createDocumentService } from './service';
import { publishDocument } from './publish';
import { compareVersions } from './reviewer';
import { createComparisonOperations } from './comparison';
import { createTranslationOperations } from './translations';
import { documentDiffPage } from '@tcg-cards/model/magic/schema/document-page';
import { communitySource, communityTranslation } from './community.fixture';

const localUrl = process.env.DOCUMENT_TEST_LOCAL_URL;
const remoteUrl = process.env.DOCUMENT_TEST_REMOTE_URL;

// Recreate a persisted parser defect without changing the retained source file or release identity.
test.skipIf(!localUrl || !remoteUrl)('manual reimport replaces public parsing atomically and republishes without editing revisions', async () => {
  const local = createDb(localUrl!);
  const remote = createDb(remoteUrl!);
  try {
    const store = createDocumentStore(local, 'local');
    const target = createDocumentStore(remote, 'remote');
    const documents = createDocumentService(store, { track: 'local' });
    const content = 'Magic: The Gathering Comprehensive Rules\n\nThese rules are effective as of October 20, 2026.\n\nIntroduction\n\nAn official TXT regression.\n\nContents\n\nCredits\n\n1. Game Concepts\n\n100. General\n\n100.1. Pay {W}.\n\n100.2. Keep playing.\n';
    const imported = await documents.importCr({ content });
    await local.execute(sql`DELETE FROM magic.document_revision_nodes WHERE revision_id = ${imported.revisionId} AND anchor = '100.2'`);
    await local.execute(sql`UPDATE magic.document_revision_nodes SET raw_text = 'Pay {W}.\n\n100.2. Keep playing.' WHERE revision_id = ${imported.revisionId} AND anchor = '100.1'`);
    await publishDocument(store, target, 'magic-cr');
    const revisions = await documents.revisions('magic-cr');
    await local.execute(sql`CREATE FUNCTION magic.cr_reparse_test_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Parsing unavailable'; END $$`);
    await local.execute(sql`CREATE TRIGGER cr_reparse_test_failure BEFORE INSERT ON magic.document_revision_nodes FOR EACH ROW WHEN (NEW.anchor = '100.2') EXECUTE FUNCTION magic.cr_reparse_test_failure()`);
    try {
      await expect(documents.importCr({ content })).rejects.toThrow();
      expect((await documents.read({ slug: 'magic-cr', versionTag: '20261020' })).sections.some(node => node.nodeId === '100.2')).toBe(false);
    } finally {
      await local.execute(sql`DROP TRIGGER cr_reparse_test_failure ON magic.document_revision_nodes`);
      await local.execute(sql`DROP FUNCTION magic.cr_reparse_test_failure()`);
    }
    expect((await documents.importCr({ content })).revisionId).toBe(imported.revisionId);
    expect(await documents.revisions('magic-cr')).toEqual(revisions);
    await publishDocument(store, target, 'magic-cr', { dryRun: true });
    const reader = createDocumentService(target, { track: 'remote' });
    expect((await reader.read({ slug: 'magic-cr', versionTag: '20261020' })).sections.some(node => node.nodeId === '100.2')).toBe(false);
    await publishDocument(store, target, 'magic-cr');
    expect((await reader.read({ slug: 'magic-cr', versionTag: '20261020' })).sections.find(node => node.nodeId === '100.2')?.text).toBe('Keep playing.');
    expect(await documents.importCr({ content })).toMatchObject({ revisionId: imported.revisionId, totalNodes: imported.totalNodes });
  } finally {
    await Promise.all([local.$client.end({ timeout: 1 }), remote.$client.end({ timeout: 1 })]);
  }
}, 30000);

// Only explicitly prepared test databases are used; application configuration is never read.
test.skipIf(!localUrl || !remoteUrl)('atomically imports a paired human translation and publishes it with PostgreSQL references', async () => {
  const local = createDb(localUrl!);
  const remote = createDb(remoteUrl!);
  try {
    const store = createDocumentStore(local, 'local');
    const documents = createDocumentService(store, { track: 'local' });
    const imported = await documents.importCr({ content: communitySource });
    const previous = await documents.revisions('magic-cr');
    const previousBindings = await store.releaseTranslations(imported.releaseId);
    // Force failure after the translation nodes have been inserted, at the release-selection boundary.
    await local.execute(sql`CREATE FUNCTION magic.cr_translation_test_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Translation selection unavailable'; END $$`);
    await local.execute(sql`CREATE TRIGGER cr_translation_test_failure BEFORE INSERT OR UPDATE ON magic.document_release_translations FOR EACH ROW EXECUTE FUNCTION magic.cr_translation_test_failure()`);
    try {
      await expect(documents.importCrTranslation({ versionTag: '20260925', content: communityTranslation })).rejects.toThrow();
      expect(await documents.revisions('magic-cr')).toEqual(previous);
      expect(await store.releaseTranslations(imported.releaseId)).toEqual(previousBindings);
    } finally {
      await local.execute(sql`DROP TRIGGER cr_translation_test_failure ON magic.document_release_translations`);
      await local.execute(sql`DROP FUNCTION magic.cr_translation_test_failure()`);
    }
    const translated = await documents.importCrTranslation({ versionTag: '20260925', content: communityTranslation });
    expect((await store.revision(translated.revisionId))?.nodes.every(node => node.sourceRevisionId === imported.revisionId && node.translationMethod === 'human')).toBe(true);
    await publishDocument(store, createDocumentStore(remote, 'remote'), 'magic-cr');
    const reader = createDocumentService(createDocumentStore(remote, 'remote'), { track: 'remote' });
    const page = await reader.read({ slug: 'magic-cr', versionTag: '20260925', locale: 'zhs' });
    expect(page.sections.find(node => node.nodeId === '100.1')).toMatchObject({ text: '支付 {W}。参见规则100.2。', reviewStatus: 'unreviewed' });
    expect(page.sections.find(node => node.nodeId === '100.3')?.localeState.isFallback).toBe(true);
    const changed = { ...communityTranslation, version: '20260807' };
    await expect(documents.importCrTranslation({ versionTag: '20260925', content: changed })).rejects.toThrow('版本');
    expect((await store.releaseTranslations(imported.releaseId))[0]?.revisionId).toBe(translated.revisionId);
  } finally {
    await Promise.all([local.$client.end({ timeout: 1 }), remote.$client.end({ timeout: 1 })]);
  }
}, 30000);

// Comparison must read and cache under the same lock used to replace public parsing.
test.skipIf(!localUrl || !remoteUrl)('comparison waits for an in-flight public source reparse', async () => {
  const local = createDb(localUrl!);
  const remote = createDb(remoteUrl!);
  try {
    const source = createDocumentStore(local, 'local');
    const documents = createDocumentService(source, { track: 'local' });
    const content = (day: number) => `Magic: The Gathering Comprehensive Rules\n\nThese rules are effective as of October ${day}, 2026.\n\nIntroduction\n\nConcurrency regression.\n\nContents\n\nCredits\n\n1. Game Concepts\n\n100. General\n\n100.1. Day ${day}.\n`;
    const from = await documents.importCr({ content: content(21) });
    const to = await documents.importCr({ content: content(22) });
    await publishDocument(source, createDocumentStore(remote, 'remote'), 'magic-cr');
    let waiting = false;
    let comparison: ReturnType<typeof compareVersions> | undefined;
    await remote.transaction(async tx => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('magic-document:magic-cr'))`);
      let settled = false;
      comparison = runWithDb(remote, () => compareVersions({ documentId: 'magic-cr', fromVersionId: from.releaseId, toVersionId: to.releaseId }));
      const markSettled = () => {
        settled = true;
      };
      void comparison.then(markSettled, markSettled);
      const deadline = Date.now() + 2000;
      while (!settled && !waiting && Date.now() < deadline) {
        await tx.execute(sql`SELECT pg_stat_clear_snapshot()`);
        const result = await tx.execute(sql`SELECT EXISTS (SELECT 1 FROM pg_stat_activity WHERE datname = current_database() AND pid <> pg_backend_pid() AND wait_event = 'advisory') AS waiting`);
        waiting = result[0]?.waiting === true;
        if (!waiting && !settled) await Bun.sleep(10);
      }
    });
    await comparison;
    expect(waiting).toBe(true);
  } finally {
    await Promise.all([local.$client.end({ timeout: 1 }), remote.$client.end({ timeout: 1 })]);
  }
}, 10000);

test.skipIf(!localUrl || !remoteUrl)('publishes two selected Chinese editions for source-based public comparison', async () => {
  const local = createDb(localUrl!);
  const remote = createDb(remoteUrl!);
  try {
    const source = createDocumentStore(local, 'local');
    const service = createDocumentService(source, { track: 'local' });
    const translations = createTranslationOperations(source, { track: 'local' });
    const content = (day: number) => `Magic: The Gathering Comprehensive Rules\n\nThese rules are effective as of October ${day}, 2026.\n\nIntroduction\n\nChinese comparison regression.\n\nContents\n\nCredits\n\n1. Game Concepts\n\n100. General\n\n100.1. Pay {W}.\n\n100.2. Draw ${day === 23 ? 'one' : 'two'} cards.\n`;
    const first = await service.importCr({ content: content(23) });
    const second = await service.importCr({ content: content(24) });
    for (const [edition, wording] of [[first, '支付白色法术力。'], [second, '支付 {W}。']] as const) {
      const original = (await source.revision(edition.revisionId))!;
      const translated = await translations.saveTranslation({ documentId:       'magic-cr', sourceRevisionId: original.id, language:         'zhs',
        nodes:            [{ sourceNodeId: original.nodes.find(node => node.anchor === '100.1')!.id, rawText: wording, translationMethod: 'human' }] });
      await translations.selectTranslation({ documentId: 'magic-cr', releaseId: edition.releaseId, revisionId: translated.id });
    }
    const target = createDocumentStore(remote, 'remote');
    await publishDocument(source, target, 'magic-cr');
    const comparison = createComparisonOperations(target, { track: 'remote' });
    const input = { slug: 'magic-cr', fromVersionTag: '20261023', toVersionTag: '20261024', locale: 'zhs' };
    const result = documentDiffPage.parse(await comparison.compare(input));
    expect(result.rows.find(row => row.kind === 'change' && row.from?.nodeId === '100.1')).toMatchObject({ translationOnly: true,
      from:            { text: '支付白色法术力。', localeState: { isFallback: false } }, to:              { text: '支付 {W}。', localeState: { isFallback: false } } });
    expect(result.rows.find(row => row.kind === 'change' && row.from?.nodeId === '100.2')).toMatchObject({ translationOnly: false,
      from:            { text: 'Draw one cards.', localeState: { isFallback: true } }, to:              { text: 'Draw two cards.', localeState: { isFallback: true } } });
    expect((await comparison.compare({ ...input, locale: 'en' })).rows.some(row => row.kind === 'change' && row.from?.nodeId === '100.1')).toBe(false);
  } finally {
    await Promise.all([local.$client.end({ timeout: 1 }), remote.$client.end({ timeout: 1 })]);
  }
}, 30000);
