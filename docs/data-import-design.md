# 多数据源导入与审批系统设计文档

## 1. 背景

当前仓库已经具备多种数据来源、watcher 检测与部分导入能力，但缺少一套统一的数据导入设计来解决以下问题：

- 同一领域对象可能来自多个外部数据源
- 不同数据源的可信度、更新频率、字段覆盖范围并不一致
- 某些字段可以直接建议覆盖，某些字段必须保守处理
- 所有更新都需要留档，但不应全部进入逐条人工审批流程
- 不同数据源需要绑定不同的导入配置，而不是共用单一规则

本设计目标是建立一套“多源、可配置、字段级策略、全量留痕、分层执行、可回滚”的统一导入框架。

## 2. 设计目标

- 支持任意数量的数据源接入
- 支持每个数据源绑定不同的导入配置
- 支持字段级导入策略
- 所有变更都必须生成留痕记录
- 支持 `auto_apply`、`batch_review`、`manual_review` 三类执行模式
- 在保证可回溯的前提下降低低风险字段的人审工作量
- 支持人工批量审批、字段级 override 与可追溯回放

## 3. 非目标

- 第一版不追求自动解决所有冲突
- 第一版不做跨游戏统一审批后台
- 第一版不做复杂的可视化规则编辑器
- 第一版不做“全局默认覆盖”的粗暴模式
- 第一版不强制实现更新日志冷热分层，但需要在表结构上预留引用与 hash 字段

## 4. 核心概念

### 4.1 ImportSource（导入源）

表示一个可独立运行的数据来源实例，例如：

- `magic/scryfall/cards`
- `magic/gatherer/cards`
- `hearthstone/patch-notes`
- `magic/manual-csv`

一个导入源包含：

- 来源标识
- 适用游戏
- 适用实体类型
- 拉取方式或适配器类型
- 来源连接配置
- 绑定的规则集
- 是否启用

### 4.2 ImportRuleSet（规则集）

表示一组可复用的导入策略集合。规则集定义：

- 默认导入策略
- 字段级规则
- 匹配键规则
- 冲突处理优先级
- 审批要求

一个数据源通常绑定一个规则集，但未来也允许多个数据源共享同一规则集。

### 4.3 FieldPath（字段路径）

字段路径用于描述某个实体中的具体字段，例如：

- `name`
- `oracleText`
- `typeline`
- `legalities.standard`
- `images.small`
- `patch.note.title`

统一采用字符串路径表示，便于字段级配置、diff 与审批展示。

### 4.4 ImportStrategy（导入策略）

字段级策略至少支持以下四类：

- `overwrite`：建议覆盖
- `ignore`：建议忽略
- `overwrite_when_matched`：仅当当前值或新值满足指定条件时建议覆盖
- `approval_required`：必须人工明确审批

注意：本设计中“建议覆盖”不代表直接写库，只代表系统给出的建议动作。所有变更仍然会进入待审批状态。

### 4.5 ChangeSet（变更集）

表示某次导入运行针对某个目标实体生成的一组字段变更集合。

例如：

- 目标实体：`card:lightning_bolt`
- 来源：`magic/scryfall/cards`
- 包含字段变更：
  - `name`
  - `oracleText`
  - `legalities.standard`

### 4.6 FieldChange（字段变更）

表示一个字段上的原值、新值、命中规则、建议动作与审批结果。

它是审批的最小粒度。

### 4.7 ReviewAction（审批动作）

表示审批人对字段变更或变更集执行的动作，例如：

- `approve_apply`
- `approve_ignore`
- `reject`
- `override_apply`
- `override_ignore`

### 4.8 DecisionMode（执行模式）

执行模式决定一条字段变更如何从“已留痕”走向“是否落库”。

- `auto_apply`：低风险变更，先留痕，再自动应用，且必须可回滚
- `batch_review`：中风险变更，进入批量审批队列，允许按来源 / 字段 / 规则分组过审
- `manual_review`：高风险变更，必须逐条人工审批

