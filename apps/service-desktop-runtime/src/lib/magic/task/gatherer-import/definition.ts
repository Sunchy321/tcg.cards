import { z } from 'zod';

import { runWithDb } from '@tcg-cards/db';

import { createDefinition } from '#task/definition';
import { getLocalDb } from '../../../hearthstone/hsdata-local-db';
import { crawlRange, getMaxMultiverseId, type CrawlLevel, type CrawlReport } from '../../gatherer/crawl';

/** Stable task type for crawling Gatherer multiverseIds into the gatherer cache. */
export const magicGathererImportTaskType = 'magic_gatherer_import';

const input = z.object({
  level:       z.enum(['fill', 'refresh', 'refresh_all', 'force']).optional().default('refresh'),
  from:        z.number().int().min(0).optional(),
  to:          z.number().int().optional(),
  concurrency: z.number().int().min(1).max(16).optional().default(4),
});

const output = z.object({
  fetched:  z.number(),
  notFound: z.number(),
  skipped:  z.number(),
  errors:   z.number(),
});

const BATCH = 5000;

interface ImportBlockState {
  from:    number;
  to:      number;
  current: number;
  counts:  CrawlReport;
}

const definition = createDefinition(magicGathererImportTaskType, {
  version:     '2026-08-25:v1',
  effectModel: 'reconcilable',
})
  .scope(z.object({}), {
    type:    'magic_gatherer_import',
    resolve: () => ({ key: 'global', snapshot: {} }),
  })
  .input(input)
  .output(output)
  .context({ init: values => values })
  .stage('crawling', { label: '爬取 Gatherer', progressMode: 'bounded', resumeMode: 'durable' })
  .entry(async ({ ctx, checkpoint }) => {
    const restored = checkpoint?.blockInput as ImportBlockState | undefined;
    if (restored) return { total: restored.to - restored.from + 1, blockInput: restored };
    const to = ctx.to ?? await runWithDb(getLocalDb(), () => getMaxMultiverseId());
    const from = ctx.from ?? 0;
    const counts: CrawlReport = { fetched: 0, notFound: 0, skipped: 0, errors: 0 };
    return { total: to - from + 1, blockInput: { from, to, current: from, counts } satisfies ImportBlockState };
  })
  .block(async ({ ctx, blockInput, checkpoint, progress, done }) => {
    const state = blockInput as ImportBlockState;
    if (state.current > state.to) return done(state);

    const end = Math.min(state.current + BATCH - 1, state.to);
    const report = await runWithDb(getLocalDb(), () => crawlRange(
      getLocalDb(),
      state.current,
      end,
      { level: (ctx.level as CrawlLevel | undefined) ?? 'refresh', concurrency: ctx.concurrency ?? 4, onProgress: p => progress({ done: p + (state.current - state.from), total: state.to - state.from + 1 }) },
    ));

    const next: ImportBlockState = {
      ...state,
      current: end + 1,
      counts:  {
        fetched:  state.counts.fetched + report.fetched,
        notFound: state.counts.notFound + report.notFound,
        skipped:  state.counts.skipped + report.skipped,
        errors:   state.counts.errors + report.errors,
      },
    };
    await checkpoint(next);
    return next.current > state.to ? done(next) : next;
  })
  .exit(({ blockInput }) => {
    const s = blockInput as ImportBlockState;
    return s.counts;
  })
  .build();

export const magicGathererImportTaskDefinition = definition;
