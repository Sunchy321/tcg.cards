# 应用内重量级任务运行框架实施计划

> 稳定的运行时边界、能力分层和数据归属规则以 [../../docs/project-architecture.zh-CN.md](../../docs/project-architecture.zh-CN.md) 为准。本文只记录应用内重量级任务运行框架的实施计划；若有冲突，以主架构文档与对应设计文档为准。

## TODO List

- [x] 固定首轮框架落地范围，并补齐设计到实施的模块映射
- [x] 为重量级任务框架新增本地数据库 schema、迁移和终态原因枚举
- [x] 在 desktop runtime 中建立通用任务定义、任务仓储、调度器与执行器骨架
- [x] 建立统一的快照读取、控制写入与实时推送协议
- [x] 将 `publish` 迁入通用框架，作为首个 `reconcilable` 任务接入（含定义、持久化、控制链路、阶段映射、块边界控制、残留批次关联、桥接清理共 7 个子步）
- [ ] 将 `reanchor` 迁入通用框架，作为首个 `atomic` 任务接入
- [ ] 将 desktop publish 页面切换到新的 `pageTask` 快照与控制模型
- [ ] 为重任务前端建立统一组件，并新增标题栏任务按钮与全局 popup 检视入口
- [ ] 增加启动清理、周期巡检和恢复前提校验
- [ ] 运行定向验证，确认创建、暂停、继续、取消、重试与残留清理闭环成立

## 实施步骤

### 1. 固定首轮实施范围

- 以 `proposals/internal-heavy-task-runtime/design.md` 作为唯一设计依据，不再为首轮补充并行队列、跨服务 worker 或事件溯源表
- 明确首轮只覆盖 desktop runtime 内的重量级任务运行框架，不扩展到 `site-console` 或 `service-internal` 的远端执行形态
- 明确首轮接入顺序：
  - 先落通用框架骨架
  - 再迁移 `publish`
  - 再迁移 `reanchor`
- 明确首轮页面只改造当前 `apps/app-console-desktop/src/pages/hearthstone/publish/index.vue`
- 若实施过程中发现设计与现有代码结构存在冲突，优先在 proposal 包内更新设计，而不是在代码里私自偏离

### 2. 建立数据库权威快照模型

- 在 `packages/db/src/schema/local/` 下新增重量级任务 schema 文件，统一承载：
  - `task_runs`
  - `task_stages`
  - 相关 enum 与约束
- `task_runs` 至少落以下字段：
  - `task_type`
  - `definition_version`
  - `task_scope_type`
  - `task_scope_key`
  - `task_scope_snapshot`
  - `status`
  - `params`
  - `supports_resume`
  - `current_stage_key`
  - `current_stage_index`
  - `current_resume_mode`
  - `paused_resume_mode`
  - `selection_anchor`
  - `resume_token`
  - `runtime_boot_id`
  - `resume_context_key`
  - `run_revision`
  - `control_request_kind`
  - `heartbeat_at`
  - `started_at`
  - `finished_at`
  - `error_code`
  - `error_message`
  - `terminal_reason`
  - `retry_of_task_run_id`
  - `created_at`
  - `updated_at`
- `task_stages` 至少落以下字段：
  - `task_run_id`
  - `stage_key`
  - `stage_index`
  - `status`
  - `label`
  - `progress_mode`
  - `resume_mode`
  - `total`
  - `done`
  - `resume_token`
  - `selection_anchor`
  - `started_at`
  - `finished_at`
  - `updated_at`
- 在数据库层建立首轮硬约束：
  - `task_runs(task_type)` 对占槽状态建立部分唯一约束
  - `bounded` 阶段的 `done <= total`
  - `session_bound` 相关字段的成组非空约束
  - `completed` 之外终态的 `terminal_reason` 非空约束
- 终态原因至少固定为：
  - `execution_failed`
  - `resume_incompatible`
  - `resume_context_lost`
  - `schedule_exhausted`
  - `manual_cancel`
  - `system_cancel`
  - `abandoned_stale_run`
