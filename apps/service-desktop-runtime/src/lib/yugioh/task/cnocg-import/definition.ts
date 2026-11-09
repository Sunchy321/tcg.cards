import { z } from 'zod';

import { crawlCnocg } from '../../konami/cnocg-crawl';
import {
  konamiIndexBlock,
  konamiIndexEntry,
  konamiIndexExit,
  type KonamiIndexOutput,
} from '../../konami/index-stage';
import {
  addCrawlReports,
  countCrawlReport,
  emptyCrawlReport,
  CRAWL_LEVELS,
  type CrawlLevel,
  type CrawlReport,
} from '../../konami/ttl';
import { getYugiohLocalDb } from '../../yugioh-local-db';
import { createDefinition } from '#task/definition';

/** Stable task type for crawling the CNOCG official database into the local cache. */
export const yugiohCnocgImportTaskType = 'yugioh_cnocg_import';

const input = z.object({
  level:       z.enum(CRAWL_LEVELS).optional().default('refresh'),
  concurrency: z.number().int().min(1).max(8).optional().default(1),
  delayMs:     z.number().int().min(50).max(5000).optional().default(500),
});

const output = z.object({
  fresh:        z.number(),
  localMissing: z.number(),
  fetched:      z.number(),
  notFound:     z.number(),
  errors:       z.number(),
});

/** Cids per durable crawling block. */
const BATCH = 1000;

/** Durable per-block state for the crawling stage: the frozen index plus crawl position and tallies. */
interface ImportBlockState {
  cids:    number[];
  current: number;
  counts:  CrawlReport;
}

/** Live progress segments for the crawling stage: one colored lane per crawl outcome. */
function buildSegments(counts: CrawlReport, total: number) {
  return [
    { name: '成功', done: counts.fetched, total, color: 'bg-success' },
    { name: '失败', done: counts.errors, total, color: 'bg-error' },
    { name: '无简中数据', done: counts.notFound, total, color: 'bg-warning' },
    { name: '未过期', done: counts.fresh, total, color: 'bg-info' },
    { name: '本地已知无', done: counts.localMissing, total, color: 'bg-purple-500' },
  ];
}

const definition = createDefinition(yugiohCnocgImportTaskType, {
  version:     '2026-10-06:v1',
  effectModel: 'reconcilable',
})
  .scope(z.object({}), {
    type:    'yugioh_cnocg_import',
    resolve: () => ({ key: 'global', snapshot: {} }),
  })
  .input(input)
  .output(output)
  .context({ init: values => values })
  .stage('indexing', { label: '抓取卡片索引', progressMode: 'bounded', resumeMode: 'durable' })
  .entry(konamiIndexEntry)
  .block(konamiIndexBlock)
  .exit(konamiIndexExit)
  .stage('crawling', { label: '爬取 CNOCG 官方库', progressMode: 'bounded', resumeMode: 'durable' })
  .entry(async ({ input, checkpoint }) => {
    const restored = checkpoint?.blockInput as ImportBlockState | undefined;
    if (restored) return { total: restored.cids.length, blockInput: restored };

    const index = input as KonamiIndexOutput;
    if (!index.cids?.length) throw new Error('Neuron card index came back empty');
    return {
      total:      index.cids.length,
      blockInput: { cids: index.cids, current: 0, counts: emptyCrawlReport() } satisfies ImportBlockState,
    };
  })
  .block(async ({ ctx, blockInput, checkpoint, progress, done, signal }) => {
    const state = blockInput as ImportBlockState;
    if (state.current >= state.cids.length) return done(state);

    const end = Math.min(state.current + BATCH, state.cids.length);
    const report = await crawlCnocg(getYugiohLocalDb(), state.cids.slice(state.current, end), {
      level:       (ctx.level as CrawlLevel | undefined) ?? 'refresh',
      concurrency: ctx.concurrency ?? 1,
      delayMs:     ctx.delayMs ?? 500,
      stopEvery:   10,
      onProgress:  (done, _total, counts) => {
        progress({
          done:     done + state.current,
          total:    state.cids.length,
          segments: buildSegments(addCrawlReports(state.counts, counts), state.cids.length),
        });
      },
      shouldStop: () => signal?.aborted ?? false,
    });

    // Advance by the cids actually crawled: on an early shouldStop the batch
    // ends partway, and a later pause-resume must restart from that exact spot.
    const next: ImportBlockState = {
      ...state,
      current: state.current + countCrawlReport(report),
      counts:  addCrawlReports(state.counts, report),
    };
    await checkpoint(next);
    return next.current >= state.cids.length ? done(next) : next;
  })
  .exit(({ blockInput }) => {
    const s = blockInput as ImportBlockState;
    return s.counts;
  })
  .build();

export const yugiohCnocgImportTaskDefinition = definition;
