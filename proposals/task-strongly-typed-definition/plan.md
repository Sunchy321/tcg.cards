# 强类型任务定义 — 实现计划

## TODO

- [ ] Phase 1: 框架基础设施
  - [ ] 设计 builder chain 核心类型系统
  - [ ] 实现 `createDefinition()` builder API
  - [ ] DB: `task_runs.result` JSONB 列 + 迁移
  - [ ] 定义 `AnyTaskDefinition` 接口
  - [ ] 适配 registry 存储 `AnyTaskDefinition`
- [ ] Phase 2: 运行时适配
  - [ ] 适配 executor 执行 typed stage（chunked + simple）
  - [ ] 实现 stage 间 input/output 传递
  - [ ] 实现 block 循环 + pause/cancel 检查
  - [ ] 实现 ctx 生命周期管理
  - [ ] 实现 progress 回调
  - [ ] 实现 result 回写 DB
  - [ ] 适配 control.ts (`createTask`)
- [ ] Phase 3: Publish 定义迁移
  - [ ] 用新 DSL 重写 publish definition
  - [ ] 移除 `publishCtxMap`
  - [ ] 验证与现有 executor 的集成
  - [ ] 端到端测试
- [ ] Phase 4: 清理与收尾
  - [ ] 按需迁移 image-render / test 定义
  - [ ] 移除以弃用的旧类型（选做）
  - [ ] 归档至 specs/

---

## Phase 1: 框架基础设施

### 1.1 类型系统设计

**文件**: `apps/service-desktop-runtime/src/lib/task/typed-definition.ts`（新建）

```typescript
// === Context ===
interface ContextDeclaration<TCtx, TInput, TScope> {
  init: (input: TInput, scope: TScope, taskRunId: string) => TCtx;
}

// === Stage metadata ===
interface StageMeta {
  label: string;
  progressMode: 'bounded' | 'unbound' | 'simple';
}

// === Simple stage builder ===
class SimpleStageBuilder<TStageKey extends string, TInput, TOutput, TCtx, TPrevOutput> {
  handler(
    fn: (args: { ctx: TCtx; input: TPrevOutput }) => TOutput | Promise<TOutput>,
  ): StageBuilder<...>;
}

// === Chunked stage builder ===
class ChunkedStageBuilder<TStageKey extends string, TInput, TOutput, TCtx, TPrevOutput, TBlockInput> {
  entry(
    fn: (args: { ctx: TCtx; input: TPrevOutput }) =>
      | { total?: number; blockInput: TBlockInput }
      | Promise<{ total?: number; blockInput: TBlockInput }>,
  ): ChunkedStageBuilder<...>;

  block(
    fn: (args: {
      ctx: TCtx;
      blockInput: TBlockInput;
      progress: ProgressFn;
    }) => TBlockInput | { done: true } | Promise<TBlockInput | { done: true }>,
  ): ChunkedStageBuilder<...>;

  exit(
    fn: (args: { ctx: TCtx }) => TOutput | Promise<TOutput>,
  ): StageBuilder<...>;
}

// === Definition builder ===
class DefinitionBuilder<TInput, TOutput, TScope, TCtx, TStageOutputs> {
  scope<TS extends z.ZodTypeAny>(
    schema: TS,
    config: { type: string; resolve: (scope: z.infer<TS>) => { key: string; snapshot: unknown } },
  ): DefinitionBuilder<...>;

  input<S extends z.ZodTypeAny>(schema: S): DefinitionBuilder<...>;

  output<S extends z.ZodTypeAny>(schema: S): DefinitionBuilder<...>;

  context<C>(decl: ContextDeclaration<C, TInput, TScope>): DefinitionBuilder<...>;

  stage<K extends string>(
    key: K,
    meta: StageMeta,
  ): StageBuilder<...>;

  build(): AnyTaskDefinition;
}
```

**类型推导机制**: 使用 accumulator pattern——每个 `.stage()` 返回一个新的 builder 类型，accumulate `TStageOutputs` 映射。`build()` 方法将 chain 信息打包为 `AnyTaskDefinition`。

### 1.2 `AnyTaskDefinition` 接口

**文件**: `apps/service-desktop-runtime/src/lib/task/definition.ts`（修改）

```typescript
export interface AnyTaskDefinition {
  taskType: string;
  definitionVersion: string;
  effectModel: TaskEffectModel;
  supportsResume: boolean;

  // Schema
  inputSchema: z.ZodTypeAny;
  outputSchema: z.ZodTypeAny;

  // Scope
  scopeType: string;
  resolveScope(input: unknown): { key: string; snapshot: unknown };

  // Context
  initContext(input: unknown, scope: unknown, taskRunId: string): unknown;

  // Stage metadata
  stageMetas: StageMeta[];
  stageKeys: string[];
  buildStagePlan(input: TaskRunInput): Promise<TaskStagePlan[]>;

  // Stage execution
  executeStage(
    stageKey: string,
    args: StageExecutionArgs,
  ): Promise<StageExecutionResult>;
}
```

现有的 `TaskDefinition` 接口保留作为运行时骨架，逐步淘汰。

