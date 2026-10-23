import { revisionHash } from './content-hash';
import type { Adjacency, NodeRelation, Document, DocumentStore, Release, ReleaseTranslation, Revision, SearchHit, Translation } from './store';
import { assertReparse } from './reparse';

/** Exercises operation contracts with transactional storage and rollback. */
export function memoryStore(): DocumentStore {
  let state = {
    documents: new Map<string, Document>(),
    revisions: new Map<string, Revision>(),
    translations: new Map<string, Translation>(),
    releases: new Map<string, Release>(),
    comparisons: new Map<string, Adjacency>(),
    relations: new Map<string, NodeRelation[]>(),
    bindings: new Map<string, ReleaseTranslation>(),
  };
  const store: DocumentStore = {
    revisionHeaders: async ids => structuredClone([...state.revisions.values()].filter(row => ids.includes(row.id)).map(({ nodes, ...row }) => row)),
    selectNodes: async input => structuredClone([...state.revisions.values()].filter(row => input.revisionIds.includes(row.id)).flatMap(row => row.nodes)
      .filter(node => (input.ids?.includes(node.id) ?? false) || (input.itemId != null && (node.nodeKey === input.itemId || node.id === input.itemId))
        || (node.sourceNodeId != null && (input.sourceNodeIds?.includes(node.sourceNodeId) ?? false)))),
    setRevisionHash: async (id, hash) => { const revision = state.revisions.get(id); if (revision) revision.contentHash = hash; },
    pruneAdjacencies: async (documentId, keepIds) => {
      for (const row of state.comparisons.values()) {
        if (row.documentId === documentId && !keepIds.includes(row.id)) {
          state.comparisons.delete(row.id);
          state.relations.delete(row.id);
        }
      }
    },
    adjacencies: async id => structuredClone([...state.comparisons.values()].filter(row => row.documentId === id)),
    putAdjacency: async (comparison, relations) => {
      state.comparisons.set(comparison.id, structuredClone(comparison));
      state.relations.set(comparison.id, structuredClone(relations));
    },
    nodeRelations: async query => structuredClone(query.comparisonIds.flatMap(id => state.relations.get(id) ?? [])
      .filter(row => (query.nodeIds?.includes(row.nodeId) ?? false) || (query.identities?.includes(row.identity) ?? false)
        || (query.groups?.some(group => group.comparisonId === row.comparisonId && group.groupId === row.groupId) ?? false))),
    async searchPublished(input) {
      const query = input.query.trim().toLowerCase();
      if (query.length === 0) return [];
      const rows: (SearchHit & { publishedAt: Date; path: string })[] = [];
      for (const document of state.documents.values()) {
        if (document.deletedAt != null || document.visibility !== 'public' || (input.slug != null && input.slug !== document.slug)) continue;
        const release = [...state.releases.values()].filter(row => row.documentId === document.id && row.deletedAt == null)
          .sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime() || b.id.localeCompare(a.id))[0];
        if (release == null) continue;
        const revisionIds = new Set([release.sourceRevisionId, ...[...state.bindings.values()].filter(row => row.releaseId === release.id).map(row => row.revisionId)]);
        for (const revisionId of revisionIds) {
          const revision = state.revisions.get(revisionId);
          if (revision == null || (input.language != null && input.language !== revision.language)) continue;
          for (const node of revision.nodes) {
            if (!matchesSearch(node.rawText, query) && !matchesSearch(revision.title, query) && !(node.anchor ?? '').toLowerCase().includes(query)) continue;
            rows.push({ documentId: document.id, slug: document.slug, title: revision.title,
              releaseId: release.id, versionTag: release.versionTag, nodeId: node.id,
              nodeKey: node.nodeKey, anchor: node.anchor, rawText: node.rawText,
              language: revision.language, markers: node.markers, publishedAt: release.publishedAt, path: node.path });
          }
        }
      }
      rows.sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime() || b.releaseId.localeCompare(a.releaseId)
        || a.documentId.localeCompare(b.documentId) || a.path.localeCompare(b.path) || a.nodeId.localeCompare(b.nodeId));
      return structuredClone(rows.slice(0, Math.max(1, Math.min(100, Math.trunc(input.limit))))
        .map(({ publishedAt: _publishedAt, path: _path, ...hit }) => hit));
    },
    async transaction(_id, operation) {
      const previous = structuredClone(state);
      try { return await operation(store); } catch (error) { state = previous; throw error; }
    },
    documents: async () => structuredClone([...state.documents.values()]),
    document: async id => structuredClone(state.documents.get(id)),
    putDocument: async row => { state.documents.set(row.id, structuredClone(row)); },
    revisions: async id => structuredClone([...state.revisions.values()].filter(row => row.documentId === id).map(({ nodes, ...row }) => row)),
    revision: async id => structuredClone(state.revisions.get(id)),
    /** Counts persisted nodes for edition list queries. */
    revisionNodeCounts: async ids => new Map(ids.map(id => [id, state.revisions.get(id)?.nodes.length ?? 0])),
    putRevision: async row => {
      if (state.revisions.has(row.id)) throw new Error('Revision already exists');
      state.revisions.set(row.id, structuredClone({ ...row, contentHash: revisionHash(row) }));
    },
    updateRevisionMeta: async (id, meta) => {
      const revision = state.revisions.get(id);
      if (revision) revision.meta = structuredClone(meta);
    },
    /** Replaces only the parsing of an unreferenced imported public source. */
    reparseRevision: async (revision, options) => {
      assertReparse({
        document: state.documents.get(revision.documentId), previous: state.revisions.get(revision.id), revision,
        released: [...state.releases.values()].some(row => row.sourceRevisionId === revision.id && row.deletedAt == null),
        referenced: [...state.revisions.values()].some(row => row.sourceRevisionId === revision.id),
      });
      if (!options?.dryRun) state.revisions.set(revision.id, structuredClone({ ...revision, contentHash: revisionHash(revision) }));
    },
    hideRevision: async (id, at) => { const row = state.revisions.get(id); if (row) row.deletedAt = at; },
    translations: async id => structuredClone([...state.translations.values()].filter(row => row.documentId === id)),
    putTranslation: async row => { state.translations.set(row.id, structuredClone(row)); },
    releases: async id => structuredClone([...state.releases.values()].filter(row => row.documentId === id)),
    putRelease: async row => { state.releases.set(row.id, structuredClone(row)); },
    releaseTranslations: async id => structuredClone([...state.bindings.values()].filter(row => row.releaseId === id)),
    putReleaseTranslation: async row => { state.bindings.set(`${row.releaseId}/${row.translationId}`, structuredClone(row)); },
  };
  return store;
}

/** Approximate simple lexemes while retaining literal substring matching in port tests. */
function matchesSearch(text: string, query: string): boolean {
  const normalized = text.toLowerCase();
  if (normalized.includes(query)) return true;
  const words = query.match(/[\p{L}\p{N}_]+/gu) ?? [];
  const lexemes = new Set(normalized.match(/[\p{L}\p{N}_]+/gu) ?? []);
  return words.length > 0 && words.every(word => lexemes.has(word));
}
