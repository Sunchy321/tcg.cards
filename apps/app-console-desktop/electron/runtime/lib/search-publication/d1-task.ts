import { readFile } from 'node:fs/promises';
import { isAbsolute, resolve } from 'node:path';

import { createDb } from '@tcg-cards/db';
import type { SearchPublicationGame, SearchPublicationManifest } from '@tcg-cards/model/search/publication';
import type { HearthstoneSearchManifest } from '@tcg-cards/model/hearthstone/search/manifest';
import {
  generateHearthstoneD1SnapshotBatches,
  generateMagicD1SnapshotBatches,
  openSearchSnapshotReaderNodeSqlite,
  projectedSearchQuery,
  snapshotRows,
  type SearchSnapshotBatch,
  type SearchSnapshotReader,
  type SnapshotItem,
} from './snapshot';
import { z } from 'zod';

import { TaskBoundarySignal } from '../../../task/registry';
import type { TaskDefinition, TaskStageDefinition } from '../../../task/registry';
import { readLocalDatabaseUrl, readSearchServiceSessionOverride } from '../../runtime-config';
import { applySearchSnapshotBatches, SEARCH_D1_FTS_MODE } from './d1-apply';
import { createSearchD1Remote, requireSearchD1Session } from './d1-remote';
import { prepareSearchPublication } from './prepare';
import { persistPreparedReleaseHash } from './release-hash';

const digest = z.string().regex(/^[a-f0-9]{64}$/);
const publicationInput = z.discriminatedUnion('game', [
  z.strictObject({
    game:          z.literal('magic'),
    pgFingerprint: digest,
    typeSymbols:   z.array(z.string()),
    tagOwners:     z.record(z.string(), z.enum(['card-only', 'print-only', 'overlap'])),
  }),
  z.strictObject({
    game:          z.literal('hearthstone'),
    pgFingerprint: digest,
    buildNumber:   z.number().int().positive(),
  }),
]);

const taskInput = z.strictObject({
  game:      z.enum(['magic', 'hearthstone']),
  directory: z.string().trim().min(1),
});

type PreparedTask = Awaited<ReturnType<typeof prepareSearchPublication>>;

const SIZING = { maxStatements: 300, maxBytes: 512 * 1024 };

const FTS_PROBE = {
  magic:       'SELECT COUNT(*) AS row_count FROM magic_search_text_fts WHERE magic_search_text_fts MATCH \'the\';',
  hearthstone: 'SELECT COUNT(*) AS row_count FROM hearthstone_search_text_fts WHERE hearthstone_search_text_fts MATCH \'the\';',
} as const;

