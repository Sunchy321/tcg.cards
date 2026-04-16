import z from 'zod';

import {
  nodeChangeReviewStateCache,
  nodeChangeType,
  nodeContentStatus,
  type NodeKind,
  nodeKind,
} from './document';

const versionSummary = z.strictObject({
  id:            z.string(),
  versionTag:    z.string(),
  effectiveDate: z.iso.date(),
  publishedAt:   z.iso.date().nullable(),
});

const documentSummary = z.strictObject({
  id:   z.string(),
  slug: z.string(),
  name: z.string(),
});

export interface DocumentOutlineItem {
  key: string;
  nodeId: string;
  entityId: string;
  label: string;
  serial: string | null;
  level: number;
  kind: NodeKind;
  children?: DocumentOutlineItem[];
}

export const documentOutlineItem: z.ZodType<DocumentOutlineItem> = z.lazy(() => z.strictObject({
  key:      z.string(),
  nodeId:   z.string(),
  entityId: z.string(),
  label:    z.string(),
  serial:   z.string().nullable(),
  level:    z.number(),
  kind:     nodeKind,
  children: z.array(documentOutlineItem).optional(),
}));

export const documentSectionLocaleState = z.strictObject({
  locale:     z.string(),
  status:     nodeContentStatus,
  isFallback: z.boolean(),
});

export const documentLatestChange = z.strictObject({
  type:           nodeChangeType,
  fromVersionTag: z.string(),
  toVersionTag:   z.string(),
});

export const documentReaderSection = z.strictObject({
  nodeId:        z.string(),
  entityId:      z.string(),
  kind:          nodeKind,
  serial:        z.string().nullable(),
  text:          z.string().nullable(),
  navText:       z.string().nullable(),
  path:          z.string(),
  level:         z.number(),
  parentNodeId:  z.string().nullable(),
  siblingOrder:  z.number(),
  latestChange:  documentLatestChange.nullable(),
  historyCount:  z.number(),
  localeState:   documentSectionLocaleState,
});

export const documentReaderPage = z.strictObject({
  document: documentSummary,
  version:  versionSummary.extend({
    isLatest: z.boolean(),
  }),
  versions: versionSummary.array(),
  outline:  documentOutlineItem.array(),
  sections: documentReaderSection.array(),
});

export const documentReaderSummary = documentReaderPage.omit({
  sections: true,
});

export const documentReaderChapter = z.strictObject({
  chapterNodeId: z.string(),
  sections:      documentReaderSection.array(),
});

export const documentChangeNode = z.strictObject({
  nodeId:   z.string().nullable(),
  entityId: z.string().nullable(),
  title:    z.string().nullable(),
  content:  z.string().nullable(),
  path:     z.string().nullable(),
});

export const documentChangeTextBlock = z.strictObject({
  type:    z.enum(['common', 'added', 'removed']),
  text:    z.string(),
  isMinor: z.boolean().optional(),
});

export const documentChangeTextDiff = z.strictObject({
  mode:   z.enum(['inline', 'side-by-side']),
  blocks: documentChangeTextBlock.array(),
});

export const documentChangeRelation = z.strictObject({
  side:     z.enum(['from', 'to']),
  nodeId:   z.string().nullable(),
  entityId: z.string().nullable(),
  weight:   z.number().nullable(),
});

export const documentChangeCard = z.strictObject({
  changeId:        z.string(),
  entityId:        z.string().nullable(),
  type:            nodeChangeType,
  reviewState:     nodeChangeReviewStateCache,
  confidenceScore: z.number(),
  summary:         z.string(),
  fromNodes:       documentChangeNode.array(),
  toNodes:         documentChangeNode.array(),
  textDiff:        documentChangeTextDiff.nullable(),
  relationGraph:   documentChangeRelation.array(),
  reasons:         z.string().array(),
});

export const documentCompareGroup = z.strictObject({
  chapterKey:   z.string(),
  chapterTitle: z.string(),
  items:        documentChangeCard.array(),
});

export const documentComparePage = z.strictObject({
  document:      documentSummary,
  fromVersion:   versionSummary,
  toVersion:     versionSummary,
  mode:          z.enum(['snapshot', 'reviewed']),
  reviewRevision: z.number(),
  stats:         z.strictObject({
    added:            z.number(),
    removed:          z.number(),
    modified:         z.number(),
    moved:            z.number(),
    renamed:          z.number(),
    renamedModified:  z.number(),
    split:            z.number(),
    merged:           z.number(),
    pendingReview:    z.number(),
  }),
  groups: documentCompareGroup.array(),
});

export const documentDiffSection = z.strictObject({
  nodeId: z.string(),
  kind:   nodeKind,
  serial: z.string().nullable(),
  text:   z.string().nullable(),
  level:  z.number(),
});

export const documentDiffRow = z.discriminatedUnion('kind', [
  z.strictObject({
    kind:  z.literal('omitted'),
    count: z.number(),
  }),
  z.strictObject({
    kind:     z.literal('change'),
    type:     nodeChangeType,
    from:     documentDiffSection.nullable(),
    to:       documentDiffSection.nullable(),
    textDiff: documentChangeTextDiff.nullable(),
  }),
]);

