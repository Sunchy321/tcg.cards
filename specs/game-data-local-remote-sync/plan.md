# 游戏领域数据本地/远端同步实施计划

## TODO List

- [x] 固定首轮实施范围与分期，明确哪些现有链路直接复用，哪些只做抽象收口
- [x] 将 `game-data-local-remote-sync` 设计包迁入 `specs/` 并作为后续实现主入口
- [x] 为 `publish-owned` 固定通用 publish stream 身份、行级 baseline 最小模型与高风险操作枚举
- [ ] 让现有 `hsdata publish` 链路对齐 `publish-owned` 通用语义，而不是继续保留 `hearthstone-card` 特化命名
- [ ] 为 `collaborative` 固定通用字段 policy registry 与 `commit / field entry / winner` 共享术语
- [ ] 将现有 `hearthstone tag` 协作同步从 tag 特化规则中抽出通用同步骨架
- [ ] 为 desktop runtime、console API 与前端页面补齐统一入口和术语
- [ ] 为本地/远端双历史、审核、冲突、发布和重建补齐验证路径与文档收口

## 目标

将现有零散的 `hsdata publish` 与 `hearthstone tag` 字段同步实现，收口为一套按字段 policy 分流的双轨同步基础设施：`publish-owned` 负责自动化结果发布，`collaborative` 负责人工可编辑字段的提交、审核、冲突处理与双端同步。

## 实施原则

- 首轮先复用已有实现，不为“通用化”重写整条链路
- `publish-owned` 与 `collaborative` 分期推进，但共享同一套术语、边界和运维入口
- 先固定 schema 语义与运行时边界，再做代码抽象和页面入口扩展
- 首轮 policy 采用代码内 registry，不额外引入数据库级 policy 配置系统
- 结果表、accepted history 和 `winner` 的关系必须保持可解释、可重建

## 当前代码落点

### 已有 `publish-owned` 相关代码

- 本地发布批次与基线：
  - `packages/db/src/schema/local/hearthstone/publish.ts`
- 远端 publish ledger：
  - `packages/db/src/schema/remote/hearthstone/publish.ts`
- desktop 本地 DB 入口：
  - `apps/service-desktop-runtime/src/lib/hearthstone/hsdata-local-db.ts`
- desktop publish 实现：
  - `apps/service-desktop-runtime/src/lib/hearthstone/hsdata-publish.ts`
- desktop publish 页面：
  - `apps/app-console-desktop/src/pages/hearthstone/publish/index.vue`

### 已有 `collaborative` 相关代码

- 通用字段提交 profile：
  - `packages/model/src/field-commit.ts`
- 共享字段同步 schema：
  - `packages/db/src/schema/shared/hearthstone/field-sync.ts`
- 本地同步 cursor：
  - `packages/db/src/schema/local/hearthstone/field-sync.ts`
- tag 提交/冲突/拉取/推送实现：
  - `packages/console-api/src/lib/hearthstone/tag-commit.ts`
  - `packages/console-api/src/lib/hearthstone/tag-conflict.ts`
  - `packages/console-api/src/lib/hearthstone/tag-pull.ts`
  - `packages/console-api/src/lib/hearthstone/tag-push.ts`

### 已有可复用的来源规则输入

- `magic` 导入来源与规则：
  - `packages/db/src/schema/local/magic/import.ts`
- 本地 hsdata 原始快照与版本事实：
  - `packages/db/src/schema/local/hearthstone/card-model.ts`

## 阶段计划

