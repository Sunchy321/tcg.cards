import type { TaskRegistration } from './registry';
import type { RecoveryRun, TaskStore } from './store';

/** Resolves a task type to its registration, undefined when it is no longer known. */
export type RegistrationResolver = (taskType: string) => TaskRegistration | undefined;

/** Run states whose Worker definitely died with the previous host boot. */
const staleStatuses: readonly string[] = ['pending', 'running', 'pausing', 'resuming', 'canceling'];

/** Reports whether one run stopped inside a stage that kept a durable checkpoint. */
function hasDurableCheckpoint(run: RecoveryRun): boolean {
  if (!run.currentStageKey) return false;
  const stage = run.stages.find(candidate => candidate.stageKey === run.currentStageKey);
  return !!stage
    && (stage.status === 'running' || stage.status === 'paused')
    && stage.resumeMode === 'durable'
    && stage.done !== null;
}

/**
 * Reclassifies every unfinished run after the task host started on a fresh boot:
 * recoverable runs wait on `interrupted`, unrecoverable ones are abandoned and
 * release their task type slot, manually paused recoverable runs keep the pause.
 */
export async function recoverUnfinishedRuns(store: TaskStore, resolveRegistration: RegistrationResolver): Promise<void> {
  const runs = await store.listRecoveryRuns();
  for (const run of runs) {
    const registration = resolveRegistration(run.taskType);
    if (!registration || registration.version !== run.definitionVersion) {
      await store.markAbandoned(run.id, 'resume_incompatible').catch(() => {});
      continue;
    }
    const checkpoint = hasDurableCheckpoint(run);
    if (run.status === 'interrupted') {
      // Already waiting for a manual continue; only a lost checkpoint can still disqualify it.
      if (!checkpoint) await store.markAbandoned(run.id, 'abandoned_stale_run').catch(() => {});
      continue;
    }
    if (run.status === 'paused') {
      // A manual pause keeps its intent when the boundary is still recoverable.
      if (checkpoint) continue;
      await store.markAbandoned(run.id, 'resume_context_lost').catch(() => {});
      continue;
    }
    if (staleStatuses.includes(run.status)) {
      if (checkpoint && run.currentStageKey) await store.markInterrupted(run.id, run.currentStageKey).catch(() => {});
      else await store.markAbandoned(run.id, 'abandoned_stale_run').catch(() => {});
    }
  }
}
