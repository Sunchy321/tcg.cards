import { adaptLegacyDefinition } from './legacy-definition-adapter';
import { registerTask } from './registry';
import type { TaskRegistration } from './registry';

const text = (params: Record<string, unknown>, key: string): string => typeof params[key] === 'string' ? params[key] as string : '';

const publishConfirmation = (scope: string) => (params: Record<string, unknown>) => ({
  environment: text(params, 'environment'),
  scope,
});

function registerLegacyTask(
  registration: Omit<TaskRegistration, 'load'>,
  loadDefinition: () => Promise<Parameters<typeof adaptLegacyDefinition>[0]>,
): void {
  registerTask({
    ...registration,
    async load() {
      return { default: adaptLegacyDefinition(await loadDefinition(), registration) };
    },
  });
}

registerLegacyTask({
  taskType:       'magic_scryfall_import',
  label:          'Scryfall 导入',
  version:        '2026-08-25:v1',
  supportsResume: true,
  scope:          () => ({ type: 'magic_scryfall_import', key: 'global', snapshot: {} }),
}, async () => (await import('../runtime/lib/magic/task/scryfall-import/definition')).magicScryfallImportTaskDefinition);

registerLegacyTask({
  taskType:       'magic_mtgch_import',
  label:          'MTGCH 导入',
  version:        '2026-09-20:v1',
  supportsResume: true,
  scope:          () => ({ type: 'magic_mtgch_import', key: 'global', snapshot: {} }),
}, async () => (await import('../runtime/lib/magic/task/mtgch-import/definition')).magicMtgchImportTaskDefinition);

registerLegacyTask({
  taskType:       'magic_mtgjson_import',
  label:          'MTGJSON 导入',
  version:        '2026-08-25:v1',
  supportsResume: true,
  scope:          () => ({ type: 'magic_mtgjson_import', key: 'global', snapshot: {} }),
}, async () => (await import('../runtime/lib/magic/task/mtgjson-import/definition')).magicMtgjsonImportTaskDefinition);

registerLegacyTask({
  taskType:       'magic_gatherer_import',
  label:          'Gatherer 导入',
  version:        '2026-08-25:v1',
  supportsResume: true,
  scope:          () => ({ type: 'magic_gatherer_import', key: 'global', snapshot: {} }),
}, async () => (await import('../runtime/lib/magic/task/gatherer-import/definition')).magicGathererImportTaskDefinition);

registerLegacyTask({
  taskType:       'magic_ruby_import',
  label:          'MTGA 注音导入',
  version:        '2026-09-21:v1',
  supportsResume: false,
  scope:          () => ({ type: 'magic_ruby_import', key: 'global', snapshot: {} }),
}, async () => (await import('../runtime/lib/magic/task/magic-ruby-import/definition')).magicRubyImportTaskDefinition);

registerLegacyTask({
  taskType:       'magic_project',
  label:          '万智牌数据整理',
  version:        '2026-09-23:v2',
  supportsResume: true,
  scope:          () => ({ type: 'magic_project', key: 'global', snapshot: {} }),
}, async () => (await import('../runtime/lib/magic/task/magic-project/definition')).magicProjectTaskDefinition);

registerLegacyTask({
  taskType:       'magic_project_commits',
  label:          '卡牌补全应用',
  version:        '2026-09-25:v1',
  supportsResume: true,
  scope:          () => ({ type: 'magic_project_commits', key: 'global', snapshot: {} }),
}, async () => (await import('../runtime/lib/magic/task/magic-project-commits/definition')).magicProjectCommitsTaskDefinition);

registerLegacyTask({
  taskType:       'magic_set_import',
  label:          '系列资料导入',
  version:        '2026-10-18:v4',
  supportsResume: false,
  scope:          () => ({ type: 'magic_set_import', key: 'global', snapshot: {} }),
}, async () => (await import('../runtime/lib/magic/task/set-import/definition')).magicSetImportTaskDefinition);

registerLegacyTask({
  taskType:            'magic_publish',
  label:               '万智牌数据发布',
  version:             '2026-09-05:v1',
  supportsResume:      false,
  admission:           { game: 'magic' },
  publishConfirmation: publishConfirmation('万智牌数据'),
  scope:               () => ({ type: 'magic_publish', key: 'global', snapshot: {} }),
}, async () => (await import('../runtime/lib/magic/task/publish/definition')).magicPublishTaskDefinition);

registerLegacyTask({
  taskType:            'magic_reference_publish',
  label:               '参考数据发布',
  version:             '2026-10-17:v1',
  supportsResume:      false,
  admission:           { game: 'magic' },
  publishConfirmation: publishConfirmation('万智牌赛制、系列与补充包'),
  scope:               params => {
    const publishTarget = text(params, 'publishTarget');
    const environment = text(params, 'environment');
    return {
      type:     'publish_stream',
      key:      `${publishTarget}:${environment}:reference_data`,
      snapshot: { publishTarget, environment },
    };
  },
}, async () => (await import('../runtime/lib/magic/task/reference-publish/definition')).referencePublishTaskDefinition);
