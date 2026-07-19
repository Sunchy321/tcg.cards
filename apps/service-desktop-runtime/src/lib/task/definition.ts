import type { z } from 'zod';

/** Distinguishes whether one task block commits inside one consistency boundary. */
export type TaskEffectModel = 'atomic' | 'reconcilable';

/** Minimal store surface needed by executeBlock. */
export interface TaskExecuteStore {
  updateStage(taskRunId: string, stageKey: string, patch: Record<string, unknown>): Promise<TaskStageState>;
  publishSnapshot?(): Promise<void>;
}

/** Durable checkpoint restored before a chunked stage resumes. */
export interface TaskCheckpoint<TBlockInput = unknown> {
  blockInput: TBlockInput;
}

/** Describes the progress representation used by one stage. */
export type TaskProgressMode = 'bounded' | 'unbound' | 'simple';

/** Describes the resume contract exposed by one stage boundary. */
export type TaskResumeMode = 'none' | 'durable' | 'session_bound';

/** Identifies one business scope that a task run operates on. */
export interface TaskScope {
  type:      string;
  key:       string;
  snapshot?: Record<string, unknown>;
}

/** Captures the immutable creation input stored on one task run. */
export interface TaskRunInput {
  taskType:          string;
  definitionVersion: string;
  scope:             TaskScope;
  params:            Record<string, unknown>;
}

/** Declares one stage skeleton created together with a task run. */
export interface TaskStagePlan {
  stageKey:     string;
  stageIndex:   number;
  label:        string;
  progressMode: TaskProgressMode;
  resumeMode:   TaskResumeMode;
}

/** Carries one persisted stage snapshot into task-defined planning hooks. */
export interface TaskStageState extends TaskStagePlan {
  status:      'pending' | 'running' | 'paused' | 'canceled' | 'failed' | 'completed' | 'abandoned';
  total:       number | null;
  done:        number | null;
  startedAt:   string | null;
  finishedAt:  string | null;
  /** May be set on updateStage calls to pass transient segments to event streams. */
  segments?:   { name: string, done: number, total: number }[] | null;
  resumeToken: Record<string, unknown> | null;
}

/** Describes one runnable block produced inside one current task stage. */
export interface TaskBlock {
  blockKey:     string;
  effectModel?: TaskEffectModel;
  payload?:     Record<string, unknown>;
}

/** Summarizes one stage entry prepared before the executor durable-enters it. */
export interface TaskStageEntry {
  stageKey:     string;
  stageIndex:   number;
  progressMode: TaskProgressMode;
  resumeMode:   TaskResumeMode;
  total:        number | null;
}

/** Supplies the task-defined planner and executor hooks for one task type. */
export interface TaskDefinition {
  taskType:          string;
  definitionVersion: string;
  supportsResume:    boolean;
  effectModel:       TaskEffectModel;
  buildStagePlan(input: TaskRunInput): Promise<TaskStagePlan[]> | TaskStagePlan[];
  prepareStageEntry(input: {
    run:       TaskRunInput;
    stage:     TaskStageState;
    resume:    boolean;
    taskRunId: string;
  }): Promise<TaskStageEntry> | TaskStageEntry;
  buildBlocks(input: {
    run:       TaskRunInput;
    stage:     TaskStageState;
    taskRunId: string;
  }): AsyncIterable<TaskBlock> | Iterable<TaskBlock>;
  executeBlock(input: {
    run:       TaskRunInput;
    stage:     TaskStageState;
    block:     TaskBlock;
    store:     TaskExecuteStore;
    taskRunId: string;
  }): Promise<void> | void;
  cleanup?(taskRunId: string): void;
  onCanceled?(run: TaskRunInput): Promise<void> | void;
}

// ────────────────────────────────────────────────────
// Strongly-typed definition system
// ────────────────────────────────────────────────────

const blockDoneSymbol: unique symbol = Symbol('task-block-done');

/** Returned by the `done()` helper inside a block fn to signal the chunk loop is finished. */
export type BlockDone = { [blockDoneSymbol]: true };

