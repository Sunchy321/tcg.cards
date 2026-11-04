import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';
import { locale as hearthstoneLocale } from '@tcg-cards/model/hearthstone/schema/basic';
import { locale as magicLocale } from '@tcg-cards/model/magic/schema/basic';
import type { SearchPublicationGame } from '@tcg-cards/model/search/publication';

import { TaskBoundarySignal } from '../../../task/registry';
import type { TaskDefinition, TaskStageDefinition } from '../../../task/registry';
import { readLocalDatabaseUrl } from '../../runtime-config';
import { createSearchD1PublicationTask } from './d1-task';
import { createSearchPublicationTask } from './task';
import { HEARTHSTONE_PUBLISH_ROWS } from './export-files';

/** Creates the export stage and optionally loads its completed files into D1. */
export function createSearchExportTask(
  game: SearchPublicationGame,
  publish: boolean,
  loadMagicFtsSql = async () => (await import('virtual:desktop-search-export-ddl')).magicFtsSql,
): TaskDefinition {
  const remote = publish ? createSearchD1PublicationTask(game, loadMagicFtsSql) : null;

  const packages = publish ? createSearchPublicationTask(game, true) : null;

  return {
    async stages(params) {
      if (remote && params.exportFromLocal !== true) {
        const { game, directory, target } = params;
        return remote.stages({ game, directory, target });
      }
      if (params.game !== game || typeof params.directory !== 'string' || !isAbsolute(params.directory)) {
        throw new Error('请先配置有效的搜索数据导出目录。');
      }
      const directory = params.directory;
      const updateD1 = publish && (params.uploadToR2 !== true || params.updateD1 !== false);
      const locales = game === 'magic' ? magicLocale.options : hearthstoneLocale.options;
      const total = locales.length + 1;
      const exportStage: TaskStageDefinition = {
        key:          'export_search_sqlite',
        label:        '导出搜索数据',
        total,
        progressMode: 'bounded',
        async run(context) {
          const connection = readLocalDatabaseUrl();
          if (!connection) throw new Error('请先在设置中填写本地数据库连接。');
          const output = join(directory, context.taskRunId);
          const manifest = join(output, 'search-publication-input.json');
          const complete = await readFile(manifest).then(() => true, (error: NodeJS.ErrnoException) => {
            if (error.code === 'ENOENT') return false;
            throw error;
          });
          let done = 0;
          /** Reports progress after one package and its metadata have been saved. */
          async function onFileWritten() {
            await context.progress(++done);
          }
          if (!complete) {
            await mkdir(directory, { recursive: true });
            const temporary = await mkdtemp(join(directory, `.${context.taskRunId}-`));
            try {
              const { default: ddl } = await import('virtual:desktop-search-export-ddl');
              if (game === 'magic') {
                const { exportMagicSearch } = await import('./export-magic');
                await exportMagicSearch(connection, temporary, locales, ddl.magic, onFileWritten);
              } else {
                const { exportHearthstoneSearch } = await import('./export-hearthstone');
                await exportHearthstoneSearch(
                  connection,
                  temporary,
                  locales,
                  ddl.hearthstone,
                  updateD1
                    ? async rows => {
                      await writeFile(join(temporary, HEARTHSTONE_PUBLISH_ROWS), JSON.stringify(rows));
                    }
                    : undefined,
                  onFileWritten,
                );
              }
              await context.checkpoint({});
              await rename(temporary, output);
            } catch (error) {
              if (error instanceof TaskBoundarySignal) throw error;
              const sqliteError = error as { code?: string, errcode?: number };
              if (sqliteError?.code === 'ENOSPC' || sqliteError?.errcode === 13) {
                throw new Error('导出目录所在磁盘空间不足，请释放空间或更换导出目录后重试。', { cause: error });
              }
              console.error('[search-export]', error instanceof Error ? error.name : 'Error');
              throw new Error('无法导出搜索数据，请检查本地搜索数据和导出目录后重试。', { cause: error });
            } finally {
              await rm(temporary, { recursive: true, force: true });
            }
          }
          if (complete) await context.progress(total);
          await context.saveResult({ directory: output });
        },
      };
      if (!remote) return [exportStage];

      const stages = [exportStage];
      if (updateD1) {
        let stage: TaskStageDefinition | undefined;
        stages.push({
          key:          'publish_search_d1',
          label:        '更新远程搜索库（D1）',
          total:        null,
          progressMode: 'bounded',
          resumeMode:   'durable',
          async prepare(context) {
            [stage] = await remote.stages({
              game,
              target:          params.target,
              directory:       join(directory, context.taskRunId),
              exportFromLocal: true,
            });
            return stage!.prepare!(context);
          },
          async run(context) {
            await stage!.run(context);
          },
        });
      }
      // Existing runs have a persisted two-stage plan and continue using it.
      if (params.uploadToR2 === true && packages) {
        let upload: TaskStageDefinition | undefined;
        stages.push({
          key:          'publish_search_packages',
          label:        '上传搜索数据包（R2）',
          total:        null,
          progressMode: 'bounded',
          resumeMode:   'durable',
          async prepare(context) {
            [upload] = await packages.stages({
              game,
              target:    params.target,
              directory: join(directory, context.taskRunId),
            });
            return { total: upload!.total };
          },
          async run(context) {
            await upload!.run(context);
          },
        });
      }
      return stages;
    },
    result: remote?.result,
    cleanup(taskRunId) {
      remote?.cleanup?.(taskRunId);
      packages?.cleanup?.(taskRunId);
    },
  };
}
