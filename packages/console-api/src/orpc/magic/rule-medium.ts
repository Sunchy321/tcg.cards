import { os as create } from '@orpc/server';
import { z } from 'zod';

import {
  changeReviewOverridePayload,
  nodeChangeReviewStateCache,
} from '@tcg-cards/model/magic/schema/document';

import {
  listChanges,
  getChangeDetail,
  submitReview,
  batchReview,
  getNodeHistory,
  compareVersions as compareVersionsLib,
  getNodeContents,
} from '../../lib/magic/documents/reviewer';
const os = create.$context<{ user: { id: string } | null }>();

export const changes = os
  .route({
    method:      'GET',
    description: 'List changes between two versions with optional review status filter',
    tags:        ['Magic', 'Rule'],
  })
  .input(z.object({
    documentId:    z.string(),
    fromVersionId: z.string(),
    toVersionId:   z.string(),
    status:        nodeChangeReviewStateCache.array().optional(),
    page:          z.number().int().positive().optional(),
    pageSize:      z.number().int().positive().max(200).optional(),
  }))
  .handler(async ({ input }) => {
    return listChanges(input);
  });

export const change = os
  .route({
    method:      'GET',
    description: 'Get a single change with its relations and review history',
    tags:        ['Magic', 'Rule'],
  })
  .input(z.object({
    changeId: z.string().min(1),
  }))
  .handler(async ({ input }) => {
    return getChangeDetail(input.changeId);
  });

export const review = os
  .route({
    method:      'POST',
    description: 'Submit a review for a change (confirm, reject, or override)',
    tags:        ['Magic', 'Rule'],
  })
  .input(z.object({
    changeId:        z.string().min(1),
    status:          z.enum(['confirmed', 'rejected', 'override']),
    reason:          z.string().optional(),
    overridePayload: changeReviewOverridePayload.optional(),
  }))
  .handler(async ({ input, context }) => {
    return submitReview({ ...input, reviewerId: context.user?.id });
  });

export const reviewBatch = os
  .route({
    method:      'POST',
    description: 'Batch review multiple changes with the same status',
    tags:        ['Magic', 'Rule'],
  })
  .input(z.object({
    changeIds: z.string().min(1).array().min(1).max(100),
    status:    z.enum(['confirmed', 'rejected']),
    reason:    z.string().optional(),
  }))
  .handler(async ({ input, context }) => {
    return batchReview({ ...input, reviewerId: context.user?.id });
  });

export const nodeHistory = os
  .route({
    method:      'GET',
    description: 'Get the history timeline of a node entity across all versions',
    tags:        ['Magic', 'Rule'],
  })
  .input(z.object({
    documentId: z.string(),
    entityId:   z.string(),
  }))
  .handler(async ({ input, context }) => {
    return getNodeHistory(input, context.user?.id);
  });

export const compareVersions = os
  .route({
    method:      'GET',
    description: 'Compare two versions of a document, returning changes and diff mode',
    tags:        ['Magic', 'Rule'],
  })
  .input(z.object({
    documentId:    z.string(),
    fromVersionId: z.string(),
    toVersionId:   z.string(),
  }))
  .handler(async ({ input }) => {
    return compareVersionsLib(input);
  });

export const nodeContent = os
  .route({
    method:      'GET',
    description: 'Get content for specific node IDs',
    tags:        ['Magic', 'Rule'],
  })
  .input(z.object({
    nodeIds: z.string().array().min(1).max(100),
  }))
  .output(z.record(z.string(), z.string().nullable()))
  .handler(async ({ input }) => {
    return getNodeContents(input.nodeIds);
  });
