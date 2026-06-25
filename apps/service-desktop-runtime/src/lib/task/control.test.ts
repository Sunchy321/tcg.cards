import { describe, expect, test } from 'bun:test';

import { toTaskControlResult } from './control';
import type { TaskRunRecord, TaskRunSnapshot } from './store';
import type { TaskStageState } from './definition';

/** Builds a minimal TaskRunRecord for control-result tests. */
function run(overrides: Partial<TaskRunRecord> & { id: string; status: TaskRunRecord['status'] }): TaskRunRecord {
  return {
    taskType: 'test_task',
    definitionVersion: 'v1',
    scope: { type: 'test', key: 'test:item' },
    params: {},
    supportsResume: false,
    currentStageKey: null,
    currentStageIndex: null,
    currentResumeMode: null,
    pausedResumeMode: null,
    runRevision: 1,
    heartbeatAt: null,
    startedAt: null,
    finishedAt: null,
    errorCode: null,
    errorMessage: null,
    terminalReason: null,
    controlRequestKind: null,
    runtimeBootId: null,
    resumeContextKey: null,
    retryOfTaskRunId: null,
    ...overrides,
  };
}

/** Builds one convenience TaskRunSnapshot with empty stages. */
function snapshot(
  runOverrides: Partial<TaskRunRecord> & { id: string; status: TaskRunRecord['status'] },
): TaskRunSnapshot {
  return { run: run(runOverrides), stages: [] as TaskStageState[] };
}

describe('toTaskControlResult', () => {
  test('maps taskRunId, runRevision and status from the snapshot', () => {
    const result = toTaskControlResult(snapshot({
      id: 'uuid-123',
      status: 'running',
      runRevision: 7,
    }));

    expect(result).toEqual({
      taskRunId: 'uuid-123',
      runRevision: 7,
      status: 'running',
    });
  });

  test('preserves every status value', () => {
    const statuses: TaskRunRecord['status'][] = [
      'pending', 'running', 'pausing', 'paused', 'resuming',
      'canceling', 'canceled', 'failed', 'completed', 'abandoned',
    ];

    for (const status of statuses) {
      const result = toTaskControlResult(snapshot({ id: 'uuid-s', status }));
      expect(result.status).toBe(status);
    }
  });

  test('round-trips a cancelled control result', () => {
    const snap = snapshot({ id: 'cancel-uuid', status: 'canceled', runRevision: 3 });

    const result = toTaskControlResult(snap);

    expect(result.taskRunId).toBe('cancel-uuid');
    expect(result.runRevision).toBe(3);
    expect(result.status).toBe('canceled');
  });
});
