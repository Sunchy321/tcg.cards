import z from 'zod';

export const definitionStatus = z.enum(['active', 'archived']);

export const versionLifecycleStatus = z.enum(['active', 'superseded']);

export const versionImportStatus = z.enum(['pending', 'processing', 'completed', 'failed']);

export const nodeKind = z.enum(['heading', 'term', 'content', 'example']);

export const nodeContentStatus = z.enum(['source', 'draft', 'reviewed', 'published', 'stale']);

export const nodeChangeType = z.enum([
  'added',
  'removed',
  'modified',
  'moved',
  'renamed',
  'renamed_modified',
  'split',
  'merged',
]);

export const nodeChangeReviewStateCache = z.enum([
  'unreviewed',
  'pending',
  'confirmed',
  'rejected',
  'overridden',
]);

export const nodeChangeRelationSide = z.enum(['from', 'to']);

export const changeReviewStatus = z.enum(['pending', 'confirmed', 'rejected', 'override']);

export const nodeChangeDetails = z.strictObject({
  oldContentHash: z.string().optional(),
  newContentHash: z.string().optional(),
  diffPatch: z.string().optional(),
  oldNodeId: z.string().optional(),
  newNodeId: z.string().optional(),
  oldPath: z.string().optional(),
  newPath: z.string().optional(),
  similarityScore: z.number().optional(),
  note: z.string().optional(),
});

export const changeReviewOverrideRelation = z.strictObject({
  side: nodeChangeRelationSide,
  nodeRefId: z.string().nullable(),
  entityId: z.string().nullable(),
  weight: z.number().nullable(),
});

export const changeReviewOverridePayload = z.strictObject({
  type: z.string().optional(),
  entityId: z.string().nullable().optional(),
  fromNodeRefId: z.string().nullable().optional(),
  toNodeRefId: z.string().nullable().optional(),
  relations: changeReviewOverrideRelation.array().optional(),
  note: z.string().optional(),
});

export type DefinitionStatus = z.infer<typeof definitionStatus>;
export type VersionLifecycleStatus = z.infer<typeof versionLifecycleStatus>;
export type VersionImportStatus = z.infer<typeof versionImportStatus>;
export type NodeKind = z.infer<typeof nodeKind>;
export type NodeContentStatus = z.infer<typeof nodeContentStatus>;
export type NodeChangeType = z.infer<typeof nodeChangeType>;
export type NodeChangeReviewStateCache = z.infer<typeof nodeChangeReviewStateCache>;
export type NodeChangeRelationSide = z.infer<typeof nodeChangeRelationSide>;
export type ChangeReviewStatus = z.infer<typeof changeReviewStatus>;
export type NodeChangeDetails = z.infer<typeof nodeChangeDetails>;
export type ChangeReviewOverrideRelation = z.infer<typeof changeReviewOverrideRelation>;
export type ChangeReviewOverridePayload = z.infer<typeof changeReviewOverridePayload>;
