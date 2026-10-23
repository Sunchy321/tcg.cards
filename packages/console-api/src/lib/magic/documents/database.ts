import { revisionHash } from './content-hash';
import { and, asc, count, desc, eq, gt, ilike, inArray, isNull, notExists, notInArray, or, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';

import type { createDb } from '@tcg-cards/db/db';
import * as local from '@tcg-cards/db/schema/local/magic/documents';
import * as remote from '@tcg-cards/db/schema/remote/magic/documents';

import type { Document, DocumentStore, Node } from './store';
import { assertReparse } from './reparse';

/** Accept the configured database without opening a connection during import. */
type Database = ReturnType<typeof createDb>;
/** Reuse the transaction for every operation in one document write. */
type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];
/** Keep the local build and remote serving tracks explicit. */
type Track = 'local' | 'remote';

/** Persist document content with per-document transactional serialization. */
export function createDocumentStore(database: Database | Transaction, track: Track): DocumentStore {
  return createStore(database, track, false);
}

/** Adapt SQL operations while retaining access to soft-deleted reference content. */
function createStore(database: Database | Transaction, track: Track, transactional: boolean): DocumentStore {
  const tables = track === 'local' ? local : remote;
  const { DocumentRevision, DocumentRevisionNode, DocumentTranslation, DocumentRelease, DocumentReleaseTranslation, DocumentAdjacency, DocumentNodeRelation } = tables;

  /** Map local identities into the common serving contract without inventing users. */
  async function documents(): Promise<Document[]> {
    if (track === 'remote') {
      return database.select().from(remote.Document);
    }
    const rows = await database.select().from(local.Document);
    return rows.map(row => ({ ...row, origin: 'static', visibility: 'public' }));
  }

  return {
    /** Read revision metadata without transferring historical node content. */
    async revisionHeaders(ids) {
      if (ids.length === 0) return [];
      return database.select().from(DocumentRevision).where(inArray(DocumentRevision.id, ids));
    },
    /** Select only requested IDs, entry addresses, or translation sources; an empty selection reads nothing. */
    async selectNodes(input) {
      if (input.revisionIds.length === 0) return [];
      const predicates = [
        input.ids?.length ? inArray(DocumentRevisionNode.id, input.ids) : undefined,
        input.itemId == null ? undefined : or(eq(DocumentRevisionNode.nodeKey, input.itemId), eq(DocumentRevisionNode.id, input.itemId)),
        input.sourceNodeIds?.length ? inArray(DocumentRevisionNode.sourceNodeId, input.sourceNodeIds) : undefined,
      ].filter(row => row != null);
      if (predicates.length === 0) return [];
      return database.select().from(DocumentRevisionNode).where(and(inArray(DocumentRevisionNode.revisionId, input.revisionIds), or(...predicates)))
        .orderBy(asc(DocumentRevisionNode.path), asc(DocumentRevisionNode.siblingOrder), asc(DocumentRevisionNode.id));
    },
    /** Record the verified source fingerprint during explicit preparation. */
    async setRevisionHash(id, contentHash) {
      await database.update(DocumentRevision).set({ contentHash }).where(eq(DocumentRevision.id, id));
    },
    /** Remove obsolete derived boundaries while preserving separately owned review evidence. */
    async pruneAdjacencies(documentId, keepIds) {
      const stale = await database.select({ id: DocumentAdjacency.id }).from(DocumentAdjacency).where(and(
        eq(DocumentAdjacency.documentId, documentId), keepIds.length ? notInArray(DocumentAdjacency.id, keepIds) : undefined,
      ));
      if (stale.length === 0) return;
      const ids = stale.map(row => row.id);
      // Only replaceable derived comparisons are purged; review evidence has separate ownership.
      await database.delete(DocumentNodeRelation).where(inArray(DocumentNodeRelation.comparisonId, ids));
      await database.delete(DocumentAdjacency).where(inArray(DocumentAdjacency.id, ids));
    },
    /** Read prepared boundary metadata for one document. */
    async adjacencies(documentId) {
      return database.select().from(DocumentAdjacency).where(eq(DocumentAdjacency.documentId, documentId));
    },
    /** Read every participant row for the requested boundaries for static publication. */
    async adjacencyRelations(comparisonIds) {
      if (comparisonIds.length === 0) return [];
      return database.select().from(DocumentNodeRelation).where(inArray(DocumentNodeRelation.comparisonId, comparisonIds));
    },
    /** Replace a complete boundary and all participants inside the document transaction. */
    async putAdjacency(comparison, relations) {
      if (!transactional) return createStore(database, track, false).transaction(comparison.documentId, tx => tx.putAdjacency(comparison, relations));
      await database.insert(DocumentAdjacency).values(comparison).onConflictDoUpdate({ target: DocumentAdjacency.id, set: comparison });
      // Relations are replaceable derived rows without soft-delete semantics or review ownership.
      await database.delete(DocumentNodeRelation).where(eq(DocumentNodeRelation.comparisonId, comparison.id));
      for (let offset = 0; offset < relations.length; offset += 500) {
        await database.insert(DocumentNodeRelation).values(relations.slice(offset, offset + 500));
      }
    },
    /** Read participants matching any requested node, identity, or boundary group. */
    async nodeRelations(query) {
      if (query.comparisonIds.length === 0) return [];
      const predicates = [
        query.nodeIds?.length ? inArray(DocumentNodeRelation.nodeId, query.nodeIds) : undefined,
        query.identities?.length ? inArray(DocumentNodeRelation.identity, query.identities) : undefined,
        ...(query.groups ?? []).map(group => and(eq(DocumentNodeRelation.comparisonId, group.comparisonId), eq(DocumentNodeRelation.groupId, group.groupId))),
      ].filter(row => row != null);
      if (predicates.length === 0) return [];
      return database.select().from(DocumentNodeRelation).where(and(inArray(DocumentNodeRelation.comparisonId, query.comparisonIds), or(...predicates)));
    },
    async searchPublished(input) {
      const query = input.query.trim();
      if (query.length === 0) return [];
      const limit = Math.max(1, Math.min(100, Math.trunc(input.limit)));
      const Document = tables.Document;
      const newer = alias(DocumentRelease, 'newer_release');
      const pattern = `%${query.replace(/[\\%_]/g, '\\$&')}%`;
      const fields = {
        documentId: Document.id, slug: Document.slug, title: DocumentRevision.title,
        releaseId: DocumentRelease.id, versionTag: DocumentRelease.versionTag,
        nodeId: DocumentRevisionNode.id, nodeKey: DocumentRevisionNode.nodeKey,
        anchor: DocumentRevisionNode.anchor, rawText: DocumentRevisionNode.rawText,
        language: DocumentRevision.language, markers: DocumentRevisionNode.markers,
        publishedAt: DocumentRelease.publishedAt, path: DocumentRevisionNode.path,
      };
      // Keep released content searchable after its edit-history entry is hidden.
      const conditions = and(
        isNull(Document.deletedAt), isNull(DocumentRelease.deletedAt),
        track === 'remote' ? eq(remote.Document.visibility, 'public') : undefined,
        input.slug == null ? undefined : eq(Document.slug, input.slug),
        input.language == null ? undefined : eq(DocumentRevision.language, input.language),
        notExists(database.select({ id: newer.id }).from(newer).where(and(
          eq(newer.documentId, Document.id), isNull(newer.deletedAt),
          or(gt(newer.publishedAt, DocumentRelease.publishedAt), and(eq(newer.publishedAt, DocumentRelease.publishedAt), gt(newer.id, DocumentRelease.id))),
        ))),
        or(
          /[\p{L}\p{N}]/u.test(query) ? sql`to_tsvector('simple', ${DocumentRevisionNode.rawText}) @@ plainto_tsquery('simple', ${query})` : undefined,
          /[\p{L}\p{N}]/u.test(query) ? sql`to_tsvector('simple', ${DocumentRevision.title}) @@ plainto_tsquery('simple', ${query})` : undefined,
          ilike(DocumentRevisionNode.rawText, pattern), ilike(DocumentRevision.title, pattern),
          ilike(DocumentRevisionNode.anchor, pattern),
        ),
      );
      const original = database.select(fields).from(DocumentRelease)
        .innerJoin(Document, eq(Document.id, DocumentRelease.documentId))
        .innerJoin(DocumentRevision, eq(DocumentRevision.id, DocumentRelease.sourceRevisionId))
        .innerJoin(DocumentRevisionNode, eq(DocumentRevisionNode.revisionId, DocumentRevision.id))
        .where(conditions)
        .orderBy(desc(DocumentRelease.publishedAt), desc(DocumentRelease.id), asc(Document.id), asc(DocumentRevisionNode.path), asc(DocumentRevisionNode.id))
        .limit(limit);
      const translated = database.select(fields).from(DocumentRelease)
        .innerJoin(Document, eq(Document.id, DocumentRelease.documentId))
        .innerJoin(DocumentReleaseTranslation, eq(DocumentReleaseTranslation.releaseId, DocumentRelease.id))
        .innerJoin(DocumentRevision, eq(DocumentRevision.id, DocumentReleaseTranslation.revisionId))
        .innerJoin(DocumentRevisionNode, eq(DocumentRevisionNode.revisionId, DocumentRevision.id))
        .where(conditions)
        .orderBy(desc(DocumentRelease.publishedAt), desc(DocumentRelease.id), asc(Document.id), asc(DocumentRevisionNode.path), asc(DocumentRevisionNode.id))
        .limit(limit);
      const rows = (await Promise.all([original, translated])).flat().sort((a, b) =>
        b.publishedAt.getTime() - a.publishedAt.getTime() || b.releaseId.localeCompare(a.releaseId)
        || a.documentId.localeCompare(b.documentId) || a.path.localeCompare(b.path) || a.nodeId.localeCompare(b.nodeId));
      const seen = new Set<string>();
      return rows.filter(row => {
        const key = `${row.releaseId}/${row.nodeId}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      }).slice(0, limit).map(({ publishedAt: _publishedAt, path: _path, ...hit }) => hit);
    },
    async transaction(documentId, operation) {
      if (transactional) {
        await database.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`magic-document:${documentId}`}))`);
        return operation(createStore(database, track, true));
      }
      return database.transaction(async tx => {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`magic-document:${documentId}`}))`);
        return operation(createStore(tx, track, true));
      });
    },
    documents,
    async document(id) {
      if (track === 'remote') {
        const [row] = await database.select().from(remote.Document).where(eq(remote.Document.id, id)).limit(1);
        return row;
      }
      const [row] = await database.select().from(local.Document).where(eq(local.Document.id, id)).limit(1);
      return row == null ? undefined : { ...row, origin: 'static', visibility: 'public' };
    },
    async putDocument(document) {
      if (track === 'remote') {
        if ((document.origin === 'static' && (document.authorId != null || document.staticKey == null))
          || (document.origin === 'user' && (document.authorId == null || document.staticKey != null))) {
          throw new Error('Document ownership does not match its origin');
        }
        const row = { ...document, authorId: document.authorId ?? null };
        await database.insert(remote.Document).values(row).onConflictDoUpdate({ target: remote.Document.id, set: row });
        return;
      }
      if (document.origin !== 'static' || document.authorId != null || document.staticKey == null) {
        throw new Error('Local documents must be static and have a publication key');
      }
      const { origin: _origin, visibility: _visibility, authorId: _author, ...content } = document;
      const row = { ...content, staticKey: document.staticKey };
      await database.insert(local.Document).values(row).onConflictDoUpdate({ target: local.Document.id, set: row });
    },
    async revisions(documentId) {
      return database.select().from(DocumentRevision)
        .where(eq(DocumentRevision.documentId, documentId))
        .orderBy(asc(DocumentRevision.createdAt), asc(DocumentRevision.id));
    },
    async revision(id) {
      const [row] = await database.select().from(DocumentRevision).where(eq(DocumentRevision.id, id)).limit(1);
      if (row == null) return undefined;
      const nodes = await database.select().from(DocumentRevisionNode)
        .where(eq(DocumentRevisionNode.revisionId, id))
        .orderBy(asc(DocumentRevisionNode.path), asc(DocumentRevisionNode.siblingOrder), asc(DocumentRevisionNode.id));
      return { ...row, nodes };
    },
    /** Counts saved nodes without loading historical article text. */
    async revisionNodeCounts(revisionIds) {
      if (revisionIds.length === 0) return new Map();
      // Edition lists need counts, not every historical rulebook's full text.
      const rows = await database.select({ revisionId: DocumentRevisionNode.revisionId, total: count() })
        .from(DocumentRevisionNode).where(inArray(DocumentRevisionNode.revisionId, revisionIds))
        .groupBy(DocumentRevisionNode.revisionId);
      return new Map(rows.map(row => [row.revisionId, row.total]));
    },
    async putRevision(revision) {
      const { nodes, ...content } = revision;
      const row = { ...content, contentHash: revisionHash(revision) };
      // A retry must not mutate immutable saved text or recreate its nodes.
      const inserted = await database.insert(DocumentRevision).values(row)
        .onConflictDoNothing({ target: DocumentRevision.id }).returning({ id: DocumentRevision.id });
      if (inserted.length === 0) return;
      await insertNodes(database, DocumentRevisionNode, nodes);
    },
    async updateRevisionMeta(id, meta) {
      await database.update(DocumentRevision).set({ meta }).where(eq(DocumentRevision.id, id));
    },
    /** Rebuilds public source parsing atomically while leaving the release and revision identity intact. */
    async reparseRevision(revision, options) {
      if (!transactional) return createStore(database, track, false).transaction(revision.documentId, tx => tx.reparseRevision(revision, options));
      const store = createStore(database, track, true);
      const [document, previous, releases, translationRefs] = await Promise.all([
        store.document(revision.documentId), store.revision(revision.id), store.releases(revision.documentId),
        database.select({ id: DocumentRevision.id }).from(DocumentRevision).where(eq(DocumentRevision.sourceRevisionId, revision.id)).limit(1),
      ]);
      assertReparse({ document, previous, revision,
        released: releases.some(row => row.sourceRevisionId === revision.id && row.deletedAt == null),
        hasTranslationReferences: translationRefs.length > 0,
      });
      if (options?.dryRun) return;
      // Imported nodes are regenerated from the same retained source file; no revision or release is deleted.
      await database.delete(DocumentRevisionNode).where(eq(DocumentRevisionNode.revisionId, revision.id));
      await insertNodes(database, DocumentRevisionNode, revision.nodes);
      await store.setRevisionHash(revision.id, revisionHash(revision));
    },
    async hideRevision(id, at) {
      await database.update(DocumentRevision).set({ deletedAt: at }).where(eq(DocumentRevision.id, id));
    },
    async translations(documentId) {
      return database.select({ id: DocumentTranslation.id, documentId: DocumentTranslation.documentId, language: DocumentTranslation.language })
        .from(DocumentTranslation).where(eq(DocumentTranslation.documentId, documentId));
    },
    async putTranslation(translation) {
      await database.insert(DocumentTranslation).values(translation).onConflictDoNothing({ target: DocumentTranslation.id });
    },
    async releases(documentId) {
      return database.select().from(DocumentRelease).where(eq(DocumentRelease.documentId, documentId))
        .orderBy(asc(DocumentRelease.publishedAt), asc(DocumentRelease.id));
    },
    async putRelease(release) {
      await database.insert(DocumentRelease).values(release)
        .onConflictDoUpdate({ target: DocumentRelease.id, set: release });
    },
    async releaseTranslations(releaseId) {
      return database.select().from(DocumentReleaseTranslation).where(eq(DocumentReleaseTranslation.releaseId, releaseId));
    },
    async putReleaseTranslation(binding) {
      await database.insert(DocumentReleaseTranslation).values(binding).onConflictDoUpdate({
        target: [DocumentReleaseTranslation.releaseId, DocumentReleaseTranslation.translationId],
        set: binding,
      });
    },
  };
}

/** Insert parents before children and bound statement size for long rulebooks. */
async function insertNodes(database: Database | Transaction, table: typeof local.DocumentRevisionNode, nodes: Node[]): Promise<void> {
  const inserted = new Set<string>();
  let remaining = [...nodes];
  while (remaining.length > 0) {
    const ready = remaining.filter(node => node.parentId == null || inserted.has(node.parentId));
    if (ready.length === 0) throw new Error('Document nodes contain missing parents or a parent cycle');
    for (let offset = 0; offset < ready.length; offset += 500) {
      await database.insert(table).values(ready.slice(offset, offset + 500));
    }
    for (const node of ready) inserted.add(node.id);
    remaining = remaining.filter(node => !inserted.has(node.id));
  }
}
