import { ORPCError } from '@orpc/server';
import z from 'zod';

import { createDocumentService } from '@tcg-cards/console-api/lib/magic/documents/service';
import { createDocumentStore } from '@tcg-cards/console-api/lib/magic/documents/database';
import { db } from '#db/db';
import { os } from '#server/orpc';
import { nodeKind } from '#model/magic/schema/document';
import { documentSettings, documentVisibility, sourceFile, textMarker, translationMethod, reviewStatus } from '#model/magic/schema/document-content';

const owner = os.use(async ({ context, next }) => {
  if (!context.user) throw new ORPCError('UNAUTHORIZED');
  return next({ context: { documents: createDocumentService(createDocumentStore(db, 'remote'), { track: 'remote', actorId: context.user.id }) } });
});

const documentId = z.object({ documentId: z.string().min(1) });
const revisionId = documentId.extend({ revisionId: z.string().min(1) });
const node = z.object({
  nodeKey:   z.string().min(1),
  rawText:   z.string(),
  kind:      nodeKind.optional(),
  parentKey: z.string().nullable().optional(),
  anchor:    z.string().optional(),
  markers:   textMarker.array().optional(),
});

const create = owner.input(z.object({
  slug:       z.string().min(1).max(200).regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/),
  title:      z.string().min(1).max(500), language:   z.string().min(1).max(32),
  visibility: documentVisibility.optional(), settings:   documentSettings.partial().optional(),
})).handler(({ input, context }) => context.documents.create(input));

const save = owner.input(documentId.extend({ title: z.string().min(1).max(500), nodes: node.array().max(20000) }))
  .handler(({ input, context }) => context.documents.save(input));
const publish = owner.input(revisionId.extend({ versionTag: z.string().min(1).max(100), effectiveDate: z.iso.date().optional(), files: sourceFile.array().optional() }))
  .handler(({ input, context }) => context.documents.publish(input));
const revision = os.input(revisionId).handler(({ input, context }) =>
  createDocumentService(createDocumentStore(db, 'remote'), { track: 'remote', actorId: context.user?.id }).revision(input));
const restore = owner.input(revisionId).handler(({ input, context }) => context.documents.restore(input));
const clearHistory = owner.input(documentId.extend({ revisionIds: z.array(z.string()).max(1000) }))
  .handler(({ input, context }) => context.documents.clearHistory(input));
const revisions = os.input(documentId).handler(({ input, context }) =>
  createDocumentService(createDocumentStore(db, 'remote'), { track: 'remote', actorId: context.user?.id }).revisions(input.documentId));

const saveTranslation = owner.input(documentId.extend({
  sourceRevisionId: z.string(), language:         z.string().min(1), title:            z.string().optional(),
  nodes:            z.array(z.object({ sourceNodeId: z.string(), rawText: z.string(), markers: textMarker.array().optional(), translationMethod, reviewStatus: reviewStatus.optional() })).max(20000),
})).handler(({ input, context }) => context.documents.saveTranslation(input));
const selectTranslation = owner.input(revisionId.extend({ releaseId: z.string() }))
  .handler(({ input, context }) => context.documents.selectTranslation(input));

const computeRelations = owner.input(documentId).handler(({ input, context }) => context.documents.computeRelations(input));

export const documentAuthoring = { create, save, computeRelations, publish, revision, restore, clearHistory, revisions, saveTranslation, selectTranslation };