执行模式与字段策略解耦：

- 字段策略决定“系统建议动作”
- 执行模式决定“系统走哪条执行路径”

## 5. 总体架构

### 5.1 链路概览

```text
数据源适配器
  -> 原始载荷入库
  -> 标准化记录
  -> 实体匹配
  -> 字段级 diff
  -> 规则评估
  -> 生成变更集与执行模式
  -> 自动应用 / 批量审批 / 人工审批
  -> 应用服务写入主表
  -> 应用日志与回滚链路
```

### 5.2 核心原则

- 数据源只负责提供事实候选，不直接改主表
- 导入服务只生成“候选变更”，不直接提交最终事实
- 所有更新都必须先落留痕记录，再决定自动应用、批量审批或人工审批
- 主领域表只能由“自动应用服务”或“审批后应用服务”写入
- 任意一次更新都必须保留原始来源、规则命中、执行模式、审批记录与最终应用日志
- 自动应用必须提供可回滚能力，不能只有前向写入

## 6. 配置模型

### 6.1 数据源级配置

每个 `ImportSource` 需要支持以下配置：

- `game`
- `entityType`
- `adapterType`
- `fetchConfig`
- `normalizeConfig`
- `matchConfig`
- `ruleSetId`
- `priority`
- `enabled`

其中：

- `fetchConfig` 用于描述 URL、认证、分页、节流等来源特化参数
- `normalizeConfig` 用于来源字段到标准字段的映射
- `matchConfig` 用于匹配目标实体，如 `cardId`、`oracleId`、`dbfId`

### 6.2 规则集级配置

规则集需要至少支持：

- 默认动作
- 默认执行模式
- 字段规则列表
- 字段规则优先级
- 冲突回退动作
- 是否允许批量审批
- 是否允许自动应用

### 6.3 字段级规则

字段级规则建议包含：

- `entityType`
- `fieldPath`
- `strategy`
- `decisionMode`
- `riskLevel`
- `currentValueMatcher`
- `incomingValueMatcher`
- `fallbackAction`
- `batchGroupBy`
- `priority`
- `reasonTemplate`

#### 6.3.1 `overwrite`

语义：

- 命中后建议采用新值
- 若执行模式为 `auto_apply`，则在留痕后自动应用
- 若执行模式为 `batch_review` / `manual_review`，则审批页默认勾选“建议应用”

#### 6.3.2 `ignore`

语义：

- 命中后建议忽略此次变更
- 仍然保留留痕记录
- 若执行模式为 `auto_apply`，则自动归档为 ignored，不写主表
- 若执行模式为 `batch_review` / `manual_review`，则审批页默认勾选“建议忽略”

#### 6.3.3 `overwrite_when_matched`

语义：

- 仅当当前值或新值满足匹配器条件时，建议应用
- 若条件不满足，则走 `fallbackAction`
- 典型情况下，低风险补空值可以配合 `auto_apply`
- 中风险条件覆盖可以配合 `batch_review`

典型场景：

- 仅当当前值是 `null`、空串、`unknown` 时允许覆盖
- 仅当新值来自白名单枚举时允许覆盖
- 仅当当前图片字段为空时允许补写图片 URL

#### 6.3.4 `approval_required`

语义：

- 强制进入人工审批
- 不给出可自动采纳的建议动作
- 不允许 `auto_apply`
- 默认走 `manual_review`

典型场景：

- 卡牌名
- 正文规则文本
- 关键比赛规则字段
- 可能影响公开展示的富文本内容

## 7. 所有更新必须留档，但不要求全部人工逐条审批

这是本设计的硬约束。变化在于：所有更新都必须先留痕，但后续执行路径由风险分层决定，而不是全部走逐条人工审批。

### 7.1 留档范围

每次导入必须至少留下：

