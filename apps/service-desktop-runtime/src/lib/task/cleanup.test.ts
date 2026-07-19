import { describe, expect, test } from 'bun:test';

import { createTaskCleanup } from './cleanup';

describe('task startup cleanup', () => {
  test('moves stale durable execution to paused instead of abandoned', async () => {
    const transitions: Array<Record<string, unknown>> = [];
    const store = {
      listActiveTaskRuns: async () => [{
        id:                'run-1',
        status:            'running',
        currentResumeMode: 'durable',
        currentStageKey:   'projecting',
      }],
      transitionStage: async (_taskRunId: string, _stageKey: string, runPatch: Record<string, unknown>, stagePatch: Record<string, unknown>) => {
        transitions.push({ runPatch, stagePatch });
      },
      updateTaskRun: async () => {
        throw new Error('durable runs must not be abandoned');
      },
    };

    await createTaskCleanup(store as never, {} as never).cleanupStartupState();

    expect(transitions).toEqual([{
      runPatch: {
        status:             'paused',
        controlRequestKind: null,
        pausedResumeMode:   'durable',
        currentResumeMode:  'durable',
      },
      stagePatch: { status: 'paused' },
    }]);
  });
});
