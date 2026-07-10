# 强类型任务定义

## 背景与动机

当前的 `TaskDefinition` 接口存在大量类型漏洞：

```typescript
interface TaskDefinition {
  taskType: string;
  params: Record<string, unknown>;
  // ...所有 hook 的入参都是 Record<string, unknown>
}
```

具体表现：

- **Stage key 是 string** — 没有编译期约束，拼写错误运行时才暴露
- **Params / Scope snapshot 是 `Record<string, unknown>`** — 每个具体定义内部充斥着 `as PublishTaskParams` / `as any`
- **Block payload 是 `Record<string, unknown>`** — `input.block.payload?.stageKey as string` 模式随处可见
- **Ctx 是外部 `Map<string, SomeCtx>`** — publish 用 `publishCtxMap`, image-render 用 `ctxMap`，生命周期和类型都没有框架管理
- **Stage 间数据流没有显式契约** — 一个 stage 写 ctx，后续 stage 隐式依赖，改一个字段断一链条
- **没有任务级别的 output 类型** — 执行结果没有类型化存储和校验

## 目标

1. 每个任务定义拥有自己的完整类型参数（input、output、scope、ctx、stage keys、block input）
2. 利用 builder chain + TypeScript 类型推导，定义侧零显式泛型参数
3. 所有 `as any` / `as SomeType` 消除在定义边界
4. 框架管理 ctx 生命周期，不再依赖外部 Map
5. Stage 间数据流通过 entry/exit 的 I/O 类型推导保证一致性
6. 最终 output 存 DB，通过 Zod schema 运行时校验

## DSL API 设计

### 完整示例

```typescript
// packages/service-desktop-runtime/src/lib/hearthstone/task/publish/definition.ts

const publish = createDefinition('hsdata_publish', { version: '2026-06-22:v1' })
  .scope(
    z.object({
      publishTarget: z.string(),
      environment: z.string(),
      publishType: z.string(),
    }),
    {
      type: 'publish_stream' as const,
      resolve: (scope) => ({
        key: `${scope.publishTarget}:${scope.environment}:${scope.publishType}`,
        snapshot: scope,
      }),
    },
  )
  .input(
    z.object({
      dryRun: z.boolean().optional(),
      operationKind: z.enum(['publish', 'revert']),
    }),
  )
  .output(
    z.object({
      manifestHash: z.string(),
      publishedAt: z.string().datetime(),
      buildMin: z.number(),
      buildMax: z.number(),
    }),
  )
  .context({
    init: (input, scope, taskRunId) => ({
      db: getLocalDb() as unknown as PublishDb,
      dryRun: input.dryRun ?? false,
    }),
  })
  // chunked stage
  .stage('loading_snapshots', { label: 'Load & diff', progressMode: 'bounded' })
    .entry(async ({ ctx, input }) => {
      const total = await countRows(ctx.db, ...);
      return { total, blockInput: { cursor: null, processed: 0 } };
    })
    .block(async ({ ctx, blockInput, progress }) => {
      const chunk = await loadChunk(ctx.db, blockInput.cursor);
      if (chunk.length === 0) return { done: true };
      ctx.lastCursor = chunk[chunk.length - 1];
      progress({ done: blockInput.processed + chunk.length, total });
      return { cursor: chunk[chunk.length - 1], processed: blockInput.processed + chunk.length };
    })
    .exit(async ({ ctx }) => {
      return { batchId: ctx.batchId!, counts: ... };
    })
  // simple stage
  .stage('finalizing', { label: 'Finalize', progressMode: 'simple' })
    .handler(async ({ ctx, input }) => {
      // input type = { batchId: string; counts: ... } 从前一个 exit 推导
      return { manifestHash: '...', publishedAt: '...', buildMin: 1, buildMax: 100 };
    })
  .build(); // 返回 AnyTaskDefinition 供 executor 消费
```

### 类型推导链

```
TScope = typeof scope schema
TInput = typeof input schema
TOutput = typeof output schema
TCtx   = ReturnType<context.init>

stage 'loading_snapshots':
  entry.input  = { ctx: TCtx; input: TInput }
  entry.output = { total: number; blockInput: TBlockInput1 }
  block.input  = { ctx: TCtx; blockInput: TBlockInput1; progress }
  block.output = TBlockInput1 | { done: true }
  exit.input   = { ctx: TCtx }
  exit.output  = TStageOutput1

stage 'finalizing':
  handler.input = { ctx: TCtx; input: TStageOutput1 }
  handler.output = TOutput  // 必须匹配 output schema
```

