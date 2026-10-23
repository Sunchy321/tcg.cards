import { createHash } from 'node:crypto';
import type { Revision } from './store';

/** Fingerprint exact source content and structure independently of derived metadata. */
export function revisionHash(revision: Revision): string {
  return createHash('sha256').update(JSON.stringify([
    revision.id, revision.documentId, revision.language, revision.translationId, revision.sourceRevisionId, revision.title,
    [...revision.nodes].sort((a, b) => a.id.localeCompare(b.id)).map(node => [
      node.id, node.revisionId, node.nodeKey, node.kind, node.anchor, node.path, node.level,
      node.parentId, node.siblingOrder, node.rawText, node.markers, node.sourceNodeId, node.sourceRevisionId,
    ]),
  ])).digest('hex');
}
