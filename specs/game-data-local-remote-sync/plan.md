# 游戏领域数据本地/远端同步实施计划

## TODO List

- [x] 固定首轮实施范围与分期，明确哪些现有链路直接复用，哪些只做抽象收口
- [x] 将 `game-data-local-remote-sync` 设计包迁入 `specs/` 并作为后续实现主入口
- [x] 为 `publish-owned` 固定通用 publish stream 身份、行级 baseline 最小模型与高风险操作枚举
- [x] 让现有 `hsdata publish` 链路对齐 `publish-owned` 通用语义，而不是继续保留 `hearthstone-card` 特化命名
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

首轮同时固定 publish stream 三元组的职责边界：

- `publishTarget`
  - 表达一条发布流所属的主业务分区
  - 首轮默认用于区分不同游戏或同级业务面
- `environment`
  - 表达该发布流面向的环境边界
  - 用于区分开发、预发、生产或等价环境面
- `publishType`
  - 表达同一主业务分区内的具体发布数据面
  - 用于区分 `card_data`、`image_data` 或其他后续发布小类

因此首轮不把以下语义混入 `publishType`：

- 不把游戏名与数据面类型拼成一个混合字段
- 不把 remote 连接身份编码进 `publishTarget`
- 不把多个独立业务面伪装成同一 `publishTarget` 下的不同 `publishType`

同时需要检查：

- `hsdata-publish.ts` 中所有按 `publishTarget` 查询 baseline/ledger/旧批次的代码
- 相关 UI 是否需要显示 `publishType`

首轮不做：

- 单独的 `publishStreamId` 数据列
- 远端逐行发布状态表

### 4. 固定行级 baseline 的最小语义并压瘦本地持久化

为便于逐步执行，本阶段拆成以下小步：

- 4.A 固定第四步的目标结构，明确要保留什么、要删除什么
- 4.B 盘点当前结构与目标结构的差异，列出必须收敛的职责
- 4.C 固定共享 row baseline 最小语义，并删除多余抽象
- 4.D 重构本地 publish 持久化结构到单一 row baseline 模型
- 4.E 重构 `hsdata-publish.ts` 读写路径，让 diff 直接基于 row baseline，而不是绕经 batch 回放
- 4.F 明确删除状态来源约束，并补充必要注释与测试

执行要求：

- 每次只完成一个最小子步骤
- 每个子步骤完成后立即汇报并停下，等待下一步指示

本阶段新的实现原则：

- 不把当前表结构当成必须保留的前提
- 如果现有 `PublishBaseline / PublishBatch / PublishBatchRow` 分工导致语义绕行，可以为保持框架简洁而重构
- 判断标准优先看“语义是否直接、边界是否清楚、运行路径是否简单”，而不是“是否最少改表”
- 第四步目标已经固定为直接 row baseline 模型，不再保留 batch-row 回放当前态

#### 4.A 第四步目标结构固定

第四步后，`publish-owned` 的本地结构收敛为以下简化模型：

- `PublishBatch`
  - 只表达一次 publish 执行批次
  - 保存批次级元数据、范围、统计、状态与审计信息
- `PublishRowBaseline`
  - 直接表达某条 publish stream 当前已发布的行级基线与删除判断锚点
  - 每行直接保存：
    - `publishTarget + environment + publishType`
    - `tableName`
    - `rowKey`
    - `rowHash`
    - 少量审计字段

第四步额外固定一条约束：

- delete 候选不能依赖“当前快照 vs baseline 的全表 key 差集”生成
- delete 候选必须来自受控写入口、删除日志或等价增量事实
- row baseline 负责保存“上次发布过什么”和“当前删除判断锚点”，但不替代删除候选来源

第四步明确不再保留的绕行语义：

- 不再使用“`PublishBaseline` 指向某个 accepted batch，再从该 batch 的 rows 回放当前行级状态”的结构
- 不再让 `PublishBatchRow` 同时承担“执行计划事实”和“长期 row baseline 存储”两层职责

第四步后的职责边界固定为：

- batch 是 batch
- row baseline 是 row baseline
- insert / update diff 可以比较“当前快照”与“当前 row baseline”
- delete diff 必须消费受控入口产出的删除候选，而不是依赖全表扫描

本小步结论：

- 第四步的重构目标已经从“显式化现有语义”改为“收敛到更简单、但不依赖全表扫描的 row baseline 模型”

