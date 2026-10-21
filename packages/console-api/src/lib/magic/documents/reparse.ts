import { isDeepStrictEqual } from 'node:util';

import type { Document, Revision } from './store';

/** Compares saved content independently of derived metadata, SQL order and history visibility. */
export function sameRevision(left: Revision, right: Revision): boolean {
  const { deletedAt: _leftDeleted, meta: _leftMeta, nodes: leftNodes, ...leftContent } = left;
  const { deletedAt: _rightDeleted, meta: _rightMeta, nodes: rightNodes, ...rightContent } = right;
  return isDeepStrictEqual(leftContent, rightContent)
    && isDeepStrictEqual([...leftNodes].sort((a, b) => a.id.localeCompare(b.id)), [...rightNodes].sort((a, b) => a.id.localeCompare(b.id)));
}

/** Restricts parsing repairs to unreferenced, released CR sources with unchanged identity. */
export function assertReparse(input: {
  document: Document | undefined;
  previous: Revision | undefined;
  revision: Revision;
  released: boolean;
  referenced: boolean;
}) {
  const { document, previous, revision, released, referenced } = input;
  if (document?.id !== 'magic-cr' || document.origin !== 'static' || document.staticKey !== 'magic-cr'
    || document.deletedAt != null || previous == null || previous.documentId !== document.id
    || previous.translationId != null || previous.sourceRevisionId != null || previous.language !== 'en'
    || previous.deletedAt != null || !released || !sameRevision(previous, { ...revision, nodes: previous.nodes })) {
    throw new Error('Only released CR source nodes can be reparsed');
  }
  if (referenced) throw new Error('Imported source has dependent translations or comparisons');
}