function mkDone(): BlockDone {
  return { [blockDoneSymbol]: true } as BlockDone;
}

/** Metadata for one stage. */
export interface StageMeta {
  label:        string;
  progressMode: TaskProgressMode;
  resumeMode?:  TaskResumeMode;
}

/** Config for declaring task scope. */
export interface ScopeConfig<TScope> {
  type:    string;
  resolve: (scope: TScope) => { key: string, snapshot: unknown };
}

/** Declaration of the per-run context factory. */
export interface ContextDeclaration<TCtx, TInput, TScope> {
  init: (input: TInput, scope: TScope, taskRunId: string) => TCtx;
}

/** Typed progress callback, varies by progress mode. */
export type ProgressFn<TMode extends TaskProgressMode>
  = TMode extends 'bounded'
    ? (update: { done: number, total: number, segments?: { name: string, done: number, total: number }[] }) => void
    : TMode extends 'unbound'
      ? (update: { done: number }) => void
      : () => void;

/** Runtime interface for a typed task definition. Built by createDefinition().build(). */
export interface AnyTaskDefinition {
  taskType:          string;
  definitionVersion: string;
  inputSchema:       z.ZodTypeAny;
  outputSchema:      z.ZodTypeAny;
  scopeType:         string;
  resolveScope(input: unknown): { key: string, snapshot: unknown };
  initContext(input: unknown, scope: unknown, taskRunId: string): unknown;
  stageMetas:        StageMeta[];
  stageKeys:         string[];
  cleanup(taskRunId: string): void;
  onCanceled?(run: TaskRunInput): Promise<void> | void;
  supportsResume:    boolean;
  effectModel:       TaskEffectModel;

  /** Adapter to the legacy TaskDefinition hooks. */
  buildStagePlan(input: TaskRunInput): Promise<TaskStagePlan[]>;
  prepareStageEntry(args: {
    run:       TaskRunInput;
    stage:     TaskStageState;
    resume:    boolean;
    taskRunId: string;
  }): Promise<TaskStageEntry>;
  buildBlocks(args: {
    run:       TaskRunInput;
    stage:     TaskStageState;
    taskRunId: string;
  }): AsyncIterable<TaskBlock>;
  executeBlock(args: {
    run:       TaskRunInput;
    stage:     TaskStageState;
    block:     TaskBlock;
    store:     TaskExecuteStore;
    taskRunId: string;
  }): Promise<void>;
}

// ── Builder classes ──

export class DefinitionInitBuilder {
  constructor(
    readonly taskType: string,
    readonly version: string,
    readonly effectModel: TaskEffectModel = 'atomic',
  ) {}

  scope<TS extends z.ZodTypeAny>(schema: TS, config: ScopeConfig<z.infer<TS>>): DefinitionBuilderScope<z.infer<TS>> {
    return new DefinitionBuilderScope(this.taskType, this.version, this.effectModel, schema as z.ZodType<z.infer<TS>>, config);
  }
}

export class DefinitionBuilderScope<TScope> {
  constructor(
    readonly taskType: string,
    readonly version: string,
    readonly effectModel: TaskEffectModel,
    readonly scopeSchema: z.ZodType<TScope>,
    readonly scopeConfig: ScopeConfig<TScope>,
  ) {}

  input<TI extends z.ZodTypeAny>(schema: TI): DefinitionBuilderInput<TScope, z.infer<TI>> {
    return new DefinitionBuilderInput(this.taskType, this.version, this.effectModel, this.scopeSchema, this.scopeConfig, schema as z.ZodType<z.infer<TI>>);
  }
}

export class DefinitionBuilderInput<TScope, TInput> {
  readonly inputSchema: z.ZodType<TInput>;

  constructor(
    readonly taskType: string,
    readonly version: string,
    readonly effectModel: TaskEffectModel,
    readonly scopeSchema: z.ZodType<TScope>,
    readonly scopeConfig: ScopeConfig<TScope>,
    schema: z.ZodType<TInput>,
  ) {
    this.inputSchema = schema;
  }

