import { TaskBoundarySignal } from '../../../task/registry';
import type { SearchSnapshotBatch } from './snapshot/snapshot-batch';

import type { SearchD1StatementResult } from './d1-remote';

/** Resume checkpoint stored after every applied snapshot segment. */
export interface SearchD1ResumeToken {
  segmentOrdinal: number;
}

/** Per-statement outcome of one remote search D1 batch. */
export type { SearchD1StatementResult };

/** The console always applies text rows with per-row FTS statements; no remote statement can exceed a small batch. */
export const SEARCH_D1_FTS_MODE = 'incremental' as const;

const FTS_DELETE_ALL = {
  magic:       'INSERT INTO magic_search_text_fts(magic_search_text_fts) VALUES (\'delete-all\');',
  hearthstone: 'INSERT INTO hearthstone_search_text_fts(hearthstone_search_text_fts) VALUES (\'delete-all\');',
} as const;

/** Injected collaborators of the snapshot applier, kept narrow for tests. */
export interface SearchD1ApplyHooks {
  game:          'magic' | 'hearthstone';
  /** Opens a fresh batch stream; the applier may stream more than once to rewind. */
  batches(): AsyncIterable<SearchSnapshotBatch>;
  execute(statements: string[]): Promise<SearchD1StatementResult[]>;
  resume?:       { done: number | null, token: Record<string, unknown> | null } | null;
  signal?:       AbortSignal | null;
  /** Base delay for transient-failure retries; tests shrink it to keep runs fast. */
  retryDelayMs?: number;
  onProgress?(update: { done: number }): Promise<void> | void;
  onSegmentComplete?(token: SearchD1ResumeToken, update: { done: number }): Promise<void> | void;
}

/** Result summary of one applier pass. */
export interface SearchD1ApplyResult {
  batchesApplied: number;
  tableCounts:    Map<string, number>;
}

/** Internal control that restarts the stream from the first text segment. */
class RewindToFirstText extends Error {
  constructor(readonly firstTextOrdinal: number) {
    super('rewind to the first text segment');
  }
}

/**
 * Applies snapshot batches segment by segment. Every insert segment starts with
 * its exact-range deletes, so replaying a segment after an interruption never
 * duplicates or erases neighboring segments. Resuming inside the text phase
 * restarts the stream from its first segment so the FTS index rebuilds cleanly;
 * progress counting restarts with it and stays within the stage total.
 */
export async function applySearchSnapshotBatches(hooks: SearchD1ApplyHooks): Promise<SearchD1ApplyResult> {
  const resumeToken = hooks.resume?.token as Partial<SearchD1ResumeToken> | null | undefined;
  let nextOrdinal = typeof resumeToken?.segmentOrdinal === 'number' && resumeToken.segmentOrdinal >= 0
    ? resumeToken.segmentOrdinal
    : 0;

  for (;;) {
    try {
      return await runPass(hooks, nextOrdinal);
    } catch (error) {
      if (error instanceof RewindToFirstText) {
        nextOrdinal = error.firstTextOrdinal;
        continue;
      }
      throw error;
    }
  }
}

/** Streams one pass over the batches, applying every segment from `startOrdinal` onward. */
async function runPass(hooks: SearchD1ApplyHooks, startOrdinal: number): Promise<SearchD1ApplyResult> {
  const executeWithRetry = async (statements: string[]): Promise<SearchD1StatementResult[]> => {
    let delayMs = hooks.retryDelayMs ?? 1000;
    for (let attempt = 0; ; attempt++) {
      try {
        return await hooks.execute(statements);
      } catch (error) {
        if (attempt >= 2 || hooks.signal?.aborted) throw error;
        await new Promise(resolveSleep => setTimeout(resolveSleep, delayMs));
        delayMs *= 4;
      }
    }
  };

  const nextOrdinal = startOrdinal;
  let ordinal = -1;
  let lastFinal = true;
  let prefixPending = false;
  let segmentDelete: string[] = [];
  let segmentIsText = false;
  let firstTextOrdinal: number | null = null;
  let done = 0;
  let batchesApplied = 0;
  const tableCounts = new Map<string, number>();

  for await (const batch of hooks.batches()) {
    if (hooks.signal?.aborted) {
      throw new TaskBoundarySignal((hooks.signal.reason as 'pause' | 'cancel' | 'shutdown' | undefined) ?? 'cancel');
    }
    const segmentStarted = lastFinal;
    lastFinal = batch.final;
    if (segmentStarted) {
      ordinal++;
      segmentDelete = batch.deleteStatements ?? [];
      segmentIsText = batch.table != null && batch.table.endsWith('_text_rows');
      if (segmentIsText && firstTextOrdinal == null) firstTextOrdinal = ordinal;
      prefixPending = true;
    }

    // A resume that lands inside the text phase replays the whole phase so the
    // index rebuilds cleanly; the stream restarts from the first text segment.
    if (segmentStarted && ordinal === nextOrdinal && segmentIsText
      && firstTextOrdinal != null && firstTextOrdinal < ordinal) {
      throw new RewindToFirstText(firstTextOrdinal);
    }
    done++;

    if (ordinal < nextOrdinal) continue;

    if (prefixPending) {
      const prefix = [...segmentDelete];
      if (segmentIsText && firstTextOrdinal === ordinal) prefix.push(FTS_DELETE_ALL[hooks.game]);
      if (prefix.length > 0) await executeWithRetry(prefix);
      prefixPending = false;
    }
    if (batch.statements.length > 0) {
      await executeWithRetry(batch.statements);
      batchesApplied++;
    }
    if (done % 25 === 0) await hooks.onProgress?.({ done });

    if (batch.final) {
      if (batch.role === 'insert' && batch.table != null) {
        const expected = batch.expectedRows ?? 0;
        const counted = await executeWithRetry([`SELECT COUNT(*) AS row_count FROM ${batch.table};`]);
        const actual = Number(counted[0]?.rows?.[0]?.['row_count'] ?? -1);
        if (actual !== expected) {
          throw new Error(`远程搜索库的表 ${batch.table} 行数校验不符：期望 ${expected}，实际 ${actual}。`);
        }
        tableCounts.set(batch.table, actual);
      }
      await hooks.onSegmentComplete?.({ segmentOrdinal: ordinal + 1 }, { done });
    }
  }

  return { batchesApplied, tableCounts };
}
