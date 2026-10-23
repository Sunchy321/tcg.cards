import { createHash } from 'node:crypto';
import { requireOwner } from './authoring';
import { asParsed, loadRevision } from './comparison';
import { revisionHash } from './content-hash';
import { matchRevisionNodes } from './matcher';
import type { DocumentContext } from './service';
import type { Adjacency, DocumentStore, Node, NodeRelation, Release, Revision } from './store';

// Bump whenever correspondence, classification, or canonical identity rules change.
export const adjacencyAlgorithm = 'document-adjacency-v1';

/** Order formal editions by publication, with deterministic ties independent of labels. */
export function formalReleases(releases: Release[]): Release[] {
  return releases.filter(row => row.deletedAt == null)
    .sort((a, b) => a.publishedAt.getTime() - b.publishedAt.getTime() || a.id.localeCompare(b.id));
}

/** Fingerprint the publication sequence that determines lineage addresses and adjacency. */
function timelineHash(releases: Release[]): string {
  return createHash('sha256').update(JSON.stringify(releases.map(row => [row.id, row.sourceRevisionId, row.publishedAt.toISOString()]))).digest('hex');
}

/** Report durable task progress without treating uncommitted relations as available. */
export interface RelationProgress {
  phase: 'comparing' | 'saving' | 'completed';
  done: number;
  total: number;
  fromVersionTag: string | null;
  toVersionTag: string | null;
}

/** Allow desktop execution to persist progress and cooperate with task cancellation. */
export interface ComputationOptions {
  onProgress?: (progress: RelationProgress) => void | Promise<void>;
  signal?: AbortSignal;
}

/** Apply the same management permission to computation and readiness inspection. */
async function requireManager(store: DocumentStore, context: DocumentContext, documentId: string) {
  if (context.track === 'remote') return requireOwner(store, context, documentId);
  const document = await store.document(documentId);
  if (document?.origin !== 'static' || document.deletedAt != null) throw new Error('Not allowed');
  return document;
}

/** Check a saved boundary against exact source fingerprints and the formal sequence. */
function isPrepared(comparison: Adjacency | undefined, previous: Release, release: Release, revisions: Map<string, Omit<Revision, 'nodes'>>, sequence: string): comparison is Adjacency {
  const from = revisions.get(previous.sourceRevisionId);
  const to = revisions.get(release.sourceRevisionId);
  return comparison != null && comparison.algorithm === adjacencyAlgorithm && comparison.timelineHash === sequence
    && comparison.fromReleaseId === previous.id && comparison.toReleaseId === release.id
    && comparison.fromRevisionId === previous.sourceRevisionId && comparison.toRevisionId === release.sourceRevisionId
    && from?.documentId === previous.documentId && to?.documentId === release.documentId
    && from.translationId == null && to.translationId == null && !!from.contentHash && !!to.contentHash
    && comparison.fromHash === from.contentHash && comparison.toHash === to.contentHash;
}

