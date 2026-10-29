import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { createDb } from '@tcg-cards/db';
import { TaskRun, TaskStage as TaskStageRow } from '@tcg-cards/db/schema/local/task';
import type { TaskPageSnapshot, TaskStage } from '@tcg-cards/model/task';

import type { TaskView } from '../contract';
import type { TaskProgressMode, TaskProgressUpdate, TaskRegistration, TaskStageResumeMode } from './registry';

/** Active run states retained by the original task model; interrupted still occupies its slot. */
const activeStatuses = ['pending', 'running', 'pausing', 'paused', 'resuming', 'canceling', 'interrupted'] as const;

/** Terminal states from which a new run may be retried with the original parameters. */
const retryableStatuses: readonly string[] = ['failed', 'canceled', 'abandoned'];

/** Every persisted state that ends a run. */
const terminalStatuses: readonly string[] = [...retryableStatuses, 'completed'];

/** Why an unfinished run became abandoned when its execution environment disappeared. */
export type AbandonReason = 'abandoned_stale_run' | 'resume_context_lost' | 'resume_incompatible';

/** One unfinished run with the fields boot recovery classifies it by. */
export interface RecoveryRun {
  id:                string;
  taskType:          string;
  definitionVersion: string;
  status:            string;
  currentStageKey:   string | null;
  stages:            { stageKey: string, status: string, resumeMode: string, done: number | null }[];
}

/** Persists and reads task snapshots in the existing local PostgreSQL tables. */
export class TaskStore {
  private db;

  constructor(databaseUrl: string) {
    this.db = createDb(databaseUrl);
  }

  /** Creates a pending run before any Worker definition is loaded. */
  async create(
    id: string,
    registration: TaskRegistration,
    params: Record<string, unknown>,
    retryOfTaskRunId?: string,
  ): Promise<TaskView> {
    const scope = registration.scope(params);
    await this.db.insert(TaskRun).values({
      id,
      taskType:          registration.taskType,
      definitionVersion: registration.version,
      taskScopeType:     scope.type,
      taskScopeKey:      scope.key,
      taskScopeSnapshot: scope.snapshot,
      params,
      supportsResume:    registration.supportsResume,
      status:            'pending',
      retryOfTaskRunId:  retryOfTaskRunId ?? null,
    });
    const view = await this.get(id);
    if (!view) throw new Error('Task was not saved');
    return view;
  }

  /** Returns the single unfinished run of one task type, whatever its scope is. */
  async findActiveByType(taskType: string): Promise<TaskView | null> {
    const [row] = await this.db.select({ id: TaskRun.id }).from(TaskRun)
      .where(and(eq(TaskRun.taskType, taskType), inArray(TaskRun.status, [...activeStatuses])))
      .orderBy(TaskRun.createdAt)
      .limit(1);
    return row ? this.get(row.id) : null;
  }

  /** Returns the newest run of each requested task type regardless of status. */
  async latestByTypes(taskTypes: string[]): Promise<TaskView[]> {
    if (taskTypes.length === 0) return [];
    const rows = await this.db.selectDistinctOn([TaskRun.taskType], { id: TaskRun.id })
      .from(TaskRun)
      .where(inArray(TaskRun.taskType, taskTypes))
      .orderBy(TaskRun.taskType, desc(TaskRun.createdAt));
    return (await Promise.all(rows.map(row => this.get(row.id)))).filter((task): task is TaskView => task !== null);
  }

  /** Returns all unfinished runs across every registered task type. */
  async listActive(): Promise<TaskView[]> {
    const rows = await this.db.select({ id: TaskRun.id }).from(TaskRun)
      .where(inArray(TaskRun.status, [...activeStatuses]))
      .orderBy(TaskRun.createdAt);
    return (await Promise.all(rows.map(row => this.get(row.id)))).filter((task): task is TaskView => task !== null);
  }