- 先更新 schema，再用仓库既有 Drizzle 生成脚本产出一份本地 migration

### 3. 建立 runtime 内部任务框架目录

- 在 `apps/service-desktop-runtime/src/lib/` 下新增独立的重量级任务模块目录，职责至少拆分为：
  - `definition`
    - 任务定义类型、阶段定义类型、恢复契约与副作用模型
  - `registry`
    - 任务定义注册表
  - `store`
    - `task_runs / task_stages` 的数据库读写
  - `scheduler`
    - 等待态发现、认领、重试推进与巡检
  - `executor`
    - 统一执行循环与块边界状态提交
  - `control`
    - create / pause / resume / cancel / retry
  - `snapshot`
    - `pageTask` 快照组装
  - `events`
    - 当前快照变化推送
  - `cleanup`
    - 启动清理与周期巡检
- 新模块中的函数、类型和非显然逻辑都按仓库约定补英文注释
- 新模块优先复用现有 ORPC、Drizzle、事件订阅模式，不引入新的 runtime 框架

### 4. 落 `TaskDefinition`、阶段骨架与接入契约

- 建立通用 `TaskDefinition` 类型，至少要求任务作者声明：
  - `taskType`
  - `definitionVersion`
  - `supportsResume`
  - `effectModel`
  - 阶段顺序
  - 每阶段 `progressMode`
  - 每阶段 `resumeMode`
  - 阶段总量构建方式
  - 阶段候选冻结方式
  - 原子块生成方式
  - 原子块执行方式
- `create task` 时一次性生成完整阶段骨架并写入 `task_stages`
- 首轮禁止惰性新增阶段、运行中重排阶段或只在进入阶段时临时补行
- 对支持继续的阶段，统一要求：
  - `resumeToken` 由阶段行承载
  - `selectionAnchor` 由阶段行承载
  - `task_runs` 只保存运行级缓存摘要
- 在代码里显式区分：
  - `effectModel = atomic`
  - `effectModel = reconcilable`
- 后续 `publish` 默认走 `reconcilable`
- 后续 `reanchor` 默认走 `atomic`

### 5. 落通用状态机、控制语义与执行循环

- 在 runtime 框架内固定 `TaskRun.status` 状态集合：
  - `pending`
  - `running`
  - `pausing`
  - `paused`
  - `resuming`
  - `canceling`
  - `canceled`
  - `failed`
  - `completed`
  - `abandoned`
- 将合法迁移和中间态不变量收敛到统一状态机模块，不允许由具体任务自由拼接
- 执行器统一采用：
  - 等待态认领
  - 当前阶段 durable 进入
  - 原子块循环
  - 块边界刷新进度、恢复点、心跳与控制意图
  - 阶段收束
  - 任务终态提交
- 所有执行期状态提交都要校验：
  - 当前 `TaskRun` 仍处于允许该轮执行写入的状态
  - 未被更晚的取消、失败或清理结果覆盖
- `pause / resume / cancel` 统一写入 `control_request_kind`
- `retry` 统一创建新的 `TaskRun`，不复活旧实例

### 6. 落调度器、心跳与清理机制

- 在 runtime 启动流程中生成当前服务唯一 `runtimeBootId`
- 建立轻量调度器，只扫描：
  - `pending`
  - `resuming`
- 建立原子认领逻辑，要求认领与“进入当前阶段”同事务提交
- 建立心跳刷新与超时阈值配置，要求：
  - 心跳间隔明显短于超时阈值
  - 原子块最大时长稳定小于心跳风险窗口
- 建立启动清理：
  - 扫描 `running / pausing / canceling`
  - 对超时失活实例收束为 `abandoned`
  - 扫描 `paused + session_bound`
  - 对上下文已失效实例收束为 `canceled + resume_context_lost`
- 建立周期巡检：
  - 再次驱动 `pending / resuming`
  - 清理执行中残留实例
  - 识别运行中的 `session_bound paused` 失效实例