/** Builds a separately schedulable publisher that loads one game's search snapshot into remote D1. */
export function createSearchD1PublicationTask(game: SearchPublicationGame): TaskDefinition {
  let prepared: PreparedTask | null = null;
  let items: SnapshotItem[] | null = null;
  let latestResult: Record<string, unknown> | null = null;

  /** Opens the validated snapshot readers for one Magic release. */
  async function openMagicPackages(manifest: SearchPublicationManifest): Promise<{
    base:    SearchSnapshotReader;
    locales: Record<string, SearchSnapshotReader>;
  }> {
    const fileByKey = new Map(prepared!.files.map(file => [file.key, file.path]));
    let base: SearchSnapshotReader | null = null;
    const locales: Record<string, SearchSnapshotReader> = {};
    for (const descriptor of manifest.packages) {
      const path = fileByKey.get(descriptor.key);
      if (path == null) throw new Error('搜索数据文件与发布信息不一致，请重新导出后重试。');
      if (descriptor.role === 'base') {
        base = await openSearchSnapshotReaderNodeSqlite(path, 'magic');
      } else {
        locales[descriptor.locale] = await openSearchSnapshotReaderNodeSqlite(path, 'magic');
      }
    }
    if (base == null) throw new Error('搜索数据文件缺少基础包，请重新导出后重试。');
    return { base, locales };
  }

  /** Streams one full snapshot as remotely applicable batches in the console's FTS mode. */
  async function* snapshotBatches(manifest: SearchPublicationManifest): AsyncGenerator<SearchSnapshotBatch> {
    if (game === 'magic') {
      const packages = await openMagicPackages(manifest);
      try {
        yield* generateMagicD1SnapshotBatches({
          manifest: manifest as SearchPublicationManifest & { game: 'magic' },
          packages,
          ftsMode:  SEARCH_D1_FTS_MODE,
          sizing:   SIZING,
        });
      } finally {
        packages.base.close();
        for (const reader of Object.values(packages.locales)) reader.close();
      }
      return;
    }
    if (items == null) throw new Error('搜索数据尚未准备完成，请重新发起发布。');
    yield* generateHearthstoneD1SnapshotBatches({
      items,
      manifest: manifest as HearthstoneSearchManifest,
      ftsMode:  SEARCH_D1_FTS_MODE,
    });
  }

  /** Counts the batches of one full generation so progress bounds stay exact. */
  async function countSnapshotBatches(manifest: SearchPublicationManifest): Promise<number> {
    let total = 0;
    for await (const batch of snapshotBatches(manifest)) {
      total++;
      if (batch.statements.length === 0 && !batch.final) {
        throw new Error('搜索快照生成了意外的空批次。');
      }
    }
    return total;
  }

  return {
    async stages(params): Promise<TaskStageDefinition[]> {
      const input = taskInput.parse(params);
      if (input.game !== game) throw new Error('所选游戏与当前任务不一致，请重新选择游戏。');
      if (!isAbsolute(input.directory)) throw new Error('请选择有效的搜索数据导出目录。');
      if (readSearchServiceSessionOverride()?.cookieHeader == null) {
        throw new Error('请先登录控制台服务，再发布搜索数据。');
      }

      let source: z.infer<typeof publicationInput>;
      try {
        source = publicationInput.parse(JSON.parse(
          await readFile(resolve(input.directory, 'search-publication-input.json'), 'utf8'),
        ));
      } catch (error) {
        console.error('[search-d1-publication] The selected export details could not be read.', error);
        throw new Error('所选目录中的搜索数据不完整或无效，请重新导出后重试。', { cause: error });
      }
      if (source.game !== game) throw new Error('所选目录中的搜索数据属于另一款游戏。');
      try {
        prepared = source.game === 'magic'
          ? await prepareSearchPublication({ ...source, game: 'magic', directory: input.directory })
          : await prepareSearchPublication({
            game:          'hearthstone',
            directory:     input.directory,
            pgFingerprint: source.pgFingerprint,
            buildNumber:   source.buildNumber,
          });
      } catch (error) {
        console.error('[search-d1-publication] The selected SQLite packages could not be verified.', error);
        throw new Error('搜索数据文件未通过检查，请确认已导出全部语言包后重试。', { cause: error });
      }

      items = null;
      if (game === 'hearthstone') {
        const connection = readLocalDatabaseUrl();
        if (connection == null) throw new Error('请先在桌面发布配置中连接本地数据库，再发布搜索数据。');
        const database = createDb(connection);
        try {
          items = snapshotRows(await projectedSearchQuery(database));
        } catch (error) {
          console.error('[search-d1-publication] The local search projection could not be read.', error);
          throw new Error('本地搜索投影尚未生成，请先完成卡牌数据投影后再发布。', { cause: error });
        } finally {
          await database.$client.end({ timeout: 1 });
        }
        if (items.length === 0) throw new Error('本地搜索投影没有任何卡牌数据，请先完成数据投影。');
      }

      const current = prepared;
      return [{
        key:          'publish_search_d1',
        label:        '发布搜索数据',
        total:        null,
        progressMode: 'bounded',
        resumeMode:   'durable',
        async prepare() {
          return { total: await countSnapshotBatches(current.manifest) };
        },
        async run(context) {
          const remote = createSearchD1Remote(requireSearchD1Session());
          await persistPreparedReleaseHash(current.manifest);
          const startedAt = Date.now();
          const manifest = current.manifest;

          try {
            const { batchesApplied, tableCounts } = await applySearchSnapshotBatches({
              game,
              batches:           () => snapshotBatches(manifest),
              execute:           statements => remote.execute(game, statements),
              resume:            context.resume ?? null,
              signal:            context.signal ?? null,
              onProgress:        update => context.progress(update),
              onSegmentComplete: (token, update) => context.checkpoint({ ...token }, update),
            });

            const meta = await remote.meta(game);
            if (meta['ready'] !== '1'
              || meta['data_version'] !== manifest.dataVersion
              || meta['release_hash'] !== manifest.releaseHash
              || meta['schema_version'] !== String(manifest.schemaVersion)) {
              throw new Error('远程搜索库装载完成但版本标识不符，请重新发布。');
            }
            await remote.execute(game, [FTS_PROBE[game]]);
            latestResult = {
              game,
              releaseHash: manifest.releaseHash,
              batches:     batchesApplied,
              tables:      Object.fromEntries(tableCounts),
              durationMs:  Date.now() - startedAt,
            };
            await context.saveResult(latestResult);
          } catch (error) {
            if (error instanceof TaskBoundarySignal) throw error;
            console.error('[search-d1-publication] The search snapshot could not be applied.', error);
            throw new Error('搜索数据装载未完成，请检查控制台服务连接后从断点重试。', { cause: error });
          }
        },
      }];
    },
    result() {
      return latestResult ?? {};
    },
    cleanup() {
      prepared = null;
      items = null;
      latestResult = null;
    },
  };
}
