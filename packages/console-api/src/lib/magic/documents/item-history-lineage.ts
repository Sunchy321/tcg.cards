import { asParsed, loadRevision } from './comparison';
import { matchRevisionNodes } from './matcher';
import type { DocumentStore, Node, Release, Revision } from './store';

/** Source content and stable identities of one formal edition. */
export interface HistoryEdition {
  release: Release;
  revision: Revision;
  nodes: Map<string, Node>;
}

/** A structural change at the beginning of the indexed edition. */
export interface HistoryBoundary {
  index: number;
  kind: 'split' | 'merged';
  from: Node[];
  to: Node[];
}

/** Follows shared comparison classifications, expanding splits both ways and merges only forward. */
export async function loadItemLineage(store: DocumentStore, releases: Release[], itemId: string, versionTag?: string) {
  const editions: HistoryEdition[] = [];
  for (const release of releases) {
    const revision = await loadRevision(store, release);
    editions.push({ release, revision, nodes: new Map(revision.nodes.map(node => [node.nodeKey, node])) });
  }
  const savedKeys = new Map<string, string>();
  const nodeIds = new Map<string, string>();
  const occurrences = new Map<string, { index: number; node: Node }[][]>();
  editions.forEach((edition, index) => {
    for (const node of edition.revision.nodes) {
      savedKeys.set(node.id, node.nodeKey);
      nodeIds.set(node.id, node.anchor ?? node.nodeKey);
      const runs = occurrences.get(node.nodeKey) ?? [];
      const last = runs.at(-1);
      if (last && last.at(-1)!.index === index - 1) last.push({ index, node });
      else runs.push([{ index, node }]);
      occurrences.set(node.nodeKey, runs);
    }
  });
  // Older imports can reuse a key after a gap. Keep the newest address as an
  // alias, but give earlier lifetimes their immutable first-node identity.
  // This changes only the read projection, never the stored source revisions.
  for (const runs of occurrences.values()) {
    for (const run of runs.slice(0, -1)) {
      const identity = run[0]!.node.id;
      for (const occurrence of run) occurrence.node.nodeKey = identity;
    }
  }
  for (const edition of editions) edition.nodes = new Map(edition.revision.nodes.map(node => [node.nodeKey, node]));
  const selected = versionTag == null ? undefined : editions.find(edition => edition.release.versionTag === versionTag)
    ?.revision.nodes.find(node => savedKeys.get(node.id) === itemId || node.id === itemId || node.nodeKey === itemId);
  if (versionTag != null && !selected) throw new Error('Item not found in published content');
  const resolved = selected ?? [...editions].reverse().flatMap(edition => edition.revision.nodes)
    .find(node => node.nodeKey === itemId || node.id === itemId);
  if (!resolved) throw new Error('Item not found in published content');
  const resolvedItemId = resolved.nodeKey;
  const compared = new Map<number, HistoryBoundary[]>();
  const members = new Set([resolvedItemId]);
  // Only changed boundaries of reachable entries need the full matcher. This
  // avoids comparing every pair of a hundred-edition rulebook for each visit.
  for (const member of members) {
    for (let index = 1; index < editions.length; index++) {
      const before = editions[index - 1]!;
      const after = editions[index]!;
      const oldNode = before.nodes.get(member);
      const newNode = after.nodes.get(member);
      if (oldNode == null && newNode == null) continue;
      // The matcher's first stage claims identical text at the same official
      // anchor before split/merge classification. A chapter move alone cannot
      // create a structural boundary and must not trigger a full-book compare.
      if (oldNode && newNode && oldNode.rawText === newNode.rawText && oldNode.anchor === newNode.anchor) continue;
      if (!compared.has(index)) {
        const matched = matchRevisionNodes(before.revision, asParsed(after.revision), after.revision.id);
        const oldNodes = new Map(before.revision.nodes.map(node => [node.id, node]));
        const newNodes = new Map(after.revision.nodes.map(node => [node.id, node]));
        compared.set(index, matched.changes.flatMap(change => {
          if (change.type !== 'split' && change.type !== 'merged') return [];
          const from = (change.relations ?? []).filter(relation => relation.side === 'from')
            .flatMap(relation => oldNodes.get(relation.nodeRefId ?? '') ?? []);
          const to = (change.relations ?? []).filter(relation => relation.side === 'to')
            .flatMap(relation => newNodes.get(relation.nodeRefId ?? '') ?? []);
          return [{ index, kind: change.type, from, to }];
        }));
      }
      for (const event of compared.get(index)!) {
        const fromMember = event.from.some(node => members.has(node.nodeKey));
        const toMember = event.to.some(node => members.has(node.nodeKey));
        if (event.kind === 'split' && (fromMember || toMember)) {
          for (const node of [...event.from, ...event.to]) members.add(node.nodeKey);
        } else if (event.kind === 'merged' && fromMember) {
          for (const node of event.to) members.add(node.nodeKey);
        }
      }
    }
  }
  const events = [...compared.values()].flat().filter(event => [...event.from, ...event.to].some(node => members.has(node.nodeKey)))
    .sort((left, right) => left.index - right.index);
  return { editions, members, events, resolvedItemId, nodeIds };
}
