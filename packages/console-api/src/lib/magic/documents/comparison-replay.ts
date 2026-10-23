import type { DocumentStore, Node, NodeRelation } from './store';

/** Collect the endpoint participants connected by prepared neighboring relations. */
export async function replayComparisonPath(store: DocumentStore, comparisonIds: string[], fromNodes: Node[], toNodes: Node[]) {
  if (comparisonIds.length === 0) return [];
  const firstId = comparisonIds[0]!;
  const lastId = comparisonIds.at(-1)!;
  const fromRows = await endpointRows(store, firstId, fromNodes, 'from');
  const toRows = await endpointRows(store, lastId, toNodes, 'to');
  const relations = new Map<string, NodeRelation>();

  /** Retain one persisted participant row and reject conflicting copies. */
  function retain(rows: NodeRelation[]) {
    for (const row of rows) {
      const key = relationKey(row);
      const previous = relations.get(key);
      if (previous != null && JSON.stringify(previous) !== JSON.stringify(row)) throw new Error('Document relations are incomplete');
      relations.set(key, row);
    }
  }

  retain(fromRows);
  retain(toRows);
  const expanded = new Set<string>();
  let pending = [...new Set([...fromRows, ...toRows].map(row => row.identity))];
  while (pending.length > 0) {
    const identities = pending.filter(identity => !expanded.has(identity));
    pending = [];
    if (identities.length === 0) break;
    identities.forEach(identity => expanded.add(identity));
    const rows = await store.nodeRelations({ comparisonIds, identities });
    retain(rows);
    const partialGroups = [...groupRows(rows)].filter(([, participants]) => !isCompleteRelationGroup(participants)).map(([key]) => key);
    const completeGroups = partialGroups.length === 0 ? [] : await store.nodeRelations({
      comparisonIds,
      groups: partialGroups.map(key => {
        const [comparisonId, groupId] = JSON.parse(key) as [string, string];
        return { comparisonId, groupId };
      }),
    });
    for (const key of partialGroups) {
      const participants = completeGroups.filter(row => groupKey(row) === key);
      assertCompleteRelationGroups(participants);
    }
    retain(completeGroups);
    pending = [...new Set([...rows, ...completeGroups].map(row => row.identity))].filter(identity => !expanded.has(identity));
  }

  const selected = [...relations.values()];
  assertCompleteRelationGroups(selected);
  const parent = new Map<string, string>();

  /** Resolve a relation participant's component root with path compression. */
  function find(nodeId: string): string {
    const current = parent.get(nodeId);
    if (current == null) { parent.set(nodeId, nodeId); return nodeId; }
    if (current === nodeId) return current;
    const root = find(current);
    parent.set(nodeId, root);
    return root;
  }

  /** Join every participant in one saved split, merge, or one-to-one group. */
  function join(rows: NodeRelation[]) {
    const first = rows[0];
    if (first == null) return;
    const root = find(first.nodeId);
    for (const row of rows.slice(1)) parent.set(find(row.nodeId), root);
  }

  for (const participants of groupRows(selected).values()) join(participants);
  const fromPosition = new Map(fromNodes.map((node, index) => [node.id, index]));
  const toPosition = new Map(toNodes.map((node, index) => [node.id, index]));
  const components = new Map<string, { from: NodeRelation[]; to: NodeRelation[] }>();
  for (const row of fromRows) {
    const root = find(row.nodeId);
    const component = components.get(root) ?? { from: [], to: [] };
    component.from.push(row);
    components.set(root, component);
  }
  for (const row of toRows) {
    const root = find(row.nodeId);
    const component = components.get(root) ?? { from: [], to: [] };
    component.to.push(row);
    components.set(root, component);
  }
  return [...components.values()]
    .map(component => ({
      from: component.from.sort((a, b) => fromPosition.get(a.nodeId)! - fromPosition.get(b.nodeId)!),
      to: component.to.sort((a, b) => toPosition.get(a.nodeId)! - toPosition.get(b.nodeId)!),
    }))
    .sort((a, b) => (fromPosition.get(a.from[0]?.nodeId ?? '') ?? Number.MAX_SAFE_INTEGER)
      - (fromPosition.get(b.from[0]?.nodeId ?? '') ?? Number.MAX_SAFE_INTEGER)
      || (toPosition.get(a.to[0]?.nodeId ?? '') ?? Number.MAX_SAFE_INTEGER)
        - (toPosition.get(b.to[0]?.nodeId ?? '') ?? Number.MAX_SAFE_INTEGER));
}

/** Require complete endpoint participation for the outermost saved boundary. */
async function endpointRows(store: DocumentStore, comparisonId: string, nodes: Node[], side: 'from' | 'to') {
  if (nodes.length === 0) return [];
  const rows = await store.nodeRelations({ comparisonIds: [comparisonId], nodeIds: nodes.map(node => node.id) });
  const byNode = new Map<string, NodeRelation[]>();
  for (const row of rows) byNode.set(row.nodeId, [...byNode.get(row.nodeId) ?? [], row]);
  if (nodes.some(node => {
    const participants = byNode.get(node.id) ?? [];
    return participants.length !== 1 || participants[0]!.side !== side;
  })) throw new Error('Document relations are incomplete');
  return rows;
}

/** Group relation rows by their persisted adjacency and change identity. */
function groupRows(rows: NodeRelation[]) {
  const groups = new Map<string, NodeRelation[]>();
  for (const row of rows) {
    const key = groupKey(row);
    groups.set(key, [...groups.get(key) ?? [], row]);
  }
  return groups;
}

/** Build a stable key for one persisted participant row. */
function relationKey(row: NodeRelation): string {
  return JSON.stringify([row.comparisonId, row.groupId, row.side, row.nodeId]);
}

/** Build a stable key shared by every participant in one saved group. */
function groupKey(row: NodeRelation): string {
  return JSON.stringify([row.comparisonId, row.groupId]);
}

/** Check participant shape and order without throwing during partial-row discovery. */
function isCompleteRelationGroup(rows: NodeRelation[]): boolean {
  const kind = rows[0]?.kind;
  if (kind == null || rows.some(row => row.kind !== kind)) return false;
  const from = rows.filter(row => row.side === 'from');
  const to = rows.filter(row => row.side === 'to');
  const valid = kind === 'unchanged' || kind === 'modified' || kind === 'moved' || kind === 'renamed' || kind === 'renamed_modified'
    ? from.length === 1 && to.length === 1
    : kind === 'added' ? from.length === 0 && to.length === 1
      : kind === 'removed' ? from.length === 1 && to.length === 0
        : kind === 'split' ? from.length === 1 && to.length >= 2
          : from.length >= 2 && to.length === 1;
  if (!valid) return false;
  return [from, to].every(participants => {
    const positions = participants.map(row => row.position).sort((left, right) => left - right);
    return positions.every((position, index) => position === index);
  });
}

/** Reject partial participant groups before they can produce false endpoint correspondence. */
export function assertCompleteRelationGroups(rows: NodeRelation[]): void {
  for (const participants of groupRows(rows).values()) {
    if (!isCompleteRelationGroup(participants)) throw new Error('Document relations are incomplete');
  }
}