- 原始来源信息
- 原始载荷摘要或引用
- 标准化后的记录
- 匹配到的目标实体
- 字段级 old/new diff
- 命中的规则
- 建议动作
- 执行模式
- 审批结果
- 最终应用结果

### 7.2 执行模式语义

所有字段变更在生成时至少进入 `recorded` 状态。

随后根据执行模式进入不同路径：

- `auto_apply`：记录完成后直接进入应用服务
- `batch_review`：进入批量审批队列
- `manual_review`：进入逐条审批队列

规则与执行模式各自负责：

- 规则决定系统建议动作
- 执行模式决定是否自动应用、批量审批或逐条审批

### 7.3 风险分层建议

建议采用三层模型：

- 低风险字段：`auto_apply`
- 中风险字段：`batch_review`
- 高风险字段：`manual_review`

示例：

- `images.*`、外部 ID、空值补写字段：优先考虑 `auto_apply`
- `artist`、`flavorText`、部分 legality：优先考虑 `batch_review`
- `name`、`oracleText`、规则正文：固定 `manual_review`

## 8. 数据模型建议

### 8.1 放置原则

根据仓库约定：

- 外部来源、导入配置、导入任务、静态数据维护动作、待审批变更属于 `*_data`
- 只有用户创建、用户行为、用户设置等应用态数据才属于 `*_app`

因此建议拆分如下。

### 8.2 `*_data` 表

#### 8.2.1 `import_sources`

记录数据源定义。

建议字段：

- `id`
- `game`
- `entityType`
- `name`
- `adapterType`
- `fetchConfig`
- `normalizeConfig`
- `matchConfig`
- `ruleSetId`
- `priority`
- `enabled`
- `createdAt`
- `updatedAt`

#### 8.2.2 `import_rule_sets`

记录规则集。

建议字段：

- `id`
- `name`
- `description`
- `defaultAction`
- `defaultDecisionMode`
- `allowBatchApprove`
- `allowAutoApply`
- `config`
- `createdAt`
- `updatedAt`

#### 8.2.3 `import_field_rules`

记录字段级规则。

建议字段：

- `id`
- `ruleSetId`
- `entityType`
- `fieldPath`
- `strategy`
- `decisionMode`
- `riskLevel`
- `currentValueMatcher`
- `incomingValueMatcher`
- `fallbackAction`
- `batchGroupBy`
- `priority`
- `enabled`

#### 8.2.4 `import_runs`

记录每次导入运行。

建议字段：

- `id`
- `sourceId`
- `triggerType`
- `status`
- `startedAt`
- `finishedAt`
- `summary`
- `error`

#### 8.2.5 `import_raw_records`

记录原始来源载荷或其引用。

建议字段：

- `id`
- `runId`
- `externalKey`
- `payload`
- `payloadHash`
- `fetchedAt`

#### 8.2.6 `import_change_sets`

记录实体级变更集。

建议字段：

- `id`
- `runId`
- `sourceId`
- `entityType`
- `targetKey`
- `status`
- `suggestedAction`
- `decisionMode`
- `batchKey`
- `requiresManualReview`
- `createdAt`

#### 8.2.7 `import_field_changes`

记录字段级变更。

建议字段：

- `id`
- `changeSetId`
- `fieldPath`
- `oldValue`
- `newValue`
- `ruleId`
- `strategy`
- `suggestedAction`
- `decisionMode`
- `riskLevel`
- `batchGroupKey`
- `decisionStatus`
- `decisionSource`
- `createdAt`

#### 8.2.8 `import_apply_logs`

记录自动应用或审批通过后真正写入主表的动作。

建议字段：

- `id`
- `changeSetId`
- `fieldChangeId`
- `targetTable`
- `targetKey`
- `fieldPath`
- `beforeValueInline`
- `afterValueInline`
- `beforeValueHash`
- `afterValueHash`
- `beforeValueRef`
- `afterValueRef`
- `valueStorageMode`
- `applyMode`
- `revertedAt`
- `revertReason`
- `appliedAt`

#### 8.2.9 `import_review_actions`

