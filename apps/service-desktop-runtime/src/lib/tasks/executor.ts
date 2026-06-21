import type { TaskDefinition, TaskStageState, TaskRunInput, TaskBlock } from './definition';
import type { TaskRunSnapshot } from './store';

/** Provides the minimal write-side hooks used while one executor loop is running. */
export interface TaskExecutorContext {
  refreshHeartbeat(taskRunId: string): Promise<void>;
  persistStageProgress(input: {
    taskRunId: string;
    stageKey: string;
    done: number | null;
    total: number | null;
    resumeToken?: Record<string, unknown> | null;
    selectionAnchor?: Record<string, unknown> | null;
  }): Promise<void>;
}

/** Describes the executor surface that will later drive one claimed task run. */
export interface TaskExecutor {
  runTask(snapshot: TaskRunSnapshot): Promise<void>;
}

/** Builds one not-yet-implemented task executor placeholder. */
export function createTaskExecutor(
  _context: TaskExecutorContext,
): TaskExecutor {
  return {
    async runTask(_snapshot: TaskRunSnapshot) {
      throw new Error('Task executor is not implemented yet');
    },
  };
}

/** Returns the current stage snapshot selected from one run snapshot. */
export function getCurrentTaskStage(
  run: Pick<TaskRunSnapshot['run'], 'currentStageKey' | 'currentStageIndex'>,
  stages: TaskStageState[],
): TaskStageState | null {
  if (run.currentStageKey == null || run.currentStageIndex == null) {
    return null;
  }

  return stages.find(stage => (
    stage.stageKey === run.currentStageKey
    && stage.stageIndex === run.currentStageIndex
  )) ?? null;
}

/** Materializes one iterable of blocks into an array for deterministic inspection. */
export async function collectTaskBlocks(
  blocks: AsyncIterable<TaskBlock> | Iterable<TaskBlock>,
): Promise<TaskBlock[]> {
  const items: TaskBlock[] = [];

  for await (const block of blocks) {
    items.push(block);
  }

  return items;
}

/** Builds the immutable run input forwarded into task-defined executor hooks. */
export function toTaskRunInput(snapshot: TaskRunSnapshot): TaskRunInput {
  return {
    taskType: snapshot.run.taskType,
    definitionVersion: snapshot.run.definitionVersion,
    scope: snapshot.run.scope,
    params: snapshot.run.params,
  };
}