| 阶段 | 目标 | 核心任务 | 输出物 | 依赖 | 验收标准 |
|------|------|----------|--------|------|----------|
| P0 范围冻结 | 固定首轮实现边界 | 冻结 `publish-owned` 与 `collaborative` 的首轮范围；明确 `hsdata publish` 与 `tag sync` 的复用关系；把 proposal 包迁入 `specs/` | 生效中的 spec 包 | 已批准设计 | 实现不再在总设计和旧专项逻辑之间摇摆 |
| P1 通用术语与 registry | 固定双轨共享概念 | 定义 publish stream、operation kind、policy registry、field entry 语义和跨端术语 | 共享类型和文档口径 | P0 | 后续代码不再继续使用冲突术语或隐含语义 |
| P2 `publish-owned` 基础设施收口 | 让现有 hsdata publish 对齐通用语义 | 调整 publish stream 键、baseline 唯一性、操作枚举、gate 输入和重建入口 | 通用 publish-owned 骨架 | P1 | hsdata publish 已符合新总设计，不再依赖领域特化假设 |
| P3 `collaborative` 基础设施收口 | 让现有 tag sync 对齐通用语义 | 抽出共享字段 policy、提交状态语义和冲突持久化规则 | 通用 collaborative 骨架 | P1 | tag sync 成为第一条 collaborative 实例，而不是一次性特例 |
| P4 运行时入口与页面收口 | 对齐 desktop/runtime/API/UI 入口 | 统一 desktop runtime、console API、桌面端页面和文案入口 | 一致的执行入口 | P2, P3 | 用户可以按新术语理解并操作发布和协作同步 |
| P5 验证与文档收口 | 固定回归与运维路径 | 补齐测试、验证清单和文档交叉引用 | 完整 spec 包与验证记录 | P2-P4 | 设计、实现、页面和运维口径一致 |

## 实施步骤

### 1. 固定首轮范围与包结构

首轮不同时做“全领域通用平台化”。固定为：

- `publish-owned`
  - 以现有 `hearthstone card` 发布链路为首轮实例
  - 目标是把现有 hsdata publish 调整成通用语义一致的实现
- `collaborative`
  - 以现有 `hearthstone tag` 字段同步为首轮实例
  - 目标是把现有 tag sync 收口为共享骨架上的第一条实例

本阶段文件动作：

- 新建或确认：
  - `specs/game-data-local-remote-sync/design.md`
  - `specs/game-data-local-remote-sync/review.md`
  - `specs/game-data-local-remote-sync/variants/hearthstone-card.md`
  - `specs/game-data-local-remote-sync/plan.md`

本阶段必须回答：

- 哪些旧 proposal 只是历史背景，不再作为实现入口
- 哪些代码先“重命名/抽象”，哪些代码先保持原状只补语义
- 是否需要同时更新 `docs/project-architecture.zh-CN.md`

固定结论：

- `specs/field-override-incremental-sync/` 与 `specs/data-local-pg-authoritative-runtime/` 只保留为历史背景和前置边界输入，不再作为本需求的实现入口
- 在本需求实现完成、且当前 spec 已完整承接所需设计信息后，删除 `specs/field-override-incremental-sync/` 与 `specs/data-local-pg-authoritative-runtime/` 两个旧 spec 包
- `hsdata publish` 与 `hearthstone tag` 现有链路首轮直接复用运行骨架，优先补共享术语、schema 语义和入口命名，不先重写整条链路
- 当前不改项目级架构边界，因此不先改 `docs/project-architecture.*`
- 当前 spec 包成为本需求唯一主入口

### 1.1 主入口确认

当前仓库中不存在并行的 `proposals/game-data-local-remote-sync/`、`archive/game-data-local-remote-sync/` 或其他同名活动设计包。

固定说明为：

- `specs/game-data-local-remote-sync/` 是当前需求唯一的生效设计入口
- 后续实现、验证和文档收口均以该 spec 包为准

### 2. 固定共享术语与代码内 registry

首轮不引入数据库 policy 表。固定为代码内 registry。

建议新增文件：

- `packages/model/src/game-data-sync.ts`
  - 共享 `publish-owned` / `collaborative` 术语
  - 定义 `publishStreamKey`
  - 定义 `publishOperationKind`
  - 定义 `manualOverrideMode`
  - 定义字段 policy 共享类型