  output<O extends z.ZodTypeAny>(schema: O): DefinitionBuilderOutput<TScope, TInput, z.infer<O>> {
    return new DefinitionBuilderOutput<TScope, TInput, z.infer<O>>(this.taskType, this.version, this.effectModel, this.scopeSchema, this.scopeConfig, this.inputSchema, schema as z.ZodType<z.infer<O>>);
  }
}

export class DefinitionBuilderOutput<TScope, TInput, TOutput> {
  readonly outputSchema: z.ZodType<TOutput>;

  constructor(
    readonly taskType: string,
    readonly version: string,
    readonly effectModel: TaskEffectModel,
    readonly scopeSchema: z.ZodType<TScope>,
    readonly scopeConfig: ScopeConfig<TScope>,
    readonly inputSchema: z.ZodType<TInput>,
    schema: z.ZodType<TOutput>,
  ) {
    this.outputSchema = schema;
  }

  context<TCtx>(decl: ContextDeclaration<TCtx, TInput, TScope>): DefinitionBuilder<TScope, TInput, TOutput, TCtx, TInput> {
    return new DefinitionBuilder(
      this.taskType, this.version, this.effectModel,
      this.scopeSchema, this.scopeConfig,
      this.inputSchema, this.outputSchema, decl,
      [],
    );
  }
}

export class DefinitionBuilder<TScope, TInput, TOutput, TCtx, TPrevOutput> {
  readonly stages: { key: string, meta: StageMeta, kind: 'simple' | 'chunked', hooks: Record<string, any> }[];

  constructor(
    readonly taskType: string,
    readonly version: string,
    readonly effectModel: TaskEffectModel,
    readonly scopeSchema: z.ZodType<TScope>,
    readonly scopeConfig: ScopeConfig<TScope>,
    readonly inputSchema: z.ZodType<TInput>,
    readonly outputSchema: z.ZodType<TOutput>,
    readonly contextDecl: ContextDeclaration<TCtx, TInput, TScope>,
    existingStages: { key: string, meta: StageMeta, kind: 'simple' | 'chunked', hooks: Record<string, any> }[],
  ) {
    this.stages = [...existingStages];
  }

  stage<K extends string>(key: K, meta: StageMeta): StageBuilder<TScope, TInput, TOutput, TCtx, TPrevOutput, K> {
    return new StageBuilder(
      this.taskType, this.version, this.effectModel,
      this.scopeSchema, this.scopeConfig,
      this.inputSchema, this.outputSchema, this.contextDecl,
      this.stages, key, meta,
    );
  }

  build(): AnyTaskDefinition {
    return buildAnyTaskDefinition(this);
  }
}

export class StageBuilder<TScope, TInput, TOutput, TCtx, TPrevOutput, TStageKey extends string> {
  readonly enableConfig?: { when: (input: TInput) => boolean, otherwise: (input: TInput) => unknown };

  constructor(
    readonly taskType: string,
    readonly version: string,
    readonly effectModel: TaskEffectModel,
    readonly scopeSchema: z.ZodType<TScope>,
    readonly scopeConfig: ScopeConfig<TScope>,
    readonly inputSchema: z.ZodType<TInput>,
    readonly outputSchema: z.ZodType<TOutput>,
    readonly contextDecl: ContextDeclaration<TCtx, TInput, TScope>,
    readonly existingStages: { key: string, meta: StageMeta, kind: 'simple' | 'chunked', hooks: Record<string, any> }[],
    readonly stageKey: TStageKey,
    readonly stageMeta: StageMeta,
    enableConfig?: { when: (input: TInput) => boolean, otherwise: (input: TInput) => unknown },
  ) {
    this.enableConfig = enableConfig;
  }