export const documentDiffPage = z.strictObject({
  document:    documentSummary,
  fromVersion: versionSummary,
  toVersion:   versionSummary,
  stats: z.strictObject({
    added:           z.number(),
    removed:         z.number(),
    modified:        z.number(),
    moved:           z.number(),
    renamed:         z.number(),
    renamedModified: z.number(),
    split:           z.number(),
    merged:          z.number(),
  }),
  rows: documentDiffRow.array(),
});

export const documentEntityHistoryEntry = z.strictObject({
  versionId:      z.string(),
  versionTag:     z.string(),
  effectiveDate:  z.iso.date(),
  nodeId:         z.string().nullable(),
  title:          z.string().nullable(),
  content:        z.string().nullable(),
  state:          z.enum(['present', 'removed', 'split', 'merged']),
  change:         z.strictObject({
    changeId:    z.string(),
    type:        nodeChangeType,
    reviewState: nodeChangeReviewStateCache,
    summary:     z.string(),
  }).nullable(),
});

export const documentEntityHistoryPage = z.strictObject({
  document: documentSummary,
  entity:   z.strictObject({
    id:               z.string(),
    originNodeId:     z.string(),
    originVersionTag: z.string(),
    currentNodeId:    z.string().nullable(),
    currentVersionTag:z.string().nullable(),
    totalRevisions:   z.number(),
  }),
  timeline: documentEntityHistoryEntry.array(),
});

export const documentReviewQueueItem = z.strictObject({
  changeId:        z.string(),
  type:            nodeChangeType,
  reviewState:     nodeChangeReviewStateCache,
  confidenceScore: z.number(),
  title:           z.string(),
  summary:         z.string(),
  chapterKey:      z.string().nullable(),
  hasOverride:     z.boolean(),
});

export const documentReviewQueuePage = z.strictObject({
  document: documentSummary,
  versionPair: z.strictObject({
    fromVersionTag: z.string(),
    toVersionTag:   z.string(),
    reviewRevision: z.number(),
  }),
  stats: z.strictObject({
    total:      z.number(),
    pending:    z.number(),
    confirmed:  z.number(),
    rejected:   z.number(),
    overridden: z.number(),
  }),
  items: documentReviewQueueItem.array(),
});

export const documentReviewDetail = z.strictObject({
  changeId:        z.string(),
  type:            nodeChangeType,
  reviewState:     nodeChangeReviewStateCache,
  confidenceScore: z.number(),
  details:         z.record(z.string(), z.unknown()),
  fromNodes:       documentChangeNode.array(),
  toNodes:         documentChangeNode.array(),
  relations:       documentChangeRelation.array(),
  latestReview:    z.strictObject({
    revision:   z.number(),
    status:     z.enum(['pending', 'confirmed', 'rejected', 'override']),
    reviewerId: z.string().nullable(),
    reviewedAt: z.iso.datetime().nullable(),
    reason:     z.string().nullable(),
  }).nullable(),
});

export type DocumentSummary = z.infer<typeof documentSummary>;
export type VersionSummary = z.infer<typeof versionSummary>;
export type DocumentSectionLocaleState = z.infer<typeof documentSectionLocaleState>;
export type DocumentLatestChange = z.infer<typeof documentLatestChange>;
export type DocumentReaderSection = z.infer<typeof documentReaderSection>;
export type DocumentReaderPage = z.infer<typeof documentReaderPage>;
export type DocumentReaderSummary = z.infer<typeof documentReaderSummary>;
export type DocumentReaderChapter = z.infer<typeof documentReaderChapter>;
export type DocumentChangeNode = z.infer<typeof documentChangeNode>;
export type DocumentChangeTextBlock = z.infer<typeof documentChangeTextBlock>;
export type DocumentChangeTextDiff = z.infer<typeof documentChangeTextDiff>;
export type DocumentChangeRelation = z.infer<typeof documentChangeRelation>;
export type DocumentChangeCard = z.infer<typeof documentChangeCard>;
export type DocumentCompareGroup = z.infer<typeof documentCompareGroup>;
export type DocumentComparePage = z.infer<typeof documentComparePage>;
export type DocumentDiffSection = z.infer<typeof documentDiffSection>;
export type DocumentDiffRow = z.infer<typeof documentDiffRow>;
export type DocumentDiffPage = z.infer<typeof documentDiffPage>;
export type DocumentEntityHistoryEntry = z.infer<typeof documentEntityHistoryEntry>;
export type DocumentEntityHistoryPage = z.infer<typeof documentEntityHistoryPage>;
export type DocumentReviewQueueItem = z.infer<typeof documentReviewQueueItem>;
export type DocumentReviewQueuePage = z.infer<typeof documentReviewQueuePage>;
export type DocumentReviewDetail = z.infer<typeof documentReviewDetail>;
