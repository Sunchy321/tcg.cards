import { fetchNeuronIndexPage } from './neuron-index';
import { sleep } from './common';

/**
 * The card-index stage shared by the Konami crawlers: walks the Neuron card
 * search list (the shared card universe for every Konami source), checkpoints
 * per batch of pages, and reports per-page progress against the site's own hit
 * count. Both `yugioh_cnocg_import` and `yugioh_neuron_import` mount these
 * hooks as their first stage; the stage exit output feeds each crawler's own
 * crawling stage.
 */

/** Safety cap on index pages so a site-side paging loop cannot spin forever. */
const MAX_INDEX_PAGES = 400;

/** Pages fetched per durable indexing block. */
const INDEX_PAGES_PER_BLOCK = 20;

/** Durable per-block state for the indexing stage: cids so far + next page to fetch. */
export interface KonamiIndexBlockState {
  cids:          number[];
  nextPage:      number;
  expectedTotal: number;
}

/** Stage exit output — the frozen card index consumed by the crawling stage. */
export interface KonamiIndexOutput {
  cids:          number[];
  expectedTotal: number;
}

/** The parts of the task context the index stage reads. */
interface IndexStageCtx {
  delayMs?: number;
}

interface IndexStageCheckpoint {
  blockInput?: unknown;
}

interface IndexStageBlockArgs {
  ctx:        IndexStageCtx;
  blockInput: unknown;
  progress:   (update: { done: number, total: number }) => void;
  checkpoint: (blockInput: unknown) => Promise<void>;
  done:       (finalBlockInput: unknown) => unknown;
  signal?:    AbortSignal;
}

/**
 * Stage entry: restores the frozen walk on resume, otherwise fetches page 1 so
 * the stage total (the site's own hit count) drives the progress bar from the
 * very first block.
 */
export async function konamiIndexEntry({ ctx: _ctx, checkpoint }: {
  ctx:        IndexStageCtx;
  checkpoint: IndexStageCheckpoint | null;
}): Promise<{ total: number, blockInput: KonamiIndexBlockState }> {
  const restored = checkpoint?.blockInput as KonamiIndexBlockState | undefined;
  if (restored) return { total: restored.expectedTotal, blockInput: restored };

  const page = await fetchNeuronIndexPage(1);
  if (page.cids.length === 0) throw new Error('Neuron card index came back empty');
  return {
    total:      page.total ?? 0,
    blockInput: {
      cids:          page.cids,
      nextPage:      2,
      expectedTotal: page.total ?? 0,
    },
  };
}

/** Stage block: fetches the next batch of index pages, checkpointing per batch. */
export async function konamiIndexBlock(args: IndexStageBlockArgs): Promise<unknown> {
  const { ctx, blockInput, progress, checkpoint, done, signal } = args;
  const state = blockInput as KonamiIndexBlockState;
  const known = new Set(state.cids);
  const cids = [...state.cids];
  const delayMs = ctx.delayMs ?? 500;

  let finished = false;
  for (let page = state.nextPage; page < state.nextPage + INDEX_PAGES_PER_BLOCK && page <= MAX_INDEX_PAGES; page++) {
    if (signal?.aborted) break;
    if (delayMs > 0) await sleep(delayMs);
    const res = await fetchNeuronIndexPage(page);
    if (res.total != null && res.total > state.expectedTotal) state.expectedTotal = res.total;
    let newCount = 0;
    for (const cid of res.cids) {
      if (!known.has(cid)) {
        known.add(cid);
        cids.push(cid);
        newCount++;
      }
    }
    state.nextPage = page + 1;
    // Report per page: a block covers ~20 slow page fetches, so waiting for
    // the block boundary would leave the progress bar frozen for minutes.
    progress({ done: cids.length, total: state.expectedTotal });
    // Empty page = past the end of the list; full overlap = the site started
    // repeating itself. Either way the index is complete.
    if (res.cids.length === 0 || newCount === 0) {
      finished = true;
      break;
    }
  }

  const next: KonamiIndexBlockState = { ...state, cids };
  await checkpoint(next);
  return finished || next.nextPage > MAX_INDEX_PAGES ? done(next) : next;
}

/** Stage exit: hands the frozen index to the crawler's own crawling stage. */
export function konamiIndexExit({ blockInput }: { blockInput: unknown }): KonamiIndexOutput {
  const s = blockInput as KonamiIndexBlockState;
  return { cids: s.cids, expectedTotal: s.expectedTotal };
}