#### 4.B 当前结构与目标结构的差异盘点

当前结构与目标结构之间，已确认的主要差异如下：

- 当前 `PublishBaseline`
  - 只保存 stream 级锚点
  - 通过 `batchId` 间接引用当前已接受状态
  - 不直接保存每行 baseline
- 目标结构中的 `PublishRowBaseline`
  - 直接保存某条 stream 的每行当前 baseline
  - 不需要先跳到 batch 再回放 rows

- 当前 `PublishBatchRow`
  - 同时承担：
    - 本轮 publish 计划
    - 本轮 apply 状态
    - 长期 row baseline 物理承载
- 目标结构中的 batch row
  - 只承担一次 batch 的执行计划与执行状态
  - 不再承担长期 baseline 存储

- 当前 diff 路径
  - `loadBaselineRowHashes()`
  - 先查 `PublishBaseline`
  - 再查 baseline 指向的 `PublishBatchRow`
  - 再组装 `baselineRowHashes`
- 目标结构中的 diff 路径
  - insert / update 直接查询 `PublishRowBaseline`
  - delete 读取受控入口产出的删除候选
  - 不再有“通过 accepted batch 回放当前状态”的绕行

- 当前成功收口路径
  - 先把本轮 `PublishBatchRow` 标记成 applied/skipped
  - 再更新 `PublishBaseline.batchId`
  - 再删除旧 completed batch rows
- 目标结构中的成功收口路径
  - 先收口 batch 执行状态
  - 再直接 upsert 当前 stream 的 `PublishRowBaseline`
  - 不再依赖“保留哪一批 batch rows 才能知道当前 baseline”

基于以上差异，第四步必须收敛的职责固定为：

- 把“当前已发布行级状态”从 `PublishBatchRow` 中拆出来
- 让 batch 只表达执行，不再表达长期当前态
- 让 baseline 成为可直接读取的当前态，而不是间接引用
- 让 insert / update diff 直接依赖 row baseline，而不是 batch 回放
- 让 delete diff 依赖受控入口候选，而不是全表 key 差集
- 让 batch 清理策略不再影响当前 baseline 可读性

本小步结论：

- 当前结构真正复杂的根源不是表数量，而是“长期当前态”和“批次执行态”耦合在同一条链路上
- 第四步后续实现应优先拆开这两类职责，而不是继续围绕 batch 引用关系补语义

#### 4.D 本地持久化已收敛到单一 row baseline 模型

第四步完成后，本地 publish 持久化的职责边界固定为：

- `PublishBatch`
  - 表达一次 publish 执行批次
  - 保存批次级元数据、范围、统计、状态与审计信息
- `PublishBatchRow`
  - 只表达本轮 batch 的执行计划与执行状态
  - 不再承担长期 row baseline 存储
- `PublishBaseline`
  - 只表达 publish stream 级锚点和摘要
  - 不再承担行级状态恢复
- `PublishRowBaseline`
  - 直接保存某条 publish stream 当前已发布的 `tableName + rowKey + rowHash`
  - 作为后续 diff 的唯一行级基线来源

当前实现状态固定为：

- schema 已新增 `PublishRowBaseline`
- `hsdata-publish.ts` 读取 baseline 时只查询 `PublishRowBaseline`
- publish 成功后会直接 upsert / delete `PublishRowBaseline`
- 旧的 `PublishBaseline + PublishBatchRow` 行级回放路径已删除

本小步结论：

- 本地长期当前态已经从批次执行态中拆出
- batch 清理策略不再影响后续 publish 的 baseline 可读性
- 第四步后续无需再保留“旧路径兼容”描述

#### 4.D.4 删除检测与 publish stream 归属分离

第四步中，删除检测不再绑定某条 publish stream，也不再复用 projection 的瞬时 `deleteRows` 作为 publish-side 中间态。

固定改为两层语义：

- 删除检测层
  - 由数据库 trigger 负责
  - 只记录“哪张表的哪一行被删除了”
  - 不携带 `publishTarget / environment / publishType`
- stream 归属层
  - 由 publish plan 构建时负责
  - 按具体 stream 的 `PublishRowBaseline` 做交集
  - 只有该 stream 之前确实发布过的行，才会生成 delete plan

本小步结论：

