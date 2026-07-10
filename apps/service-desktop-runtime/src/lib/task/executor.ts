import type { TaskRunSnapshot, TaskRunRecord } from './store';
import type { TaskDefinition, TaskStageEntry, TaskStageState, TaskRunInput, TaskBlock } from './definition';
import { getTaskDefinition } from './registry';
import { getTaskResult, getPerRunState } from './definition';
import { runtimeBootId, generateResumeContextKey } from './runtime';
import { buildTaskPageSnapshot } from './snapshot';
import type { TaskEventPublisher } from './events';

/** Full store access for the executor. */
export interface TaskExecutorStore {
  getTaskRun(taskRunId: string): Promise<TaskRunSnapshot | null>;
  updateTaskRun(taskRunId: string, patch: Record<string, unknown>): Promise<TaskRunRecord>;
  updateStage(taskRunId: string, stageKey: string, patch: Record<string, unknown>): Promise<TaskStageState>;
  transitionStage(
    taskRunId: string,
    stageKey: string,
    runPatch: Record<string, unknown>,
    stagePatch: Record<string, unknown>,
  ): Promise<void>;
  /** Publish the current task snapshot to event subscribers. Set by the executor. */
  publishSnapshot?(): Promise<void>;
}

/** Describes the executor surface that drives one claimed task run. */
export interface TaskExecutor {
  runTask(snapshot: TaskRunSnapshot): Promise<void>;
}

/** Transitions the current stage and task run into the paused state. */
async function enterPaused(store: TaskExecutorStore, taskRunId: string, stageKey: string, resumeMode: string): Promise<void> {
  const runPatch: Record<string, unknown> = {
    status: 'paused',
    controlRequestKind: null,
    currentStageKey: stageKey,
    pausedResumeMode: resumeMode,
  };
  if (resumeMode === 'session_bound') {
    runPatch.runtimeBootId = runtimeBootId;
    runPatch.resumeContextKey = generateResumeContextKey();
  }
  await store.transitionStage(taskRunId, stageKey, runPatch, { status: 'paused' });
}

/** Transitions the current stage and task run into the canceled state. */
async function enterCanceled(store: TaskExecutorStore, taskRunId: string, stageKey: string): Promise<void> {
  await store.updateStage(taskRunId, stageKey, { status: 'canceled' });
  await store.updateTaskRun(taskRunId, { status: 'canceled', terminalReason: 'manual_cancel', finishedAt: new Date(), controlRequestKind: null, currentStageKey: null, currentStageIndex: null, currentResumeMode: null, pausedResumeMode: null });
}

/** Transitions the current stage and task run into the failed state with error details. */
async function enterFailed(store: TaskExecutorStore, taskRunId: string, stageKey: string, err: unknown): Promise<void> {
  console.error(`[task] task ${taskRunId} failed at stage ${stageKey}:`, err);
  await store.updateStage(taskRunId, stageKey, { status: 'failed' });
  await store.updateTaskRun(taskRunId, {
    status: 'failed',
    terminalReason: 'execution_failed',
    errorMessage: (err as Error)?.message ?? String(err),
    finishedAt: new Date(),
    controlRequestKind: null,
    currentStageKey: null,
    currentStageIndex: null,
    currentResumeMode: null,
    pausedResumeMode: null,
  });
}

/** Reads the latest snapshot and publishes it as a TaskPageEvent if a publisher is available. */
async function publishCurrentEvent(store: TaskExecutorStore, taskRunId: string, publisher?: TaskEventPublisher): Promise<void> {
  if (!publisher) return;
  const snap = await store.getTaskRun(taskRunId);
  if (!snap) return;
  publisher.publish(buildTaskPageSnapshot(snap));
}

/** Runs one atomic block: execute, refresh heartbeat, persist progress, check controls. */
async function runBlock(
  store: TaskExecutorStore,
  taskRunId: string,
  runInput: TaskRunInput,
  stage: TaskStageState,
  block: TaskBlock,
  definition: TaskDefinition,
): Promise<'ok' | 'pause' | 'cancel' | 'fail'> {
  try {
    await definition.executeBlock({ run: runInput, stage, block, store, taskRunId });
  } catch (err) {
    await enterFailed(store, taskRunId, stage.stageKey, err);
    return 'fail';
  }
  await store.updateTaskRun(taskRunId, { heartbeatAt: new Date() });

  const current = await store.getTaskRun(taskRunId);
  if (!current) return 'cancel';

  const { controlRequestKind, status } = current.run;
  if (controlRequestKind === 'cancel' || status === 'canceling') return 'cancel';
  if (controlRequestKind === 'pause') return 'pause';
  return 'ok';
}