  /** Reads every unfinished run with the fields boot recovery classifies it by. */
  async listRecoveryRuns(): Promise<RecoveryRun[]> {
    const rows = await this.db.select({
      id:                TaskRun.id,
      taskType:          TaskRun.taskType,
      definitionVersion: TaskRun.definitionVersion,
      status:            TaskRun.status,
      currentStageKey:   TaskRun.currentStageKey,
    }).from(TaskRun).where(inArray(TaskRun.status, [...activeStatuses])).orderBy(TaskRun.createdAt);
    const stages = await this.db.select({
      taskRunId:  TaskStageRow.taskRunId,
      stageKey:   TaskStageRow.stageKey,
      status:     TaskStageRow.status,
      resumeMode: TaskStageRow.resumeMode,
      done:       TaskStageRow.done,
    }).from(TaskStageRow);
    const byRun = new Map<string, RecoveryRun['stages']>();
    for (const stage of stages) {
      const list = byRun.get(stage.taskRunId) ?? [];
      list.push({ stageKey: stage.stageKey, status: stage.status, resumeMode: stage.resumeMode, done: stage.done });
      byRun.set(stage.taskRunId, list);
    }
    return rows.map(row => ({ ...row, stages: byRun.get(row.id) ?? [] }));
  }

  /** Reads one run and its stages through the same view used by all task pages. */
  async get(id: string): Promise<TaskView | null> {
    const [run] = await this.db.select().from(TaskRun).where(eq(TaskRun.id, id)).limit(1);
    if (!run) return null;
    const stages = await this.db.select().from(TaskStageRow)
      .where(eq(TaskStageRow.taskRunId, id)).orderBy(TaskStageRow.stageIndex);
    const currentStage = stages.find(stage => stage.stageKey === run.currentStageKey && stage.stageIndex === run.currentStageIndex);
    const pageSnapshot: TaskPageSnapshot = {
      pageTask: {
        kind:              'attached',
        taskRunId:         run.id,
        runRevision:       run.runRevision,
        taskType:          run.taskType,
        taskScopeType:     run.taskScopeType,
        taskScopeKey:      run.taskScopeKey,
        taskScopeSnapshot: run.taskScopeSnapshot ?? undefined,
        status:            run.status,
        ...(typeof run.params.dryRun === 'boolean' ? { dryRun: run.params.dryRun } : {}),
        supportsResume:    run.supportsResume,
        currentStageKey:   run.currentStageKey,
        currentStageIndex: run.currentStageIndex,
        currentResumeMode: run.currentResumeMode,
        pausedResumeMode:  run.pausedResumeMode,
        progressMode:      currentStage?.progressMode ?? null,
        startedAt:         run.startedAt?.toISOString() ?? null,
        finishedAt:        run.finishedAt?.toISOString() ?? null,
        errorCode:         run.errorCode,
        errorMessage:      run.errorMessage,
        terminalReason:    run.terminalReason,
        canPause:          run.status === 'running' && run.supportsResume,
        canResume:         run.status === 'paused' || run.status === 'interrupted',
        canCancel:         ['pending', 'running', 'pausing', 'paused', 'resuming'].includes(run.status),
      },
      stages: stages.map((stage): TaskStage => ({
        stageKey:     stage.stageKey,
        stageIndex:   stage.stageIndex,
        label:        stage.label,
        status:       stage.status,
        progressMode: stage.progressMode,
        resumeMode:   stage.resumeMode,
        total:        stage.total,
        done:         stage.done,
        startedAt:    stage.startedAt?.toISOString() ?? null,
        finishedAt:   stage.finishedAt?.toISOString() ?? null,
        ...(stage.segments ? { segments: stage.segments } : {}),
      })),
      ...(run.status === 'completed' && run.result ? { result: run.result } : {}),
    };
    return {
      id:        run.id,
      taskType:  run.taskType,
      label:     run.taskType,
      status:    run.status,
      phase:     run.status === 'pending' ? 'starting' : run.status === 'running' ? 'running' : 'finished',
      elapsedMs: Math.max(0, (run.startedAt ?? run.finishedAt ?? new Date()).getTime() - run.createdAt.getTime()),
      stages:    stages.map(stage => ({
        key:    stage.stageKey,
        label:  stage.label,
        status: stage.status,
        done:   stage.done,
        total:  stage.total,
      })),
      result:       run.status === 'completed' ? run.result : null,
      errorMessage: run.errorMessage,
      createdAt:    run.createdAt.toISOString(),
      startedAt:    run.startedAt?.toISOString() ?? null,
      finishedAt:   run.finishedAt?.toISOString() ?? null,
      pageSnapshot,
    };
  }

  /** Reports whether one run ended and can no longer be controlled. */
  async isTerminal(id: string): Promise<boolean> {
    const [row] = await this.db.select({ status: TaskRun.status }).from(TaskRun).where(eq(TaskRun.id, id)).limit(1);
    return !row || terminalStatuses.includes(row.status);
  }