  enable<TOut>(config: { when: (input: TInput) => boolean, otherwise: (input: TInput) => TOut }): StageBuilder<TScope, TInput, TOutput, TCtx, TPrevOutput, TStageKey> {
    return new StageBuilder(
      this.taskType, this.version, this.effectModel,
      this.scopeSchema, this.scopeConfig,
      this.inputSchema, this.outputSchema, this.contextDecl,
      this.existingStages, this.stageKey, this.stageMeta, config,
    );
  }

  handler<TOut>(fn: (args: { ctx: TCtx, input: TPrevOutput }) => TOut | Promise<TOut>): DefinitionBuilder<TScope, TInput, TOutput, TCtx, TOut> {
    return new DefinitionBuilder(
      this.taskType, this.version, this.effectModel,
      this.scopeSchema, this.scopeConfig,
      this.inputSchema, this.outputSchema, this.contextDecl,
      [...this.existingStages, { key: this.stageKey, meta: this.stageMeta, kind: 'simple' as const, hooks: { handler: fn, enable: this.enableConfig } }],
    );
  }

  entry<TBlockInput>(fn: (args: { scope: TScope, ctx: TCtx, input: TPrevOutput, checkpoint: TaskCheckpoint | null }) => { total?: number, blockInput: TBlockInput } | Promise<{ total?: number, blockInput: TBlockInput }>): ChunkedStageBuilder<TScope, TInput, TOutput, TCtx, TPrevOutput, TStageKey, TBlockInput> {
    return new ChunkedStageBuilder(
      this.taskType, this.version, this.effectModel,
      this.scopeSchema, this.scopeConfig,
      this.inputSchema, this.outputSchema, this.contextDecl,
      this.existingStages, this.stageKey, this.stageMeta, fn,
      this.enableConfig,
    );
  }
}

export class ChunkedStageBuilder<TScope, TInput, TOutput, TCtx, TPrevOutput, TStageKey extends string, TBlockInput> {
  readonly enableConfig?: { when: (input: TInput) => boolean, otherwise: (input: TInput) => unknown };

  constructor(
    readonly taskType: string,
    readonly version: string,
    readonly effectModel: TaskEffectModel,
    readonly scopeSchema: z.ZodType<TScope>,
    readonly scopeConfig: ScopeConfig<TScope>,
    readonly inputSchema: z.ZodType<TInput>,
    readonly outputSchema: z.ZodType<TOutput>,
    readonly contextDecl: ContextDeclaration<TCtx, TInput, TScope>,
    readonly existingStages: { key: string, meta: StageMeta, kind: 'simple' | 'chunked', hooks: Record<string, any> }[],
    readonly stageKey: TStageKey,
    readonly stageMeta: StageMeta,
    readonly entryFn: (args: { scope: TScope, ctx: TCtx, input: TPrevOutput, checkpoint: TaskCheckpoint | null }) => { total?: number, blockInput: TBlockInput } | Promise<{ total?: number, blockInput: TBlockInput }>,
    enableConfig?: { when: (input: TInput) => boolean, otherwise: (input: TInput) => unknown },
    readonly blockFn?: (args: { scope: TScope, ctx: TCtx, blockInput: TBlockInput, progress: ProgressFn<any>, checkpoint: (blockInput: TBlockInput) => Promise<void>, done: (finalBlockInput: TBlockInput) => BlockDone }) => TBlockInput | BlockDone | Promise<TBlockInput | BlockDone>,
  ) {
    this.enableConfig = enableConfig;
  }

  enable<TOut>(config: { when: (input: TInput) => boolean, otherwise: (input: TInput) => TOut }): ChunkedStageBuilder<TScope, TInput, TOutput, TCtx, TPrevOutput, TStageKey, TBlockInput> {
    return new ChunkedStageBuilder(
      this.taskType, this.version, this.effectModel,
      this.scopeSchema, this.scopeConfig,
      this.inputSchema, this.outputSchema, this.contextDecl,
      this.existingStages, this.stageKey, this.stageMeta,
      this.entryFn, config, this.blockFn,
    );
  }