- `pending / resuming` 只在拿到明确不可推进证据时收束为 `failed`

### 7. 建立快照接口、控制接口与实时事件协议

- 在 `apps/service-desktop-runtime/src/orpc/` 下新增通用任务路由，不再把框架语义散落在 `hsdata.ts` 的专用接口里
- 快照接口至少输入：
  - `taskType`
  - `activeScope`
- 快照接口输出统一收敛为：
  - `pageTask.kind = idle | attached | blocking`
  - 当前阶段快照
  - 完整阶段列表
  - `canPause`
  - `canResume`
  - `canCancel`
- 控制接口固定为：
  - `create task`
  - `pause task`
  - `resume task`
  - `cancel task`
  - `retry task`
- 写侧结果只返回任务级受理结果，不返回页面拼装态
- 实时通道推送当前快照变化，结构尽量与快照接口同构
- 页面真相始终以快照重拉为准，实时通道只做增量更新或变更提示
- 前后端共享协议优先以 `zod schema` 落在 `packages/model`，前端展示层类型从 schema 推导

### 8. 迁移 `publish` 到通用框架

- 将 `apps/service-desktop-runtime/src/lib/hearthstone/hsdata-publish.ts`
  与 `hsdata-publish-progress.ts` 中的专用运行控制逻辑迁入通用任务框架
- 为 `publish` 建立独立 `TaskDefinition`，固定：
  - `taskType`
  - `taskScopeType = publish_stream`
  - `taskScopeKey = publishTarget + environment + publishType`
  - `taskScopeSnapshot = { publishTarget, environment, publishType }`
- 将当前 publish 的阶段、总量计算、块边界和进度事件映射到通用 `TaskStage`
- 将现有“停止 publish job”语义切换为通用 `cancel task`
- 将现有“恢复残留批次”语义折叠到新的快照与控制模型下
- 保留 publish 现有业务写入逻辑，但要求块级确认与恢复点通过框架统一提交

#### 8.1 先补齐 `publish` 的正式任务定义与注册

- 新增 `publish` 的正式 `TaskDefinition`，不再只依赖当前过渡桥接文件
- 在定义中固定：
  - `taskType = hearthstone_publish`
  - `definitionVersion`
  - `supportsResume`
  - `effectModel = reconcilable`
  - `taskScopeType = publish_stream`
- 将当前 publish 的业务输入拆成：
  - 任务 scope
  - 任务 params
  - 阶段骨架
- 将定义注册到通用任务注册表，后续创建时统一从注册表取定义

#### 8.2 落通用 `TaskStore` 的最小持久化能力，只覆盖 `publish` 当前所需路径

- 为 `task_runs / task_stages` 实现最小可用读写，不再只在内存里维护 publish 任务记录
- 当前至少落这些路径：
  - `createTaskRun`
  - `getTaskRun`
  - 按 `taskType + scope` 读取当前活跃实例
  - 更新运行状态、当前阶段、错误信息、终态原因
  - 更新阶段状态、阶段进度、阶段总量
- `publish` 本步需要讨论并明确：
  - `resumeToken` 放在 `public.task_stages`
  - `selectionAnchor` 放在 `public.task_stages`
  - 不额外为 `publish` 新建游戏专属运行时表

#### 8.3 落通用创建、快照与取消控制链路，只先打通 `publish`

- 用通用 `create task` 入口替换当前 `createPublishTask` 的直接内存写入
- 用通用快照组装替换当前 `publish` 的临时 `TaskPageSnapshot` 拼装
- 用通用 `cancel task` 入口替换当前 `stopPublishJob` 对 publish 的控制语义
- 写侧返回统一收敛为：
  - `taskRunId`
  - `runRevision`
  - `status`
- `hsdata.ts` 里的旧 publish 专用接口本步先保留兼容外壳，但内部必须改为调用通用控制链路

#### 8.4 将 `publish` 的计划与执行映射到通用阶段模型

