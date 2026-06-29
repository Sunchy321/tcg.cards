import { and, eq, inArray, sql } from 'drizzle-orm';

import { TaskRun, TaskStage } from '@tcg-cards/db/schema/local/task';
import type {
  TaskControlRequestKind,
  TaskResumeMode,
  TaskRunStatus,
  TaskStageStatus,
  TaskTerminalReason,
} from '@tcg-cards/model/src/task';

import type { TaskRunInput, TaskStagePlan, TaskStageState } from './definition';

/** Captures one task run snapshot returned by the framework store. */
export interface TaskRunRecord extends TaskRunInput {
  id: string;
  status: TaskRunStatus;
  supportsResume: boolean;
  currentStageKey: string | null;
  currentStageIndex: number | null;
  currentResumeMode: TaskResumeMode | null;
  pausedResumeMode: TaskResumeMode | null;
  runRevision: number;
  heartbeatAt: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  terminalReason: TaskTerminalReason | null;
  controlRequestKind: TaskControlRequestKind | null;
  runtimeBootId: string | null;
  resumeContextKey: string | null;
  retryOfTaskRunId: string | null;
}

/** Aggregates one task run snapshot together with all persisted stage rows. */
export interface TaskRunSnapshot {
  run: TaskRunRecord;
  stages: TaskStageState[];
}

/** Carries the create-time payload persisted by the framework store. */
export interface TaskRunCreateInput {
  run: TaskRunInput;
  supportsResume: boolean;
  stages: TaskStagePlan[];
  retryOfTaskRunId?: string | null;
}

/** Fields that can be patched on an existing task run. */
export interface TaskRunUpdatePatch {
  status?: TaskRunStatus;
  currentStageKey?: string | null;
  currentStageIndex?: number | null;
  currentResumeMode?: TaskResumeMode | null;
  pausedResumeMode?: TaskResumeMode | null;
  controlRequestKind?: TaskControlRequestKind | null;
  heartbeatAt?: Date | string | null;
  startedAt?: Date | string | null;
  finishedAt?: Date | string | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  terminalReason?: TaskTerminalReason | null;
  runtimeBootId?: string | null;
  resumeContextKey?: string | null;
}

/** Fields that can be patched on one task stage row. */
export interface TaskStageUpdatePatch {
  status?: TaskStageStatus;
  total?: number | null;
  done?: number | null;
  resumeToken?: Record<string, unknown> | null;
  selectionAnchor?: Record<string, unknown> | null;
  segments?: { name: string; done: number; total: number }[] | null;
  startedAt?: Date | string | null;
  finishedAt?: Date | string | null;
}

/** Fields that can be patched on the store-side update for task runs (accepts raw dates). */
export interface TaskRunStorePatch {
  status?: TaskRunStatus;
  currentStageKey?: string | null;
  currentStageIndex?: number | null;
  currentResumeMode?: TaskResumeMode | null;
  pausedResumeMode?: TaskResumeMode | null;
  controlRequestKind?: TaskControlRequestKind | null;
  heartbeatAt?: Date | string | null;
  startedAt?: Date | string | null;
  finishedAt?: Date | string | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  terminalReason?: TaskTerminalReason | null;
  runtimeBootId?: string | null;
  resumeContextKey?: string | null;
}

/** Defines the persistence contract consumed by the task framework. */
export interface TaskStore {
  createTaskRun(input: TaskRunCreateInput): Promise<TaskRunSnapshot>;
  getTaskRun(taskRunId: string): Promise<TaskRunSnapshot | null>;
  getActiveTaskRun(
    taskType: string,
    taskScopeType: string,
    taskScopeKey: string,
  ): Promise<TaskRunRecord | null>;
  listPendingTaskRuns(): Promise<TaskRunRecord[]>;
  listResumingTaskRuns(): Promise<TaskRunRecord[]>;
  listActiveTaskRuns(): Promise<TaskRunRecord[]>;
  updateTaskRun(taskRunId: string, patch: TaskRunUpdatePatch): Promise<TaskRunRecord>;
  updateStage(
    taskRunId: string,
    stageKey: string,
    patch: TaskStageUpdatePatch,
  ): Promise<TaskStageState>;
  transitionStage(
    taskRunId: string,
    stageKey: string,
    runPatch: TaskRunStorePatch,
    stagePatch: TaskStageUpdatePatch,
  ): Promise<void>;
}