### 1.3 DB 迁移

**文件**: `packages/db/src/schema/local/task.ts`（修改）

```typescript
// task_runs 表新增
result: jsonb('result').$type<Record<string, unknown>>().default(null),
```

```bash
# 生成迁移
bun run db:generate:local
```

迁移脚本需要包含：

```sql
ALTER TABLE task_runs ADD COLUMN result jsonb DEFAULT NULL;
```

> 注意：如果 `task_runs` 已有大量数据，`DEFAULT NULL` 不会导致锁表（PostgreSQL 16+ 对于 `ADD COLUMN ... DEFAULT NULL` 是元数据操作）。

### 1.4 Registry 适配

**文件**: `apps/service-desktop-runtime/src/lib/task/registry.ts`（修改）

```typescript
// 存储类型从 TaskDefinition 扩展为 AnyTaskDefinition
const taskDefinitions = new Map<string, AnyTaskDefinition>();

export function registerTaskDefinition(definition: AnyTaskDefinition): void;
export function getTaskDefinition(taskType: string): AnyTaskDefinition;
```

## Phase 2: 运行时适配

### 2.1 Executor 适配

**文件**: `apps/service-desktop-runtime/src/lib/task/executor.ts`（重构）

执行流程调整为：

```
for each stage in stagePlan:
  if stage is simple:
    handler({ ctx, input }) → output
  if stage is chunked:
    entry({ ctx, input }) → { total, blockInput }
    loop:
      block({ ctx, blockInput, progress }) → blockInput | { done: true }
      check pause/cancel between blocks
    exit({ ctx }) → output
  set current output = next stage's input
```

主要变化：
- 不再调用 `buildBlocks` / `executeBlock`
- 执行逻辑按 `stageKey` 路由到对应的 typed hook
- 新增 `result` 回写：最后 stage 的 output 经 Zod 校验后写 DB

### 2.2 Ctx 生命周期

```typescript
// 在 createTask 时初始化
const ctx = definition.initContext(input, scope, taskRunId);

// 在 executor 中通过闭包传入各 hook
const executeArgs = { ctx, ... };
```

### 2.3 Progress 实现

`progress` 回调由 executor 提供，包装 `store.updateStage`：

```typescript
function createProgressFn(taskRunId: string, stageKey: string, mode: ProgressMode) {
  return (update: ProgressUpdate) => {
    const patch = formatProgressUpdate(mode, update);
    store.updateStage(taskRunId, stageKey, patch);
  };
}
```

### 2.4 Result 回写

```typescript
// executor 在 task 完成后
const parsedResult = definition.outputSchema.parse(stageOutput);
await store.updateTaskRun(taskRunId, { result: parsedResult });
```

### 2.5 Control 适配

**文件**: `apps/service-desktop-runtime/src/lib/task/control.ts`（修改）

`createTask` 使用新的 `initContext` + `buildStagePlan`：

```typescript
async createTask(input, scope, definition): Promise<TaskControlResult> {
  const stagePlans = await definition.buildStagePlan(input);
  const ctx = definition.initContext(input, scope, crypto.randomUUID());
  // 将 ctx 持久化或存储在 executor 可访问的位置
  return store.createTaskRun({ ... });
}
```

## Phase 3: Publish 定义迁移

### 3.1 重写 publish definition

**文件**: `apps/service-desktop-runtime/src/lib/hearthstone/task/publish/definition.ts`（重写）

核心改动：

- 移除 `publishCtxMap` — 所有状态由框架管理的 ctx 承载
- 按 DSL API 重写
- Stage 拆分：
  - `loading_snapshots` — chunked, bounded
  - `applying_remote` — chunked, bounded
  - `update_baseline` — chunked, bounded
  - `finalizing` — simple

每个 stage 的 ctx 字段精确类型化：

```typescript
interface PublishCtx {
  db: PublishDb;
  dryRun: boolean;
  // loading_snapshots
  lastCursor?: any;
  // applying_remote
  remoteDb?: any;
  // ...
}

interface LoadingBlockInput {
  cursor: any;
  processed: number;
}
```

### 3.2 移除旧的导出函数

移除不再需要的工具函数：
- `buildPublishTaskScope` / `buildPublishTaskScopeKey` / `buildPublishTaskRunInput`
- `assertPublishTaskRunInput` / `readPublishTaskParams`
- `buildPublishTaskStagePlan` / `buildPublishTaskStageEntry` / `buildPublishTaskBlocks`

保留纯业务函数（`executeLoadingChunk` 等），以新签名在 block hook 内部调用。

### 3.3 集成验证

- 注册新定义到 `index.ts`
- 运行现有 publish 流程，验证：
  - 前端 snapshot/watch 正常
  - pause/cancel 正常
  - result 正确写入 DB
  - progress 正确显示

## Phase 4: 清理与收尾

- image-render definition 按需迁移
- test-work definition 按需迁移（或保留旧格式作为兜底测试）
- 若所有定义都迁移完成，从 `definition.ts` 中移除旧的 `TaskDefinition` 接口
- 将 `proposals/task-strongly-typed-definition/` 归档到 `specs/`
