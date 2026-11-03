/**
 * One remotely applicable slice of a generated search snapshot. Segments are
 * ordered parents-first so re-applying one segment after a failure never
 * violates the foreign keys that remote D1 enforces by default.
 */
export type SearchSnapshotBatch = {
  /** Segment role; insert batches carry the target table. */
  role: 'ddl' | 'meta-clear' | 'clear' | 'insert' | 'fts' | 'meta';

  /** Target table for insert batches; null for the framing segments. */
  table: string | null;

  /** Marks the last batch of the current segment. */
  final: boolean;

  /** Source row count for the finished insert segment, used for remote count verification. */
  expectedRows?: number;

  /**
   * Exact-range delete statements scoped to this segment, emitted on the first
   * batch of an insert segment. Re-applying a segment after an interruption
   * deletes exactly its own rows first, so replay never duplicates or erases
   * neighboring segments.
   */
  deleteStatements?: string[];

  /** Raw SQL statements to execute in order within one remote call. */
  statements: string[];
};