  block(fn: (args: { scope: TScope, ctx: TCtx, blockInput: TBlockInput, progress: ProgressFn<any>, checkpoint: (blockInput: TBlockInput) => Promise<void>, done: (finalBlockInput: TBlockInput) => BlockDone }) => TBlockInput | BlockDone | Promise<TBlockInput | BlockDone>): ChunkedStageBuilder<TScope, TInput, TOutput, TCtx, TPrevOutput, TStageKey, TBlockInput> {
    return new ChunkedStageBuilder<TScope, TInput, TOutput, TCtx, TPrevOutput, TStageKey, TBlockInput>(
      this.taskType, this.version, this.effectModel,
      this.scopeSchema, this.scopeConfig,
      this.inputSchema, this.outputSchema, this.contextDecl,
      this.existingStages, this.stageKey, this.stageMeta, this.entryFn, this.enableConfig, fn,
    );
  }

  exit<TOut>(fn: (args: { ctx: TCtx, blockInput: TBlockInput, input: TPrevOutput }) => TOut | Promise<TOut>): DefinitionBuilder<TScope, TInput, TOutput, TCtx, TOut> {
    return new DefinitionBuilder<TScope, TInput, TOutput, TCtx, TOut>(
      this.taskType, this.version, this.effectModel,
      this.scopeSchema, this.scopeConfig,
      this.inputSchema, this.outputSchema, this.contextDecl,
      [...this.existingStages, {
        key:   this.stageKey, meta:  this.stageMeta, kind:  'chunked',
        hooks: { entry: this.entryFn, block: this.blockFn, exit: fn, enable: this.enableConfig },
      }],
    );
  }
}

// ── Per-run state ──

interface PerRunState {
  ctx:                 unknown;
  isSimple:            boolean;
  skipped:             boolean;
  handlerFn:           ((args: { scope: unknown, ctx: unknown, input: unknown }) => unknown | Promise<unknown>) | null;
  blockFn:             ((args: { scope: unknown, ctx: unknown, blockInput: unknown, progress: (...args: any[]) => void, checkpoint: (blockInput: unknown) => Promise<void>, done: (finalBlockInput: unknown) => BlockDone }) => unknown | BlockDone | Promise<unknown | BlockDone>) | null;
  exitFn:              ((args: { ctx: unknown, blockInput: unknown, input: unknown }) => unknown | Promise<unknown>) | null;
  blockDone:           boolean;
  /** Captured by done(finalBlockInput) — forwarded to exit. */
  exitBlockInput:      unknown;
  lastBlockResult:     unknown;
  previousStageOutput: unknown;
  progressMode:        TaskProgressMode;
  stageKey:            string;
  taskResult:          unknown;
  /** The input value passed to entry() — the previous stage's exit output (or task input for first stage). */
  entryInput:          unknown;
}

const perRunStates = new Map<string, PerRunState>();

function allocState(taskRunId: string): PerRunState {
  const existing = perRunStates.get(taskRunId);
  if (existing) return existing;
  const s: PerRunState = {
    ctx:                 null,
    isSimple:            false,
    skipped:             false,
    handlerFn:           null,
    blockFn:             null,
    exitFn:              null,
    blockDone:           false,
    lastBlockResult:     undefined,
    previousStageOutput: undefined,
    progressMode:        'simple',
    stageKey:            '',
    taskResult:          undefined,
    entryInput:          undefined,
    exitBlockInput:      undefined,
  };
  perRunStates.set(taskRunId, s);
  return s;
}

// ── Adapter builder ──

