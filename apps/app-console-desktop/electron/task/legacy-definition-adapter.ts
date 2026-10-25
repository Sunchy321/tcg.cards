import {
  getPerRunState,
  getTaskResult,
} from '../runtime/lib/task/definition';
import type {
  TaskBlock,
  TaskDefinition as LegacyTaskDefinition,
  TaskExecuteStore,
  TaskRunInput,
  TaskScope,
  TaskStagePlan,
  TaskStageState,
} from '../runtime/lib/task/definition';
import type { TaskDefinition, TaskProgressUpdate, TaskStageDefinition } from './registry';

interface LegacyTaskRegistration {
  scope(params: Record<string, unknown>): { type: string, key: string, snapshot?: Record<string, unknown> };
}

type LegacyDefinition = LegacyTaskDefinition & {
  definitionVersion: string;
  buildStagePlan(input: TaskRunInput): Promise<TaskStagePlan[]> | TaskStagePlan[];
  prepareStageEntry(input: {
    run:       TaskRunInput;
    stage:     TaskStageState;
    resume:    boolean;
    taskRunId: string;
  }): { stageKey: string, stageIndex: number, progressMode: TaskStagePlan['progressMode'], resumeMode: TaskStagePlan['resumeMode'], total: number | null }
    | Promise<{ stageKey: string, stageIndex: number, progressMode: TaskStagePlan['progressMode'], resumeMode: TaskStagePlan['resumeMode'], total: number | null }>;
  buildBlocks(input: { run: TaskRunInput, stage: TaskStageState, taskRunId: string }): AsyncIterable<TaskBlock> | Iterable<TaskBlock>;
  executeBlock(input: {
    run:       TaskRunInput;
    stage:     TaskStageState;
    block:     TaskBlock;
    store:     TaskExecuteStore;
    taskRunId: string;
    signal?:   AbortSignal;
  }): Promise<void> | void;
};

function asResult(value: unknown): Record<string, unknown> | null {
  return value != null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

/** Runs a migrated task definition through the Electron-owned stage lifecycle. */
export function adaptLegacyDefinition(
  definition: LegacyDefinition,
  registration: LegacyTaskRegistration,
): TaskDefinition {
  let latestTaskRunId: string | undefined;

  return {
    async stages(params) {
      const scopeValue = registration.scope(params);
      const scope: TaskScope = {
        type:     scopeValue.type,
        key:      scopeValue.key,
        snapshot: scopeValue.snapshot,
      };
      const run: TaskRunInput = {
        taskType:          definition.taskType,
        definitionVersion: definition.definitionVersion,
        scope,
        params,
      };
      const plans = await definition.buildStagePlan(run);

      return plans.map((plan, index): TaskStageDefinition => ({
        key:          plan.stageKey,
        label:        plan.label,
        total:        null,
        progressMode: plan.progressMode,
        resumeMode:   plan.resumeMode,
        async run(context) {
          latestTaskRunId = context.taskRunId;
          const token = context.resume?.token ?? null;
          const stageState: TaskStageState = {
            ...plan,
            status:      context.resume ? 'paused' : 'pending',
            total:       typeof token?.total === 'number' ? token.total : null,
            done:        context.resume?.done ?? 0,
            startedAt:   null,
            finishedAt:  null,
            resumeToken: token,
          };
          const entry = await definition.prepareStageEntry({
            run,
            stage:     stageState,
            resume:    context.resume != null,
            taskRunId: context.taskRunId,
          });
          const liveStage: TaskStageState = { ...stageState, ...entry };
          const typedState = getPerRunState(context.taskRunId);
          if (typedState?.skipped) return;

          let progressUpdate: TaskProgressUpdate | undefined;
          let resumeToken = token;
          let pending = Promise.resolve();
          const queue = (operation: () => Promise<void>) => {
            pending = pending.then(operation);
            return pending;
          };
          const store: TaskExecuteStore = {
            async updateStage(_taskRunId, _stageKey, patch) {
              if (typeof patch.done === 'number' || patch.done === null
                || typeof patch.total === 'number' || patch.total === null
                || Array.isArray(patch.segments)) {
                progressUpdate = {
                  done: typeof patch.done === 'number' || patch.done === null ? patch.done : liveStage.done ?? 0,
                  ...(typeof patch.total === 'number' || patch.total === null ? { total: patch.total } : {}),
                  ...(Array.isArray(patch.segments) ? { segments: patch.segments as NonNullable<TaskProgressUpdate['segments']> } : {}),
                };
                liveStage.done = progressUpdate.done;
                if (progressUpdate.total !== undefined) liveStage.total = progressUpdate.total;
                if (progressUpdate.segments) liveStage.segments = progressUpdate.segments;
              }

              if (patch.resumeToken != null && typeof patch.resumeToken === 'object' && !Array.isArray(patch.resumeToken)) {
                resumeToken = patch.resumeToken as Record<string, unknown>;
                const update = progressUpdate;
                progressUpdate = undefined;
                await queue(() => context.checkpoint(resumeToken!, update));
              } else if (progressUpdate) {
                const update = progressUpdate;
                progressUpdate = undefined;
                await queue(() => context.progress(update));
              }

              return { ...liveStage, ...patch } as TaskStageState;
            },
            publishSnapshot: async () => {},
          };

          const blocks = definition.buildBlocks({ run, stage: liveStage, taskRunId: context.taskRunId });
          let blockIndex = 0;
          for await (const block of blocks) {
            await definition.executeBlock({
              run,
              stage:     liveStage,
              block,
              store,
              taskRunId: context.taskRunId,
              signal:    context.signal,
            });
            await pending;
            if (plan.resumeMode !== 'durable' || resumeToken == null) {
              resumeToken = { stageKey: plan.stageKey, blockIndex };
            }
            await context.checkpoint(resumeToken, progressUpdate);
            progressUpdate = undefined;
            blockIndex++;
          }

          if (index === plans.length - 1) {
            const savedResult = asResult(getTaskResult(context.taskRunId));
            if (savedResult) await context.saveResult(savedResult);
          }
        },
      }));
    },
    result(_params, taskRunId) {
      return asResult(getTaskResult(taskRunId ?? latestTaskRunId ?? '')) ?? {};
    },
    async onCanceled(params, taskRunId) {
      latestTaskRunId = taskRunId;
      await definition.onCanceled?.({
        taskType:          definition.taskType,
        definitionVersion: definition.definitionVersion,
        scope:             registration.scope(params),
        params,
      });
    },
    cleanup(taskRunId) {
      definition.cleanup?.(taskRunId);
      if (latestTaskRunId === taskRunId) latestTaskRunId = undefined;
    },
  };
}