/** Active statuses that indicate a task run still occupies its slot. */
const activeStatuses: TaskRunStatus[] = [
  'pending',
  'running',
  'pausing',
  'paused',
  'resuming',
  'canceling',
];

/** Maps a Drizzle task_runs row to the framework TaskRunRecord type. */
function toTaskRunRecord(row: typeof TaskRun.$inferSelect): TaskRunRecord {
  return {
    id: row.id,
    taskType: row.taskType,
    definitionVersion: row.definitionVersion,
    scope: {
      type: row.taskScopeType,
      key: row.taskScopeKey,
      snapshot: row.taskScopeSnapshot ?? undefined,
    },
    params: row.params,
    status: row.status as TaskRunStatus,
    supportsResume: row.supportsResume,
    currentStageKey: row.currentStageKey,
    currentStageIndex: row.currentStageIndex,
    currentResumeMode: row.currentResumeMode as TaskResumeMode | null,
    pausedResumeMode: row.pausedResumeMode as TaskResumeMode | null,
    runRevision: row.runRevision,
    heartbeatAt: row.heartbeatAt?.toISOString() ?? null,
    startedAt: row.startedAt?.toISOString() ?? null,
    finishedAt: row.finishedAt?.toISOString() ?? null,
    errorCode: row.errorCode,
    errorMessage: row.errorMessage,
    terminalReason: row.terminalReason as TaskTerminalReason | null,
    controlRequestKind: row.controlRequestKind as TaskControlRequestKind | null,
    runtimeBootId: row.runtimeBootId,
    resumeContextKey: row.resumeContextKey,
    retryOfTaskRunId: row.retryOfTaskRunId,
  };
}

/** Maps a Drizzle task_stages row to the framework TaskStageState type. */
function toTaskStageState(row: typeof TaskStage.$inferSelect): TaskStageState {
  return {
    stageKey: row.stageKey,
    stageIndex: row.stageIndex,
    label: row.label,
    status: row.status as TaskStageStatus,
    progressMode: row.progressMode as TaskStageState['progressMode'],
    resumeMode: row.resumeMode as TaskStageState['resumeMode'],
    total: row.total,
    done: row.done,
    startedAt: row.startedAt?.toISOString() ?? null,
    finishedAt: row.finishedAt?.toISOString() ?? null,
    resumeToken: row.resumeToken,
    selectionAnchor: row.selectionAnchor,
    segments: row.segments ?? undefined,
  };
}