- delete 候选不再从“当前快照 vs baseline 全量差集”推导
- delete 检测与 stream 归属彻底分离
- 同一份删除日志可被多个 publish stream 复用

#### 4.D.5 新增 stream-agnostic 删除日志表

本阶段进一步将删除专用日志收敛为统一行级变更日志。

- 在 `packages/db/src/schema/local/hearthstone/publish.ts` 新增 `PublishRowChangeLog`
- 该表保存：
  - `tableName`
  - `rowKey`
  - `operation`
    - `insert`
    - `update`
    - `delete`
  - `changedAt`
  - `sourceBuild`
  - `sourceTag`
  - `sourceRunId`
  - 基本审计字段

这张表的职责固定为：

- 承载数据库 trigger 检测到的统一行级变更事实
- 保持与 publish stream 无关
- 供后续 publish plan 在不扫全表的前提下读取候选 row key 集合

与 `PublishRowBaseline` 的分工固定为：

- `PublishRowBaseline` 表示某条 publish stream 当前已发布的行
- `PublishRowChangeLog` 表示与 stream 无关的行级变更事实日志

publish 读取统一变更日志时固定规则为：

- 读取 `changedAt >= baseline.publishedAt` 的变更日志
- 按 `tableName + rowKey` 去重，得到候选 row key 集合
- 按候选 key 回查当前本地状态
- 用“当前状态 + baseline”判定最终 `insert / update / delete`

本小步明确不做：

- 不给统一变更日志附加 stream 字段
- 不引入 `lastChangeLogId`、`cursor` 或额外顺序列
- 不直接把 trigger 记录到的 `operation` 当成最终 publish 动作
- 不生成 migration

本小步结论：

- 行级变更检测已收敛为 trigger + 统一变更日志
- publish 动作判定已收敛为“时间窗口 + 当前状态 + baseline”

#### 4.D.6 第四步实施结果

第四步当前已完成以下收口：

1. 删除专用日志已收束为统一的 `PublishRowChangeLog`
2. `PublishRowChangeLog` 的 schema、migration 与 trigger SQL 已补齐
3. `cards / entities / entity_localizations / entity_relations` 四张表都已接入 `AFTER INSERT / UPDATE / DELETE` trigger
4. publish 候选构建已全面切到 `change log + baseline`
5. 旧的 delete-only 设计残留、batch-row 回放路径和相关注释已清理
6. 本地单测已覆盖当前 `row baseline + change log` 的行级计划构建语义

#### 4.E `hsdata-publish.ts` 已改为直接基于 row baseline diff

第四步完成后，`hsdata-publish.ts` 的核心读写路径固定为：

- `loadBaselineRowHashes()`
  - 直接查询 `PublishRowBaseline`
  - 不再通过 `PublishBaseline.batchId` 回放旧 `PublishBatchRow`
- `loadCurrentRowSnapshots()`
  - 有 baseline 时，先用 `PublishRowChangeLog.changedAt >= baseline.publishedAt` 读取候选 row key
  - 再按候选 key 回查当前本地行
  - 用 baseline 叠加出当前 diff 输入
- `buildBatchRowPlans()`
  - 只根据“当前状态 + baseline row hashes”判定 `insert / update / delete / unchanged`
- `finalizePublishBatchSuccess()`
  - 更新 batch / batch row 状态
  - 直接维护 `PublishRowBaseline`
  - 同步更新 `PublishBaseline` 的 stream 级摘要

本小步结论：

- diff 已不再绕经 batch 回放
- `PublishBatchRow` 已只剩执行期职责
- 第四步要求的“直接 row baseline diff”已经达成

#### 4.F 删除状态来源约束、注释与测试

第四步完成后，删除状态来源固定为：

- 数据库 trigger 记录统一的 `PublishRowChangeLog`
- publish 只把它当作候选事实
- 最终 delete 仍由“当前状态为空 + baseline 存在”判定

当前已完成的收尾包括：

- 增加 `publish-trigger.sql` 作为 trigger 维护源文件
- 在 schema、runtime 注释与 spec 中明确 `PublishRowChangeLog` 不等于最终 publish 动作
- `hsdata-publish.test.ts` 已覆盖：
  - `insert / update / delete / unchanged` 判定
  - baseline overlay 语义
  - 空 baseline / 空 current 的边界场景
  - plan 排序与 manifest hash 稳定性

本小步结论：

