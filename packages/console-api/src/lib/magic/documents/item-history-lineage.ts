import { formalReleases, preparedAdjacencies } from './adjacency';
import type { DocumentStore, Node, NodeRelation, Release, Revision } from './store';

/** Source content and stable identities of one formal edition. */
export interface HistoryEdition {
  release:  Release;
  revision: Revision;
  nodes:    Map<string, Node>;
}

/** A structural change at the beginning of the indexed edition. */
export interface HistoryBoundary {
  index: number;
  kind:  'split' | 'merged';
  from:  Node[];
  to:    Node[];
}

/** Load only persisted reachable participants and the source nodes needed for display. */
export async function loadItemLineage(store: DocumentStore, inputReleases: Release[], itemId: string, versionTag?: string) {
  const releases = formalReleases(inputReleases);
  const { comparisons, revisions } = await preparedAdjacencies(store, releases);
  const selectedRelease = versionTag == null ? undefined : releases.find(row => row.versionTag === versionTag);
  if (versionTag != null && selectedRelease == null) throw new Error('Item not found in published content');
  const candidates = await store.selectNodes({ revisionIds: (selectedRelease ? [selectedRelease] : releases).map(row => row.sourceRevisionId), itemId });
  const order = new Map(releases.map((row, index) => [row.sourceRevisionId, index]));
  const selected = candidates.sort((a, b) => order.get(b.revisionId)! - order.get(a.revisionId)!)[0];
  if (selected == null) throw new Error('Item not found in published content');
  const comparisonIds = comparisons.map(row => row.id);
  const seed = await store.nodeRelations({ comparisonIds, nodeIds: [selected.id] });
  if (comparisons.length > 0 && seed.length === 0) throw new Error('Document relations are incomplete');
  const identity = seed[0]?.identity ?? selected.id;
  const resolvedItemId = seed[0]?.itemId ?? selected.nodeKey;
  const identities = new Set([identity]);
  const all = new Map<string, NodeRelation>();
  const expanded = new Set<string>();
  /** Merge selected participant rows without multiplying nodes shared by adjacent boundaries. */
  function retain(rows: NodeRelation[]) {
    for (const row of rows) all.set(JSON.stringify([row.comparisonId, row.side, row.nodeId]), row);
  }
  // Split expansion is bidirectional; merge expansion follows sources forward.
  // The reader keeps the existing history contract while correspondence comes
  // exclusively from preparation, including unchanged continuity.
  while ([...identities].some(id => !expanded.has(id))) {
    const pending = [...identities].filter(id => !expanded.has(id));
    pending.forEach(id => expanded.add(id));
    const rows = await store.nodeRelations({ comparisonIds, identities: pending });
    retain(rows);
    const groups = rows.filter(row => row.kind === 'split' || (row.kind === 'merged' && row.side === 'from'))
      .map(row => ({ comparisonId: row.comparisonId, groupId: row.groupId }));
    const participants = await store.nodeRelations({ comparisonIds, groups });
    retain(participants);
    for (const row of participants) {
      if (row.kind === 'split' || row.side === 'to') identities.add(row.identity);
    }
  }
  // A merge destination includes source snapshots, without expanding their past.
  const merges = [...all.values()].filter(row => row.kind === 'merged').map(row => ({ comparisonId: row.comparisonId, groupId: row.groupId }));
  retain(await store.nodeRelations({ comparisonIds, groups: merges }));
  const rows = [...all.values()];
  const nodeIds = new Map<string, string>();
  const sourceNodes = await store.selectNodes({ revisionIds: releases.map(row => row.sourceRevisionId), ids: [...new Set([selected.id, ...rows.map(row => row.nodeId)])] });
  const byId = new Map(sourceNodes.map(node => [node.id, node]));
  if (rows.some(row => !byId.has(row.nodeId))) throw new Error('Document relations are incomplete');
  const aliases = new Map(rows.map(row => [row.identity, row.itemId]));
  const keys = new Map(rows.map(row => [row.nodeId, row.itemId]));
  const editions: HistoryEdition[] = releases.map(release => {
    const nodes = sourceNodes.filter(node => node.revisionId === release.sourceRevisionId).map(node => {
      nodeIds.set(node.id, node.anchor ?? node.nodeKey);
      return { ...node, nodeKey: keys.get(node.id) ?? node.nodeKey };
    }).sort((a, b) => a.path.localeCompare(b.path) || a.siblingOrder - b.siblingOrder || a.id.localeCompare(b.id));
    return { release, revision: { ...revisions.get(release.sourceRevisionId)!, nodes }, nodes: new Map(nodes.map(node => [node.nodeKey, node])) };
  });
  const boundaries = new Map<string, HistoryBoundary>();
  for (const row of rows) {
    if (row.kind !== 'split' && row.kind !== 'merged') continue;
    const key = JSON.stringify([row.comparisonId, row.groupId]);
    if (boundaries.has(key)) continue;
    const index = comparisons.findIndex(comparison => comparison.id === row.comparisonId) + 1;
    const participants = rows.filter(other => other.comparisonId === row.comparisonId && other.groupId === row.groupId).sort((a, b) => a.position - b.position);
    /** Resolve a participant using the public identity retained in its exact edition. */
    function nodes(side: 'from' | 'to') {
      return participants.filter(participant => participant.side === side).map(participant => {
        const node = byId.get(participant.nodeId)!;
        return { ...node, nodeKey: participant.itemId };
      });
    }
    boundaries.set(key, { index, kind: row.kind, from: nodes('from'), to: nodes('to') });
  }
  return { editions, members: new Set([...identities].map(id => aliases.get(id) ?? resolvedItemId)),
    events:  [...boundaries.values()].sort((a, b) => a.index - b.index), resolvedItemId, nodeIds };
}
