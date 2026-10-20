import type { DocumentChangeTextBlock, DocumentChangeTextDiff } from '@tcg-cards/model/magic/schema/document-page';
import type { MatchResult } from './matcher';
import type { Node, Revision } from './store';
import { textDiff } from './diff-text';

/** Retain the exact source endpoints whose numbering relationship must be proven. */
interface Pair { before: Node; after: Node }
/** Preserve ordinary text separately from a verified reference to one source identity. */
interface Part { text: string; pair?: Pair }
/** Describe proven reference changes independently of structural changes. */
interface Result { referenceOnly: boolean; referenceUpdates: { from: string; to: string }[]; textDiff: DocumentChangeTextDiff | null }

/** Verify renumbering against exact source correspondence, then inspect each language's own markers. */
export function createReferenceComparison(before: Revision, after: Revision, matched: MatchResult, releases: { from: string; to: string }) {
  const originals = new Map(before.nodes.map(node => [node.nodeKey, node]));
  const fromPairs = new Map<string, Pair>();
  const toPairs = new Map<string, Pair>();
  const states = new Map<string, boolean | 'visiting'>();

  /** Reject repeated source text as evidence of an unambiguous target identity. */
  function counts(revision: Revision) {
    const result = new Map<string, number>();
    for (const node of revision.nodes) {
      const key = signature(node);
      result.set(key, (result.get(key) ?? 0) + 1);
    }
    return result;
  }
  const oldCounts = counts(before);
  const newCounts = counts(after);
  for (const node of after.nodes) {
    const assignment = matched.entityAssignments.get(node.anchor ?? node.nodeKey);
    const original = assignment?.isNew === false ? originals.get(assignment.entityId) : undefined;
    if (original?.anchor == null || node.anchor == null || original.anchor === node.anchor
      || original.kind !== node.kind || original.level !== node.level) continue;
    const pair = { before: original, after: node };
    fromPairs.set(original.anchor, pair);
    toPairs.set(node.anchor, pair);
  }

  /** Ground each changed address in unique unchanged content or an already proven reference-only update. */
  function confirmed(pair: Pair): boolean {
    const state = states.get(pair.before.id);
    if (state != null) return state === true;
    states.set(pair.before.id, 'visiting');
    const unique = oldCounts.get(signature(pair.before)) === 1 && newCounts.get(signature(pair.after)) === 1;
    const result = unique && (pair.before.rawText === pair.after.rawText || analyze(pair.before, pair.after).referenceOnly);
    states.set(pair.before.id, result);
    return result;
  }

  /** Use typed links, explicit rule-reference context, and resolvable source targets together. */
  function parts(node: Node, side: 'from' | 'to'): Part[] {
    const pairs = side === 'from' ? fromPairs : toPairs;
    const result: Part[] = [];
    let offset = 0;
    for (const marker of [...node.markers].sort((left, right) => left.start - right.start)) {
      if (marker.type !== 'chapter' || marker.start < offset || marker.end > node.rawText.length
        || (marker.documentId != null && marker.documentId !== before.documentId)
        || (marker.releaseId != null && marker.releaseId !== releases[side])) continue;
      const pair = pairs.get(marker.anchor);
      if (pair == null || node.rawText.slice(marker.start, marker.end) !== marker.anchor) continue;
      // Importers also link bare numeric tokens. A rule/rules/规则 cue prevents a
      // coincidentally equal cost or quantity from becoming semantic evidence.
      const context = node.rawText.slice(0, marker.start);
      if (!/(?:\brules?\s+|规则\s*)(?:\d{3}\.\d+[a-z]*\.?(?:\s*(?:[,，、/–—-]|and|or|与|及|和|以及|至)\s*)?)*$/iu.test(context) || !confirmed(pair)) continue;
      result.push({ text: node.rawText.slice(offset, marker.start) }, { text: marker.anchor, pair });
      offset = marker.end;
    }
    result.push({ text: node.rawText.slice(offset) });
    return result;
  }

  /** Align unambiguous shared targets while retaining new or removed references as ordinary text. */
  function analyze(oldNode: Node, newNode: Node): Result {
    const left = parts(oldNode, 'from');
    const right = parts(newNode, 'to');
    const occurrences = (items: Part[], id: string) => items.filter(part => part.pair?.before.id === id).length;
    const shared: { left: number; right: number }[] = [];
    const sameSequence = left.length === right.length
      && left.every((part, index) => part.pair?.before.id === right[index]!.pair?.before.id);
    let next = 0;
    for (let index = 0; index < left.length; index++) {
      const id = left[index]!.pair?.before.id;
      if (id == null || (!sameSequence && (occurrences(left, id) !== 1 || occurrences(right, id) !== 1))) continue;
      const target = sameSequence ? index : right.findIndex(part => part.pair?.before.id === id);
      // Reordered or repeated occurrences remain ordinary changes when their positions are uncertain.
      if (target < next) continue;
      shared.push({ left: index, right: target });
      next = target + 1;
    }
    let ordinaryChange = false;
    const updates = new Map<string, { from: string; to: string }>();
    const blocks: DocumentChangeTextBlock[] = [];
    let oldOffset = 0;
    let newOffset = 0;
    /** Compare all prose and unpaired references between two proven corresponding targets. */
    function ordinary(oldText: string, newText: string) {
      ordinaryChange ||= oldText !== newText;
      const diff = textDiff(oldText, newText);
      if (diff != null) blocks.push(...diff.blocks);
      else if (oldText !== '') blocks.push({ type: 'common', text: oldText });
    }
    for (const position of shared) {
      ordinary(left.slice(oldOffset, position.left).map(part => part.text).join(''),
        right.slice(newOffset, position.right).map(part => part.text).join(''));
      const oldPart = left[position.left]!;
      const newPart = right[position.right]!;
      updates.set(oldPart.pair!.before.id, { from: oldPart.text, to: newPart.text });
      blocks.push({ type: 'removed', text: oldPart.text, isMinor: true }, { type: 'added', text: newPart.text, isMinor: true });
      oldOffset = position.left + 1;
      newOffset = position.right + 1;
    }
    ordinary(left.slice(oldOffset).map(part => part.text).join(''), right.slice(newOffset).map(part => part.text).join(''));
    return { referenceOnly: updates.size > 0 && !ordinaryChange, referenceUpdates: [...updates.values()],
      textDiff: oldNode.rawText === newNode.rawText ? null : { mode: 'inline', blocks } };
  }
  return analyze;
}

/** Count identical structure and prose without trusting display numbers as identity. */
function signature(node: Node): string {
  return JSON.stringify([node.kind, node.level, node.rawText]);
}
