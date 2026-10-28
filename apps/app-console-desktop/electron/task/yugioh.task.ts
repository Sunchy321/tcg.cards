import { adaptLegacyDefinition } from './legacy-definition-adapter';
import { registerTask } from './registry';
import type { TaskDefinition, TaskRegistration, TaskStageContext } from './registry';

import { importYugiohCards } from '../runtime/lib/yugioh/cards-import';
import { publishYugiohCards } from '../runtime/lib/yugioh/cards-publish';
import { importYugiohImages } from '../runtime/lib/yugioh/image-import';

/** Progress reporter serialized across image workers and checkpointed at safe units. */
function progressReporter(
  context: TaskStageContext,
  options: { updateEvery: number, checkpointEvery: number },
) {
  let pending = Promise.resolve();

  return (value: { phase: string, completedCount?: number, totalCount?: number }) => {
    pending = pending.then(async () => {
      const done = value.completedCount ?? 0;
      const total = value.totalCount ?? null;
      const update = { done, total };
      const terminal = value.phase === 'completed';

      if (!terminal && done > 0 && done % options.checkpointEvery === 0) {
        await context.checkpoint({ phase: value.phase, done, total }, update);
        return;
      }

      if (terminal || done === 0 || done % options.updateEvery === 0 || (total != null && done === total)) {
        await context.progress(update);
      }
    });

    return pending;
  };
}

/** Task definition for the fixed structured card source import. */
function cardsImportDefinition(): TaskDefinition {
  return {
    stages: () => [{
      key:          'import',
      label:        '导入卡牌数据',
      total:        null,
      progressMode: 'unbound',
      resumeMode:   'durable',
      async run(context) {
        const report = await importYugiohCards({
          onProgress: progressReporter(context, { updateEvery: 100, checkpointEvery: 100 }),
        });
        await context.saveResult(report as unknown as Record<string, unknown>);
      },
    }],
  };
}

/** Task definition for the verified primary-card-image source import. */
function imageImportDefinition(): TaskDefinition {
  return {
    stages: () => [{
      key:          'images',
      label:        '导入主卡图',
      total:        null,
      progressMode: 'unbound',
      resumeMode:   'durable',
      async run(context) {
        const report = await importYugiohImages({
          onProgress: progressReporter(context, { updateEvery: 20, checkpointEvery: 100 }),
        });
        await context.saveResult(report as unknown as Record<string, unknown>);
      },
    }],
  };
}

/** Task definition for publishing one verified test-target snapshot. */
function publishDefinition(): TaskDefinition {
  return {
    stages: () => [{
      key:          'publish',
      label:        '发布卡牌数据',
      total:        null,
      progressMode: 'unbound',
      resumeMode:   'durable',
      async run(context) {
        const report = await publishYugiohCards({
          operatorUserId: typeof context.params.operatorUserId === 'string' ? context.params.operatorUserId : undefined,
          onProgress:     progressReporter(context, { updateEvery: 1, checkpointEvery: 1 }),
        });
        await context.saveResult(report as unknown as Record<string, unknown>);
      },
    }],
  };
}

/** Registers one simple Electron-owned task with a fresh Worker-side definition. */
function registerSimpleTask(
  registration: Omit<TaskRegistration, 'load'>,
  definition: () => TaskDefinition,
): void {
  registerTask({
    ...registration,
    async load() {
      return { default: definition() };
    },
  });
}

const sharedScope = { type: 'yugioh_workflow', key: 'global', snapshot: {} };

registerSimpleTask({
  taskType:       'yugioh_cards_import',
  label:          '游戏王卡牌导入',
  version:        '2026-10-27:v1',
  supportsResume: true,
  scope:          () => sharedScope,
}, cardsImportDefinition);

registerSimpleTask({
  taskType:       'yugioh_image_import',
  label:          '游戏王主卡图导入',
  version:        '2026-10-27:v1',
  supportsResume: true,
  scope:          () => sharedScope,
}, imageImportDefinition);

registerSimpleTask({
  taskType:            'yugioh_publish',
  label:               '游戏王卡牌发布',
  version:             '2026-10-27:v1',
  supportsResume:      true,
  admission:           { game: 'yugioh' },
  publishConfirmation: () => ({ environment: 'test', scope: '全部游戏王卡牌' }),
  scope:               () => sharedScope,
}, publishDefinition);

/** Registers a legacy crawl definition through the Electron task lifecycle. */
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
  taskType:       'yugioh_cnocg_import',
  label:          'CNOCG 官方库抓取',
  version:        '2026-10-06:v1',
  supportsResume: true,
  scope:          () => ({ type: 'yugioh_cnocg_import', key: 'global', snapshot: {} }),
}, async () => (await import('../runtime/lib/yugioh/task/cnocg-import/definition')).yugiohCnocgImportTaskDefinition);

registerLegacyTask({
  taskType:       'yugioh_neuron_import',
  label:          'Neuron 官方库抓取',
  version:        '2026-10-06:v2',
  supportsResume: true,
  scope:          () => ({ type: 'yugioh_neuron_import', key: 'global', snapshot: {} }),
}, async () => (await import('../runtime/lib/yugioh/task/neuron-import/definition')).yugiohNeuronImportTaskDefinition);
