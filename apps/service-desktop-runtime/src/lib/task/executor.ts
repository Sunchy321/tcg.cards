import type { TaskStore, TaskRunSnapshot, TaskRunRecord } from './store';
import type { TaskDefinition, TaskStageState, TaskRunInput, TaskBlock } from './definition';
import { getTaskDefinition } from './registry';

/** Full store access for the executor. */
export interface TaskExecutorStore {
  getTaskRun(taskRunId: string): Promise<TaskRunSnapshot | null>;
  updateTaskRun(taskRunId: string, patch: Record<string, unknown>): Promise<TaskRunRecord>;
  updateStage(taskRunId: string, stageKey: string, patch: Record<string, unknown>): Promise<TaskStageState>;
}

/** Describes the executor surface that drives one claimed task run. */
export interface TaskExecutor {
  runTask(snapshot: TaskRunSnapshot): Promise<void>;
}

/** Transitions the current stage and task run into the paused state. */
async function enterPaused(store: TaskExecutorStore, taskRunId: string, stageKey: string, resumeMode: string): Promise<void> {
  await store.updateStage(taskRunId, stageKey, { status: 'paused' });
  await store.updateTaskRun(taskRunId, { status: 'paused', controlRequestKind: null, currentStageKey: stageKey, pausedResumeMode: resumeMode });
}

/** Transitions the current stage and task run into the canceled state. */
async function enterCanceled(store: TaskExecutorStore, taskRunId: string, stageKey: string): Promise<void> {
  await store.updateStage(taskRunId, stageKey, { status: 'canceled' });
  await store.updateTaskRun(taskRunId, { status: 'canceled', terminalReason: 'manual_cancel', finishedAt: new Date(), controlRequestKind: null, currentStageKey: null, currentStageIndex: null, currentResumeMode: null, pausedResumeMode: null });
}

/** Runs one atomic block: execute, refresh heartbeat, persist progress, check controls. */
async function runBlock(
  store: TaskExecutorStore,
  taskRunId: string,
  runInput: TaskRunInput,
  stage: TaskStageState,
  block: TaskBlock,
  definition: TaskDefinition,
): Promise<'ok' | 'pause' | 'cancel'> {
  await definition.executeBlock({ run: runInput, stage, block });
  await store.updateTaskRun(taskRunId, { heartbeatAt: new Date() });

  const current = await store.getTaskRun(taskRunId);
  if (!current) return 'cancel';

  const { controlRequestKind, status } = current.run;
  if (controlRequestKind === 'cancel' || status === 'canceling') return 'cancel';
  if (controlRequestKind === 'pause') return 'pause';
  return 'ok';
}

/** Builds one task executor that drives the full stage lifecycle automatically. */
export function createTaskExecutor(store: TaskExecutorStore): TaskExecutor {
  return {
    async runTask(snapshot): Promise<void> {
      const { run, stages } = snapshot;
      const taskRunId = run.id;
      const runInput = toTaskRunInput(snapshot);
      const definition = getTaskDefinition(run.taskType);

      const isResume = run.status === 'resuming';
      let startedAtSet = !!run.startedAt;
      const startIdx = isResume ? (run.currentStageIndex ?? 0) : 0;

      for (let si = startIdx; si < stages.length; si++) {
        const stageState = stages[si]!;
        if (stageState.status === 'completed') continue;

        const entry = await definition.prepareStageEntry({ run: runInput, stage: stageState, resume: isResume });

        // Enter the stage atomically
        await store.updateTaskRun(taskRunId, { currentStageKey: entry.stageKey, currentStageIndex: entry.stageIndex, currentResumeMode: entry.resumeMode, controlRequestKind: null });
        await store.updateStage(taskRunId, entry.stageKey, {
          status: 'running',
          total: entry.progressMode === 'simple' ? null : entry.total,
          done: entry.progressMode === 'simple' ? null : 0,
          startedAt: new Date(),
        });
        if (!startedAtSet) {
          await store.updateTaskRun(taskRunId, { status: 'running', startedAt: new Date() });
          startedAtSet = true;
        } else {
          await store.updateTaskRun(taskRunId, { status: 'running' });
        }

        // Generate and iterate blocks
        const blocks = definition.buildBlocks({ run: runInput, stage: { ...stageState, ...entry } });
        let done = 0;

        for await (const block of blocks) {
          const result = await runBlock(store, taskRunId, runInput, stageState, block, definition);

          if (result === 'cancel') {
            await enterCanceled(store, taskRunId, entry.stageKey);
            return;
          }
          if (result === 'pause') {
            await enterPaused(store, taskRunId, entry.stageKey, entry.resumeMode);
            return;
          }

          done++;
          if (entry.progressMode !== 'simple') {
            await store.updateStage(taskRunId, entry.stageKey, { done, total: entry.total });
          }
        }

        const stagePatch: Record<string, unknown> = { status: 'completed', finishedAt: new Date() };
        if (entry.progressMode !== 'simple') {
          stagePatch.done = done;
        }
        await store.updateStage(taskRunId, entry.stageKey, stagePatch);
      }

      await store.updateTaskRun(taskRunId, { status: 'completed', finishedAt: new Date(), currentStageKey: null, currentStageIndex: null, currentResumeMode: null, pausedResumeMode: null });
    },
  };
}

/** Returns the current stage snapshot selected from one run snapshot. */
export function getCurrentTaskStage(
  run: Pick<TaskRunRecord, 'currentStageKey' | 'currentStageIndex'>,
  stages: TaskStageState[],
): TaskStageState | null {
  if (run.currentStageKey == null || run.currentStageIndex == null) return null;
  return stages.find(s => s.stageKey === run.currentStageKey && s.stageIndex === run.currentStageIndex) ?? null;
}

/** Materializes one iterable of blocks into an array for deterministic inspection. */
export async function collectTaskBlocks(blocks: AsyncIterable<TaskBlock> | Iterable<TaskBlock>): Promise<TaskBlock[]> {
  const items: TaskBlock[] = [];
  for await (const block of blocks) items.push(block);
  return items;
}

/** Builds the immutable run input forwarded into task-defined executor hooks. */
export function toTaskRunInput(snapshot: TaskRunSnapshot): TaskRunInput {
  return { taskType: snapshot.run.taskType, definitionVersion: snapshot.run.definitionVersion, scope: snapshot.run.scope, params: snapshot.run.params };
}
