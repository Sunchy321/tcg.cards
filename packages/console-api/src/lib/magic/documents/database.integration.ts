import { expect, test } from 'bun:test';
import { randomUUID } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import { DocumentChangeReview, DocumentComparison } from '@tcg-cards/db/schema/remote/magic/document';

import { createDb, runWithDb } from '@tcg-cards/db/db';
import { createComparisonOperations } from './comparison';
import { createDocumentStore } from './database';
import { createItemHistoryOperations } from './item-history';
import { createDocumentService } from './service';
import { publishDocument } from './publish';
import { createRuleReader } from './rules';
import { compareVersions, submitReview } from './reviewer';

const localUrl = process.env.DOCUMENT_TEST_LOCAL_URL;
const remoteUrl = process.env.DOCUMENT_TEST_REMOTE_URL;

// These explicitly supplied databases must contain the exported document schemas.
// No project database configuration is consulted or schema changed by this test.
test.skipIf(!localUrl || !remoteUrl)('imports, translates, publishes, searches and reviews through PostgreSQL-backed operations', async () => {
  const local = createDb(localUrl!);
  const remote = createDb(remoteUrl!);
  try {
    const localStore = createDocumentStore(local, 'local');
    const remoteStore = createDocumentStore(remote, 'remote');
    const source = createDocumentService(localStore, { track: 'local' });
    const text = `Magic: The Gathering Comprehensive Rules\n\nThese rules are effective as of October 1, 2026.\n\nIntroduction\n\nA test rulebook.\n\nContents\n\nCredits\n\n1. Game Concepts\n\n100. General\n\n100.1. Pay {W} to continue.\n`;
    const first = await source.importCr({ content: text });
    const second = await source.importCr({ content: text.replace('October 1', 'November 1').replace('{W}', '{U}') });
    const translated = await source.saveTranslation({ documentId: 'magic-cr', sourceRevisionId: second.revisionId, language: 'zhs', nodes: [
      { sourceNodeId: `${second.revisionId}/100.1`, rawText: '支付 {U} 后继续。', translationMethod: 'machine' },
    ] });
    await source.selectTranslation({ documentId: 'magic-cr', releaseId: second.releaseId, revisionId: translated.id });
    const translatedSource = (await localStore.revision(second.revisionId))!;
    await expect(localStore.reparseRevision(translatedSource)).rejects.toThrow('dependent translations');
    await source.computeRelations({ documentId: 'magic-cr' });
    await publishDocument(localStore, remoteStore, 'magic-cr');
    await publishDocument(localStore, remoteStore, 'magic-cr');
    const metadata = createRuleReader(remoteStore);
    expect((await metadata.meta({ ruleId: 'magic-cr' }))?.meta?.ruleCount).toBe(1);
    expect((await metadata.meta({ ruleId: 'magic-cr', language: 'zhs' }))?.meta).toMatchObject({
      characterCount: 7, wordCount: 0, entryCount: 1, ruleCount: 1,
    });
    await remoteStore.updateRevisionMeta(second.revisionId, {});
    await publishDocument(localStore, remoteStore, 'magic-cr', { dryRun: true });
    expect((await metadata.meta({ ruleId: 'magic-cr' }))?.meta).toEqual({});
    await publishDocument(localStore, remoteStore, 'magic-cr');
    expect((await metadata.meta({ ruleId: 'magic-cr' }))?.meta?.ruleCount).toBe(1);
    const reader = createDocumentService(remoteStore, { track: 'remote' });
    expect((await reader.read({ slug: 'magic-cr', locale: 'zhs' })).sections.find(node => node.nodeId === '100.1')?.text).toBe('支付 {U} 后继续。');
    expect((await reader.search({ query: '支付', language: 'zhs' }))[0]?.language).toBe('zhs');
    expect((await reader.search({ query: '{U}' })).length).toBeGreaterThan(0);
    expect(await reader.search({ query: '%' })).toEqual([]);
    const userId = `document-test-${randomUUID()}`;
    await remote.execute(sql`INSERT INTO public.users (id, name, email) VALUES (${userId}, 'Document test', ${`${userId}@example.test`})`);
    const owner = createDocumentService(remoteStore, { track: 'remote', actorId: userId });
    const article = await owner.create({ slug: userId, title: 'A private article', language: 'en' });
    const revision = await owner.save({ documentId: article.id, title: article.title, nodes: [{ nodeKey: 'one', rawText: 'Secret draft.' }] });
    await owner.publish({ documentId: article.id, revisionId: revision.id, versionTag: '1' });
    await owner.clearHistory({ documentId: article.id, revisionIds: [revision.id] });
    expect((await owner.read({ slug: userId })).sections[0]?.text).toBe('Secret draft.');
    expect(await reader.search({ query: 'Secret' })).toEqual([]);
    await publishDocument(localStore, remoteStore, 'magic-cr');
    expect((await owner.read({ slug: userId })).document.id).toBe(article.id);
    const pair = { documentId: 'magic-cr', fromVersionId: first.releaseId, toVersionId: second.releaseId };
    const reviewEvidence = await runWithDb(remote, async () => {
      const compared = await compareVersions(pair);
      const change = compared.changes.find(row => row.type === 'modified');
      expect(change).toBeDefined();
      await submitReview({ changeId: change!.id, status: 'confirmed', reviewerId: userId });
      const reviewed = await compareVersions(pair);
      expect(reviewed.changes.find(row => row.id === change!.id)?.reviewStateCache).toBe('confirmed');
      expect(reviewed.reviewRevision).toBe(compared.reviewRevision + 1);
      const [basis] = await remote.select().from(DocumentComparison).where(and(
        eq(DocumentComparison.documentId, pair.documentId), eq(DocumentComparison.fromVersionId, pair.fromVersionId),
        eq(DocumentComparison.toVersionId, pair.toVersionId),
      )).limit(1);
      expect(basis).toBeDefined();
      const reviews = await remote.select().from(DocumentChangeReview).where(eq(DocumentChangeReview.comparisonId, basis!.id));
      return { reviewed, basis, reviews };
    });

    const originalFirst = (await localStore.revision(first.revisionId))!;
    const repairedText = 'Pay {W} to continue after the parser repair.';
    await localStore.reparseRevision({ ...originalFirst, nodes: originalFirst.nodes.map(node => node.anchor === '100.1' ? { ...node, rawText: repairedText } : node) });
    await expect(createItemHistoryOperations(localStore, { track: 'local' }).itemHistory({ slug: 'magic-cr', itemId: '100.1', locale: 'en' })).rejects.toThrow('relations');
    await source.computeRelations({ documentId: 'magic-cr' });
    await publishDocument(localStore, remoteStore, 'magic-cr');
    const refreshed = await createComparisonOperations(remoteStore, { track: 'remote' }).compare({
      slug: 'magic-cr', fromVersionTag: '20261001', toVersionTag: '20261101', locale: 'en',
    });
    expect(refreshed.rows.some(row => row.kind === 'change' && row.from?.text === repairedText)).toBe(true);
    const [basisAfter] = await remote.select().from(DocumentComparison).where(eq(DocumentComparison.id, reviewEvidence.basis!.id)).limit(1);
    const reviewsAfter = await remote.select().from(DocumentChangeReview).where(eq(DocumentChangeReview.comparisonId, reviewEvidence.basis!.id));
    expect(basisAfter).toEqual(reviewEvidence.basis);
    expect(reviewsAfter).toEqual(reviewEvidence.reviews);
    await runWithDb(remote, async () => {
      expect(await compareVersions(pair)).toEqual(reviewEvidence.reviewed);
    });
    const repairedHistory = await createItemHistoryOperations(remoteStore, { track: 'remote' }).itemHistory({ slug: 'magic-cr', itemId: '100.1', locale: 'en' });
    expect(repairedHistory.rows.some(row => row.kind === 'period' && row.cells.some(cell => cell.text === repairedText))).toBe(true);
  } finally {
    await Promise.all([local.$client.end({ timeout: 1 }), remote.$client.end({ timeout: 1 })]);
  }
}, 30000);
