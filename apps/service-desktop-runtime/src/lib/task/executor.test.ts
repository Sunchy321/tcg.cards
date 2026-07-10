import { describe, expect, test } from 'bun:test';

import type { TaskExecutorStore } from './executor';
import { createTaskExecutor } from './executor';
import { registerTaskDefinition } from './registry';
import type {
  TaskBlock,
  TaskDefinition,
  TaskRunInput,
  TaskStageEntry,
  TaskStagePlan,
  TaskStageState,
} from './definition';

// ── In-memory store ─────────────────────────────────────

interface MemRun {
  id: string;
  status: string;
  currentStageKey: string | null;
  currentStageIndex: number | null;
  currentResumeMode: string | null;
  pausedResumeMode: string | null;
  runtimeBootId: string | null;
  resumeContextKey: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  controlRequestKind: string | null;
  terminalReason: string | null;
  heartbeatAt: string | null;
  errorMessage: string | null;
  runRevision: number;
  taskType: string;
  definitionVersion: string;
  scope: { type: string; key: string };
  params: Record<string, unknown>;
  supportsResume: boolean;
}

interface MemStage {
  taskRunId: string;
  stageKey: string;
  stageIndex: number;
  status: string;
  progressMode: string;
  resumeMode: string;
  total: number | null;
  done: number | null;
  startedAt: string | null;
  finishedAt: string | null;
  label: string;
}

type MemStore = ReturnType<typeof createMemStore>;

function createMemStore() {
  const runs = new Map<string, MemRun>();
  const stages = new Map<string, MemStage>();

  function skey(rid: string, sid: string) {
    return `${rid}:${sid}`;
  }

  function buildSnapshot(taskRunId: string) {
    const run = runs.get(taskRunId);
    if (!run) return null;
    const stageList: TaskStageState[] = [];
    for (const [, s] of stages) {
      if (!s.taskRunId.startsWith(taskRunId)) continue;
      stageList.push({
        stageKey: s.stageKey,
        stageIndex: s.stageIndex,
        label: s.label,
        status: s.status as any,
        progressMode: s.progressMode as any,
        resumeMode: s.resumeMode as any,
        total: s.total,
        done: s.done,
        startedAt: s.startedAt,
        finishedAt: s.finishedAt,
        resumeToken: null,
      });
    }
    stageList.sort((a, b) => a.stageIndex - b.stageIndex);
    return {
      run: {
        id: run.id,
        taskType: run.taskType,
        definitionVersion: run.definitionVersion,
        scope: run.scope,
        params: run.params,
        status: run.status as any,
        supportsResume: run.supportsResume,
        currentStageKey: run.currentStageKey,
        currentStageIndex: run.currentStageIndex,
        currentResumeMode: run.currentResumeMode as any,
        pausedResumeMode: run.pausedResumeMode as any,
        runRevision: run.runRevision,
        heartbeatAt: run.heartbeatAt,
        startedAt: run.startedAt,
        finishedAt: run.finishedAt,
        errorCode: null,
        errorMessage: run.errorMessage,
        terminalReason: run.terminalReason as any,
        controlRequestKind: run.controlRequestKind as any,
        runtimeBootId: run.runtimeBootId,
        resumeContextKey: run.resumeContextKey,
        retryOfTaskRunId: null,
      },
      stages: stageList,
    };
  }

  const store: TaskExecutorStore = {
    async getTaskRun(taskRunId) {
      return buildSnapshot(taskRunId);
    },
    async updateTaskRun(taskRunId, patch) {
      const run = runs.get(taskRunId)!;
      for (const [k, v] of Object.entries(patch)) {
        (run as any)[k] = v;
      }
      run.runRevision++;
      if (['canceled', 'failed', 'abandoned'].includes(run.status) && !run.terminalReason) {
        run.terminalReason = 'execution_failed';
      }
      return run as any;
    },
    async updateStage(taskRunId, stageKey, patch) {
      const s = stages.get(skey(taskRunId, stageKey))!;
      for (const [k, v] of Object.entries(patch)) {
        (s as any)[k] = v;
      }
      return {
        stageKey: s.stageKey,
        stageIndex: s.stageIndex,
        label: s.label,
        status: s.status as any,
        progressMode: s.progressMode as any,
        resumeMode: s.resumeMode as any,
        total: s.total,
        done: s.done,
        startedAt: s.startedAt,
        finishedAt: s.finishedAt,
        resumeToken: null,
      };
    },
    async transitionStage(taskRunId, stageKey, runPatch, stagePatch) {
      const run = runs.get(taskRunId)!;
      for (const [k, v] of Object.entries(runPatch)) {
        (run as any)[k] = v;
      }
      run.runRevision++;
      const s = stages.get(skey(taskRunId, stageKey))!;
      for (const [k, v] of Object.entries(stagePatch)) {
        (s as any)[k] = v;
      }
    },
  };

  return { store, runs, stages, buildSnapshot };
}