function buildAnyTaskDefinition(builder: DefinitionBuilder<any, any, any, any, any>): AnyTaskDefinition {
  const { taskType, version, effectModel, scopeSchema, scopeConfig, inputSchema, outputSchema, contextDecl, stages } = builder;

  const scopeType = scopeConfig.type;

  function inputFromRun(run: TaskRunInput): unknown {
    return run.params;
  }

  function scopeFromRun(run: TaskRunInput): unknown {
    return run.scope.snapshot ?? {};
  }

  return {
    taskType,
    definitionVersion: version,
    inputSchema,
    outputSchema,
    scopeType,
    supportsResume:    stages.some(s => s.meta.resumeMode !== 'none'),
    effectModel,
    resolveScope(input: unknown) {
      const rawScope = (input as any)?.scope ?? input;
      return scopeConfig.resolve(scopeSchema.parse(rawScope));
    },
    cleanup(taskRunId: string) { perRunStates.delete(taskRunId); },

    initContext(input: unknown, scope: unknown, runId: string): unknown {
      return contextDecl.init(input as any, scope as any, runId);
    },

    stageMetas: stages.map(s => ({ label: s.meta.label, progressMode: s.meta.progressMode, resumeMode: s.meta.resumeMode ?? 'none' })),
    stageKeys:  stages.map(s => s.key),

    async buildStagePlan(input: TaskRunInput): Promise<TaskStagePlan[]> {
      const enabled = stages.filter(s => {
        const enable = s.hooks.enable as undefined | { when: (i: any) => boolean };
        if (!enable) return true;
        return enable.when(input.params);
      });
      return enabled.map((s, i) => ({
        stageKey:     s.key,
        stageIndex:   i,
        label:        s.meta.label,
        progressMode: s.meta.progressMode,
        resumeMode:   s.meta.resumeMode ?? 'none',
      }));
    },

    async prepareStageEntry(args) {
      const { stage, run, taskRunId } = args;
      const st = stages.find(s => s.key === stage.stageKey);
      if (!st) throw new Error(`Stage "${stage.stageKey}" not found in definition`);
      const stageIdx = stages.indexOf(st);

      console.log('[task] prepareStageEntry:', stage.stageKey, 'status:', stage.status);
      const state = allocState(taskRunId);
      state.stageKey = stage.stageKey;
      state.isSimple = st.kind === 'simple';
      state.progressMode = st.meta.progressMode;
      state.blockDone = false; // reset per-stage — prevents blockDone leaking across stages

      if (state.ctx === null) {
        state.ctx = contextDecl.init(inputFromRun(run) as any, scopeFromRun(run) as any, taskRunId);
      }

      // Check enable / skip
      const enable = st.hooks.enable as undefined | { when: (input: any) => boolean, otherwise: (input: any) => unknown };
      if (enable) {
        const enabled = enable.when(inputFromRun(run));
        if (!enabled) {
          state.skipped = true;
          const prevInput = stageIdx === 0 ? run.params : state.previousStageOutput;
          state.previousStageOutput = await enable.otherwise(prevInput);
          return {
            stageKey:     stage.stageKey, stageIndex:   stage.stageIndex,
            progressMode: st.meta.progressMode, resumeMode:   'none',
            total:        null,
          };
        }
      }

      if (st.kind === 'simple') {
        state.handlerFn = st.hooks.handler as any;
        return {
          stageKey:     stage.stageKey, stageIndex:   stage.stageIndex,
          progressMode: st.meta.progressMode, resumeMode:   'none',
          total:        null,
        };
      }

      // Chunked: call entry with previous stage output (or task-level input for first stage)
      const entryInput = stageIdx === 0 ? run.params : state.previousStageOutput;
      state.entryInput = entryInput;
      state.blockFn = st.hooks.block as any;
      state.exitFn = st.hooks.exit as any;
      console.log('[task] calling entry for stage', state.stageKey, 'entryFn type:', typeof st.hooks.entry);
      const checkpoint = stage.resumeToken != null && 'blockInput' in stage.resumeToken
        ? stage.resumeToken as unknown as TaskCheckpoint
        : null;
      const entryResult = await st.hooks.entry({
        scope: scopeFromRun(run),
        ctx:   state.ctx,
        input: entryInput,
        checkpoint,
      });
      state.lastBlockResult = entryResult.blockInput;

      return {
        stageKey:     stage.stageKey, stageIndex:   stage.stageIndex,
        progressMode: st.meta.progressMode, resumeMode:   st.meta.resumeMode ?? 'none',
        total:        entryResult.total ?? null,
      };
    },

    buildBlocks(args) {
      const { taskRunId } = args;
      const state = perRunStates.get(taskRunId);
      if (!state) throw new Error(`No per-run state for task ${taskRunId}`);

      // Skipped stage: no blocks
      if (state.skipped) {
        return { async* [Symbol.asyncIterator]() {} };
      }

      if (state.isSimple) {
        return {
          async* [Symbol.asyncIterator]() {
            yield { blockKey: `${state.stageKey}:run`, effectModel: 'atomic' as const };
          },
        };
      }

      return {
        async* [Symbol.asyncIterator]() {
          let blockIndex = 0;
          while (true) {
            const currentInput = state.lastBlockResult;
            yield {
              blockKey:    `${state.stageKey}:block_${blockIndex}`,
              effectModel: 'atomic' as const,
              payload:     currentInput,
            };
            blockIndex++;
            if (state.blockDone) break;
            if (state.lastBlockResult === undefined) break;
          }
        },
      };
    },

    async executeBlock(args) {
      const { taskRunId, store } = args;
      const state = perRunStates.get(taskRunId);
      if (!state || state.skipped) return;

      // Simple: call handler, store output for next stage
      if (state.isSimple) {
        const idx = stages.findIndex(s => s.key === state.stageKey);
        const handlerInput = idx === 0 ? args.run.params : state.previousStageOutput;
        const output = await state.handlerFn!({ scope: undefined, ctx: state.ctx, input: handlerInput });
        state.previousStageOutput = output;
        if (idx === stages.length - 1) {
          state.taskResult = outputSchema.parse(output);
        }
        return;
      }

      // Chunked: call block fn
      const blockInput = args.block.payload;
      const progress = mkProgress(store, taskRunId, state.stageKey, state.progressMode);
      const checkpoint = async (blockInput: unknown) => {
        await store.updateStage(taskRunId, state.stageKey, {
          resumeToken: { blockInput } as Record<string, unknown>,
        });
      };

      const done = (finalBlockInput: unknown) => {
        state.exitBlockInput = finalBlockInput;
        return mkDone();
      };

      const result = await state.blockFn!({ scope: undefined, ctx: state.ctx, blockInput, progress, checkpoint, done });

      if (result && typeof result === 'object' && blockDoneSymbol in result) {
        state.blockDone = true;
        const exitInput = state.entryInput;
        const exitOutput = await state.exitFn!({ ctx: state.ctx, blockInput: state.exitBlockInput, input: exitInput });
        state.previousStageOutput = exitOutput;
        const idx = stages.findIndex(s => s.key === state.stageKey);
        if (idx === stages.length - 1) {
          state.taskResult = outputSchema.parse(exitOutput);
        }
        return;
      }

      state.lastBlockResult = result;
    },
  };
}

/** Returns the per-run state for one task run, used by the executor for skip/handler checks. */
export function getPerRunState(taskRunId: string): PerRunState | undefined {
  return perRunStates.get(taskRunId);
}

/** Returns the task-level result for a completed typed task, if one was stored. */
export function getTaskResult(taskRunId: string): unknown | undefined {
  return perRunStates.get(taskRunId)?.taskResult;
}

function mkProgress(
  store: TaskExecuteStore,
  taskRunId: string,
  stageKey: string,
  _mode: TaskProgressMode,
): (...args: any[]) => void {
  return (update?: any) => {
    if (update == null) {
      store.updateStage(taskRunId, stageKey, {}).catch(() => {});
      return;
    }

    const patch: Record<string, unknown> = {};
    if (typeof update.done === 'number') patch.done = update.done;
    if (typeof update.total === 'number') patch.total = update.total;
    if (update.segments != null) patch.segments = update.segments;
    store.updateStage(taskRunId, stageKey, patch).catch(() => {});
  };
}

/** Creates a strongly-typed task definition using the builder API. */
export function createDefinition(taskType: string, config: { version: string, effectModel?: TaskEffectModel }): DefinitionInitBuilder {
  return new DefinitionInitBuilder(taskType, config.version, config.effectModel);
}
