import { z } from 'zod';

import { NeuronCards } from '@tcg-cards/db/schema/local/yugioh';

import {
  konamiIndexBlock,
  konamiIndexEntry,
  konamiIndexExit,
  type KonamiIndexOutput,
} from '../../konami/index-stage';
import { crawlNeuron } from '../../konami/neuron-crawl';
import {
  NEURON_LOCALE_WAVE,
  neuronLocaleSelection,
  neuronLocaleWorklist,
  type NeuronLocale,
} from '../../konami/neuron-queue';
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

/** Stable task type for crawling the Neuron official database into the local cache. */
export const yugiohNeuronImportTaskType = 'yugioh_neuron_import';

const input = z.object({
  level:       z.enum(CRAWL_LEVELS).optional().default('refresh'),
  /** Locales to crawl; omitted or empty means the full wave in wave order. */
  locales:     z.enum(NEURON_LOCALE_WAVE).array().optional(),
  concurrency: z.number().int().min(1).max(8).optional().default(1),
  delayMs:     z.number().int().min(50).max(5000).optional().default(800),
});

const localeReport = z.object({
  locale:       z.string(),
  fresh:        z.number(),
  localMissing: z.number(),
  fetched:      z.number(),
  notFound:     z.number(),
  errors:       z.number(),
});

const output = z.object({
  locales: localeReport.array(),
});

/** Cids per durable crawling block. */
const BATCH = 1000;

/**
 * Durable per-block state for the crawling stage: the frozen index, the new
 * cids to prioritize, the position within the locale wave, and the tallies.
 */
interface ImportBlockState {
  cids:         number[];
  newCids:      number[];
  localeIndex:  number;
  current:      number;
  counts:       CrawlReport;
  localeCounts: Record<string, CrawlReport>;
}

/** Live progress segments for the crawling stage: one colored lane per crawl outcome. */
function buildSegments(counts: CrawlReport, total: number) {
  return [
    { name: '成功', done: counts.fetched, total, color: 'bg-success' },
    { name: '失败', done: counts.errors, total, color: 'bg-error' },
    { name: '无本地化数据', done: counts.notFound, total, color: 'bg-warning' },
    { name: '未过期', done: counts.fresh, total, color: 'bg-info' },
    { name: '本地已知无', done: counts.localMissing, total, color: 'bg-purple-500' },
  ];
}

/** Cids with no row in the cache at all — cards newly seen in the index. */
async function findNewCids(cids: number[]): Promise<number[]> {
  const rows = await getYugiohLocalDb().selectDistinct({ cid: NeuronCards.cid }).from(NeuronCards);
  const cached = new Set(rows.map(row => row.cid));
  return cids.filter(cid => !cached.has(cid));
}

const definition = createDefinition(yugiohNeuronImportTaskType, {
  version:     '2026-10-06:v2',
  effectModel: 'reconcilable',
})
  .scope(z.object({}), {
    type:    'yugioh_neuron_import',
    resolve: () => ({ key: 'global', snapshot: {} }),
  })
  .input(input)
  .output(output)
  .context({ init: values => values })
  .stage('indexing', { label: '抓取卡片索引', progressMode: 'bounded', resumeMode: 'durable' })
  .entry(konamiIndexEntry)
  .block(konamiIndexBlock)
  .exit(konamiIndexExit)
  .stage('crawling', { label: '爬取 Neuron 官方库', progressMode: 'bounded', resumeMode: 'durable' })
  .entry(async ({ ctx, input, checkpoint }) => {
    const locales = neuronLocaleSelection((ctx as { locales?: string[] }).locales);
    const restored = checkpoint?.blockInput as ImportBlockState | undefined;
    if (restored) return { total: restored.cids.length * locales.length, blockInput: restored };

    const index = input as KonamiIndexOutput;
    if (!index.cids?.length) throw new Error('Neuron card index came back empty');
    return {
      total:      index.cids.length * locales.length,
      blockInput: {
        cids:         index.cids,
        newCids:      await findNewCids(index.cids),
        localeIndex:  0,
        current:      0,
        counts:       emptyCrawlReport(),
        localeCounts: {},
      } satisfies ImportBlockState,
    };
  })
  .block(async ({ ctx, blockInput, checkpoint, progress, done, signal }) => {
    const state = blockInput as ImportBlockState;
    const locales = neuronLocaleSelection((ctx as { locales?: string[] }).locales);
    if (state.localeIndex >= locales.length) return done(state);

    const locale = locales[state.localeIndex]!;
    const worklist = neuronLocaleWorklist(state.cids, state.newCids);
    const end = Math.min(state.current + BATCH, worklist.length);
    const report = await crawlNeuron(
      getYugiohLocalDb(),
      worklist.slice(state.current, end),
      locale,
      {
        level:       (ctx.level as CrawlLevel | undefined) ?? 'refresh',
        concurrency: ctx.concurrency ?? 1,
        delayMs:     ctx.delayMs ?? 800,
        stopEvery:   10,
        onProgress:  (done, _total, counts) => {
          const total = state.cids.length * locales.length;
          progress({
            done:     state.localeIndex * state.cids.length + state.current + done,
            total,
            segments: buildSegments(addCrawlReports(state.counts, counts), total),
          });
        },
        shouldStop: () => signal?.aborted ?? false,
      },
    );

    // Advance by the cids actually crawled: on an early shouldStop the batch
    // ends partway, and a later pause-resume must restart from that exact spot.
    const processed = countCrawlReport(report);
    const counts = addCrawlReports(state.counts, report);
    const localeCounts: Record<string, CrawlReport> = {
      ...state.localeCounts,
      [locale]: addCrawlReports(state.localeCounts[locale] ?? emptyCrawlReport(), report),
    };
    const finishedLocale = state.current + processed >= worklist.length;
    const next: ImportBlockState = {
      ...state,
      counts,
      localeCounts,
      localeIndex: finishedLocale ? state.localeIndex + 1 : state.localeIndex,
      current:     finishedLocale ? 0 : state.current + processed,
    };
    await checkpoint(next);
    return next.localeIndex >= locales.length ? done(next) : next;
  })
  .exit(({ ctx, blockInput }) => {
    const state = blockInput as ImportBlockState;
    const locales = neuronLocaleSelection((ctx as { locales?: string[] }).locales);
    return {
      locales: locales.map(locale => ({
        locale,
        ...(state.localeCounts[locale] ?? emptyCrawlReport()),
      })),
    };
  })
  .build();

export const yugiohNeuronImportTaskDefinition = definition;

export type { NeuronLocale };
