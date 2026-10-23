import { isDeepStrictEqual } from 'node:util';
import { documentMeta } from '@tcg-cards/model/magic/schema/document-content';

import type { DocumentStore, Revision } from './store';
import { sameRevision } from './reparse';

/** Report the complete publication snapshot, including dry runs and retries. */
export interface PublicationCounts {
  documents: number;
  translations: number;
  revisions: number;
  nodes: number;
  releases: number;
}

/** Publishes static content atomically, then transports saved relations independently. */
export async function publishStaticDocuments(source: DocumentStore, target: DocumentStore, options: { dryRun?: boolean } = {}): Promise<PublicationCounts> {
  const published = await source.transaction('static-documents', async local => {
    const documents = (await local.documents()).filter(document => document.origin === 'static')
      .sort((left, right) => left.id.localeCompare(right.id));
    if (documents.length === 0) throw new Error('No static documents available to publish');
    // A conflict in a later article must roll back articles written earlier in this batch.
    const counts = await target.transaction('static-documents', async remote => {
      const result: PublicationCounts = { documents: 0, translations: 0, revisions: 0, nodes: 0, releases: 0 };
      for (const document of documents) {
        const current = await publishDocumentContent(local, remote, document.id, options);
        result.documents += current.documents;
        result.translations += current.translations;
        result.revisions += current.revisions;
        result.nodes += current.nodes;
        result.releases += current.releases;
      }
      return result;
    });
    return { counts, documentIds: documents.map(document => document.id) };
  });
  if (!options.dryRun) {
    for (const documentId of published.documentIds) await publishRelationsBestEffort(source, target, documentId);
  }
  return published.counts;
}

/** Publish one static article without importing build state or touching user content. */
export async function publishDocument(source: DocumentStore, target: DocumentStore, documentId: string, options: { dryRun?: boolean } = {}): Promise<PublicationCounts> {
  const counts = await publishDocumentContent(source, target, documentId, options);
  if (!options.dryRun) await publishRelationsBestEffort(source, target, documentId);
  return counts;
}

