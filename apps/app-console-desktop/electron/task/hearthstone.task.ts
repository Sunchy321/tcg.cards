import { adaptLegacyDefinition } from './legacy-definition-adapter';
import { registerTask } from './registry';
import type { TaskRegistration } from './registry';

const text = (params: Record<string, unknown>, key: string): string => typeof params[key] === 'string' ? params[key] as string : '';
const strings = (params: Record<string, unknown>, key: string): string[] => Array.isArray(params[key]) ? (params[key] as unknown[]).filter((value): value is string => typeof value === 'string') : [];
const numbers = (params: Record<string, unknown>, key: string): number[] => Array.isArray(params[key]) ? (params[key] as unknown[]).filter((value): value is number => typeof value === 'number') : [];
const publishConfirmation = (scope: string | ((params: Record<string, unknown>) => string)) => (params: Record<string, unknown>) => ({
  target: text(params, 'target'),
  scope:  typeof scope === 'string' ? scope : scope(params),
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
  taskType:       'hearthstone_hsdata_import',
  label:          'hsdata 导入',
  version:        '2026-07-22:v1',
  supportsResume: true,
  scope:          params => ({ type: 'hearthstone_hsdata_import', key: 'global', snapshot: { sourceIds: strings(params, 'sourceIds') } }),
}, async () => (await import('../runtime/lib/hearthstone/task/import/definition')).hsdataImportTaskDefinition);

registerLegacyTask({
  taskType:       'hearthstone_project',
  label:          '数据投影',
  version:        '2026-10-11:v3',
  supportsResume: true,
  scope:          params => ({ type: 'hearthstone_hsdata_projection', key: 'global', snapshot: { sourceTags: numbers(params, 'sourceTags') } }),
}, async () => (await import('../runtime/lib/hearthstone/task/project/definition')).projectTaskDefinition);

registerTask({
  taskType:            'hearthstone_tag_push',
  label:               '标签推送',
  version:             '2026-10-28:v1',
  supportsResume:      true,
  admission:           { game: 'hearthstone', connection: 'direct' },
  publishConfirmation: publishConfirmation('待推送的标签提交'),
  scope:               params => {
    const game = text(params, 'game') || 'hearthstone';
    const target = text(params, 'target');
    return {
      type:     'publish_stream',
      key:      `${game}:${target}:tag_push`,
      snapshot: { game, target, publishType: 'tag_push' },
    };
  },
  async load() {
    return { default: (await import('../runtime/lib/hearthstone/task/tag-push/definition')).tagPushTaskDefinition };
  },
});

registerLegacyTask({
  taskType:       'hearthstone_cards_project',
  label:          '卡牌收录范围',
  version:        '2026-10-11:v1',
  supportsResume: false,
  scope:          () => ({ type: 'hearthstone_cards_projection', key: 'global', snapshot: {} }),
}, async () => (await import('../runtime/lib/hearthstone/task/cards-project/definition')).cardsProjectTaskDefinition);

registerLegacyTask({
  taskType:       'hearthstone_unpack_import',
  label:          '拆包数据导入',
  version:        '2026-07-21:v2',
  supportsResume: false,
  scope:          params => ({ type: 'hearthstone_unpack_import', key: 'global', snapshot: { zipName: text(params, 'zipName') } }),
}, async () => (await import('../runtime/lib/hearthstone/task/unpack-import/definition')).unpackImportTaskDefinition);

registerLegacyTask({
  taskType:       'hearthstone_image_render',
  label:          '图片渲染',
  version:        '2026-06-27:v1',
  supportsResume: false,
  scope:          params => ({ type: 'image_render', key: `hearthstone:${text(params, 'lang') || 'all'}`, snapshot: { ...params } }),
}, async () => (await import('../runtime/lib/hearthstone/task/image-render/definition')).imageRenderTaskDefinition);

registerLegacyTask({
  taskType:            'hearthstone_publish',
  label:               '卡牌数据发布',
  version:             '2026-06-22:v1',
  supportsResume:      false,
  admission:           { game: 'hearthstone', connection: 'direct' },
  publishConfirmation: publishConfirmation('卡牌数据'),
  scope:               params => {
    const game = text(params, 'game') || 'hearthstone';
    const target = text(params, 'target');
    const publishType = text(params, 'publishType') || 'card_data';
    return { type: 'publish_stream', key: `${game}:${target}:${publishType}`, snapshot: { game, target, publishType } };
  },
}, async () => (await import('../runtime/lib/hearthstone/task/publish/definition')).publishTaskDefinition);