- `packages/console-api/src/lib/game-data-sync/policy-registry.ts`
  - 首轮代码内 policy registry
  - 提供按 `entityType + fieldPath` 查询 policy 的入口

首轮 registry 至少固定：

- `track`
  - `publish-owned | collaborative`
- `allowManualEdit`
- `allowedAutoSources`
- `autoAcceptSources`
- `manualOverrideMode`
  - `manual_sticky | manual_until_source_change`
- `requiresReview`

首轮不做：

- 多级 policy 继承
- 数据库存储 policy 快照
- 跨游戏统一 UI 配置面板

### 3. 收口 `publish-owned` 的通用 publish stream 语义

现有 publish 实现已经使用：

- `publishTarget`
- `environment`
- `publishType`
- `targetFingerprint`

但本地 `PublishBaseline` 与远端 `PublishLedger` 仍以 `publishTarget` 为主键，不足以表达设计中要求的 publish stream 三元组。

本阶段需要修改：

- `packages/db/src/schema/local/hearthstone/publish.ts`
- `packages/db/src/schema/remote/hearthstone/publish.ts`
- 相关 Drizzle migration

首轮收口要求：

- `PublishBaseline` 的唯一键升级为：
  - `publishTarget + environment + publishType`
- `PublishLedger` 的唯一键升级为：
  - `publishTarget + environment + publishType`
- `PublishBatch` 与 `PublishBatchRow` 保持批次维度，但其查询、回收和重放逻辑统一按 publish stream 过滤
- 明确 `operationKind`
  - `publish`
  - `repair`
  - `rollback`
  - `baseline_repair`

同时需要检查：

- `hsdata-publish.ts` 中所有按 `publishTarget` 查询 baseline/ledger/旧批次的代码
- 相关 UI 是否需要显示 `publishType`

首轮不做：

- 单独的 `publishStreamId` 数据列
- 远端逐行发布状态表

### 4. 固定行级 baseline 的最小语义并压瘦本地持久化

设计已经明确：

- baseline 只需要 `rowKey`、`rowHash`、`exists` 和少量审计字段
- 更新按整行发送

现有实现中：

- 本地 `PublishBaseline` 只保存批次级摘要
- 行级状态事实主要依附在 `PublishBatchRow`
- 读取 previous row state 时通过当前 baseline 指向的 batch 回放 `PublishBatchRow`

首轮允许保留“baseline 指向 batch、batch rows 承载逐行状态”的结构，但必须把语义明确为：

- `PublishBatchRow`
  - 是 publish plan 和记账事实
  - 也是当前首轮行级 baseline 的物理承载
- `PublishBaseline`
  - 是某条 publish stream 当前已接受批次的 stream 级锚点

本阶段需要补充：

- 在 `packages/model/src/game-data-sync.ts` 或等价位置定义通用 row baseline 语义类型
- 在 `apps/service-desktop-runtime/src/lib/hearthstone/hsdata-publish.ts` 中增加清晰注释和辅助函数命名，避免继续让 batch row 与 baseline 语义混淆
- 明确删除状态只由受控写入口或重建入口产出，不由远端逐行状态回推

若实现中发现 `PublishBatchRow` 过度承担长期状态，可在本阶段评估是否新增轻量 row baseline 表；但首轮默认不拆表。

### 5. 收口 `publish-owned` gate 与高风险入口

当前 `hsdata-publish.ts` 已有：

- `targetFingerprint`
- manifest hash
- source/build 范围
- 本地 baseline
- 远端 ledger

本阶段要把它们收口到设计里的统一 gate 语义。

需要修改或补充：

- `apps/service-desktop-runtime/src/lib/hearthstone/hsdata-publish.ts`
- `apps/service-desktop-runtime/src/lib/hearthstone/hsdata-publish-target.ts`
- `apps/service-desktop-runtime/src/index.ts`
- 相关 ORPC/runtime 调用入口

固定要求：

