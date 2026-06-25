import type {
  TaskBlock,
  TaskDefinition,
  TaskExecuteStore,
  TaskRunInput,
  TaskStageEntry,
  TaskStagePlan,
  TaskStageState,
} from '#task/definition';
import { reanchorCurrentHsdataPublishBaseline } from '../../hsdata-publish';

export const reanchorTaskType = 'hsdata_reanchor';
export const reanchorDefinitionVersion = '2026-06-23:v1';

export const reanchorStagePlans: TaskStagePlan[] = [
  { stageKey: 'loading_baseline', stageIndex: 0, label: 'Load baseline', progressMode: 'simple', resumeMode: 'none' },
  { stageKey: 'loading_snapshots', stageIndex: 1, label: 'Load snapshots', progressMode: 'bounded', resumeMode: 'none' },
  { stageKey: 'finalizing', stageIndex: 2, label: 'Finalize', progressMode: 'simple', resumeMode: 'none' },
];

export function buildReanchorTaskRunInput(scope: { publishTarget: string; environment: string }): TaskRunInput {
  return {
    taskType: reanchorTaskType,
    definitionVersion: reanchorDefinitionVersion,
    scope: { type: 'publish_stream', key: `${scope.publishTarget}:${scope.environment}:reanchor` },
    params: { publishTarget: scope.publishTarget, environment: scope.environment },
  };
}

function getScope(input: TaskRunInput): { publishTarget: string; environment: string } {
  return {
    publishTarget: (input.scope.snapshot as any)?.publishTarget ?? (input.params as any)?.publishTarget ?? 'hearthstone',
    environment: (input.scope.snapshot as any)?.environment ?? (input.params as any)?.environment ?? '',
  };
}

export function* buildReanchorBlocks(stage: TaskStageState): Generator<TaskBlock> {
  yield { blockKey: `${stage.stageKey}:run`, effectModel: 'atomic', payload: { stageKey: stage.stageKey } };
}

/** Runs one reanchor stage block. Called by the executor. */
export async function executeReanchorStageBlock(input: {
  run: TaskRunInput;
  stage: TaskStageState;
  block: TaskBlock;
  store: TaskExecuteStore;
  taskRunId: string;
}): Promise<void> {
  const { store, taskRunId } = input;
  const scope = getScope(input.run);
  const stageKey = input.block.payload?.stageKey as string;

  if (stageKey === 'loading_baseline') {
    // handled internally by reanchorCurrentHsdataPublishBaseline
    return;
  }

  if (stageKey === 'loading_snapshots') {
    await reanchorCurrentHsdataPublishBaseline({
      ...scope,
      publishType: 'card_data',
      onProgress: (e) => {
        store.updateStage(taskRunId, 'loading_snapshots', {
          total: e.total ?? null,
          done: e.completed ?? null,
        }).catch(() => {});
      },
    });
    return;
  }

  if (stageKey === 'finalizing') {
    return;
  }
}

export const reanchorTaskDefinition: TaskDefinition = {
  taskType: reanchorTaskType,
  definitionVersion: reanchorDefinitionVersion,
  supportsResume: false,
  effectModel: 'atomic',
  buildStagePlan(_input: TaskRunInput): TaskStagePlan[] {
    return reanchorStagePlans.map(s => ({ ...s }));
  },
  prepareStageEntry({ stage }: { run: TaskRunInput; stage: TaskStageState; resume: boolean }): TaskStageEntry {
    return {
      stageKey: stage.stageKey,
      stageIndex: stage.stageIndex,
      progressMode: stage.progressMode,
      resumeMode: stage.resumeMode,
      total: stage.total,
      selectionAnchor: stage.selectionAnchor,
    };
  },
  buildBlocks({ stage }: { run: TaskRunInput; stage: TaskStageState; taskRunId: string }): Iterable<TaskBlock> {
    return buildReanchorBlocks(stage);
  },
  async executeBlock(input) {
    await executeReanchorStageBlock(input);
  },
};
