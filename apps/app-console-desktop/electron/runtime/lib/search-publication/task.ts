import { createReadStream } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { isAbsolute, resolve } from 'node:path';
import { Readable } from 'node:stream';
import { z } from 'zod';

import type { SearchPublicationGame } from '@tcg-cards/model/search/publication';
import type { TaskDefinition } from '../../../task/registry';
import { findPublishTargetByName, readSearchServiceSessionOverride } from '../../runtime-config';
import { manifestBytes, runSearchPublication } from './publication';
import { prepareSearchPublication } from './prepare';
import { createSearchPublishRemote } from './remote';
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
  target:    z.string().trim().min(1),
});

type PreparedTask = Awaited<ReturnType<typeof prepareSearchPublication>>;

/** Writes one file to a signed upload URL without buffering it in memory. */
async function uploadFile(
  url: string,
  path: string,
  bytes: number,
  headers: Record<string, string>,
  signal: AbortSignal | undefined,
): Promise<void> {
  const response = await fetch(url, {
    method:  'PUT',
    headers: { ...headers, 'content-length': String(bytes) },
    body:    Readable.toWeb(createReadStream(path)) as ReadableStream,
    duplex:  'half',
    signal,
  } as RequestInit & { duplex: 'half' });
  if (!response.ok) throw new Error(`搜索数据上传失败（HTTP ${response.status}）。`);
}

/** Writes one small in-memory object to a signed upload URL. */
async function uploadBuffer(
  url: string,
  body: Buffer,
  headers: Record<string, string>,
  signal: AbortSignal | undefined,
): Promise<void> {
  const response = await fetch(url, {
    method:  'PUT',
    headers: { ...headers, 'content-length': String(body.byteLength) },
    body:    new Uint8Array(body),
    signal,
  });
  if (!response.ok) throw new Error(`搜索清单上传失败（HTTP ${response.status}）。`);
}

/** Builds a separately schedulable publisher for one game's complete search package group. */
export function createSearchPublicationTask(game: SearchPublicationGame, accountOnly = false): TaskDefinition {
  let prepared: PreparedTask | null = null;
  let latestResult: Record<string, unknown> | null = null;

  return {
    async stages(params) {
      const input = taskInput.parse(params);
      if (input.game !== game) throw new Error('所选游戏与当前任务不一致，请重新选择游戏。');
      if (!isAbsolute(input.directory)) throw new Error('请选择有效的搜索数据导出目录。');

      // The selected destination decides whether this run uploads anything at all.
      const destination = accountOnly ? null : findPublishTargetByName(input.target);
      if (!accountOnly && !destination) throw new Error('发布目标不存在，请重新选择。');
      const isAccountTarget = accountOnly || destination?.kind === 'account';
      if (isAccountTarget && !readSearchServiceSessionOverride()) {
        throw new Error('账户发布目标需要先登录控制台服务。');
      }

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
      const manifestPath = resolve(input.directory, 'search-publication-manifest.json');
      return [{
        key:          'publish_search_packages',
        label:        isAccountTarget ? '发布搜索数据' : '生成搜索数据',
        total:        isAccountTarget ? current.manifest.packages.length + 2 : 1,
        progressMode: 'bounded',
        resumeMode:   accountOnly ? 'durable' : 'none',
        async run(context) {
          await persistPreparedReleaseHash(current.manifest);

          /** Saves the prepared release description next to the exported packages. */
          async function writeLocalManifest() {
            const temporaryManifestPath = `${manifestPath}.${randomUUID()}.tmp`;
            try {
              await writeFile(temporaryManifestPath, manifestBytes(current.manifest), { flag: 'wx' });
              await rename(temporaryManifestPath, manifestPath);
            } catch (error) {
              await unlink(temporaryManifestPath).catch(() => {});
              console.error('[search-publication] The prepared release description could not be saved.', error);
              throw new Error('无法在导出目录保存发布信息，请检查目录权限后重试。', { cause: error });
            }
          }

          const remote = isAccountTarget
            ? createSearchPublishRemote(readSearchServiceSessionOverride()!)
            : null;
          const outcome = await runSearchPublication({
            isAccountTarget,
            manifest:   current.manifest,
            files:      current.files,
            remote,
            uploadFile: async (upload, file, signal) => {
              await uploadFile(upload.url, file.path, file.bytes, upload.headers, signal);
            },
            uploadBuffer: async (upload, body, signal) => {
              await uploadBuffer(upload.url, body, upload.headers, signal);
            },
            writeLocalManifest,
            progress: async done => {
              if (accountOnly) {
                await context.checkpoint({}, { done });
              } else {
                await context.progress({ done, total: null });
              }
            },
            signal: context.signal,
          });

          latestResult = {
            game:            current.manifest.game,
            directory:       input.directory,
            releaseHash:     current.manifest.releaseHash,
            manifestPath,
            mode:            outcome.mode,
            uploadedObjects: outcome.uploadedObjects,
            reusedObjects:   outcome.reusedObjects,
          };
          await context.saveResult(latestResult);
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