  /** Reports whether one run ended in a state that allows a same-parameter retry. */
  async isRetryable(id: string): Promise<boolean> {
    const [row] = await this.db.select({ status: TaskRun.status }).from(TaskRun).where(eq(TaskRun.id, id)).limit(1);
    return !!row && retryableStatuses.includes(row.status);
  }

  /** Reads the original task type and parameters kept by one run. */
  async parametersOf(id: string): Promise<{ taskType: string, params: Record<string, unknown> } | null> {
    const [row] = await this.db.select({ taskType: TaskRun.taskType, params: TaskRun.params })
      .from(TaskRun).where(eq(TaskRun.id, id)).limit(1);
    return row ?? null;
  }

  /** Reads one stage checkpoint without including it in renderer-facing snapshots. */
  async resumeState(id: string, stageKey: string): Promise<{ done: number | null, token: Record<string, unknown> | null } | null> {
    const [row] = await this.db.select({ done: TaskStageRow.done, resumeToken: TaskStageRow.resumeToken })
      .from(TaskStageRow)
      .where(and(eq(TaskStageRow.taskRunId, id), eq(TaskStageRow.stageKey, stageKey)))
      .limit(1);
    return row ? { done: row.done, token: row.resumeToken ?? null } : null;
  }

  /** Reads the saved task result for a resumed Worker. */
  async resultOf(id: string): Promise<Record<string, unknown> | null> {
    const [row] = await this.db.select({ result: TaskRun.result }).from(TaskRun).where(eq(TaskRun.id, id)).limit(1);
    return row?.result ?? null;
  }

  /** Saves one task result while its Worker is active. */
  async saveResult(id: string, result: Record<string, unknown>): Promise<void> {
    await this.db.update(TaskRun).set({ result }).where(eq(TaskRun.id, id));
  }

  /** Marks a running run as pausing so its Worker stops at the next safe boundary. */
  async requestPause(id: string): Promise<boolean> {
    const rows = await this.db.update(TaskRun).set({
      status:             'pausing',
      controlRequestKind: 'pause',
      runRevision:        sql`${TaskRun.runRevision} + 1`,
    }).where(and(eq(TaskRun.id, id), eq(TaskRun.status, 'running'))).returning({ id: TaskRun.id });
    return rows.length > 0;
  }

  /** Clears a settled pause so the waiting Worker may continue its current stage. */
  async requestResume(id: string): Promise<boolean> {
    const rows = await this.db.update(TaskRun).set({
      status:             'resuming',
      controlRequestKind: null,
      runRevision:        sql`${TaskRun.runRevision} + 1`,
    }).where(and(eq(TaskRun.id, id), inArray(TaskRun.status, ['paused', 'interrupted']))).returning({ id: TaskRun.id });
    return rows.length > 0;
  }

  /** Marks a running or pausing run as canceling at its current safe boundary. */
  async requestCancel(id: string): Promise<boolean> {
    const rows = await this.db.update(TaskRun).set({
      status:             'canceling',
      controlRequestKind: 'cancel',
      runRevision:        sql`${TaskRun.runRevision} + 1`,
    }).where(and(eq(TaskRun.id, id), inArray(TaskRun.status, ['running', 'pausing']))).returning({ id: TaskRun.id });
    return rows.length > 0;
  }

  /** Finalizes a manual cancel from any status that has no safe boundary left to wait for. */
  async markCanceled(id: string): Promise<boolean> {
    const rows = await this.db.update(TaskRun).set({
      status:             'canceled',
      terminalReason:     'manual_cancel',
      finishedAt:         new Date(),
      controlRequestKind: null,
      currentStageKey:    null,
      currentStageIndex:  null,
      currentResumeMode:  null,
      pausedResumeMode:   null,
      runRevision:        sql`${TaskRun.runRevision} + 1`,
    }).where(and(eq(TaskRun.id, id), inArray(TaskRun.status, [...activeStatuses]))).returning({ id: TaskRun.id });
    if (rows.length === 0) return false;
    await this.db.update(TaskStageRow).set({ status: 'canceled', finishedAt: new Date() })
      .where(and(
        eq(TaskStageRow.taskRunId, id),
        inArray(TaskStageRow.status, ['pending', 'running', 'paused']),
      ));
    return true;
  }