## Stage 种类

### Simple Stage

```typescript
.stage('finalizing', { label: 'Finalize', progressMode: 'simple' })
  .handler(async ({ ctx, input }) => {
    // input type = 上一个 stage exit 的返回类型（或 TInput 如果是第一个）
    return { manifestHash: '...' };  // 必须匹配 TOutput（若为最后一个 stage）
  })
```

- `handler` 一次性执行
- 返回值成为下一个 stage 的 input（或任务 output 如果是最后一个）

### Chunked Stage

```typescript
.stage('loading_snapshots', { label: 'Load & diff', progressMode: 'bounded' })
  .entry(async ({ ctx, input }) => {
    // 准备阶段。input type = 上一个 stage exit 的返回类型（或 TInput 如果是第一个）
    return { total: 100, blockInput: { cursor: null, processed: 0 } };
  })
  .block(async ({ ctx, blockInput, progress }) => {
    // blockInput type = entry 的 blockInput 字段（第一轮）| 前一个 block 的返回值（后续轮）
    if (exhausted) return { done: true };            // 终止
    progress({ done: processed, total });               // progressMode=bounded
    return { cursor: next, processed: processed + n };  // 下一轮 blockInput
  })
  .exit(async ({ ctx }) => {
    // 收尾阶段
    return { batchId: '...' };  // 下一个 stage 的 input（或任务 output）
  })
```

- `entry` 调用一次，返回 `{ total?: number; blockInput: T }`
- `block` 循环调用直到返回 `{ done: true }`
- 每轮 block 间框架检查 pause/cancel
- `exit` 在循环结束后调用一次

#### 各 progressMode 的 progress 签名

| progressMode | progress 参数 |
|---|---|
| `bounded` | `{ done: number; total: number; segments?: { name: string; done: number; total: number }[] }` |
| `unbound` | `{ done: number }` |
| `simple` | 无 progress 参数 |

## Ctx 生命周期

由框架管理：

```typescript
{
  init: (input: TInput, scope: TScope, taskRunId: string) => TCtx
}
```

- `init` 在 `createTask` 时调用
- 产生的 ctx 注入所有 hook：`entry`、`block`、`exit`、`handler`
- 运行时框架持有 ctx，不依赖外部 Map
- Mutable（stage 间需要共享状态）

## Scope 声明

```typescript
.scope(
  z.object({ publishTarget: z.string(), environment: z.string(), publishType: z.string() }),
  {
    type: 'publish_stream' as const,  // DB task_runs.task_scope_type
    resolve: (scope) => ({
      key: `${scope.publishTarget}:${scope.environment}:${scope.publishType}`,  // DB task_runs.task_scope_key
      snapshot: scope,  // DB task_runs.task_scope_snapshot
    }),
  },
)
```

- `scope` 和 `input` 分开，语义不同
- `resolve` 提取 DB 需要的三列
- `type` 是字面量类型，用于单 slot 匹配

## DB 变更

`task_runs` 新增列：

```sql
ALTER TABLE task_runs ADD COLUMN result jsonb;
```

任务完成后由框架写入 final stage 的 output（经 Zod 校验）。查询 API (`snapshot`) 返回 `result` 字段。

## 框架内部：AnyTaskDefinition

Builder chain 的最终产物统一装箱为 `AnyTaskDefinition`：

```typescript
interface AnyTaskDefinition {
  taskType: string;
  definitionVersion: string;
  scope: { type: string; resolve(input: unknown): { key: string; snapshot: unknown } };
  inputSchema: ZodSchema;
  outputSchema: ZodSchema;
  initContext(input: unknown, scope: unknown, taskRunId: string): unknown;
  stageKeys: readonly string[];
  supportsResume: boolean;
  effectModel: TaskEffectModel;
  // runtime hooks
  buildStagePlan(input: TaskRunInput): Promise<TaskStagePlan[]>;
  executeStage(stageKey: string, stageSnapshot: ...): ...;
}
```

Executor / Controller 消费 `AnyTaskDefinition`，不感知具体类型参数。类型安全限定在定义层面。

## 迁移计划

现有 task definition（publish、image-render、hearthstone test）逐步重写为新 DSL：

1. Publish — 优先级最高，投入实际使用，验证 DSL 设计
2. Image-render — 验证不同场景
3. Test definition — 保留以测试框架
4. Reanchor — 等待未来重做

迁移过程不改变 DB schema 和前端的交互接口（snapshot / control API 保持兼容）。唯一的 DB 变更就是 `result` 列的新增。
