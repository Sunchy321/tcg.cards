import { runWithDb } from '@tcg-cards/db';

import type { BlockDone } from '#task/definition';

import { getLocalDb } from '../../hearthstone/hsdata-local-db';
import { addImageImportOutput, emptyImageImportOutput, type ImageImportDelta, type ImageImportOutput } from './result';

/** Mutable state of one chunked import stage, checkpointed between batches. */
export interface ImportBatchState<TItem> {
  items:      TItem[];
  offset:     number;
  counts:     ImageImportOutput;
  cleanupJpg: boolean;
  force:      boolean;
}

export function createImportBatchState<TItem>(
  items: TItem[],
  counts: ImageImportOutput,
  options: { cleanupJpg: boolean, force: boolean },
): ImportBatchState<TItem> {
  return { items, offset: 0, counts, cleanupJpg: options.cleanupJpg, force: options.force };
}

/**
 * Runs one block of a chunked import stage: takes the next batch, executes it
 * inside one DB scope, checkpoints, reports progress and signals completion.
 */
export async function runImportBlock<TItem>(args: {
  state:      ImportBatchState<TItem>;
  batchSize:  number;
  run:        (batch: TItem[], signal?: AbortSignal) => Promise<ImageImportDelta>;
  progress:   (update: { done: number, total: number }) => void;
  checkpoint: (state: ImportBatchState<TItem>) => Promise<void>;
  done:       (state: ImportBatchState<TItem>) => BlockDone;
  signal?:    AbortSignal;
}): Promise<ImportBatchState<TItem> | BlockDone> {
  const { state, batchSize, run, progress, checkpoint, done, signal } = args;
  if (state.offset >= state.items.length) return done(state);

  const batch = state.items.slice(state.offset, state.offset + batchSize);
  const db = getLocalDb();
  const counts = await runWithDb(db, () => run(batch, signal));

  state.counts = addImageImportOutput(state.counts, counts);
  state.offset += batch.length;
  await checkpoint(state);
  progress({ done: state.offset, total: state.items.length });

  if (state.offset >= state.items.length) return done(state);
  return state;
}

/** Fresh accumulator, re-exported so definitions do not import two modules for it. */
export { emptyImageImportOutput };
