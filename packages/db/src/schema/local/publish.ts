import { pgEnum } from 'drizzle-orm/pg-core';

/** Shared batch lifecycle states used by local publish-owned execution. */
export const publishBatchStatus = pgEnum('publish_batch_status', [
  'planning',
  'applying',
  'paused',
  'stopped',
  'completed',
  'failed',
]);

/** Shared stream-level control operations used by local publish-owned execution. */
export const publishOperationKind = pgEnum('publish_operation_kind', [
  'publish',
  'repair',
  'rollback',
  'pin',
]);

/** Shared row-level plan actions produced by local publish-owned diff planning. */
export const publishBatchRowAction = pgEnum('publish_batch_row_action', [
  'insert',
  'update',
  'delete',
  'unchanged',
]);

/** Shared row-level execution states recorded by local publish-owned apply flow. */
export const publishBatchRowStatus = pgEnum('publish_batch_row_status', [
  'pending',
  'applied',
  'skipped',
  'failed',
]);

/** Shared row-level change operations recorded by local publish-owned change tracking. */
export const publishRowChangeOperation = pgEnum('publish_row_change_operation', [
  'insert',
  'update',
  'delete',
]);