/** Builds one task executor that drives the full stage lifecycle automatically. */
export function createTaskExecutor(store: TaskExecutorStore, publisher?: TaskEventPublisher): TaskExecutor {
  return {
    async runTask(snapshot): Promise<void> {
      const { run, stages } = snapshot;
      const taskRunId = run.id;

      // Wire publishSnapshot so definitions can push events mid-block
      if (!store.publishSnapshot && publisher) {
        store.publishSnapshot = async () => {
          await publishCurrentEvent(store, taskRunId, publisher);
        };
      }

      // Re-read the task run status to guard against races (cancel/pause between
      // scheduler read and executor start)
      const fresh = await store.getTaskRun(taskRunId);
      if (!fresh) return;
      if (fresh.run.status !== 'pending' && fresh.run.status !== 'resuming') return;

      const runInput = toTaskRunInput(snapshot);
      const definition = getTaskDefinition(run.taskType);

      const isResume = fresh.run.status === 'resuming';
      let startedAtSet = !!run.startedAt;
      const startIdx = isResume ? (run.currentStageIndex ?? 0) : 0;

      for (let si = startIdx; si < stages.length; si++) {
        const stageState = stages[si]!;
        if (stageState.status === 'completed') continue;

        let entry: TaskStageEntry;
        try {
          entry = await definition.prepareStageEntry({ run: runInput, stage: stageState, resume: isResume, taskRunId });
        } catch (err) {
          await enterFailed(store, taskRunId, stageState.stageKey, err);
          return;
        }

        // Skipped stage: mark as completed and continue
        const typedState = getPerRunState(taskRunId);
        if (typedState?.skipped) {
          await store.updateStage(taskRunId, entry.stageKey, { status: 'completed' });
          await publishCurrentEvent(store, taskRunId, publisher);
          continue;
        }

        // Enter the stage atomically (single transaction)
        const stagePatch: Record<string, unknown> = {
          status: 'running',
          total: entry.progressMode === 'simple' ? null : entry.total,
          done: entry.progressMode === 'simple' ? null : 0,
          startedAt: new Date(),
        };
        const runPatch: Record<string, unknown> = {
          currentStageKey: entry.stageKey,
          currentStageIndex: entry.stageIndex,
          currentResumeMode: entry.resumeMode,
          controlRequestKind: null,
          status: 'running',
        };
        if (!startedAtSet) {
          runPatch.startedAt = new Date();
          startedAtSet = true;
        }
        if (isResume) {
          runPatch.pausedResumeMode = null;
          runPatch.runtimeBootId = null;
          runPatch.resumeContextKey = null;
        }

        await store.transitionStage(taskRunId, entry.stageKey, runPatch, stagePatch);
        await publishCurrentEvent(store, taskRunId, publisher);

        // Generate and iterate blocks
        const blocks = definition.buildBlocks({ run: runInput, stage: { ...stageState, ...entry }, taskRunId });

        for await (const block of blocks) {
          const result = await runBlock(store, taskRunId, runInput, stageState, block, definition);

          if (result === 'cancel') {
            await enterCanceled(store, taskRunId, entry.stageKey);
            await publishCurrentEvent(store, taskRunId, publisher);
            return;
          }
          if (result === 'pause') {
            await enterPaused(store, taskRunId, entry.stageKey, entry.resumeMode);
            await publishCurrentEvent(store, taskRunId, publisher);
            return;
          }
          if (result === 'fail') {
            await publishCurrentEvent(store, taskRunId, publisher);
            return;
          }

          await publishCurrentEvent(store, taskRunId, publisher);
        }

        await store.updateStage(taskRunId, entry.stageKey, { status: 'completed', finishedAt: new Date() });
        await publishCurrentEvent(store, taskRunId, publisher);
      }

      const completionPatch: Record<string, unknown> = {
        status: 'completed',
        finishedAt: new Date(),
        currentStageKey: null,
        currentStageIndex: null,
        currentResumeMode: null,
        pausedResumeMode: null,
      };
      const taskResult = getTaskResult(taskRunId);
      if (taskResult !== undefined) {
        completionPatch.result = taskResult;
      }
      await store.updateTaskRun(taskRunId, completionPatch);
      await publishCurrentEvent(store, taskRunId, publisher);
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