记录静态数据维护过程中的审批与 override 动作。

建议字段：

- `id`
- `changeSetId`
- `fieldChangeId`
- `scopeType`
- `scopeKey`
- `action`
- `reviewerId`
- `reason`
- `overrideValue`
- `createdAt`

这个表建议放在 `*_app`，因为它记录的是审批人或维护人的动作事实，天然包含用户语义；若后续需要沉淀用户无关的投影状态，应额外投影到 `*_data`。

## 9. 执行与审批工作流

### 9.1 生成阶段

导入服务完成 diff 后：

- 为每个目标实体生成 `changeSet`
- 为每个变更字段生成 `fieldChange`
- 为每个字段计算 `decisionMode`
- 全部先写留痕记录，再进入后续执行路径

### 9.2 自动应用阶段

若执行模式为 `auto_apply`：

- 先写 `import_apply_logs`
- 再事务更新主领域表
- 最后回写 `fieldChange.decisionStatus = applied`

自动应用的前提：

- 来源可信度足够高
- 字段风险足够低
- 规则边界足够明确

### 9.3 批量审批阶段

若执行模式为 `batch_review`：

- 进入批量审批队列
- 审批人按 `source + entityType + fieldPath + strategy + batchGroupKey` 分组处理
- 同一次批量动作必须为每条命中的 `fieldChange` 留下审批记录

### 9.4 人工逐条审批阶段

若执行模式为 `manual_review`：

- 审批人逐条处理字段变更或变更集
- 允许字段级 override
- 高风险字段不得通过批量“全选通过”绕过逐条确认

### 9.5 应用阶段

只有自动应用成功的变更，以及审批通过的字段变更，才可以进入应用服务。

应用服务职责：

- 以事务方式写入主领域表
- 写入 `import_apply_logs`
- 回写 `fieldChange.decisionStatus = applied`
- 回写 `changeSet.status`

### 9.6 拒绝与忽略

若审批结果为忽略或拒绝：

- 不改主表
- 保留变更记录
- 记录审批理由

### 9.7 回滚

任何自动应用或审批后应用的变更，都必须支持按 `apply_log` 回滚。

回滚要求：

- 能按 `runId`、`changeSetId`、`fieldChangeId` 定位
- 能通过 `beforeValueInline` 或 `beforeValueRef` 恢复旧值
- 能记录回滚动作、回滚原因与回滚时间

## 10. 更新日志存储与归档进阶目标

更新日志必须保存，但不应把所有大字段永久塞进主库热表。建议采用“热索引 + 冷内容 + hash 校验 + 可归档”的分层模型。

### 10.1 热表职责

`import_apply_logs` 热表主要保存：

- 关联键：`runId`、`changeSetId`、`fieldChangeId`、`reviewActionId`
- 目标定位：`targetTable`、`targetKey`、`fieldPath`
- 值摘要：`beforeValueHash`、`afterValueHash`
- 值引用：`beforeValueRef`、`afterValueRef`
- 小值内联：`beforeValueInline`、`afterValueInline`
- 应用状态：`applyMode`、`status`、`appliedAt`、`revertedAt`

热表优先服务近期查询、审计列表、状态排查和回滚定位。

### 10.2 冷内容职责

长文本、大 JSON、原始 payload 等大内容可以转存到对象存储，例如 R2 或 S3。

数据库只保留：

- 内容 hash
- 对象存储引用
- 内容存储模式
- 必要的查询索引

示例路径：

```text
import-logs/{game}/{yyyy}/{mm}/{runId}/{fieldChangeId}/before.json
import-logs/{game}/{yyyy}/{mm}/{runId}/{fieldChangeId}/after.json
```

### 10.3 内联阈值建议

建议按值大小选择存储方式：

- 小于 1KB：直接写入 `beforeValueInline` / `afterValueInline`
- 1KB 到 32KB：可以压缩后内联，或按来源配置转冷存储
- 大于 32KB：只保留 hash 与对象存储引用

