import { and, eq, inArray, sql } from 'drizzle-orm';
import { createDb } from '@tcg-cards/db';
import { TaskRun, TaskStage as TaskStageRow } from '@tcg-cards/db/schema/local/task';

import type { TaskView } from '../contract';
import type { TaskRegistration } from './registry';

/** Active run states retained by the original task model. */
const activeStatuses = ['pending', 'running', 'pausing', 'paused', 'resuming', 'canceling'] as const;

/** Persists and reads task snapshots in the existing local PostgreSQL tables. */
export class TaskStore {
  private db;

  constructor(databaseUrl: string) {
    this.db = createDb(databaseUrl);
  }

  /** Creates a pending run before any Worker definition is loaded. */
  async create(id: string, registration: TaskRegistration, params: Record<string, unknown>): Promise<TaskView> {
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
    });
    const view = await this.get(id);
    if (!view) throw new Error('Task was not saved');
    return view;
  }

  /** Returns all unfinished runs across every registered task type. */
  async listActive(): Promise<TaskView[]> {
    const rows = await this.db.select({ id: TaskRun.id }).from(TaskRun)
      .where(inArray(TaskRun.status, [...activeStatuses]))
      .orderBy(TaskRun.createdAt);
    return (await Promise.all(rows.map(row => this.get(row.id)))).filter((task): task is TaskView => task !== null);
  }

  /** Reads one run and its stages through the same view used by all task pages. */
  async get(id: string): Promise<TaskView | null> {
    const [run] = await this.db.select().from(TaskRun).where(eq(TaskRun.id, id)).limit(1);
    if (!run) return null;
    const stages = await this.db.select().from(TaskStageRow)
      .where(eq(TaskStageRow.taskRunId, id)).orderBy(TaskStageRow.stageIndex);
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
      result:       run.result,
      errorMessage: run.errorMessage,
      createdAt:    run.createdAt.toISOString(),
      startedAt:    run.startedAt?.toISOString() ?? null,
      finishedAt:   run.finishedAt?.toISOString() ?? null,
    };
  }

  /** Inserts the stage skeleton after the Worker has loaded its definition. */
  async plan(id: string, stages: { key: string, label: string, total: number }[]): Promise<void> {
    if (stages.length === 0) return;
    await this.db.insert(TaskStageRow).values(stages.map((stage, index) => ({
      taskRunId:    id,
      stageKey:     stage.key,
      stageIndex:   index,
      label:        stage.label,
      status:       'pending' as const,
      progressMode: 'bounded' as const,
      resumeMode:   'none' as const,
      total:        stage.total,
      done:         0,
    })));
  }

  /** Starts a stage and records when actual execution begins. */
  async beginStage(id: string, key: string, index: number): Promise<void> {
    await this.db.update(TaskStageRow).set({ status: 'running', startedAt: new Date() })
      .where(and(eq(TaskStageRow.taskRunId, id), eq(TaskStageRow.stageKey, key)));
    await this.db.update(TaskRun).set({
      status:            'running',
      startedAt:         sql`coalesce(${TaskRun.startedAt}, now())`,
      currentStageKey:   key,
      currentStageIndex: index,
      currentResumeMode: 'none',
      runRevision:       sql`${TaskRun.runRevision} + 1`,
    }).where(eq(TaskRun.id, id));
  }

  /** Saves monotonic bounded progress for one stage. */
  async progress(id: string, key: string, done: number): Promise<void> {
    await this.db.update(TaskStageRow).set({ done }).where(and(
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
      status:            'completed', result, finishedAt:        new Date(), currentStageKey:   null,
      currentStageIndex: null, currentResumeMode: null,
      runRevision:       sql`${TaskRun.runRevision} + 1`,
    }).where(eq(TaskRun.id, id));
  }

  /** Clears an unfinished run after a Worker or preparation failure. */
  async fail(id: string, message: string): Promise<void> {
    await this.db.update(TaskRun).set({
      status:            'failed', terminalReason:    'execution_failed', errorMessage:      message,
      finishedAt:        new Date(), currentStageKey:   null, currentStageIndex: null,
      currentResumeMode: null, runRevision:       sql`${TaskRun.runRevision} + 1`,
    }).where(eq(TaskRun.id, id));
    await this.db.update(TaskStageRow).set({ status: 'failed', finishedAt: new Date() })
      .where(and(eq(TaskStageRow.taskRunId, id), eq(TaskStageRow.status, 'running')));
  }
}
