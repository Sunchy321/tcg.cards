import { adaptLegacyDefinition } from './legacy-definition-adapter';
import { registerTask } from './registry';
import type { TaskRegistration } from './registry';

/** Registers one legacy domain definition with the Electron Worker lifecycle. */
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
  taskType:       'shadowverse_cards_import',
  label:          '超凡世界卡牌导入',
  version:        '2026-08-30:v1',
  supportsResume: true,
  scope:          () => ({ type: 'shadowverse_cards_import', key: 'global', snapshot: {} }),
}, async () => (await import('../runtime/lib/shadowverse/task/cards-import/definition')).cardsImportTaskDefinition);

registerLegacyTask({
  taskType:       'shadowverse_images_import',
  label:          '超凡世界卡图导入',
  version:        '2026-08-30:v1',
  supportsResume: true,
  scope:          () => ({ type: 'shadowverse_images_import', key: 'global', snapshot: {} }),
}, async () => (await import('../runtime/lib/shadowverse/task/image-import/definition')).imageImportTaskDefinition);

registerLegacyTask({
  taskType:       'shadowverse_evolve_cards_import',
  label:          '进化对决卡牌导入',
  version:        '2026-08-30:v1',
  supportsResume: true,
  scope:          () => ({ type: 'shadowverse_evolve_cards_import', key: 'global', snapshot: {} }),
}, async () => (await import('../runtime/lib/shadowverse-evolve/task/cards-import/definition')).evolveCardsImportTaskDefinition);

registerLegacyTask({
  taskType:       'shadowverse_evolve_images_import',
  label:          '进化对决卡图导入',
  version:        '2026-08-30:v1',
  supportsResume: true,
  scope:          () => ({ type: 'shadowverse_evolve_images_import', key: 'global', snapshot: {} }),
}, async () => (await import('../runtime/lib/shadowverse-evolve/task/images-import/definition')).evolveImagesImportTaskDefinition);
