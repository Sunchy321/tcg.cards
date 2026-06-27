import type {
  TaskBlock,
  TaskDefinition,
  TaskExecuteStore,
  TaskRunInput,
  TaskStageEntry,
  TaskStagePlan,
  TaskStageState,
} from './definition';

export const testWorkTaskType = 'test_work';
export const testWorkDefinitionVersion = '2026-06-23:v1';

export const testWorkStagePlans: TaskStagePlan[] = [
  { stageKey: 'phase_1', stageIndex: 0, label: 'Phase 1 — Setup', progressMode: 'bounded', resumeMode: 'durable' },
  { stageKey: 'phase_2', stageIndex: 1, label: 'Phase 2 — Processing', progressMode: 'bounded', resumeMode: 'durable' },
  { stageKey: 'phase_3', stageIndex: 2, label: 'Phase 3 — Cleanup', progressMode: 'simple', resumeMode: 'none' },
];

/** Returns the number of work items for each stage. */
function stageItemCount(stageKey: string, workload: number): number {
  if (stageKey === 'phase_1') return 20;
  if (stageKey === 'phase_2') return workload;
  return 0;
}

/** Builds blocks for every work item in the current stage. */
export function* buildTestWorkBlocks(
  stage: TaskStageState,
  workload: number,
): Generator<TaskBlock> {
  const count = stageItemCount(stage.stageKey, workload);
  if (count <= 0) {
    yield { blockKey: `${stage.stageKey}:run`, effectModel: 'atomic' };
    return;
  }
  for (let i = 0; i < count; i++) {
    yield { blockKey: `${stage.stageKey}:item_${i + 1}`, effectModel: 'atomic' };
  }
}

/** Simulates one work item by sleeping. */
export async function executeTestWorkBlock(): Promise<void> {
  await new Promise(r => setTimeout(r, 300));
}

export const testWorkTaskDefinition: TaskDefinition = {
  taskType: testWorkTaskType,
  definitionVersion: testWorkDefinitionVersion,
  supportsResume: true,
  effectModel: 'atomic',
  buildStagePlan(_input: TaskRunInput): TaskStagePlan[] {
    return testWorkStagePlans.map(s => ({ ...s }));
  },
  prepareStageEntry({ run, stage }: { run: TaskRunInput; stage: TaskStageState; resume: boolean; taskRunId: string }): TaskStageEntry {
    const workload = (run.params.workload as number) ?? 100;
    return {
      stageKey: stage.stageKey,
      stageIndex: stage.stageIndex,
      progressMode: stage.progressMode,
      resumeMode: stage.resumeMode,
      total: stageItemCount(stage.stageKey, workload),
      selectionAnchor: null,
    };
  },
  buildBlocks({ run, stage }: { run: TaskRunInput; stage: TaskStageState; taskRunId: string }): Iterable<TaskBlock> {
    const workload = run.params.workload as number ?? 100;
    return buildTestWorkBlocks(stage, workload);
  },
  async executeBlock(input: { run: TaskRunInput; stage: TaskStageState; block: TaskBlock; store: TaskExecuteStore; taskRunId: string }): Promise<void> {
    await executeTestWorkBlock();
    const workload = (input.run.params.workload as number) ?? 100;
    const total = stageItemCount(input.stage.stageKey, workload);
    const match = input.block.blockKey.match(/item_(\d+)$/);
    const done = match ? parseInt(match[1]!) : (total > 0 ? total : 0);
    await input.store.updateStage(input.taskRunId, input.stage.stageKey, { done, total });
  },
};
