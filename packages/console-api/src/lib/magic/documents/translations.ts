import { randomUUID } from 'node:crypto';
import z from 'zod';

import { reviewStatus, textMarker, translationMethod } from '@tcg-cards/model/magic/schema/document-content';

import { validateMarkers } from './text';
import { calculateStatistics } from './statistics';
import type { DocumentContext } from './service';
import type { Document, DocumentStore, Revision } from './store';

const translationInput = z.strictObject({
  documentId:       z.string().min(1),
  sourceRevisionId: z.string().min(1),
  language:         z.string().trim().min(1),
  title:            z.string().min(1).optional(),
  nodes:            z.array(z.strictObject({
    sourceNodeId: z.string().min(1),
    rawText:      z.string(),
    markers:      z.array(textMarker).default([]),
    translationMethod,
    reviewStatus: reviewStatus.default('unreviewed'),
  })),
});

/** Generate node-aligned translations without independent translated editions. */
export function createTranslationOperations(store: DocumentStore, context: DocumentContext) {
  return {
    async saveTranslation(input: z.input<typeof translationInput>): Promise<Revision> {
      const parsed = translationInput.parse(input);
      return store.transaction(parsed.documentId, async tx => {
        const document = await tx.document(parsed.documentId);
        assertWritable(document, context);
        const source = await tx.revision(parsed.sourceRevisionId);
        if (source == null || source.documentId !== document.id || source.translationId != null || source.sourceRevisionId != null) {
          throw new Error('Translation source must be an original revision of this document');
        }
        if (parsed.language === source.language || parsed.language === document.sourceLanguage) {
          throw new Error('Translation language must differ from the source language');
        }
        const sourceNodes = new Map(source.nodes.map(node => [node.id, node]));
        const selected = new Set<string>();
        for (const node of parsed.nodes) {
          if (!sourceNodes.has(node.sourceNodeId)) throw new Error('Translation node does not belong to its source revision');
          if (selected.has(node.sourceNodeId)) throw new Error('A source node can only be translated once per revision');
          selected.add(node.sourceNodeId);
          validateMarkers(node.rawText, node.markers);
        }
        const existing = (await tx.translations(document.id)).find(row => row.language === parsed.language);
        const translation = existing ?? { id: randomUUID(), documentId: document.id, language: parsed.language };
        if (existing == null) await tx.putTranslation(translation);
        const revisionId = randomUUID();
        const revision: Revision = {
          id:               revisionId, documentId:       document.id, translationId:    translation.id,
          sourceRevisionId: source.id, language:         parsed.language, title:            parsed.title ?? source.title,
          createdAt:        new Date(), deletedAt:        null,
          nodes:            parsed.nodes.map(node => {
            const original = sourceNodes.get(node.sourceNodeId)!;
            return {
              id:                randomUUID(), revisionId, nodeKey:           original.nodeKey, kind:              original.kind,
              anchor:            original.anchor, path:              original.path, level:             original.level,
              parentId:          null, siblingOrder:      original.siblingOrder,
              rawText:           node.rawText, markers:           node.markers,
              sourceNodeId:      original.id, sourceRevisionId:  source.id,
              translationMethod: node.translationMethod, reviewStatus:      node.reviewStatus,
            };
          }),
        };
        revision.meta = calculateStatistics(revision.nodes, document.staticKey === 'magic-cr' ? 'magic-cr' : undefined);
        await tx.putRevision(revision);
        return revision;
      });
    },
    async selectTranslation(input: { documentId: string, releaseId: string, revisionId: string }): Promise<void> {
      await store.transaction(input.documentId, async tx => {
        const document = await tx.document(input.documentId);
        assertWritable(document, context);
        const release = (await tx.releases(document.id)).find(row => row.id === input.releaseId && row.deletedAt == null);
        const revision = await tx.revision(input.revisionId);
        if (release == null) throw new Error('Release not found');
        if (revision == null || revision.documentId !== document.id || revision.translationId == null
          || revision.sourceRevisionId !== release.sourceRevisionId) {
          throw new Error('Translation revision does not match the release source');
        }
        const translation = (await tx.translations(document.id)).find(row => row.id === revision.translationId);
        if (translation == null || translation.language !== revision.language) throw new Error('Translation identity does not match its revision');
        await tx.putReleaseTranslation({ documentId: document.id, releaseId: release.id, translationId: translation.id, revisionId: revision.id, sourceRevisionId: release.sourceRevisionId });
      });
    },
  };
}

/** Enforce static build ownership locally and authenticated article ownership remotely. */
function assertWritable(document: Document | undefined, context: DocumentContext): asserts document is Document {
  if (document == null || document.deletedAt != null) throw new Error('Document not found');
  if (context.track === 'local') {
    if (document.origin !== 'static' || document.authorId != null || document.staticKey == null) throw new Error('Local translations require static content');
  } else if (document.origin !== 'user' || context.actorId == null || document.authorId !== context.actorId) {
    throw new Error('Translation editing requires the document owner');
  }
}