registerLegacyTask({
  taskType:            'hearthstone_single_card_publish',
  label:               '单卡发布',
  version:             '2026-10-25:v1',
  supportsResume:      false,
  admission:           { game: 'hearthstone', connection: 'direct' },
  publishConfirmation: publishConfirmation(params => `单张卡牌：${text(params, 'cardId')}`),
  scope:               params => {
    const game = text(params, 'game') || 'hearthstone';
    const target = text(params, 'target');
    const cardId = text(params, 'cardId');
    return { type: 'publish_stream', key: `${game}:${target}:card_data:${cardId}`, snapshot: { game, target, publishType: 'card_data', cardId } };
  },
}, async () => (await import('../runtime/lib/hearthstone/task/single-card-publish/definition')).singleCardPublishTaskDefinition);

registerLegacyTask({
  taskType:            'hsdata_pin',
  label:               '固定卡牌数据',
  version:             '2026-07-14:v1',
  supportsResume:      false,
  admission:           { game: 'hearthstone', connection: 'direct' },
  publishConfirmation: publishConfirmation('固定卡牌数据'),
  scope:               params => {
    const game = text(params, 'game') || 'hearthstone';
    const target = text(params, 'target');
    return { type: 'publish_stream', key: `${game}:${target}:pin`, snapshot: { game, target } };
  },
}, async () => (await import('../runtime/lib/hearthstone/task/pin/definition')).pinTaskDefinition);

registerLegacyTask({
  taskType:            'hearthstone_reference_publish',
  label:               '参考数据发布',
  version:             '2026-08-25:v1',
  supportsResume:      false,
  admission:           { game: 'hearthstone', connection: 'direct' },
  publishConfirmation: publishConfirmation('参考数据'),
  scope:               params => {
    const game = text(params, 'game') || 'hearthstone';
    const target = text(params, 'target');
    return { type: 'publish_stream', key: `${game}:${target}:reference_data`, snapshot: { game, target } };
  },
}, async () => (await import('../runtime/lib/hearthstone/task/reference-publish/definition')).referencePublishTaskDefinition);

registerLegacyTask({
  taskType:            'hearthstone_announcement_publish',
  label:               '公告数据发布',
  version:             '2026-08-07:v1',
  supportsResume:      false,
  admission:           { game: 'hearthstone', connection: 'direct' },
  publishConfirmation: publishConfirmation('公告数据'),
  scope:               params => {
    const game = text(params, 'game') || 'hearthstone';
    const target = text(params, 'target');
    return { type: 'publish_stream', key: `${game}:${target}:announcement_data`, snapshot: { game, target } };
  },
}, async () => (await import('../runtime/lib/hearthstone/task/announcement-publish/definition')).announcementPublishTaskDefinition);

registerLegacyTask({
  taskType:       'hearthstone_purge',
  label:          '清理炉石数据',
  version:        '2026-08-07:v1',
  supportsResume: false,
  scope:          () => ({ type: 'purge', key: 'hearthstone:purge', snapshot: {} }),
}, async () => (await import('../runtime/lib/hearthstone/task/purge/definition')).hearthstonePurgeTaskDefinition);

registerTask({
  taskType:            'hearthstone_search_package_publish',
  label:               '炉石传说搜索数据发布',
  version:             '2026-11-01:v1',
  supportsResume:      false,
  admission:           { game: 'hearthstone', connection: 'direct' },
  publishConfirmation: () => ({ target: 'production', scope: '搜索数据包' }),
  scope:               () => ({ type: 'search_package_publish', key: 'hearthstone', snapshot: { game: 'hearthstone' } }),
  async load() {
    return { default: (await import('../runtime/lib/search-publication/task')).createSearchPublicationTask('hearthstone') };
  },
});

registerTask({
  taskType:            'hearthstone_search_d1_publish',
  label:               '炉石传说搜索数据发布（远程搜索库）',
  version:             '2026-11-03:v1',
  supportsResume:      true,
  admission:           { game: 'hearthstone', connection: 'direct' },
  publishConfirmation: () => ({ target: 'production', scope: '搜索数据' }),
  scope:               () => ({ type: 'search_d1_publish', key: 'hearthstone', snapshot: { game: 'hearthstone' } }),
  async load() {
    return { default: (await import('../runtime/lib/search-publication/d1-task')).createSearchD1PublicationTask('hearthstone') };
  },
});