  /** Persists one Worker-side pause at a safe boundary inside the current stage. */
  async markPaused(
    id: string,
    stageKey: string,
    resumeMode: TaskStageResumeMode,
    total?: number | null,
  ): Promise<void> {
    const [stage] = await this.db.select({ stageIndex: TaskStageRow.stageIndex })
      .from(TaskStageRow)
      .where(and(eq(TaskStageRow.taskRunId, id), eq(TaskStageRow.stageKey, stageKey)))
      .limit(1);
    if (!stage) throw new Error('Task stage was not found');
    await this.db.update(TaskStageRow).set({
      status: 'paused',
      ...(total === undefined ? {} : { total }),
    })
      .where(and(eq(TaskStageRow.taskRunId, id), eq(TaskStageRow.stageKey, stageKey)));
    await this.db.update(TaskRun).set({
      status:             'paused',
      controlRequestKind: null,
      currentStageKey:    stageKey,
      currentStageIndex:  stage.stageIndex,
      currentResumeMode:  resumeMode,
      pausedResumeMode:   resumeMode,
      runRevision:        sql`${TaskRun.runRevision} + 1`,
    }).where(and(eq(TaskRun.id, id), inArray(TaskRun.status, ['running', 'pausing'])));
  }

  /** Moves a run whose execution environment disappeared onto the interrupted checkpoint. */
  async markInterrupted(id: string, stageKey: string): Promise<boolean> {
    const [stage] = await this.db.select({ stageIndex: TaskStageRow.stageIndex, resumeMode: TaskStageRow.resumeMode })
      .from(TaskStageRow)
      .where(and(eq(TaskStageRow.taskRunId, id), eq(TaskStageRow.stageKey, stageKey)))
      .limit(1);
    if (!stage) return false;
    const rows = await this.db.update(TaskRun).set({
      status:             'interrupted',
      controlRequestKind: null,
      currentStageKey:    stageKey,
      currentStageIndex:  stage.stageIndex,
      currentResumeMode:  stage.resumeMode,
      pausedResumeMode:   null,
      runtimeBootId:      null,
      resumeContextKey:   null,
      runRevision:        sql`${TaskRun.runRevision} + 1`,
    }).where(and(
      eq(TaskRun.id, id),
      inArray(TaskRun.status, ['pending', 'running', 'pausing', 'resuming', 'canceling']),
    )).returning({ id: TaskRun.id });
    if (rows.length === 0) return false;
    await this.db.update(TaskStageRow).set({ status: 'paused' })
      .where(and(
        eq(TaskStageRow.taskRunId, id),
        eq(TaskStageRow.stageKey, stageKey),
        inArray(TaskStageRow.status, ['running', 'pending']),
      ));
    return true;
  }

  /** Ends an unfinished run as abandoned, freeing the slot of its task type. */
  async markAbandoned(id: string, reason: AbandonReason): Promise<boolean> {
    const rows = await this.db.update(TaskRun).set({
      status:             'abandoned',
      terminalReason:     reason,
      finishedAt:         new Date(),
      controlRequestKind: null,
      currentStageKey:    null,
      currentStageIndex:  null,
      currentResumeMode:  null,
      pausedResumeMode:   null,
      runtimeBootId:      null,
      resumeContextKey:   null,
      runRevision:        sql`${TaskRun.runRevision} + 1`,
    }).where(and(eq(TaskRun.id, id), inArray(TaskRun.status, [...activeStatuses]))).returning({ id: TaskRun.id });
    if (rows.length === 0) return false;
    await this.db.update(TaskStageRow).set({ status: 'abandoned', finishedAt: new Date() })
      .where(and(
        eq(TaskStageRow.taskRunId, id),
        inArray(TaskStageRow.status, ['pending', 'running', 'paused']),
      ));
    return true;
  }

  /** Inserts the stage skeleton after the Worker has loaded its definition. */
  async plan(id: string, stages: { key: string, label: string, total: number | null, progressMode?: TaskProgressMode, resumeMode?: TaskStageResumeMode }[]): Promise<void> {
    if (stages.length === 0) return;
    await this.db.insert(TaskStageRow).values(stages.map((stage, index) => ({
      taskRunId:    id,
      stageKey:     stage.key,
      stageIndex:   index,
      label:        stage.label,
      status:       'pending' as const,
      progressMode: stage.progressMode ?? 'bounded' as const,
      resumeMode:   stage.resumeMode ?? 'none' as const,
      total:        stage.total,
      done:         stage.progressMode === 'simple' ? null : 0,
    })));
  }