- 第四步的删除来源约束已经固定
- 相关注释与单测已经补齐
- 第四步可以视为完成

### 5. 收口 `publish-owned` gate 与高风险入口

当前 `hsdata-publish.ts` 已有：

- `targetFingerprint`
- manifest hash
- sourceTag 范围
- 本地 baseline
- 远端 ledger

本阶段要把它们收口到设计里的统一 gate 语义。

需要修改或补充：

- `apps/service-desktop-runtime/src/lib/hearthstone/hsdata-publish.ts`
- `apps/service-desktop-runtime/src/lib/hearthstone/hsdata-publish-target.ts`
- `apps/service-desktop-runtime/src/index.ts`
- 相关 ORPC/runtime 调用入口

固定要求：

- 普通发布不得自动创建新的 `publish stream`，未登记的 `publishTarget + environment + publishType` 必须拒绝
- 远端必须对已登记 stream 校验 `targetFingerprint` 约束，不能只检查字段非空
- 普通发布必须显式绑定 previous baseline 摘要
- 同 generation 下 sourceTag 不得静默倒退
- 同 lineage 摘要分叉必须拒绝普通发布
- `repair / rollback / baseline_repair` 必须走显式入口，不能复用普通 publish 开关
- 时间只用于提示、日志和 lease 语义，不参与硬拒绝

若当前 runtime 还没有高风险发布入口，本阶段至少要先：

- 补共享类型和状态枚举
- 在入口层做显式预留
- 在普通 publish 中拒绝需要高风险入口处理的情况
- 为后续远端 stream allowlist / bootstrap approval 预留受控校验点

当前已完成的第 5 步收口：

- 远端新增 `PublishStreamRegistration`
  - 用于登记允许普通 publish 推进的 publish stream
  - 绑定 `publishTarget + environment + publishType`
  - 绑定唯一允许的 `targetFingerprint`
  - 通过 `normalPublishEnabled` 显式控制普通 publish 是否允许
- `hsdata-publish.ts`
  - 在任何远端行写入前先执行 stream gate
  - 未登记 stream 直接拒绝
  - `targetFingerprint` 不匹配直接拒绝
  - `previousManifestHash` 与远端当前 ledger 不一致时直接拒绝
- 当前普通 publish 语义固定为：
  - 只能推进远端已登记且允许普通 publish 的 stream
  - 不能隐式创建新 stream
  - 不能静默接管远端已变化的 baseline

本阶段同时固定一条信任模型前提：

- 当 desktop 能直接访问 remote PostgreSQL 时，数据库连接凭据不再被视为首要安全边界
- 同级可信的 desktop 终端共享同一类数据库写权限时，系统重点不再是“彻底隐藏数据库凭据”，而是：
  - 约束正常 publish 工作流
  - 降低误操作与并发冲突
  - 保留清晰的审计与运维边界
- 因此 `PublishStreamRegistration`、`targetFingerprint`、previous baseline compare-and-swap 和后续 lease 语义，首轮都按流程约束设计，而不是按零信任对抗模型设计
- 首轮不把“local 发布者身份”纳入普通 publish gate
- 当多个 local 被视为等价权威源时，首轮优先通过 stream 级 lease / lock 协调并发，而不是先引入 local 身份认证
- 若后续引入更强的 service-side 控制面，再补密钥授权、publisher identity 和更细粒度的 allowlist
- 当前 ordinary publish 的最小 lease 实现已固定为：
  - lease 状态直接挂在远端 `PublishStreamRegistration`
  - `leaseHolderId` 直接使用 `PublishBatch.id`
  - TTL 固定为 5 分钟
  - 进入远端 gate 前先抢占或续租 lease
  - 每成功完成一个 remote chunk 后续租一次
  - 完成时主动释放，异常退出时依赖 TTL 过期
  - 抢占失败或续租失败时，以明确冲突错误中止普通 publish

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

本阶段额外固定一条入口要求：

- 当同一游戏存在多个独立 publish stream（例如不同环境对应不同 remote）时，桌面端必须提供显式切换入口
- 切换的对象是 publish stream，而不是在一次 publish 中同时 fan-out 到多个 remote
- 每个 remote 继续视为独立 publish，分别维护自己的 baseline、ledger、gate 和历史
- 首轮至少支持在已配置 stream 之间明确切换，并让页面与运行时都能显示当前选中的 stream

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