- 普通发布必须显式绑定 previous baseline 摘要
- 同 generation 下 source/build 不得静默倒退
- 同 lineage 摘要分叉必须拒绝普通发布
- `repair / rollback / baseline_repair` 必须走显式入口，不能复用普通 publish 开关
- 时间只用于提示、日志和 lease 语义，不参与硬拒绝

若当前 runtime 还没有高风险发布入口，本阶段至少要先：

- 补共享类型和状态枚举
- 在入口层做显式预留
- 在普通 publish 中拒绝需要高风险入口处理的情况

### 6. 明确 `publish-owned` 的统一写入口与重建入口

设计要求删除检测和重建候选必须来自受控入口。

结合当前代码，首轮统一入口应落在：

- `apps/service-desktop-runtime/src/lib/hearthstone/hsdata-publish.ts`
- `apps/service-desktop-runtime/src/lib/hearthstone/hsdata-project.ts`
- 相关 desktop runtime ORPC 或 HTTP 调用入口

本阶段要固定两类入口：

- 日常增量入口
  - 继续走现有本地结果表 + baseline diff
- 重投影 / rebuild 入口
  - 显式触发整轮 publish plan 重建

需要新增或调整：

- runtime 层参数对象，明确：
  - `publishType`
  - `operationKind`
  - `dryRun`
  - `forceRebuild`
  - `expectedPreviousBaseline`
- UI 层只暴露普通入口；高风险入口先保留为内部调用能力或受限开关

### 7. 抽出 `collaborative` 的共享 policy 与 field entry 语义

当前 tag sync 已有 `FieldCommit`、`FieldWinner`、`FieldConflict`，但仍是“每条 row 就是一条字段 commit”的实现，尚未把总设计里的 `field entry` 概念显式落出来。

首轮不强制新增独立 `field_entries` 表，但必须先把语义固定下来：

- 一条 `FieldCommit` 当前代表一条字段级 entry
- commit 容器与 field entry 拆分，先体现在共享类型、函数命名和页面文案上
- 后续如果出现真正多字段提交，再评估是否拆实体表

本阶段建议修改：

- `packages/model/src/field-commit.ts`
- `packages/console-api/src/lib/hearthstone/tag-commit.ts`
- `packages/console-api/src/lib/hearthstone/tag-conflict.ts`
- `packages/console-api/src/lib/hearthstone/tag-pull.ts`
- `packages/console-api/src/lib/hearthstone/tag-push.ts`

本阶段至少要完成：

- 固定共享 `commitKind` 术语与最小集合
  - 与总设计对齐时，可保留 tag 首轮已有 kind，但要建立映射或收口计划
- 固定 `reviewStatus / projectionStatus / syncStatus` 的共享语义说明
- 把 `winner` 的职责注释清楚为“自动接受锚点”，不是第二真相
- 把“accepted 直接写结果表”的原子关系写进本地事务边界注释

### 8. 把 tag 专用协作逻辑抽成共享骨架

首轮不追求一口气支持所有 collaborative 对象，但应把 `tag` 的共享部分从领域代码里抽出来。

建议新增目录：

- `packages/console-api/src/lib/game-data-sync/`

建议逐步抽出：

- 共享 revision hash 工具
- 共享 `clientMutationId` 幂等检查
- 共享 conflict 记录输入 shape
- 共享 cursor-based `pull / push` 骨架
- 共享 policy 查询

保留在 tag 侧的内容：

- `entityKey` 结构
- `fieldPath` 规则
- row revision 计算
- 结果表写入方式
- tag 特有 auto-base 规则

抽象后的目标是：

- `tag` 成为 collaborative track 的一个实例
- 未来 card/tag 之外的人工可编辑对象可以复用同一套历史同步骨架

### 9. 对齐本地/远端双历史边界与页面入口

当前已有页面：

- `packages/console-shell/app/pages/hearthstone/commit/index.vue`
- `packages/console-shell/app/pages/hearthstone/conflict/index.vue`
- `apps/app-console-desktop/src/pages/hearthstone/publish/index.vue`