- 至少把当前 publish 拆成可解释的阶段集合，例如：
  - `loading_baseline / loading_snapshots`
  - `deriving_range`
  - `building_diff`
  - `writing_batch`
  - `writing_batch_rows`
  - `applying_remote`
  - `finalizing`
- 明确每个阶段的：
  - `progressMode`
  - `resumeMode`
  - 总量构建方式
  - 阶段进入与阶段完成条件
- 将当前 `hsdata-publish.ts` 中的进度事件改为驱动通用阶段写入，而不是先写专用 publish progress 再映射

#### 8.5 将块边界确认、控制意图检查与恢复点提交收敛到框架

- 在 `publish` 的计划阶段与远端应用阶段识别稳定块边界
- 每个块边界统一完成：
  - 刷新阶段进度
  - 检查 `control_request_kind`
  - 写入 `resumeToken`
  - 写入 `selectionAnchor`
  - 刷新运行心跳
- 若当前 `publish` 首轮仍不支持 `resume`，也要明确：
  - 哪些字段先写空
  - 哪些字段仍作为后续支持继续时的保留位
- 不允许继续只靠过渡桥的内存 `stopRequested` 作为唯一控制事实

#### 8.6 将“残留批次恢复”折叠到通用任务快照与控制模型

- 将“检测到未完成 publish batch 后继续执行”的入口，改为先还原或接续对应的 `TaskRun`
- 页面或兼容接口读取当前状态时，应优先看通用任务快照，而不是直接看旧 publish job 内存态
- 明确当前残留批次与 `TaskRun` 的映射关系：
  - 同一 publish stream 下只允许一个活跃 `TaskRun`
  - 同一 `TaskRun` 可以绑定一个正在推进的 publish batch
- 保留现有数据库残留批次取消入口，但要能回写对应任务终态

#### 8.7 清理过渡桥，只保留 `reanchor` 仍然需要的旧逻辑边界

- 将 publish 专用桥接逻辑收缩为：
  - 仅兼容旧前端接口名
  - 不再持有自己的任务真相源
- 若 `hsdata-publish-progress.ts` 里还有 publish 专属运行态，应迁走或删掉
- `reanchor` 还未迁移前，可以临时保留它依赖的旧 publish progress 通道
- 完成本步后，必须能明确回答：
  - publish 的权威运行状态在哪
  - publish 的权威阶段状态在哪
  - publish 的取消控制意图在哪
  - publish 的恢复点在哪

### 9. 迁移 `reanchor` 到通用框架

- 将 `reanchor` 从 publish 专用控制流中拆出，建立独立 `TaskDefinition`
- 复用同一页面 scope 模型，但与 `publish` 保持独立 `taskType`
- 将 `reanchor` 作为首个 `atomic` 任务示例接入，验证：
  - 同库内块确认
  - 阶段总量冻结
  - 暂停与取消块边界语义
- 明确 `reanchor` 是否支持 `resume`
  - 若当前无法给出稳定 `selectionAnchor + resumeToken`
  - 则首轮只支持取消与重试，不伪装成可继续任务

### 10. 切换 desktop publish 页面到新模型

- 在 `apps/app-console-desktop/src/composables/` 下新增通用任务 composable `useTaskCard`，负责：
  - 轮询后端 pageTask 快照
  - 根据 `startedAt` 前端实时计算已用时间
  - 根据阶段进度比例估算剩余时间
  - 推导 `canPause` / `canResume` / `canCancel` 能力位
  - 管理 stage 折叠/展开状态
- 将 `apps/app-console-desktop/src/pages/hearthstone/publish/index.vue` 从专用 publish job 状态切换到：
  - `pageTask`（判别联合：`idle` / `attached` / `blocking`）
  - 阶段列表
  - 能力位按钮
  - 统一实时通道
- 页面先拉快照，再接实时流
- 页面按 `activeScope` 解析当前主任务：
  - `attached` — 页面附着到匹配 scope 的主任务
  - `blocking` — 另一 scope 的同类型任务占槽
  - `idle` — 无活跃任务
