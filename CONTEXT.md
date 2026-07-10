# Context

## Task System (任务系统)

### Task Definition
Definition of a task type, defining its lifecycle hooks weakly typed (current) or strongly typed (target). Being migrated to a generic definition with explicit per-task type parameters. Uses a builder API: `createDefinition().input(zod).output(zod).scope({...}).context({...}).stage(...)`.

### Task Input
The task-level input declared via a Zod schema. Type `TInput`. Passed into the first stage's `entry` as `input` and into `context.init()`.

### Task Output
The task-level output declared via a Zod schema. Type `TOutput`. Stored in the `task_runs.result` JSONB column. The last stage's `run` (simple) or `exit` (chunked) return type must match the output schema.

### Task Scope
A separate declaration from input. Contains a literal `type` and a `resolve` function that extracts `{ key, snapshot }` from the task input. Used for single-slot enforcement per `(taskType, scopeType, scopeKey)`.

### Task Ctx
A context object that lives for the entire task run. Initialized in `context.init()` when the task is created. Accessible by all stage hooks. Must only contain data that does NOT depend on stage ordering — resources (db connections), immutable flags, and resolved configuration. Stage-to-stage data must flow through the exit/input chain, not through ctx mutation.

### Stage
A step in the task execution pipeline. Two kinds:
- **Simple stage**: Has a `handler` hook that executes atomically. Input from previous stage's output. Returns output for next stage.
- **Chunked stage**: Has `entry` (prepare, determines total), `block` (called per block), `exit` (finalize, returns output for next stage). Framework checks pause/cancel between `block` calls. Each `block` receives the previous `block`'s return value as `blockInput`.

### Stage I/O
Each stage receives the previous stage's output as its `input`. The first stage receives the task-level `input` as its `input`. The last stage's `handler`/`exit` return type must match the task-level `output` schema.

### Block Input
Data passed between consecutive `block` calls within a chunked stage. The first `block` receives the `blockInput` returned by `entry`. Each subsequent `block` receives the previous `block`'s return value. Terminated by `{ done: true }`.

### Block Progress
Reported via a `progress` callback within `block` hooks. Type varies by the stage's `progressMode`:
- `bounded`: `{ done: number; total: number; segments?: [...] }`
- `unbound`: `{ done: number }`
- `simple`: no arguments