  /** Starts a stage and records when actual execution begins; false when a control state outran it. */
  async beginStage(
    id: string,
    key: string,
    index: number,
    resumeMode: TaskStageResumeMode,
    total?: number | null,
  ): Promise<boolean> {
    return await this.db.transaction(async tx => {
      const rows = await tx.update(TaskRun).set({
        status:            'running',
        startedAt:         sql`coalesce(${TaskRun.startedAt}, now())`,
        currentStageKey:   key,
        currentStageIndex: index,
        currentResumeMode: resumeMode,
        pausedResumeMode:  null,
        runRevision:       sql`${TaskRun.runRevision} + 1`,
      }).where(and(eq(TaskRun.id, id), inArray(TaskRun.status, ['pending', 'running', 'resuming']))).returning({ id: TaskRun.id });
      if (rows.length === 0) return false;
      await tx.update(TaskStageRow).set({
        status:    'running',
        startedAt: new Date(),
        ...(total === undefined ? {} : { total }),
      })
        .where(and(eq(TaskStageRow.taskRunId, id), eq(TaskStageRow.stageKey, key)));
      return true;
    });
  }

  /** Saves stage progress and optional visual segments. */
  async progress(id: string, key: string, update: TaskProgressUpdate): Promise<void> {
    const patch: Partial<typeof TaskStageRow.$inferInsert> = { done: update.done };
    if (update.total !== undefined) patch.total = update.total;
    if (update.segments !== undefined) patch.segments = update.segments;
    await this.db.update(TaskStageRow).set(patch).where(and(
      eq(TaskStageRow.taskRunId, id), eq(TaskStageRow.stageKey, key),
    ));
  }

  /** Persists one domain checkpoint with its latest progress. */
  async checkpoint(id: string, key: string, token: Record<string, unknown>, update?: TaskProgressUpdate): Promise<void> {
    const patch: Partial<typeof TaskStageRow.$inferInsert> = { resumeToken: token };
    if (update) {
      patch.done = update.done;
      if (update.total !== undefined) patch.total = update.total;
      if (update.segments !== undefined) patch.segments = update.segments;
    }
    await this.db.update(TaskStageRow).set(patch).where(and(
      eq(TaskStageRow.taskRunId, id), eq(TaskStageRow.stageKey, key),
    ));
  }

  /** Completes one stage before the next stage starts. */
  async completeStage(id: string, key: string): Promise<void> {
    await this.db.update(TaskStageRow).set({ status: 'completed', finishedAt: new Date() })
      .where(and(eq(TaskStageRow.taskRunId, id), eq(TaskStageRow.stageKey, key)));
  }

  /** Marks the entire run complete and stores its result. */
  async complete(id: string, result: Record<string, unknown>): Promise<void> {
    await this.db.update(TaskRun).set({
      status:            'completed',
      result,
      finishedAt:        new Date(),
      currentStageKey:   null,
      currentStageIndex: null,
      currentResumeMode: null,
      pausedResumeMode:  null,
      runRevision:       sql`${TaskRun.runRevision} + 1`,
    }).where(eq(TaskRun.id, id));
  }

  /** Clears an unfinished run after a Worker or preparation failure. */
  async fail(id: string, message: string, stageKey?: string): Promise<void> {
    await this.db.update(TaskRun).set({
      status:            'failed',
      terminalReason:    'execution_failed',
      errorMessage:      message,
      finishedAt:        new Date(),
      currentStageKey:   null,
      currentStageIndex: null,
      currentResumeMode: null,
      pausedResumeMode:  null,
      runRevision:       sql`${TaskRun.runRevision} + 1`,
    }).where(and(eq(TaskRun.id, id), inArray(TaskRun.status, [...activeStatuses])));
    const stageCondition = stageKey == null
      ? and(eq(TaskStageRow.taskRunId, id), eq(TaskStageRow.status, 'running'))
      : and(
        eq(TaskStageRow.taskRunId, id),
        eq(TaskStageRow.stageKey, stageKey),
        inArray(TaskStageRow.status, ['pending', 'running']),
      );
    await this.db.update(TaskStageRow).set({ status: 'failed', finishedAt: new Date() })
      .where(stageCondition);
  }
}
