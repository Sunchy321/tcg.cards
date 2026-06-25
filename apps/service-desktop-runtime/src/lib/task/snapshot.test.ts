import { describe, expect, test } from 'bun:test';

import type { TaskRunRecord, TaskRunSnapshot } from './store';
import type { TaskStageState } from './definition';
import {
  buildTaskPageSnapshot,
  createIdleTaskPageSnapshot,
} from './snapshot';

/** Builds a minimal TaskRunRecord for use in snapshot tests. */
function run(overrides: Partial<TaskRunRecord> & { status: TaskRunRecord['status'] }): TaskRunRecord {
  return {
    id: 'test-run-uuid',
    taskType: 'hsdata_publish',
    definitionVersion: 'v1',
    scope: { type: 'publish_stream', key: 'hearthstone:production:card_data' },
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

/** Builds a complete TaskRunSnapshot for use in snapshot tests. */
function snapshot(
  runOverrides: Partial<TaskRunRecord> & { status: TaskRunRecord['status'] },
  stages: TaskStageState[] = [],
): TaskRunSnapshot {
  return { run: run(runOverrides), stages };
}

describe('snapshot', () => {
  describe('createIdleTaskPageSnapshot', () => {
    test('returns idle with empty stages', () => {
      const result = createIdleTaskPageSnapshot();
      expect(result).toEqual({ pageTask: { kind: 'idle' }, stages: [] });
    });
  });

  describe('buildTaskPageSnapshot', () => {
    test('terminal statuses produce attached page task with final state', () => {
      const terminalStatuses: TaskRunRecord['status'][] = [
        'completed', 'failed', 'canceled', 'abandoned',
      ];

      for (const status of terminalStatuses) {
        const result = buildTaskPageSnapshot(snapshot({ status }));
        expect(result.pageTask).toMatchObject({
          kind: 'attached',
          status,
          canCancel: false,
          canPause: false,
          canResume: false,
        });
      }
    });

    test('pending status produces attached page task with correct capabilities', () => {
      const result = buildTaskPageSnapshot(snapshot({ status: 'pending' }));

      expect(result.pageTask).toMatchObject({
        kind: 'attached',
        status: 'pending',
        canPause: false,
        canResume: false,
        canCancel: true,
        supportsResume: false,
      });
      expect(result.stages).toEqual([]);
    });

    test('running status produces attached with canCancel', () => {
      const result = buildTaskPageSnapshot(snapshot({ status: 'running' }));

      expect(result.pageTask).toMatchObject({
        kind: 'attached',
        status: 'running',
        canPause: false,
        canResume: false,
        canCancel: true,
      });
    });

    test('running with supportsResume enables canPause', () => {
      const result = buildTaskPageSnapshot(
        snapshot({ status: 'running', supportsResume: true }),
      );

      expect(result.pageTask).toMatchObject({
        kind: 'attached',
        status: 'running',
        canPause: true,
        canCancel: true,
      });
    });

    test('paused status produces attached with canResume and canCancel', () => {
      const result = buildTaskPageSnapshot(
        snapshot({ status: 'paused', supportsResume: true }),
      );

      expect(result.pageTask).toMatchObject({
        kind: 'attached',
        status: 'paused',
        canPause: false,
        canResume: true,
        canCancel: true,
      });
    });

    test('passes through all page task fields for attached status', () => {
      const now = new Date().toISOString();
      const result = buildTaskPageSnapshot(snapshot({
        status: 'running',
        taskType: 'custom_type',
        scope: { type: 'game_scope', key: 'game:mode:item', snapshot: { game: 'test' } },
        runRevision: 5,
        supportsResume: true,
        currentStageKey: 'phase_two',
        currentStageIndex: 1,
        currentResumeMode: 'durable',
        pausedResumeMode: null,
        startedAt: now,
        errorCode: 'ERR_001',
        errorMessage: 'Something went wrong',
        terminalReason: null,
        controlRequestKind: null,
      }));

      expect(result.pageTask).toMatchObject({
        kind: 'attached',
        taskRunId: 'test-run-uuid',
        runRevision: 5,
        taskType: 'custom_type',
        taskScopeType: 'game_scope',
        taskScopeKey: 'game:mode:item',
        taskScopeSnapshot: { game: 'test' },
        status: 'running',
        supportsResume: true,
        currentStageKey: 'phase_two',
        currentStageIndex: 1,
        currentResumeMode: 'durable',
        startedAt: now,
        errorCode: 'ERR_001',
        errorMessage: 'Something went wrong',
      });
    });

    test('maps stages with correct fields', () => {
      const stages: TaskStageState[] = [
        { stageKey: 'a', stageIndex: 0, label: 'Stage A', status: 'completed', progressMode: 'simple', resumeMode: 'none', total: null, done: null, startedAt: null, finishedAt: null, resumeToken: null, selectionAnchor: null },
        { stageKey: 'b', stageIndex: 1, label: 'Stage B', status: 'running', progressMode: 'bounded', resumeMode: 'none', total: 200, done: 75, startedAt: null, finishedAt: null, resumeToken: null, selectionAnchor: null },
        { stageKey: 'c', stageIndex: 2, label: 'Stage C', status: 'pending', progressMode: 'bounded', resumeMode: 'none', total: 50, done: 0, startedAt: null, finishedAt: null, resumeToken: null, selectionAnchor: null },
      ];

      const result = buildTaskPageSnapshot(snapshot(
        { status: 'running', currentStageKey: 'b', currentStageIndex: 1 },
        stages,
      ));

      expect(result.stages).toHaveLength(3);
      expect(result.stages[0]).toMatchObject({ stageKey: 'a', status: 'completed', progressMode: 'simple', total: null, done: null });
      expect(result.stages[1]).toMatchObject({ stageKey: 'b', status: 'running', progressMode: 'bounded', total: 200, done: 75 });
      expect(result.stages[2]).toMatchObject({ stageKey: 'c', status: 'pending', progressMode: 'bounded', total: 50, done: 0 });
    });
  });
});