/** Commit validated static content before attempting independent derived-data transport. */
async function publishDocumentContent(source: DocumentStore, target: DocumentStore, documentId: string, options: { dryRun?: boolean }): Promise<PublicationCounts> {
  return source.transaction(documentId, async local => {
    const document = await local.document(documentId);
    if (document == null) throw new Error('Document not found');
    if (document.origin !== 'static' || document.staticKey == null || document.authorId != null) {
      throw new Error('Only static documents can be published');
    }
    const translations = await local.translations(documentId);
    const revisions: Revision[] = [];
    for (const entry of await local.revisions(documentId)) {
      const revision = await local.revision(entry.id);
      if (revision == null) throw new Error('Publication references a missing revision');
      revisions.push(revision);
    }
    const ordered = orderRevisions(revisions);
    const releases = await local.releases(documentId);
    const bindings = (await Promise.all(releases.map(release => local.releaseTranslations(release.id)))).flat();
    for (const release of releases) {
      const revision = ordered.find(row => row.id === release.sourceRevisionId);
      if (revision == null || revision.translationId != null) throw new Error('Release must reference a source revision');
    }
    for (const binding of bindings) {
      const revision = ordered.find(row => row.id === binding.revisionId);
      const release = releases.find(row => row.id === binding.releaseId);
      if (revision == null || release == null || revision.translationId !== binding.translationId
        || revision.sourceRevisionId !== release.sourceRevisionId || binding.sourceRevisionId !== release.sourceRevisionId
        || binding.documentId !== documentId) throw new Error('Publication translation does not match its release');
    }
    const counts = { documents: 1, translations: translations.length, revisions: ordered.length, nodes: ordered.reduce((sum, row) => sum + row.nodes.length, 0), releases: releases.length };

    return target.transaction(documentId, async remote => {
      const identities = await remote.documents();
      const existingDocument = identities.find(row => row.id === documentId);
      if (existingDocument != null && (existingDocument.origin !== 'static' || existingDocument.staticKey !== document.staticKey)) {
        throw new Error('Publication would overwrite a document owned by another source');
      }
      if (identities.some(row => row.id !== documentId && (row.slug === document.slug || row.staticKey === document.staticKey))) {
        throw new Error('Publication document slug or static key collides with another document');
      }
      // Child IDs are global primary keys. Check foreign ownership before upserts.
      for (const identity of identities.filter(row => row.id !== documentId)) {
        const foreignTranslations = await remote.translations(identity.id);
        const foreignReleases = await remote.releases(identity.id);
        if (translations.some(row => foreignTranslations.some(other => other.id === row.id))
          || releases.some(row => foreignReleases.some(other => other.id === row.id))) {
          throw new Error('Publication child identity belongs to another document');
        }
      }
      const existingTranslations = await remote.translations(documentId);
      for (const translation of translations) {
        const previous = existingTranslations.find(row => row.id === translation.id || row.language === translation.language);
        if (previous != null && !isDeepStrictEqual(previous, translation)) throw new Error('Publication translation identity conflicts');
      }
      const existingReleases = await remote.releases(documentId);
      for (const release of releases) {
        const previous = existingReleases.find(row => row.id === release.id || row.versionTag === release.versionTag);
        if (previous != null && (previous.id !== release.id || previous.sourceRevisionId !== release.sourceRevisionId)) {
          throw new Error('Publication cannot replace an existing release source');
        }
      }
      const newRevisions: Revision[] = [];
      const reparsed: Revision[] = [];
      for (const revision of ordered) {
        const previous = await remote.revision(revision.id);
        if (previous == null) newRevisions.push(revision);
        else if (!sameRevision(previous, revision)) {
          if (sameRevision(previous, { ...revision, nodes: previous.nodes })) {
            await remote.reparseRevision(revision, { dryRun: true });
            reparsed.push(revision);
          } else throw new Error('Publication immutable revision conflicts');
        }
      }
      if (options.dryRun) return counts;
      await remote.putDocument({ ...document, origin: 'static', authorId: null, visibility: 'public' });
      for (const translation of translations) await remote.putTranslation(translation);
      for (const revision of reparsed) await remote.reparseRevision(revision);
      for (const revision of newRevisions) await remote.putRevision(revision);
      for (const revision of ordered) {
        // Derived statistics can be backfilled without replacing referenced nodes.
        await remote.updateRevisionMeta(revision.id, documentMeta.parse(revision.meta ?? {}));
        if (revision.deletedAt != null) await remote.hideRevision(revision.id, revision.deletedAt);
      }
      for (const release of releases) await remote.putRelease(release);
      for (const binding of bindings) await remote.putReleaseTranslation(binding);
      return counts;
    });
  });
}

/** Copy only stored relation rows in a separate transaction after content publication. */
async function publishRelationsBestEffort(source: DocumentStore, target: DocumentStore, documentId: string): Promise<void> {
  try {
    await source.transaction(documentId, async local => {
      const adjacencies = await local.adjacencies(documentId);
      await target.transaction(documentId, async remote => {
        await remote.pruneAdjacencies(documentId, adjacencies.map(row => row.id));
        // Copy one boundary at a time to bound memory for large rulebooks.
        for (const adjacency of adjacencies) {
          const relations = await local.adjacencyRelations([adjacency.id]);
          await remote.putAdjacency(adjacency, relations);
        }
      });
    });
  } catch {
    // Relation availability may affect history reads, but it never decides whether content publishes.
  }
}

/** Preserve source dependency order even when revisions share timestamps. */
function orderRevisions(revisions: Revision[]): Revision[] {
  const result: Revision[] = [];
  const inserted = new Set<string>();
  let pending = [...revisions];
  while (pending.length > 0) {
    const ready = pending.filter(row => row.sourceRevisionId == null || inserted.has(row.sourceRevisionId));
    if (ready.length === 0) throw new Error('Publication revisions have a missing source or cycle');
    for (const revision of ready) {
      result.push(revision);
      inserted.add(revision.id);
    }
    pending = pending.filter(row => !inserted.has(row.id));
  }
  return result;
}
