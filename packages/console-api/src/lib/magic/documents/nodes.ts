import type { Node } from './store';

/** Preserves authored sibling order instead of sorting section labels alphabetically. */
export function orderedNodes(nodes: Node[]): Node[] {
  const children = new Map<string | null, Node[]>();
  for (const node of nodes) {
    const siblings = children.get(node.parentId) ?? [];
    siblings.push(node);
    children.set(node.parentId, siblings);
  }
  const result: Node[] = [];
  const visited = new Set<string>();
  /** Walks the immutable tree in document order. */
  function visit(parentId: string | null) {
    for (const node of (children.get(parentId) ?? []).sort((a, b) => a.siblingOrder - b.siblingOrder || a.id.localeCompare(b.id))) {
      if (visited.has(node.id)) throw new Error('Node parent cycle');
      visited.add(node.id);
      result.push(node);
      visit(node.id);
    }
  }
  visit(null);
  if (result.length !== nodes.length) throw new Error('Node parent missing');
  return result;
}