// ── Utilities ───────────────────────────────────────────

function makeRun(overrides: Partial<MemRun> = {}): MemRun {
  return {
    id: 'test-run-1',
    taskType: 'test_executor',
    definitionVersion: 'v1',
    scope: { type: 'test', key: 'test:item' },
    params: {},
    supportsResume: false,
    status: 'pending',
    currentStageKey: null,
    currentStageIndex: null,
    currentResumeMode: null,
    pausedResumeMode: null,
    runtimeBootId: null,
    resumeContextKey: null,
    startedAt: null,
    finishedAt: null,
    controlRequestKind: null,
    terminalReason: null,
    heartbeatAt: null,
    errorMessage: null,
    runRevision: 0,
    ...overrides,
  };
}

function makeStages(runId: string): MemStage[] {
  return [
    { taskRunId: runId, stageKey: 'stage_a', stageIndex: 0, label: 'Stage A', status: 'pending', progressMode: 'simple', resumeMode: 'none', total: null, done: null, startedAt: null, finishedAt: null },
    { taskRunId: runId, stageKey: 'stage_b', stageIndex: 1, label: 'Stage B', status: 'pending', progressMode: 'bounded', resumeMode: 'none', total: 3, done: 0, startedAt: null, finishedAt: null },
    { taskRunId: runId, stageKey: 'stage_c', stageIndex: 2, label: 'Stage C', status: 'pending', progressMode: 'simple', resumeMode: 'none', total: null, done: null, startedAt: null, finishedAt: null },
  ];
}

function populate(mem: MemStore, run: MemRun, stageList: MemStage[]) {
  mem.runs.set(run.id, run);
  for (const s of stageList) {
    mem.stages.set(`${run.id}:${s.stageKey}`, s);
  }
}

// ── Test definition ─────────────────────────────────────

let blockSeq = 0;

function makeDefinition(workload?: { failAfter?: number }): TaskDefinition {
  return {
    taskType: 'test_executor',
    definitionVersion: 'v1',
    supportsResume: false,
    effectModel: 'atomic',
    buildStagePlan(_input: TaskRunInput): TaskStagePlan[] {
      return [
        { stageKey: 'stage_a', stageIndex: 0, label: 'Stage A', progressMode: 'simple', resumeMode: 'none' },
        { stageKey: 'stage_b', stageIndex: 1, label: 'Stage B', progressMode: 'bounded', resumeMode: 'none' },
        { stageKey: 'stage_c', stageIndex: 2, label: 'Stage C', progressMode: 'simple', resumeMode: 'none' },
      ];
    },
    prepareStageEntry({ stage }: { run: TaskRunInput; stage: TaskStageState; resume: boolean }): TaskStageEntry {
      return {
        stageKey: stage.stageKey,
        stageIndex: stage.stageIndex,
        progressMode: stage.progressMode,
        resumeMode: stage.resumeMode,
        total: stage.total,
      };
    },
    buildBlocks({ stage }: { run: TaskRunInput; stage: TaskStageState }): Iterable<TaskBlock> {
      if (stage.stageKey === 'stage_b') {
        return [
          { blockKey: 'b:1' },
          { blockKey: 'b:2' },
          { blockKey: 'b:3' },
        ];
      }
      return [{ blockKey: `${stage.stageKey}:run` }];
    },
    async executeBlock(input: { run: TaskRunInput; stage: TaskStageState; block: TaskBlock }) {
      blockSeq++;
      if (workload?.failAfter != null && blockSeq >= workload.failAfter) {
        throw new Error('simulated block failure');
      }
      const p = input.run.params as Record<string, unknown>;
      const delay = typeof p._delayMs === 'number' ? p._delayMs : undefined;
      if (delay != null) await new Promise(r => setTimeout(r, delay));
    },
  };
}