/** Builds one Drizzle-backed task store for the given database client. */
export function createTaskStore(db: {
  insert: Function;
  update: Function;
  select: Function;
  delete: Function;
}): TaskStore {
  return {
    async createTaskRun(input): Promise<TaskRunSnapshot> {
      const [run] = await db
        .insert(TaskRun)
        .values({
          taskType: input.run.taskType,
          definitionVersion: input.run.definitionVersion,
          taskScopeType: input.run.scope.type,
          taskScopeKey: input.run.scope.key,
          taskScopeSnapshot: (input.run.scope.snapshot ?? null) as Record<
            string,
            unknown
          > | null,
          params: input.run.params,
          supportsResume: input.supportsResume,
          status: 'pending',
          currentStageKey: null,
          currentStageIndex: null,
          currentResumeMode: null,
          pausedResumeMode: null,
          selectionAnchor: null,
          resumeToken: null,
          runtimeBootId: null,
          resumeContextKey: null,
          runRevision: 0,
          controlRequestKind: null,
          heartbeatAt: null,
          startedAt: null,
          finishedAt: null,
          errorCode: null,
          errorMessage: null,
          terminalReason: null,
          retryOfTaskRunId: input.retryOfTaskRunId ?? null,
        })
        .returning();

      if (!run) {
        throw new Error('Failed to create task run');
      }

      const stages: TaskStageState[] = [];

      if (input.stages.length > 0) {
        const insertedStages = await db
          .insert(TaskStage)
          .values(
            input.stages.map(stage => ({
              taskRunId: run.id,
              stageKey: stage.stageKey,
              stageIndex: stage.stageIndex,
              status: 'pending' as const,
              label: stage.label,
              progressMode: stage.progressMode,
              resumeMode: stage.resumeMode,
              total: null,
              done: null,
              resumeToken: null,
              selectionAnchor: null,
              startedAt: null,
              finishedAt: null,
            })),
          )
          .returning();

        stages.push(...insertedStages.map(toTaskStageState));
      }

      return {
        run: toTaskRunRecord(run),
        stages,
      };
    },

    async getTaskRun(taskRunId): Promise<TaskRunSnapshot | null> {
      const [run] = await db
        .select()
        .from(TaskRun)
        .where(eq(TaskRun.id, taskRunId))
        .limit(1);

      if (!run) {
        return null;
      }

      const stageRows = await db
        .select()
        .from(TaskStage)
        .where(eq(TaskStage.taskRunId, taskRunId))
        .orderBy(TaskStage.stageIndex);

      return {
        run: toTaskRunRecord(run),
        stages: stageRows.map(toTaskStageState),
      };
    },

    async getActiveTaskRun(
      taskType,
      taskScopeType,
      taskScopeKey,
    ): Promise<TaskRunRecord | null> {
      const [run] = await db
        .select()
        .from(TaskRun)
        .where(
          and(
            eq(TaskRun.taskType, taskType),
            eq(TaskRun.taskScopeType, taskScopeType),
            eq(TaskRun.taskScopeKey, taskScopeKey),
            inArray(TaskRun.status, activeStatuses),
          ),
        )
        .limit(1);

      return run ? toTaskRunRecord(run) : null;
    },

    async listPendingTaskRuns(): Promise<TaskRunRecord[]> {
      const rows = await db
        .select()
        .from(TaskRun)
        .where(eq(TaskRun.status, 'pending'));

      return rows.map(toTaskRunRecord);
    },

    async listResumingTaskRuns(): Promise<TaskRunRecord[]> {
      const rows = await db
        .select()
        .from(TaskRun)
        .where(eq(TaskRun.status, 'resuming'));

      return rows.map(toTaskRunRecord);
    },

    async listActiveTaskRuns(): Promise<TaskRunRecord[]> {
      const rows = await db
        .select()
        .from(TaskRun)
        .where(inArray(TaskRun.status, activeStatuses));

      return rows.map(toTaskRunRecord);
    },

    async updateTaskRun(taskRunId, patch): Promise<TaskRunRecord> {
      const [updated] = await db
        .update(TaskRun)
        .set({
          ...patch,
          runRevision: sql`${TaskRun.runRevision} + 1`,
        })
        .where(eq(TaskRun.id, taskRunId))
        .returning();

      if (!updated) {
        throw new Error(`Task run ${taskRunId} does not exist`);
      }

      return toTaskRunRecord(updated);
    },

    async updateStage(taskRunId, stageKey, patch): Promise<TaskStageState> {
      const [updated] = await db
        .update(TaskStage)
        .set(patch)
        .where(
          and(
            eq(TaskStage.taskRunId, taskRunId),
            eq(TaskStage.stageKey, stageKey),
          ),
        )
        .returning();

      if (!updated) {
        throw new Error(
          `Stage "${stageKey}" does not exist on task run ${taskRunId}`,
        );
      }

      return toTaskStageState(updated);
    },

    async transitionStage(taskRunId, stageKey, runPatch, stagePatch): Promise<void> {
      const txDb = db as unknown as { transaction: Function };
      if (typeof txDb.transaction !== 'function') {
        throw new Error('Store does not support atomic transitions');
      }
      await txDb.transaction(async (tx: any) => {
        const [run] = await tx
          .update(TaskRun)
          .set({ ...runPatch, runRevision: sql`${TaskRun.runRevision} + 1` })
          .where(eq(TaskRun.id, taskRunId))
          .returning();
        if (!run) throw new Error(`Task run ${taskRunId} does not exist`);
        const [stage] = await tx
          .update(TaskStage)
          .set(stagePatch)
          .where(and(eq(TaskStage.taskRunId, taskRunId), eq(TaskStage.stageKey, stageKey)))
          .returning();
        if (!stage) throw new Error(`Stage "${stageKey}" does not exist on task run ${taskRunId}`);
      });
    },
  };
}
