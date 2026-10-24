import { expect, test } from 'bun:test';
import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { createDb } from '@tcg-cards/db/db';
import { createDocumentStore } from './database';
import { createDocumentService } from './service';
import { createItemHistoryOperations } from './item-history';
import { publishDocument } from './publish';
import { memoryStore } from './testing';

const url = process.env.DOCUMENT_RELATION_TEST_URL;

// Only explicitly supplied disposable databases are used; schema setup belongs
// to the caller, using Drizzle definitions rather than handwritten table SQL.
test.skipIf(!url)('reuses persisted local and remote relations after rebuilding PostgreSQL stores', async () => {
  const database = createDb(url!);
  try {
    const local = createDocumentStore(database, 'local');
    await local.pruneAdjacencies('magic-cr', []);
    const staticService = createDocumentService(local, { track: 'local' });
    /** Supply two exact official source editions for persistence checks. */
    const source = (month: string, symbol: string) => `Magic: The Gathering Comprehensive Rules\n\nThese rules are effective as of ${month} 1, 2026.\n\nIntroduction\n\nExample.\n\nContents\n\nCredits\n\n1. Game Concepts\n\n100. General\n\n100.1. Pay {${symbol}} to continue.\n`;
    const first = await staticService.importCr({ content: source('October', 'W') });
    await staticService.importCr({ content: source('November', 'U') });
    const query = { slug: 'magic-cr', itemId: '100.1', locale: 'en' };
    await expect(createItemHistoryOperations(local, { track: 'local' }).itemHistory(query)).rejects.toThrow('relations');
    await expect(staticService.computeRelations({ documentId: 'magic-cr' }, { onProgress: progress => {
      if (progress.phase === 'saving' && progress.done === 1) throw new Error('cancelled rebuild');
    } })).rejects.toThrow('cancelled rebuild');
    expect(await local.adjacencies('magic-cr')).toEqual([]);
    await expect(createItemHistoryOperations(local, { track: 'local' }).itemHistory(query)).rejects.toThrow('relations');
    // Publication has no relation preparation or completeness gate.
    await publishDocument(local, memoryStore(), 'magic-cr');
    await staticService.computeRelations({ documentId: 'magic-cr' });
    const expected = await createItemHistoryOperations(local, { track: 'local' }).itemHistory(query);
    const reopened = createDocumentStore(database, 'local');
    expect(await createItemHistoryOperations(reopened, { track: 'local' }).itemHistory(query)).toEqual(expected);
    await createDocumentService(reopened, { track: 'local' }).computeRelations({ documentId: 'magic-cr' });
    expect(await createItemHistoryOperations(reopened, { track: 'local' }).itemHistory(query)).toEqual(expected);
    const revision = (await reopened.revision(first.revisionId))!;
    await reopened.reparseRevision({ ...revision, nodes: revision.nodes.map(node => node.anchor === '100.1' ? { ...node, rawText: 'Pay {B} to continue.' } : node) });
    await expect(createItemHistoryOperations(reopened, { track: 'local' }).itemHistory(query)).rejects.toThrow('relations');

    let enterRebuild!: () => void;
    let continueRebuild!: () => void;
    let waited = false;
    const entered = new Promise<void>(resolve => {
      enterRebuild = resolve;
    });
    const waiting = new Promise<void>(resolve => {
      continueRebuild = resolve;
    });
    const rebuilding = createDocumentService(reopened, { track: 'local' }).computeRelations({ documentId: 'magic-cr' }, { onProgress: async progress => {
      if (!waited && progress.phase === 'comparing' && progress.done === 0) {
        waited = true;
        enterRebuild();
        await waiting;
      }
    } });
    await entered;
    const current = (await reopened.revision(first.revisionId))!;
    const reparsing = reopened.reparseRevision({ ...current, nodes: current.nodes.map(node => node.anchor === '100.1' ? { ...node, rawText: 'Pay {G} after the concurrent repair.' } : node) });
    continueRebuild();
    await Promise.all([rebuilding, reparsing]);
    await expect(createItemHistoryOperations(reopened, { track: 'local' }).itemHistory(query)).rejects.toThrow('relations');
    await createDocumentService(reopened, { track: 'local' }).computeRelations({ documentId: 'magic-cr' });
    await expect(createItemHistoryOperations(reopened, { track: 'local' }).itemHistory(query)).resolves.toMatchObject({ entry: { itemId: '100.1' } });

    const userId = `relations-${randomUUID()}`;
    await database.execute(sql`INSERT INTO public.users (id, name, email) VALUES (${userId}, 'Relations test', ${`${userId}@example.test`})`);
    const context = { track: 'remote' as const, actorId: userId };
    const remote = createDocumentStore(database, 'remote');
    const owner = createDocumentService(remote, context);
    const article = await owner.create({ slug: userId, title: 'Private article', language: 'en' });
    for (const [index, versionTag] of ['1', '10', '2'].entries()) {
      const revision = await owner.save({ documentId: article.id, title:      article.title, nodes:      [
        { nodeKey: 'intro', rawText: index === 0 ? 'Pay white to continue.' : 'Pay blue to continue.' },
        { nodeKey: 'unchanged', rawText: 'Always retain this paragraph.' },
      ] });
      const release = await owner.publish({ documentId: article.id, revisionId: revision.id, versionTag });
      await remote.putRelease({ ...release, publishedAt: new Date(Date.UTC(2026, 9, index + 1)) });
    }
    await owner.computeRelations({ documentId: article.id });
    const articleQuery = { slug: article.slug, itemId: 'intro', locale: 'en' };
    const result = await createItemHistoryOperations(createDocumentStore(database, 'remote'), context).itemHistory(articleQuery);
    expect(result.rows.filter(row => row.kind === 'period').map(row => [row.versionFrom, row.versionTo])).toEqual([['1', '1'], ['10', '2']]);
    const unchanged = await createItemHistoryOperations(createDocumentStore(database, 'remote'), context).itemHistory({ ...articleQuery, itemId: 'unchanged' });
    expect(unchanged.entry.periodCount).toBe(1);
    await expect(createItemHistoryOperations(createDocumentStore(database, 'remote'), { track: 'remote' }).itemHistory(articleQuery)).rejects.toThrow('Document not found');
    await database.execute(sql`UPDATE magic_app.document_adjacencies SET algorithm = 'outdated' WHERE document_id = ${article.id}`);
    await expect(createItemHistoryOperations(createDocumentStore(database, 'remote'), context).itemHistory(articleQuery)).rejects.toThrow('relations');
    await owner.computeRelations({ documentId: article.id });
    expect(await createItemHistoryOperations(createDocumentStore(database, 'remote'), context).itemHistory(articleQuery)).toEqual(result);
  } finally {
    await database.$client.end({ timeout: 1 });
  }
}, 30000);