本阶段要做的是术语和入口收口，而不是全面重做 UI。

需要检查并修改：

- 页面标题和文案中是否仍混用 proposal/commit/winner 等旧口径
- desktop 页面是否把 publish 误解释为“远端管理”
- commit/conflict 页面是否需要补充 `processingSide`、`processingStage`、`syncStatus` 的说明

同时要确认：

- remote 管理入口仍属于 remote 历史，不自动并入 local
- desktop 集成 remote 能力不等于混同两端 authority

### 10. 验证、迁移与回退

本需求首轮涉及 schema 与运行时语义调整，必须预先固定验证路径。

#### 10.1 `publish-owned` 验证

至少验证：

- 同一 `publishTarget` 下不同 `environment + publishType` 不再互相污染 baseline
- 普通增量 publish 仍能只发布变更行
- 同 lineage 摘要分叉会被普通 publish 拒绝
- 重跑未完成 batch 不会错误更新 baseline/ledger
- 远端不保存逐行发布状态仍可完成下一轮 diff

建议测试位置：

- `apps/service-desktop-runtime/src/lib/hearthstone/hsdata-publish.test.ts`
- 新增针对 publish stream 三元组和 gate 的测试

#### 10.2 `collaborative` 验证

至少验证：

- 本地保存 tag 仍然即时更新主表和 winner
- remote push/pull 仍然按 sequence 增量工作
- 冲突会落到 `FieldConflict`
- `winner_clear`、人工覆盖和 auto-base 规则仍然成立
- 共享术语调整后，现有 tag 页面与查询接口返回值不失真

建议测试位置：

- 现有 tag 相关测试
- 需要时补充新的 shared sync helper 测试

#### 10.3 migration 与回退

首轮涉及 Drizzle schema 变更时：

- 先改 schema，再用 `drizzle-kit generate`
- 不手写 snapshot
- 如需数据迁移，只补最小 manual SQL

回退原则：

- 先允许新代码同时兼容旧数据读法，再切换写法
- baseline/ledger 主键调整前，先准备兼容读取逻辑
- 若 `publish-owned` gate 收口失败，优先回退入口校验，不回退已完成的本地构建事实

## 实施顺序建议

建议按以下顺序执行：

1. 固定 spec 包并提交计划
2. 收口共享术语与 policy registry
3. 调整 `publish-owned` schema 与 gate
4. 调整 `hsdata publish` runtime 与页面入口
5. 收口 `collaborative` 共享语义
6. 抽 tag sync 的共享骨架
7. 补测试与文档

原因：

- `publish-owned` 与 `collaborative` 都依赖统一术语
- `hsdata publish` 的 schema/gate 风险更高，应先稳定
- tag sync 目前已可用，适合在第二阶段做抽象，不宜先重构

## 非目标提醒

本计划首轮不做：

- 通用 Git 风格分支系统
- 全领域统一 `field_entries` 实体重构
- 远端逐行 publish state 存储
- 数据库存储的可视化 policy 管理系统
- 全部游戏对象一次性接入 collaborative track

## 自检

### 1. 设计覆盖

已覆盖设计中的两条主线：

- `publish-owned`
  - publish stream 三元组
  - 行级 baseline
  - 普通 publish 与高风险操作分级
  - 统一写入口与 rebuild 入口
- `collaborative`
  - 字段 policy
  - `commit / field entry / winner`
  - 本地/远端双历史
  - push/pull/conflict/accepted 结果表更新

### 2. 占位符检查

本计划未使用：

- `TBD`
- “后续补充”式步骤占位
- “写测试”但不给范围的空描述

### 3. 命名一致性

计划中统一使用：

- `publish-owned`
- `collaborative`
- `publish stream`
- `policy registry`
- `operationKind`
- `winner`

并明确：

- 首轮 `tag` 中“一条 FieldCommit 对应一条字段级 entry”只是实现映射，不是总模型混同
