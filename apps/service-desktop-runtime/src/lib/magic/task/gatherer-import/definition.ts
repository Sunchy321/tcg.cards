import { z } from 'zod';

import { runWithDb } from '@tcg-cards/db';

import { createDefinition } from '#task/definition';
import { getLocalDb } from '../../../hearthstone/hsdata-local-db';
import { crawlRange, getMaxMultiverseId, type CrawlLevel, type CrawlReport } from '../../gatherer/crawl';

/** Stable task type for crawling Gatherer multiverseIds into the gatherer cache. */
export const magicGathererImportTaskType = 'magic_gatherer_import';

const input = z.object({
  level:       z.enum(['fill', 'refresh', 'refresh_all', 'force']).optional().default('refresh'),
  from:        z.number().int().min(1).optional(),
  to:          z.number().int().min(1).optional(),
  concurrency: z.number().int().min(1).max(16).optional().default(4),
});

const output = z.object({
  fresh:    z.number(),
  fetched:  z.number(),
  notFound: z.number(),
  errors:   z.number(),
});

const BATCH = 5000;

interface ImportBlockState {
  from:    number;
  to:      number;
  current: number;
  counts:  CrawlReport;
}

function addCounts(a: CrawlReport, b: CrawlReport): CrawlReport {
  return {
    fresh:    a.fresh + b.fresh,
    fetched:  a.fetched + b.fetched,
    notFound: a.notFound + b.notFound,
    errors:   a.errors + b.errors,
  };
}

/** Live progress segments: one colored lane per crawl outcome, over the whole range. */
function buildSegments(counts: CrawlReport, total: number) {
  return [
    { name: '成功', done: counts.fetched, total, color: 'bg-success' },
    { name: '无此卡', done: counts.notFound, total, color: 'bg-warning' },
    { name: '失败', done: counts.errors, total, color: 'bg-error' },
    { name: '未过期', done: counts.fresh, total, color: 'bg-info' },
  ];
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
    const from = ctx.from ?? 1;
    // Clamp an out-of-range to < from into an empty range so total never goes negative.
    const to = Math.max(ctx.to ?? await runWithDb(getLocalDb(), () => getMaxMultiverseId()), from - 1);
    const counts: CrawlReport = { fresh: 0, fetched: 0, notFound: 0, errors: 0 };
    return { total: to - from + 1, blockInput: { from, to, current: from, counts } satisfies ImportBlockState };
  })
  .block(async ({ ctx, blockInput, checkpoint, progress, done, signal }) => {
    const state = blockInput as ImportBlockState;
    if (state.current > state.to) return done(state);

    const end = Math.min(state.current + BATCH - 1, state.to);
    const report = await runWithDb(getLocalDb(), () => crawlRange(
      getLocalDb(),
      state.current,
      end,
      {
        level:       (ctx.level as CrawlLevel | undefined) ?? 'refresh',
        concurrency: ctx.concurrency ?? 4,
        stopEvery:   10,
        onProgress:  (done, _total, counts) => {
          const rangeTotal = state.to - state.from + 1;
          progress({
            done:     done + (state.current - state.from),
            total:    rangeTotal,
            segments: buildSegments(addCounts(state.counts, counts), rangeTotal),
          });
        },
        shouldStop: () => signal?.aborted ?? false,
      },
    ));

    // Advance by the ids actually crawled: on an early shouldStop the batch ends
    // partway, and a later pause-resume must restart from that exact position.
    const processed = report.fresh + report.fetched + report.notFound + report.errors;
    const next: ImportBlockState = {
      ...state,
      current: state.current + processed,
      counts:  {
        fresh:    state.counts.fresh + report.fresh,
        fetched:  state.counts.fetched + report.fetched,
        notFound: state.counts.notFound + report.notFound,
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