阈值可以在规则集或系统配置中调整。

### 10.4 保留策略

建议按阶段实现：

- 第一版：保留 hash / ref 字段，仍可先以内联为主
- 进阶版：接入对象存储，自动分流大字段
- 成熟版：按时间分区或按月份归档 `import_apply_logs`

可选保留策略：

- 热表保留近期 90 到 180 天的高频查询索引
- 冷存储保留 1 到 3 年完整内容
- 长期只保留 hash、来源、审批、最终状态和回滚状态

### 10.5 分区建议

如果导入频率高，`import_apply_logs` 建议按 `appliedAt` 做 PostgreSQL 分区。

示例：

- `import_apply_logs_2026_04`
- `import_apply_logs_2026_05`

这样可以降低近期查询成本，并简化历史归档。

## 11. 不同来源不同配置

本设计要求“来源实例”和“规则集”解耦，但允许一对一绑定。

示例：

### 11.1 `magic/scryfall/cards`

建议策略：

- `name`：`approval_required + manual_review`
- `oracleText`：`approval_required + manual_review`
- `images.*`：`overwrite_when_matched + auto_apply`，仅当当前值为空
- `legalities.*`：`overwrite + batch_review`
- `artist`：`overwrite_when_matched + batch_review`，仅覆盖空值

### 11.2 `magic/gatherer/cards`

建议策略：

- `name`：`ignore + manual_review`
- `oracleText`：`ignore + manual_review`
- `flavorText`：`approval_required + batch_review`
- `multiverseId`：`overwrite + auto_apply`
- `images.*`：`overwrite + batch_review`

这说明两个来源即使都导入卡牌，也可以采用完全不同的字段策略。

## 12. 冲突处理

### 12.1 同一字段来自多个来源

建议采用以下规则：

- 先按来源优先级排序
- 再按规则建议动作排序
- 最后按执行模式进入自动应用、批量审批或逐条审批路径

### 12.2 高优先级不代表直接生效

高优先级来源只影响建议排序，不影响高风险字段必须走 `manual_review` 的原则。

## 13. 风险

### 13.1 字段路径配置过于自由

风险：

- 配错路径后规则失效

建议：

- 字段路径需要可枚举、可校验
- 后续增加字段路径注册表

### 13.2 默认自动应用范围过大

风险：

- 低风险边界划错后会错误覆盖主表

建议：

- `auto_apply` 只允许用于低风险字段
- 第一版默认白名单启用，而不是全局开启
- 必须优先补齐回滚链路

### 13.3 变更量过大导致审批堆积

风险：

- 高频来源可能制造大量待审批项

建议：

- 支持按来源、字段、策略批量审批
- 支持相同规则命中的批处理

### 13.4 批量审批分组过粗

风险：

- 可能把不该一起批准的变更混到同一组里

建议：

- 批量审批必须按来源、字段路径、策略、matcher 原因等稳定维度分组
- 高风险字段禁止进入批量审批

### 13.5 留档过细带来存储膨胀

风险：

- 原始载荷和字段变更记录会快速增长

建议：

- 第一版预留 hash、ref 与 storage mode 字段
- 进阶版接入对象存储，只在热表中保留引用与 hash
- 成熟版引入分区、归档和保留策略

### 13.6 规则与审批事实来源混乱

风险：

- 建议动作与最终审批动作混淆

建议：

- 明确 `suggestedAction` 只表示系统建议
- 明确 `decisionStatus` 只是派生状态，`import_review_actions` 与 `import_apply_logs` 才是静态数据维护决策事实来源

## 14. 建议实施顺序

1. 先实现来源定义、规则集与字段规则
2. 再实现导入运行、原始载荷与标准化记录
3. 再实现 diff、变更集、执行模式与字段变更
4. 然后实现自动应用、批量审批、逐条审批与应用日志
5. 最后接入来源适配器、批量审批工具与回滚服务
