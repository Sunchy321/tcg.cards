import { randomUUID } from 'node:crypto';
import { readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { isAbsolute, resolve } from 'node:path';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';

import { createDb } from '@tcg-cards/db';
import { SearchPublicationMetadata } from '@tcg-cards/db/schema/remote';
import { LOCAL_SEARCH_SCHEMA_VERSIONS } from '@tcg-cards/model/search/publication';
import type { SearchPublicationGame, SearchPublicationManifest } from '@tcg-cards/model/search/publication';
import type { TaskDefinition } from '../../../task/registry';
import { readLocalDatabaseUrl, readSearchR2Override } from '../../runtime-config';
import { prepareSearchPublication } from './prepare';
import { createSearchR2Client, publishSearchPackageGroup } from './r2-publisher';

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

/** Builds a separately schedulable publisher for one game's complete search package group. */
export function createSearchPublicationTask(game: SearchPublicationGame): TaskDefinition {
  let prepared: PreparedTask | null = null;
  let latestResult: Record<string, unknown> | null = null;

  return {
    async stages(params) {
      const input = taskInput.parse(params);
      if (input.game !== game) throw new Error('所选游戏与当前任务不一致，请重新选择游戏。');
      if (!isAbsolute(input.directory)) throw new Error('请选择有效的搜索数据导出目录。');

      let source: z.infer<typeof publicationInput>;
      try {
        source = publicationInput.parse(JSON.parse(
          await readFile(resolve(input.directory, 'search-publication-input.json'), 'utf8'),
        ));
      } catch (error) {
        console.error('[search-publication] The selected export details could not be read.', error);
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
        console.error('[search-publication] The selected SQLite packages could not be verified.', error);
        throw new Error('搜索数据文件未通过检查，请确认已导出全部语言包后重试。', { cause: error });
      }

      const current = prepared;
      return [{
        key:          'publish_search_packages',
        label:        '发布搜索数据',
        total:        current.manifest.packages.length,
        progressMode: 'bounded',
        async run(context) {
          const configured = readSearchR2Override();
          if (!configured?.accountId || !configured.accessKeyId || !configured.secretAccessKey) {
            throw new Error('请先在发布配置中填写完整的 Cloudflare R2 连接。');
          }
          await persistPreparedReleaseHash(current.manifest);
          const client = createSearchR2Client({
            accountId:       configured.accountId,
            accessKeyId:     configured.accessKeyId,
            secretAccessKey: configured.secretAccessKey,
          });
          try {
            const manifestPath = resolve(input.directory, 'search-publication-manifest.json');
            const temporaryManifestPath = `${manifestPath}.${randomUUID()}.tmp`;
            try {
              await writeFile(temporaryManifestPath, `${JSON.stringify(current.manifest, null, 2)}\n`, { flag: 'wx' });
              await rename(temporaryManifestPath, manifestPath);
            } catch (error) {
              await unlink(temporaryManifestPath).catch(() => {});
              console.error('[search-publication] The prepared release description could not be saved.', error);
              throw new Error('无法在导出目录保存发布信息，请检查目录权限后重试。', { cause: error });
            }
            let result;
            try {
              result = await publishSearchPackageGroup({
                client,
                bucket:            'data',
                manifest:          current.manifest,
                files:             current.files,
                signal:            context.signal,
                onPackageComplete: async (done, total) => {
                  await context.progress({ done, total });
                },
              });
            } catch (error) {
              if (context.signal?.aborted) throw error;
              console.error('[search-publication] The R2 package group could not be published.', error);
              throw new Error('搜索数据发布未完成，请检查网络和 R2 设置后重试。', { cause: error });
            }
            latestResult = {
              game:            result.game,
              releaseHash:     result.releaseHash,
              manifestPath,
              uploadedObjects: result.uploadedObjects,
              reusedObjects:   result.reusedObjects,
              cleanedObjects:  result.cleanedObjects,
              cleanupWarnings: result.cleanupWarnings,
            };
            await context.saveResult(latestResult);
          } finally {
            client.destroy();
          }
        },
      }];
    },
    result() {
      return latestResult ?? {};
    },
    cleanup() {
      prepared = null;
      latestResult = null;
    },
  };
}

/** Records the complete candidate identity so later PG and D1 publication can match it. */
async function persistPreparedReleaseHash(
  manifest: SearchPublicationManifest,
): Promise<void> {
  const connection = readLocalDatabaseUrl();
  if (connection == null) throw new Error('请先在桌面发布配置中连接本地数据库，再发布搜索数据。');
  const database = createDb(connection);
  try {
    const [publication] = await database.select().from(SearchPublicationMetadata)
      .where(eq(SearchPublicationMetadata.game, manifest.game));
    if (publication == null || !publication.ready
      || publication.dataVersion !== manifest.dataVersion
      || publication.pgFingerprint !== manifest.pgFingerprint
      || publication.schemaVersion !== manifest.schemaVersion
      || manifest.schemaVersion !== LOCAL_SEARCH_SCHEMA_VERSIONS[manifest.game]
      || !matchesPlannerMetadata(publication.plannerMetadata, manifest)) {
      throw new Error('本地搜索投影已变化，请重新导出全部搜索包后再发布。');
    }
    const [updated] = await database.update(SearchPublicationMetadata)
      .set({ releaseHash: manifest.releaseHash, updatedAt: new Date() })
      .where(and(
        eq(SearchPublicationMetadata.game, manifest.game),
        eq(SearchPublicationMetadata.dataVersion, manifest.dataVersion),
        eq(SearchPublicationMetadata.pgFingerprint, manifest.pgFingerprint),
        eq(SearchPublicationMetadata.ready, true),
      ))
      .returning({ game: SearchPublicationMetadata.game });
    if (updated == null) throw new Error('本地搜索投影已变化，请重新导出全部搜索包后再发布。');
  } finally {
    await database.$client.end({ timeout: 1 });
  }
}

function matchesPlannerMetadata(metadata: Record<string, unknown>, manifest: SearchPublicationManifest): boolean {
  if (manifest.game === 'hearthstone') return metadata.buildNumber === manifest.buildNumber;
  const symbols = metadata.typeSymbols;
  const owners = metadata.tagOwners;
  if (!Array.isArray(symbols) || symbols.some(value => typeof value !== 'string')
    || owners == null || typeof owners !== 'object' || Array.isArray(owners)) return false;
  const sortRecord = (value: Record<string, unknown>) => Object.fromEntries(
    Object.entries(value).sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0),
  );
  return JSON.stringify(symbols) === JSON.stringify(manifest.typeSymbols)
    && JSON.stringify(sortRecord(owners as Record<string, unknown>))
    === JSON.stringify(sortRecord(manifest.tagOwners));
}