- 页面不再自己重建状态机，不再直接推导是否可暂停、可继续、可取消
- 对 `paused` 的”继续”按钮按”发起继续尝试”展示，不宣传必然成功
- 若当前被别的 scope 的同类任务占槽，页面明确展示阻塞来源

### 11. 建立统一任务组件与全局检视入口

- 在 `packages/console-shell/app/components/task/` 下建立统一任务组件：

```
TaskCard（容器组件，三行无分割线水平长条布局）
├── TaskTitleBar     ← 第一行：标题 + 状态标签 + 已用时间
├── TaskProgressBar  ← 第二行：进度条 + 计数器 + 阶段已用/剩余时间
└── TaskStepsRow     ← 第三行：水平 step 指示器 + 操作按钮
    ├── TaskStepIndicator  ← 步骤列表，当前 ±2 折叠，可展开
    └── TaskActionBar      ← 暂停/继续/取消/重试按钮
```

  - 组件覆盖以下所有状态且保持三行高度一致：`idle / pending / running / pausing / paused / resuming / canceling / completed / failed / canceled / abandoned / blocking`
  - 每行状态表现按 `specs/ui-task-card/design.md` 的状态对应表实现
  - 步骤指示器默认折叠为当前阶段前后各 2 个，超出部分显示 `… N` 点击展开全部，展开后显示 `▲ 收起` 按钮
- 新增标题栏任务按钮，负责：
  - 显示当前是否存在占槽任务
  - 在有任务时给出明确提醒
- 新增全局任务 popup，负责：
  - 展示当前全局占槽任务摘要
  - 展示当前阶段与整体阶段序列
  - 复用统一按钮条提供 `pause / resume / cancel`
  - 在需要时跳转到对应任务页面查看完整细节
- publish 页面与全局 popup 必须复用同一套任务组件和状态文案
- 若当前不存在占槽任务，标题栏按钮与 popup 也应展示统一空闲态

### 12. 补充定向测试与验证脚本

- 在 `apps/service-desktop-runtime` 为新框架补充单元测试或集成测试，至少覆盖：
  - `task_runs` 单槽约束
  - create 后进入 `pending`
  - 调度认领 `pending -> running`
  - `running -> pausing -> paused`
  - `paused -> resuming -> running`
  - `running -> canceling -> canceled`
  - `resuming` 恢复失败收束为 `failed`
  - 执行中残留清理收束为 `abandoned`
  - `session_bound paused` 上下文丢失收束为 `canceled`
- 为 `publish` 迁移补充定向测试，确认：
  - 阶段总量、进度和终态原因可映射到框架
  - 现有跨库副作用不会因重试或重复块提交被错误放大
- 为 `reanchor` 补充定向测试，确认：
  - 单库路径能按 `atomic` 模型稳定收束
- 为前端补充最小页面验证，确认：
  - 首次进入快照接续
  - 阻塞态展示
  - 按钮能力位联动
  - 实时断线后快照兜底
  - 标题栏任务按钮状态更新
  - 全局 popup 与页面主视图保持同一状态语义

### 13. 验证与收口

- 用真实 desktop runtime 手工验证以下闭环：
  - 创建任务后页面进入等待态
  - 调度成功后进入运行态
  - 阶段进度、百分比与已用时间展示正确
  - `pause` 在块边界生效
  - `resume` 成功后继续推进同一阶段
  - `resume` 失败时正确落成 `failed`
  - `cancel` 在 `pending / running / paused / resuming` 上都符合设计语义
  - `retry` 创建新实例且旧实例保持原终态
  - runtime 重启后执行中残留实例会被清为 `abandoned`
  - runtime 重启后 `session_bound paused` 会被清为 `canceled`
  - 标题栏任务按钮能在任务创建、暂停、恢复和终态后正确更新
  - 全局 popup 与 publish 页面展示相同的当前任务状态、阶段和能力位
- 验证完成后，根据实际落地情况回写：
  - `design.md` 中需要收紧的实现边界
  - 后续若要进入 `specs/`，再补对应 `review.md`