// ── Tests ───────────────────────────────────────────────

describe('executor state machine', () => {
  test('pending → running → completed', async () => {
    blockSeq = 0;
    const mem = createMemStore();
    registerTaskDefinition(makeDefinition());
    populate(mem, makeRun(), makeStages('test-run-1'));

    const snap = mem.buildSnapshot('test-run-1');
    const executor = createTaskExecutor(mem.store);
    await executor.runTask(snap!);

    const final = mem.buildSnapshot('test-run-1');
    expect(final?.run.status).toBe('completed');
    expect(final?.run.finishedAt).not.toBeNull();
    for (const st of final!.stages) {
      expect(st.status).toBe('completed');
      expect(st.finishedAt).not.toBeNull();
    }
  });

  test('running → fail on block error', async () => {
    blockSeq = 0;
    const mem = createMemStore();
    registerTaskDefinition(makeDefinition({ failAfter: 1 }));
    populate(mem, makeRun(), makeStages('test-run-1'));

    const snap = mem.buildSnapshot('test-run-1');
    const executor = createTaskExecutor(mem.store);
    await executor.runTask(snap!);

    const final = mem.buildSnapshot('test-run-1');
    expect(final?.run.status).toBe('failed');
    expect(final?.run.terminalReason).toBe('execution_failed');
    expect(final?.run.errorMessage).toBe('simulated block failure');
  });

  test('running → canceling → canceled via controlRequestKind', async () => {
    const mem = createMemStore();

    let releaseGate: (() => void) | null = null;
    let gated = false;

    const def: TaskDefinition = {
      taskType: 'test_executor',
      definitionVersion: 'v1',
      supportsResume: false,
      effectModel: 'atomic',
      buildStagePlan: () => [
        { stageKey: 'a', stageIndex: 0, label: 'A', progressMode: 'simple', resumeMode: 'none' },
      ],
      prepareStageEntry({ stage }) {
        return { stageKey: stage.stageKey, stageIndex: stage.stageIndex, progressMode: stage.progressMode, resumeMode: stage.resumeMode, total: stage.total };
      },
      buildBlocks() {
        return [{ blockKey: 'b1' }, { blockKey: 'b2' }];
      },
      async executeBlock(input) {
        // Gate the second block so test can inject cancel
        if (input.block.blockKey === 'b2') {
          gated = true;
          await new Promise<void>(r => { releaseGate = r; });
        }
      },
    };
    registerTaskDefinition(def);
    populate(mem, makeRun(), [{ taskRunId: 'test-run-1', stageKey: 'a', stageIndex: 0, label: 'A', status: 'pending', progressMode: 'simple', resumeMode: 'none', total: null, done: null, startedAt: null, finishedAt: null }]);

    const snap = mem.buildSnapshot('test-run-1');
    const executor = createTaskExecutor(mem.store);
    const promise = executor.runTask(snap!);

    // Wait until executor is inside the gate
    while (!gated) await new Promise(r => setTimeout(r, 0));

    await mem.store.updateTaskRun('test-run-1', {
      status: 'canceling',
      controlRequestKind: 'cancel',
    });
    releaseGate!();

    await promise;

    const final = mem.buildSnapshot('test-run-1');
    expect(final?.run.status).toBe('canceled');
    expect(final?.run.terminalReason).toBe('manual_cancel');
  });

  test('running → pausing → paused', async () => {
    const mem = createMemStore();

    let releaseGate: (() => void) | null = null;
    let gated = false;

    const def: TaskDefinition = {
      taskType: 'test_executor',
      definitionVersion: 'v1',
      supportsResume: false,
      effectModel: 'atomic',
      buildStagePlan: () => [
        { stageKey: 'a', stageIndex: 0, label: 'A', progressMode: 'simple', resumeMode: 'none' },
      ],
      prepareStageEntry({ stage }) {
        return { stageKey: stage.stageKey, stageIndex: stage.stageIndex, progressMode: stage.progressMode, resumeMode: stage.resumeMode, total: stage.total };
      },
      buildBlocks() {
        return [{ blockKey: 'b1' }, { blockKey: 'b2' }];
      },
      async executeBlock(input) {
        if (input.block.blockKey === 'b2') {
          gated = true;
          await new Promise<void>(r => { releaseGate = r; });
        }
      },
    };
    registerTaskDefinition(def);
    populate(mem, makeRun({ supportsResume: true }), [{ taskRunId: 'test-run-1', stageKey: 'a', stageIndex: 0, label: 'A', status: 'pending', progressMode: 'simple', resumeMode: 'none', total: null, done: null, startedAt: null, finishedAt: null }]);

    const snap = mem.buildSnapshot('test-run-1');
    const executor = createTaskExecutor(mem.store);
    const promise = executor.runTask(snap!);

    while (!gated) await new Promise(r => setTimeout(r, 0));

    await mem.store.updateTaskRun('test-run-1', {
      status: 'pausing',
      controlRequestKind: 'pause',
    });
    releaseGate!();

    await promise;

    const final = mem.buildSnapshot('test-run-1');
    expect(final?.run.status).toBe('paused');
  });

  test('paused → resuming → running → completed + clears pause fields', async () => {
    blockSeq = 0;
    const mem = createMemStore();

    // Set up a task already in paused state (stage_b had run 1 of 3 blocks)
    populate(mem, makeRun({
      status: 'paused',
      currentStageKey: 'stage_b',
      currentStageIndex: 1,
      currentResumeMode: 'durable',
      pausedResumeMode: 'durable',
      runtimeBootId: 'boot-1',
      resumeContextKey: 'ctx-1',
    }), [
      { taskRunId: 'test-run-1', stageKey: 'stage_a', stageIndex: 0, label: 'Stage A', status: 'completed', progressMode: 'simple', resumeMode: 'none', total: null, done: null, startedAt: null, finishedAt: new Date().toISOString() },
      { taskRunId: 'test-run-1', stageKey: 'stage_b', stageIndex: 1, label: 'Stage B', status: 'paused', progressMode: 'bounded', resumeMode: 'durable', total: 3, done: 1, startedAt: null, finishedAt: null },
      { taskRunId: 'test-run-1', stageKey: 'stage_c', stageIndex: 2, label: 'Stage C', status: 'pending', progressMode: 'simple', resumeMode: 'none', total: null, done: null, startedAt: null, finishedAt: null },
    ]);

    // Transition to resuming
    await mem.store.updateTaskRun('test-run-1', { status: 'resuming' });

    registerTaskDefinition(makeDefinition());
    const snap = mem.buildSnapshot('test-run-1');
    const executor = createTaskExecutor(mem.store);
    await executor.runTask(snap!);

    const final = mem.buildSnapshot('test-run-1');
    expect(final?.run.status).toBe('completed');
    // Resume fields must be cleared
    expect(final?.run.pausedResumeMode).toBeNull();
    expect(final?.run.runtimeBootId).toBeNull();
    expect(final?.run.resumeContextKey).toBeNull();
  });

  test('executor guard rejects stale pending task', async () => {
    blockSeq = 0;
    const mem = createMemStore();
    registerTaskDefinition(makeDefinition());
    populate(mem, makeRun(), makeStages('test-run-1'));

    // Read snapshot (simulates scheduler), then cancel before executor starts
    const snap = mem.buildSnapshot('test-run-1');
    await mem.store.updateTaskRun('test-run-1', {
      status: 'canceled',
      terminalReason: 'manual_cancel',
      finishedAt: new Date().toISOString(),
    });

    const executor = createTaskExecutor(mem.store);
    await executor.runTask(snap!);

    const final = mem.buildSnapshot('test-run-1');
    expect(final?.run.status).toBe('canceled');
  });
});