/** Prepare complete neighboring correspondence only through an explicit management action. */
export function createAdjacencyOperations(store: DocumentStore, context: DocumentContext) {
  return {
    /** Rebuild all neighboring formal comparisons under the existing management permission. */
    async computeRelations(input: { documentId: string }, options: ComputationOptions = {}) {
      /** Persist each observed update before moving on to the next unit of work. */
      async function report(progress: RelationProgress) {
        options.signal?.throwIfAborted();
        await options.onProgress?.(progress);
      }
      const result = await store.transaction(input.documentId, async tx => {
        const document = await requireManager(tx, context, input.documentId);
        const releases = formalReleases(await tx.releases(input.documentId));
        const total = Math.max(0, releases.length - 1);
        await report({ phase: 'comparing', done: 0, total, fromVersionTag: releases[0]?.versionTag ?? null, toVersionTag: releases[1]?.versionTag ?? null });
        const sequence = timelineHash(releases);
        let previous: Revision | undefined;
        const identities = new Map<string, string>();
        const latest = new Map<string, Node>();
        const aliasOwners = new Map<string, string>();
        const comparisons: { comparison: Adjacency; relations: NodeRelation[] }[] = [];
        for (let index = 0; index < releases.length; index++) {
          const release = releases[index]!;
          if (index > 0) await report({ phase: 'comparing', done: index - 1, total,
            fromVersionTag: releases[index - 1]!.versionTag, toVersionTag: release.versionTag });
          const original = await loadRevision(tx, release);
          const hash = revisionHash(original);
          await tx.setRevisionHash(original.id, hash);
          const matched = previous == null ? null : matchRevisionNodes(previous, asParsed(original), original.id);
          const canonical: Revision = { ...original, contentHash: hash, nodes: original.nodes.map(node => {
            const assignment = matched?.entityAssignments.get(node.anchor ?? node.nodeKey);
            const identity = assignment?.isNew === false ? assignment.entityId : node.id;
            identities.set(node.id, identity);
            latest.set(identity, node);
            aliasOwners.set(node.nodeKey, identity);
            return { ...node, nodeKey: identity };
          }) };
          if (previous == null) {
            previous = canonical;
            continue;
          }
          const fromRelease = releases[index - 1]!;
          const id = createHash('sha256').update(JSON.stringify([document!.id, fromRelease.id, release.id])).digest('hex');
          const comparison: Adjacency = { id, documentId: document!.id, fromReleaseId: fromRelease.id, toReleaseId: release.id,
            fromRevisionId: previous.id, toRevisionId: original.id, fromHash: previous.contentHash!, toHash: hash, algorithm: adjacencyAlgorithm, timelineHash: sequence };
          const relations: NodeRelation[] = [];
          const claimed = new Set<string>();
          /** Record every participant once, retaining ordered split and merge groups. */
          function add(groupId: string, kind: NodeRelation['kind'], side: NodeRelation['side'], nodeId: string, position: number) {
            const key = `${side}:${nodeId}`;
            if (claimed.has(key)) throw new Error('Ambiguous document relations');
            claimed.add(key);
            relations.push({ comparisonId: id, groupId, kind, side, nodeId, identity: identities.get(nodeId)!, itemId: '', position });
          }
          for (const [changeIndex, change] of matched!.changes.entries()) {
            const groupId = String(changeIndex);
            for (const side of ['from', 'to'] as const) {
              const participants = change.relations?.filter(row => row.side === side).map(row => row.nodeRefId).filter((id): id is string => id != null)
                ?? [side === 'from' ? change.fromNodeRefId : change.toNodeRefId].filter((id): id is string => id != null);
              participants.forEach((nodeId, position) => add(groupId, change.type, side, nodeId, position));
            }
          }
          const previousByIdentity = new Map(previous.nodes.map(node => [node.nodeKey, node]));
          for (const node of canonical.nodes) {
            if (claimed.has(`to:${node.id}`)) continue;
            const old = previousByIdentity.get(node.nodeKey);
            if (old == null) throw new Error('Incomplete document relations');
            const groupId = `unchanged:${node.id}`;
            add(groupId, 'unchanged', 'from', old.id, 0);
            add(groupId, 'unchanged', 'to', node.id, 0);
          }
          if (relations.filter(row => row.side === 'from').length !== previous.nodes.length
            || relations.filter(row => row.side === 'to').length !== canonical.nodes.length) throw new Error('Incomplete document relations');
          comparisons.push({ comparison, relations });
          previous = canonical;
          await report({ phase: 'comparing', done: index, total, fromVersionTag: fromRelease.versionTag, toVersionTag: release.versionTag });
        }
        // Keep existing public entry addresses where possible. Earlier lifetimes
        // of a reused key are addressed by their actual first-node identity.
        for (const [index, { comparison, relations }] of comparisons.entries()) {
          await report({ phase: 'saving', done: index, total, fromVersionTag: releases[index]!.versionTag, toVersionTag: releases[index + 1]!.versionTag });
          for (const row of relations) {
            const alias = latest.get(row.identity)!.nodeKey;
            row.itemId = aliasOwners.get(alias) === row.identity ? alias : row.identity;
          }
          await tx.putAdjacency(comparison, relations);
          await report({ phase: 'saving', done: index + 1, total, fromVersionTag: releases[index]!.versionTag, toVersionTag: releases[index + 1]!.versionTag });
        }
        await tx.pruneAdjacencies(input.documentId, comparisons.map(row => row.comparison.id));
        return { comparisons: comparisons.length };
      });
      // Report completion only after the source transaction has committed.
      await report({ phase: 'completed', done: result.comparisons, total: result.comparisons, fromVersionTag: null, toVersionTag: null });
      return result;
    },
    /** Inspect persisted readiness without taking the computation's document lock. */
    async relationStatus(input: { documentId: string }) {
      await requireManager(store, context, input.documentId);
      const releases = formalReleases(await store.releases(input.documentId));
      const [headers, comparisons] = await Promise.all([
        store.revisionHeaders([...new Set(releases.map(row => row.sourceRevisionId))]), store.adjacencies(input.documentId),
      ]);
      const revisions = new Map(headers.map(row => [row.id, row]));
      const sequence = timelineHash(releases);
      return { versions: releases.map((release, index) => {
        const previous = releases[index - 1];
        const comparison = previous == null ? undefined : comparisons.find(row => row.fromReleaseId === previous.id && row.toReleaseId === release.id);
        const status: 'not_needed' | 'unprepared' | 'ready' | 'outdated' = previous == null ? 'not_needed'
          : isPrepared(comparison, previous, release, revisions, sequence) ? 'ready'
            : comparisons.some(row => row.toReleaseId === release.id) ? 'outdated' : 'unprepared';
        return { releaseId: release.id, versionTag: release.versionTag, previousVersionTag: previous?.versionTag ?? null, status };
      }) };
    },
  };
}

/** Validate every required boundary using source metadata, never historical full text. */
export async function preparedAdjacencies(store: DocumentStore, releases: Release[], timeline: Release[] = releases) {
  const headers = await store.revisionHeaders([...new Set(releases.map(row => row.sourceRevisionId))]);
  const revisions = new Map(headers.map(row => [row.id, row]));
  const saved = releases.length < 2 ? [] : await store.adjacencies(releases[0]!.documentId);
  const comparisons: Adjacency[] = [];
  const sequence = timelineHash(formalReleases(timeline));
  for (let index = 0; index < releases.length; index++) {
    const release = releases[index]!;
    const revision = revisions.get(release.sourceRevisionId);
    if (revision?.documentId !== release.documentId || revision.translationId != null) throw new Error('Release content missing');
    if (index === 0) continue;
    const previous = releases[index - 1]!;
    const comparison = saved.find(row => row.fromReleaseId === previous.id && row.toReleaseId === release.id);
    if (!isPrepared(comparison, previous, release, revisions, sequence)) {
      throw new Error('Document relations are not prepared or are outdated');
    }
    comparisons.push(comparison);
  }
  return { comparisons, revisions };
}
