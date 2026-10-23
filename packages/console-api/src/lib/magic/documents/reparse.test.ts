import { expect, test } from 'bun:test';

import type { Document, Node, Revision } from './store';
import { assertReparse } from './reparse';

const at = new Date('2026-10-01T00:00:00Z');
const document: Document = {
  id: 'magic-cr', slug: 'magic-cr', title: 'Rules', sourceLanguage: 'en', origin: 'static', staticKey: 'magic-cr',
  visibility: 'public', settings: { outline: false, compare: true, historyPublic: true, copyable: true },
  createdAt: at, updatedAt: at, deletedAt: null,
};
const node: Node = {
  id: 'revision/100.1', revisionId: 'revision', nodeKey: '100.1', kind: 'content', anchor: '100.1', path: '1/100/1', level: 3,
  parentId: null, siblingOrder: 0, rawText: 'Pay {W}.', markers: [], sourceNodeId: null, sourceRevisionId: null,
  translationMethod: null, reviewStatus: null,
};
const previous: Revision = {
  id: 'revision', documentId: 'magic-cr', translationId: null, sourceRevisionId: null, title: 'Rules', language: 'en',
  createdAt: at, deletedAt: null, nodes: [node],
};
const revision: Revision = { ...previous, nodes: [{ ...node, rawText: 'Pay {W} after the update.' }] };

test('allows repairing published source content while preserving translated source-node protection', () => {
  expect(() => assertReparse({ document, previous, revision, released: true, hasTranslationReferences: false })).not.toThrow();
  expect(() => assertReparse({ document, previous, revision, released: true, hasTranslationReferences: true }))
    .toThrow('Imported source has dependent translations');
});
