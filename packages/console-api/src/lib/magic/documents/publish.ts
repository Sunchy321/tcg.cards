import { isDeepStrictEqual } from 'node:util';

import type { DocumentStore, Revision } from './store';

/** Report the complete publication snapshot, including dry runs and retries. */
export interface PublicationCounts {
  documents: number;
  translations: number;
  revisions: number;
  nodes: number;
  releases: number;
}

/** Publish one static article without importing build state or touching user content. */
export async function publishDocument(source: DocumentStore, target: DocumentStore, documentId: string, options: { dryRun?: boolean } = {}): Promise<PublicationCounts> {
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
      for (const revision of ordered) {
        const previous = await remote.revision(revision.id);
        if (previous == null) newRevisions.push(revision);
        else if (!sameRevision(previous, revision)) throw new Error('Publication immutable revision conflicts');
      }
      if (options.dryRun) return counts;
      await remote.putDocument({ ...document, origin: 'static', authorId: null, visibility: 'public' });
      for (const translation of translations) await remote.putTranslation(translation);
      for (const revision of newRevisions) await remote.putRevision(revision);
      for (const revision of ordered) {
        if (revision.deletedAt != null) await remote.hideRevision(revision.id, revision.deletedAt);
      }
      for (const release of releases) await remote.putRelease(release);
      for (const binding of bindings) await remote.putReleaseTranslation(binding);
      return counts;
    });
  });
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

/** Compare immutable content independently of history cleanup and SQL row ordering. */
function sameRevision(left: Revision, right: Revision): boolean {
  const { deletedAt: _leftDeleted, nodes: leftNodes, ...leftContent } = left;
  const { deletedAt: _rightDeleted, nodes: rightNodes, ...rightContent } = right;
  return isDeepStrictEqual(leftContent, rightContent)
    && isDeepStrictEqual([...leftNodes].sort((a, b) => a.id.localeCompare(b.id)), [...rightNodes].sort((a, b) => a.id.localeCompare(b.id)));
}
