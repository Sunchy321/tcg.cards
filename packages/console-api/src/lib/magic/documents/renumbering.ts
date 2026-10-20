import type { ParsedDocumentNode } from './parser';
import type { ChangeRecord, EntityAssignment, OldNode } from './matcher';

/** Keep content correspondence while excluding number shifts caused by inserted or removed siblings. */
export function excludeInsertedNumbering(oldNodes: OldNode[], newNodes: ParsedDocumentNode[], assignments: Map<string, EntityAssignment>, changes: ChangeRecord[]): ChangeRecord[] {
  const originals = new Map(oldNodes.map(node => [node.entityId, node]));
  const byOldId = new Map(oldNodes.map(node => [node.id, node]));
  const pairs = new Map<string, OldNode>();
  const targets = new Map<string, ParsedDocumentNode>();
  for (const node of newNodes) {
    const assignment = assignments.get(node.nodeId);
    const original = assignment?.isNew === false ? originals.get(assignment.entityId) : undefined;
    if (original == null) continue;
    pairs.set(node.id, original);
    targets.set(original.id, node);
  }

  /** Group physical siblings independently of their displayed numbers. */
  function siblings<T extends { parentNodeId: string | null; siblingOrder: number }>(nodes: T[]): Map<string | null, T[]> {
    const groups = new Map<string | null, T[]>();
    for (const node of nodes) {
      const group = groups.get(node.parentNodeId) ?? [];
      group.push(node);
      groups.set(node.parentNodeId, group);
    }
    for (const group of groups.values()) group.sort((left, right) => left.siblingOrder - right.siblingOrder);
    return groups;
  }
  const oldGroups = siblings(oldNodes);
  const newGroups = siblings(newNodes);
  const shifted = new Map<string, boolean>();

  /** Detect the same surviving sibling position, including inherited parent renumbering. */
  function isShift(original: OldNode): boolean {
    const cached = shifted.get(original.id);
    if (cached != null) return cached;
    const target = targets.get(original.id);
    if (target == null) return false;
    const parent = original.parentNodeId == null ? undefined : byOldId.get(original.parentNodeId);
    const correspondingParent = parent == null ? null : targets.get(parent.id)?.id;
    if (correspondingParent !== target.parentNodeId) return false;
    const before = oldGroups.get(original.parentNodeId) ?? [];
    const after = newGroups.get(target.parentNodeId) ?? [];
    // Siblings migrated to another parent no longer occupy a local position;
    // incoming migrated nodes displace local siblings just like inserted ones.
    const retainedBefore = before.filter(node => targets.get(node.id)?.parentNodeId === target.parentNodeId);
    const retainedAfter = after.filter(node => pairs.get(node.id)?.parentNodeId === original.parentNodeId);
    const previousRank = retainedBefore.findIndex(node => node.id === original.id);
    const currentRank = retainedAfter.findIndex(node => node.id === target.id);
    const oldIndex = before.findIndex(node => node.id === original.id);
    const newIndex = after.findIndex(node => node.id === target.id);
    const insertedBefore = after.slice(0, newIndex).some(node => pairs.get(node.id)?.parentNodeId !== original.parentNodeId);
    const removedBefore = before.slice(0, oldIndex).some(node => targets.get(node.id)?.parentNodeId !== target.parentNodeId);
    const result = previousRank === currentRank && previousRank >= 0
      && ((newIndex > oldIndex && insertedBefore) || (newIndex < oldIndex && removedBefore) || (parent != null && isShift(parent)));
    shifted.set(original.id, result);
    return result;
  }

  return changes.flatMap(change => {
    if (!['renamed', 'renamed_modified', 'moved'].includes(change.type)) return [change];
    const original = change.fromNodeRefId == null ? undefined : byOldId.get(change.fromNodeRefId);
    const target = original == null ? undefined : targets.get(original.id);
    if (original == null || target == null || !isShift(original)) return [change];
    // The identity still moves to its new source number; only the change label is
    // suppressed. Real text edits (including updated references) remain visible.
    return original.content === target.content ? [] : [{ ...change, type: 'modified' as const }];
  });
}
