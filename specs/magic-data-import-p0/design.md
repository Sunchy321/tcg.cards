# 万智牌多源数据导入 P0 设计文档

## 1. 背景

当前仓库已经存在万智牌数据来源页面、主领域表以及基于 `__lockedPaths` / `__updations` 的人工更新机制，但还缺少一套面向万智牌的统一导入底座，用来解决以下问题：

- 同一张卡牌事实会同时来自 `gatherer`、`scryfall`、`mtgch`、`mtgjson`
- 不同来源对不同字段的可信度不同，不能按“整条记录覆盖”处理
- 纯人工逐条审批的工作量过大，但完全默认覆盖又缺少安全边界
- 现有待处理更新散落在主表 `__updations` 中，不利于统一追踪、批量审批、来源隔离与回滚
- 后续需要支持来源级配置、字段级策略、批量审批、自动应用与完整留痕

因此，P0 的目标不是直接实现全功能导入，而是先把**万智牌领域边界、字段路径体系、匹配规则、执行模式边界、审批事实来源**固定下来，为 P1 的表结构与迁移提供明确输入。

## 2. 设计目标

- 仅针对万智牌领域收口导入模型
- 固化首批来源目录、来源职责与信任分层
- 固化 6 类目标实体及其匹配边界
- 固化字段路径注册表与保留字段范围
- 固化来源字段覆盖能力与单条记录缺失语义
- 固化 `overwrite`、`ignore`、`overwrite_when_matched`、`approval_required` 的适用语义
- 固化 `auto_apply`、`batch_review`、`manual_review` 三类执行路径的准入边界
- 固化前端只读快照页的展示范围与快照生成机制，用于查看数据源、字段来源状态与导入策略
- 固化 `magic` / `magic_data` / `magic_app` 的职责划分
- 为日志冷热分层预留字段契约，但不在 P0 落地

## 3. 范围与非目标

### 3.1 P0 范围

- 仅讨论万智牌，不扩展到其他游戏
- 仅讨论以下实体：
  - `card`
  - `cardLocalization`
  - `cardPart`
  - `cardPartLocalization`
  - `print`
  - `printPart`
- 仅讨论以下来源：
  - `magic/gatherer`
  - `magic/scryfall`
  - `magic/mtgch`
  - `magic/mtgjson`
- 仅定义来源不支持字段、单条记录未提供字段、来源明确空值之间的语义差异
- 仅定义前端只读快照页的信息结构与快照生成流程，不实现动态规则编辑器
- 仅定义结构化 matcher，不允许脚本表达式
- 仅定义审批与应用链路的 authoritative 边界，不展开 UI 细节

### 3.2 非目标

- P0 不实现实际数据库迁移
- P0 不实现拉取器、标准化器或 watcher
- P0 不实现跨游戏统一审批后台
- P0 不实现对象存储、冷热分层或归档
- P0 不引入基于名称的模糊匹配
- P0 不继续扩展主表内联 `__updations` 机制

## 4. 现有万智牌模型与问题

### 4.1 当前主领域实体

当前万智牌主领域表已经较完整，核心边界如下：

- `magic.cards`：卡牌级事实，包含 `name`、`typeline`、`text`、`manaValue`、`colorIdentity`、`legalities` 等
- `magic.card_localizations`：按 `cardId + locale` 管理本地化名称、类别行与文字
- `magic.card_parts`：按 `cardId + partIndex` 管理分面/部件级事实
- `magic.card_part_localizations`：按 `cardId + partIndex + locale` 管理部件本地化事实
- `magic.prints`：按 `cardId + set + number + lang` 管理印刷版本事实
- `magic.print_parts`：按 `cardId + set + number + lang + partIndex` 管理印刷部件事实

### 4.2 当前人工更新机制

上述 6 张主表都内置了：

- `__lockedPaths`：字段锁定列表
- `__updations`：待处理更新列表

这套机制已经证明“字段级 diff + 审批”是万智牌可行方向，但也存在明显不足：

- 更新候选与主表耦合，无法按来源、规则集、导入运行批次隔离
- 批量审批能力弱，难以承接大批量低风险更新
- 自动应用与回滚链路不清晰
- 来源规则、字段规则与审批事实没有统一存储模型

因此，P0 的原则是：**保留 `__lockedPaths` 作为兼容输入，但不再把新的导入体系建立在 `__updations` 上。**

## 5. 来源目录与职责分层

### 5.1 来源目录

| 来源 ID | 定位 | 主要覆盖 | 信任级别 | P0 状态 |
|---------|------|----------|----------|----------|
| `magic/gatherer` | 官方规则来源 | 官方英文名称、类别行、规则文字、`multiverseId` 等官方印刷标识 | 高 | 启用 |
| `magic/scryfall` | 结构化综合来源 | 结构化卡牌/印刷元数据、图片 URI、外部平台 ID | 高（元数据）/中（语义字段） | 启用 |
| `magic/mtgch` | 中文本地化来源 | 中文名称、中文类别行、中文规则文字、本地化印刷信息 | 中 | 启用 |
| `magic/mtgjson` | 批量校验来源 | 大批量 JSON 快照、对账、补漏 | 中 | 只做校验与候选，不作为 P0 默认落库来源 |

### 5.2 来源职责约束

- `gatherer` 优先承接**官方规则语义**与 `multiverseId`
- `scryfall` 优先承接**结构化印刷元数据、图片、外部平台 ID**
- `mtgch` 优先承接**中文本地化内容**
- `mtgjson` 在 P0 中只允许：
  - 原始载荷留档
  - 生成 diff 候选
  - 参与对账
  - 通过显式规则开放少量字段

### 5.3 来源级默认策略

| 来源 ID | 默认策略 | 默认执行模式 | 备注 |
|---------|----------|--------------|------|
| `magic/gatherer` | `overwrite_when_matched` | `manual_review` | 仅对显式白名单字段可降到 `auto_apply` / `batch_review` |
| `magic/scryfall` | `overwrite_when_matched` | `batch_review` | 对图片、外部 ID 等低风险字段开放 `auto_apply` |
| `magic/mtgch` | `overwrite_when_matched` | `batch_review` | 主要用于本地化内容 |
| `magic/mtgjson` | `ignore` | `manual_review` | 需显式字段白名单才允许进入应用链路 |

## 6. 目标实体与匹配边界

### 6.1 目标实体

P0 仅允许导入候选落到以下 6 类实体：

| 实体类型 | 主键 |
|----------|------|
| `card` | `cardId` |
| `cardLocalization` | `cardId + locale` |
| `cardPart` | `cardId + partIndex` |
| `cardPartLocalization` | `cardId + partIndex + locale` |
| `print` | `cardId + lang + set + number` |
| `printPart` | `cardId + partIndex + lang + set + number` |

### 6.2 允许的匹配键

每类实体允许的匹配键如下：

| 实体类型 | 允许的匹配键 |
|----------|--------------|
| `card` | `cardId`、`scryfallOracleId` |
| `cardLocalization` | `cardId + locale` |
| `cardPart` | `cardId + partIndex` |
| `cardPartLocalization` | `cardId + partIndex + locale` |
| `print` | `cardId + lang + set + number`、`scryfallCardId`、`multiverseId` |
| `printPart` | `cardId + partIndex + lang + set + number` |

### 6.3 明确禁止的匹配方式

P0 明确禁止以下做法：

- 仅按英文或中文卡名模糊匹配
- 仅按 `set + number` 但缺少 `lang` 的印刷匹配
- 仅按 `oracle text`、`typeline` 等语义字段反推实体
- 一个来源记录同时匹配多个目标实体后自动落库

如来源适配后仍无法唯一匹配，应直接进入 `unmatched` 状态，而不是尝试启发式写入。

## 7. 字段路径注册表

### 7.1 命名规则

字段路径统一采用：

```text
{entityType}.{field}
```

对于映射型字段，允许注册占位符路径：

```text
card.legalities.{format}
print.scryfallImageUris.{kind}
```

### 7.2 不进入字段规则系统的字段

以下字段不进入字段规则系统：

- 所有主键字段：`cardId`、`locale`、`partIndex`、`lang`、`set`、`number`
- 所有系统字段：`__lockedPaths`、`__updations`
- `cardLocalization.__lastDate`

这些字段只能用于匹配、系统控制或审计，不允许作为普通导入覆盖目标。

### 7.3 P0 可配置字段清单

| 实体类型 | P0 字段路径 |
|----------|-------------|
| `card` | `card.partCount`、`card.name`、`card.typeline`、`card.text`、`card.manaValue`、`card.colorIdentity`、`card.keywords`、`card.counters`、`card.producibleMana`、`card.contentWarning`、`card.category`、`card.tags`、`card.legalities.{format}`、`card.scryfallOracleId` |
| `cardLocalization` | `cardLocalization.name`、`cardLocalization.typeline`、`cardLocalization.text` |
| `cardPart` | `cardPart.name`、`cardPart.typeline`、`cardPart.text`、`cardPart.cost`、`cardPart.manaValue`、`cardPart.color`、`cardPart.colorIndicator`、`cardPart.typeSuper`、`cardPart.typeMain`、`cardPart.typeSub`、`cardPart.power`、`cardPart.toughness`、`cardPart.loyalty`、`cardPart.defense`、`cardPart.handModifier`、`cardPart.lifeModifier` |
| `cardPartLocalization` | `cardPartLocalization.name`、`cardPartLocalization.typeline`、`cardPartLocalization.text` |
| `print` | `print.name`、`print.typeline`、`print.text`、`print.layout`、`print.frame`、`print.frameEffects`、`print.borderColor`、`print.cardBack`、`print.securityStamp`、`print.promoTypes`、`print.rarity`、`print.releaseDate`、`print.isDigital`、`print.isPromo`、`print.isReprint`、`print.finishes`、`print.hasHighResImage`、`print.imageStatus`、`print.fullImageType`、`print.inBooster`、`print.games`、`print.previewDate`、`print.previewSource`、`print.previewUri`、`print.printTags`、`print.scryfallOracleId`、`print.scryfallCardId`、`print.scryfallFace`、`print.scryfallImageUris.{kind}`、`print.arenaId`、`print.mtgoId`、`print.mtgoFoilId`、`print.multiverseId`、`print.tcgPlayerId`、`print.cardMarketId` |
| `printPart` | `printPart.name`、`printPart.typeline`、`printPart.text`、`printPart.attractionLights`、`printPart.flavorName`、`printPart.flavorText`、`printPart.artist`、`printPart.watermark`、`printPart.scryfallIllusId` |

### 7.4 注册表要求

P1 开始实现时，字段路径必须满足以下要求：

- 所有 `fieldPath` 都必须在注册表中存在
- 注册表需要区分“完整字段路径”与“占位符字段路径”
- 任意来源规则引用了未注册路径，配置加载即失败
- UI 展示名称、批量审批分组、自动应用白名单都必须建立在注册表上

### 7.5 来源覆盖能力与字段缺失语义

P0 明确规定：**不能用 `null` 表示“来源没有提供这个字段”。**

字段缺失必须拆成来源能力层与单条记录层两类语义。

#### 7.5.1 来源能力层

每个来源都需要声明自己对字段路径的覆盖能力：

| 覆盖状态 | 语义 | 是否参与 diff |
|----------|------|---------------|
| `supported` | 来源稳定支持该字段 | 可以参与 |
| `conditional` | 来源只在部分记录、部分语种或部分版本中提供该字段 | 仅当单条记录实际提供时参与 |
| `unsupported` | 来源不覆盖该字段 | 永不参与 |

示例：

```json
{
  "sourceId": "magic/scryfall",
  "fieldCoverage": {
    "print.scryfallImageUris.{kind}": "supported",
    "print.tcgPlayerId": "supported",
    "cardLocalization.text": "unsupported",
    "print.previewDate": "conditional"
  }
}
```

来源能力层用于回答“这个来源理论上是否会覆盖该字段”。如果字段为 `unsupported`，标准化阶段不应为它生成候选值，也不应生成 `FieldChange`。

#### 7.5.2 单条记录层

标准化后的单条记录必须为每个候选字段保留字段状态，而不是只保存 `value`：

| 字段状态 | 语义 | 处理方式 |
|----------|------|----------|
| `provided` | 来源明确提供了非空值 | 可以参与 diff |
| `explicit_null` | 来源明确声明该字段为空 | 仅当字段可空且规则允许清空时参与 diff，默认不自动应用 |
| `not_provided` | 来源理论上支持该字段，但本条记录未提供 | 不生成 `FieldChange`，只进入统计或诊断信息 |
| `not_applicable` | 该字段对本条记录不适用 | 不生成 `FieldChange` |
| `parse_failed` | 来源提供了原始值，但无法解析为目标类型 | 不生成 `FieldChange`，进入导入错误或警告日志 |

示例结构：

```ts
type NormalizedField =
  | { state: 'provided'; fieldPath: string; value: unknown }
  | { state: 'explicit_null'; fieldPath: string }
  | { state: 'not_provided'; fieldPath: string; reason?: string }
  | { state: 'not_applicable'; fieldPath: string; reason?: string }
  | { state: 'parse_failed'; fieldPath: string; rawValue: unknown; error: string };
```

#### 7.5.3 diff 生成约束

字段状态对 diff 的影响如下：

- `provided`：正常比较旧值与新值，必要时生成 `FieldChange`
- `explicit_null`：只有在目标字段允许清空、字段规则允许清空、且未被 `__lockedPaths` 锁定时，才允许生成候选变更
- `not_provided`：不生成 `FieldChange`
- `not_applicable`：不生成 `FieldChange`
- `parse_failed`：不生成 `FieldChange`，但必须记录到导入运行的警告或错误统计

因此：

- 来源不覆盖的字段不能生成“覆盖为 `null`”的候选
- 单条记录缺失字段不能进入审批队列
- 只有来源明确提供值或明确提供空值时，才可能进入字段策略评估
- `null` 只表示“来源明确声明为空”，不能表示“不知道”或“没覆盖”

## 8. 字段策略与 matcher 约束

### 8.1 策略语义

P0 固定四类字段策略：

| 策略 | 语义 |
|------|------|
| `overwrite` | 建议采用新值 |
| `ignore` | 建议忽略此次变更 |
| `overwrite_when_matched` | 仅当当前值或新值满足 matcher 时建议采用新值 |
| `approval_required` | 不给出自动应用建议，必须走人工审批 |

注意：所有候选更新都必须先生成留痕记录；`overwrite` 不等于直接写库。

### 8.2 P0 允许的 matcher

P0 第一版只允许结构化 matcher：

- `is_null`
- `is_empty_string`
- `equals`
- `in`
- `contains_any`

matcher 只允许比较：

- 标量值
- 字符串数组
- 映射字段中的单个子键值

P0 不允许：

- 任意脚本
- 跨字段表达式
- 正则表达式
- 数值范围表达式
- 基于上下文网络请求的动态判断

### 8.3 matcher 组合方式

- `currentValueMatcher` 与 `incomingValueMatcher` 都是可选项
- 同一条规则中多个 matcher 采用 `AND`
- 若 matcher 不命中，进入该规则的 `fallbackAction`
- `fallbackAction` 在 P0 只允许：
  - `ignore`
  - `manual_review`

## 9. 执行模式边界

### 9.1 总体原则

万智牌导入不采用“默认覆盖”模型，而采用：

- 低风险字段：`auto_apply`
- 中风险字段：`batch_review`
- 高风险字段：`manual_review`

所有候选都先落留痕，再根据执行模式决定是否直接应用。

### 9.2 `auto_apply` 白名单边界

P0 仅允许以下类型字段进入 `auto_apply`：

- 外部平台 ID：
  - `card.scryfallOracleId`
  - `print.scryfallCardId`
  - `print.arenaId`
  - `print.mtgoId`
  - `print.mtgoFoilId`
  - `print.tcgPlayerId`
  - `print.cardMarketId`
- 图片与预览元数据：
  - `print.scryfallImageUris.{kind}`
  - `print.previewDate`
  - `print.previewSource`
  - `print.previewUri`
  - `print.hasHighResImage`
  - `print.imageStatus`
- 官方或强标识字段在“当前为空”时的补全：
  - `print.multiverseId`

并且必须同时满足：

- 来源属于显式白名单
- 字段路径属于显式白名单
- 当前值为空或命中允许覆盖 matcher
- 目标字段未被 `__lockedPaths` 锁定

### 9.3 `batch_review` 边界

P0 默认以下字段族进入 `batch_review`：

- 本地化文本：
  - `cardLocalization.name`
  - `cardLocalization.typeline`
  - `cardLocalization.text`
  - `cardPartLocalization.name`
  - `cardPartLocalization.typeline`
  - `cardPartLocalization.text`
- 可成组审核的印刷补充信息：
  - `print.releaseDate`
  - `print.rarity`
  - `print.layout`
  - `print.frame`
  - `print.frameEffects`
  - `print.borderColor`
  - `print.securityStamp`
  - `print.promoTypes`
  - `print.finishes`
  - `print.fullImageType`
  - `print.games`
  - `print.printTags`
- 可批量审核的部件展示信息：
  - `printPart.flavorName`
  - `printPart.flavorText`
  - `printPart.artist`
  - `printPart.watermark`
  - `printPart.scryfallIllusId`
- 结构化玩法元数据：
  - `card.legalities.{format}`
  - `card.tags`
  - `card.keywords`
  - `card.counters`
  - `card.producibleMana`
  - `card.contentWarning`

批量审批分组键在 P0 必须至少包含：

- `sourceId`
- `entityType`
- `fieldPath`
- `decisionMode`
- `ruleSetId`
- `locale` 或 `lang`
- `reasonCode`

### 9.4 `manual_review` 边界

以下字段默认进入 `manual_review`：

- 所有核心语义字段：
  - `card.name`
  - `card.typeline`
  - `card.text`
  - `card.manaValue`
  - `card.colorIdentity`
  - `card.category`
  - `card.partCount`
- 所有部件结构字段：
  - `cardPart.name`
  - `cardPart.typeline`
  - `cardPart.text`
  - `cardPart.cost`
  - `cardPart.manaValue`
  - `cardPart.color`
  - `cardPart.colorIndicator`
  - `cardPart.typeSuper`
  - `cardPart.typeMain`
  - `cardPart.typeSub`
  - `cardPart.power`
  - `cardPart.toughness`
  - `cardPart.loyalty`
  - `cardPart.defense`
  - `cardPart.handModifier`
  - `cardPart.lifeModifier`
- 所有印刷正面展示语义字段：
  - `print.name`
  - `print.typeline`
  - `print.text`
  - `print.isDigital`
  - `print.isPromo`
  - `print.isReprint`
  - `print.inBooster`
- 所有明确声明为 `approval_required` 的规则

## 10. 审批事实来源与日志边界

### 10.1 authoritative 边界

P0 固定以下事实来源：

| 数据 | authoritative 表/来源 |
|------|-----------------------|
| 导入来源配置 | `magic_data.import_sources` |
| 规则集与字段规则 | `magic_data.import_rule_sets`、`magic_data.import_field_rules` |
| 导入批次与原始载荷 | `magic_data.import_runs`、`magic_data.import_raw_records` |
| 候选变更 | `magic_data.import_change_sets`、`magic_data.import_field_changes` |
| 维护审批动作 | `magic_app.import_review_actions` |
| 实际应用与回滚记录 | `magic_data.import_apply_logs` |

### 10.2 derived 字段

以下状态只作为缓存或查询加速字段，不作为事实来源：

- `import_change_sets.decisionStatus`
- `import_field_changes.decisionStatus`
- `import_change_sets.appliedAt`
- `import_field_changes.appliedAt`

它们必须由：

- `magic_app.import_review_actions`
- `magic_data.import_apply_logs`

推导或回写得到。

### 10.3 审批后日志是否保留

审批通过、忽略、驳回、override 之后，日志仍然保留，原因如下：

- 需要追溯在什么时候批准了哪类字段
- 需要支持回滚、争议复盘与来源质量评估
- 需要支持后续规则调优与批量审批命中率分析

因此，P0 结论是：**审批动作日志永久保留，状态可归档但不删除。**

## 11. 前端只读快照展示页

### 11.1 目标

P0 需要在前端提供一个**只读页面**，用于展示万智牌导入体系的配置全貌，让维护者在不运行导入、不进入审批队列的情况下确认：

- 当前有哪些数据源
- 每个数据源覆盖哪些字段
- 每个字段在不同来源下的来源状态
- 每个字段在不同来源下采用什么导入策略
- 字段最终会进入 `auto_apply`、`batch_review` 还是 `manual_review`

该页面是配置可视化页面，不是导入执行页，也不是规则编辑器。

### 11.2 页面位置

第一版建议复用现有万智牌数据源入口：

```text
apps/site-console/app/pages/magic/data-source/index.vue
```

页面可以继续以数据源卡片为入口，但需要新增字段矩阵或策略矩阵区域。

### 11.3 页面数据来源定义

该页面不是实时拼接规则表，而是读取**已发布的配置快照**。

页面数据来源必须满足：

- 不直接查询实时规则表拼装页面
- 不触发导入、审批、应用或回滚
- 不允许在页面上修改规则
- 页面只读取一个“当前生效的快照版本”
- 快照可以是编译期产物、缓存文件或数据库中的已发布快照记录

页面是只读展示层，不是配置事实源。

### 11.4 快照生成机制

快照应在“配置发布”时生成，而不是在用户打开页面时生成。

#### 11.4.1 生成时机

P0 / P1 推荐以下触发方式：

- 配置变更并通过审批后生成
- 手动执行“发布配置”后生成
- P0 初期可在构建或脚本执行时生成一次默认快照

#### 11.4.2 生成输入

快照生成时需要读取：

- 来源目录
- 规则集
- 字段规则
- 字段路径注册表
- 来源字段覆盖能力定义

P0 初期这些输入可以来自代码内默认配置；P1 开始可逐步切换到 `import_sources`、`import_rule_sets`、`import_field_rules` 等已发布配置。

#### 11.4.3 编译校验

在生成快照前，必须执行编译校验：

- `fieldPath` 必须在注册表中存在
- matcher 必须属于允许的结构化操作符
- 高风险字段不得越权进入 `auto_apply`
- `explicit_null` 只有在字段可空且规则允许时才可开放
- 来源覆盖状态与字段策略必须能互相解释，不能出现 `unsupported` 但仍声明覆盖策略的情况

若校验失败，则此次快照发布失败，不能切换为当前生效版本。

#### 11.4.4 生成输出

快照至少需要编译出以下内容：

- `version`
- `publishedAt`
- `sources`
- `fieldCoverageMatrix`
- `policyMatrix`
- `filterOptions`
- `metadata`

其中：

- `version` 建议由配置内容 hash 或发布版本号生成
- `publishedAt` 用于审计和缓存失效判断
- `metadata` 可包含生成人、来源、说明、校验摘要

#### 11.4.5 存储方式

P0 / P1 可按阶段采用不同存储方式：

- P0：仓库内 JSON / TS 快照文件
- P1：服务端缓存文件或只读 API 返回的内存快照
- P2：`magic_data.import_policy_snapshots` 中保存已发布快照，并通过只读接口分发

无论使用哪种方式，前端页面都只读取“当前生效快照”，不直接读规则事实表。

#### 11.4.6 前端读取方式

前端页面读取快照时应遵守：

- 优先读取当前生效快照
- 支持 `version` / `ETag` / 缓存控制
- 页面刷新时只拉取快照，不重新编译规则
- 不因为页面打开而触发快照重建

### 11.5 展示内容

页面至少需要展示三类信息。

#### 11.5.1 数据源总览

每个来源展示：

- 来源 ID，例如 `magic/scryfall`
- 来源名称
- 来源定位，例如官方规则来源、结构化综合来源、中文本地化来源
- 当前发布状态，例如启用、候选、只对账
- 默认策略
- 默认执行模式
- 主要覆盖字段族
- 备注或风险说明

#### 11.5.2 字段来源状态矩阵

字段矩阵以 `fieldPath` 为主轴，以来源为列，展示每个来源对字段的覆盖能力：

| 字段 | `gatherer` | `scryfall` | `mtgch` | `mtgjson` |
|------|------------|------------|---------|-----------|
| `card.name` | `supported` | `supported` | `unsupported` | `conditional` |
| `cardLocalization.text` | `unsupported` | `unsupported` | `supported` | `conditional` |
| `print.tcgPlayerId` | `unsupported` | `supported` | `unsupported` | `conditional` |

每个单元格至少展示：

- 覆盖状态：`supported`、`conditional`、`unsupported`
- 字段来源说明
- 若为 `conditional`，展示条件说明

#### 11.5.3 导入策略矩阵

策略矩阵以 `sourceId + fieldPath` 为单元，展示：

- `strategy`
- `decisionMode`
- `riskLevel`
- `currentValueMatcher`
- `incomingValueMatcher`
- `fallbackAction`
- `batchGroupBy`
- `reasonCode`
- 是否允许 `explicit_null`
- 是否受 `__lockedPaths` 硬约束

页面不需要展示真实卡牌字段值，也不需要展示某次导入运行的 diff。

### 11.6 交互要求

P0 只读快照页只需要只读交互：

- 按来源筛选
- 按实体类型筛选
- 按字段路径搜索
- 按覆盖状态筛选
- 按执行模式筛选
- 显示字段族说明与策略说明

页面不得提供：

- 规则编辑
- 导入执行
- 审批操作
- 自动应用开关
- 数据库写入操作

### 11.7 快照结构与配置模型的关系

页面展示的数据应来自一个可复用的快照结构，至少包含：

```ts
type ImportPolicySnapshot = {
  version: string;
  publishedAt: string;
  sources: {
    sourceId: string;
    name: string;
    summary: string;
    defaultStrategy: string;
    defaultDecisionMode: string;
  }[];
  policies: SourceFieldPolicyView[];
  filterOptions: {
    entityTypes: string[];
    sourceIds: string[];
    decisionModes: string[];
    coverageStates: string[];
  };
};

type SourceFieldPolicyView = {
  sourceId: string;
  entityType: string;
  fieldPath: string;
  coverage: 'supported' | 'conditional' | 'unsupported';
  strategy: 'overwrite' | 'ignore' | 'overwrite_when_matched' | 'approval_required';
  decisionMode: 'auto_apply' | 'batch_review' | 'manual_review';
  riskLevel: 'low' | 'medium' | 'high';
  matcherSummary?: string;
  fallbackAction?: 'ignore' | 'manual_review';
  allowExplicitNull: boolean;
  lockedPathAware: boolean;
  reasonCode: string;
};
```

P1 开始设计数据模型时，应尽量让：

- `import_sources`
- `import_rule_sets`
- `import_field_rules`
- `import_policy_snapshots`

与该快照结构可以互相映射。

### 11.8 验收标准

P0 的前端只读快照页达到以下标准即可：

- 能看到 4 个 P0 来源的职责、默认策略与默认执行模式
- 能按实体和字段查看来源覆盖状态
- 能看到每个来源字段组合的导入策略与执行模式
- 能明确区分 `supported`、`conditional`、`unsupported`
- 能明确看到缺失字段不会被解释为 `null`
- 页面只读取已发布快照，不会实时拼接规则
- 页面只读，不会触发任何导入或写库行为

## 12. 与现有 `__lockedPaths` / `__updations` 的衔接

### 12.1 `__lockedPaths`

`__lockedPaths` 在 P0 继续保留，并作为导入引擎的硬约束：

- 若字段路径被锁定，则任何来源都不能自动应用
- 若字段路径被锁定，则 `batch_review` / `manual_review` 也只能展示为“建议忽略”或“需要 override”
- 锁定状态读取自主表，不复制为独立事实源

### 12.2 `__updations`

`__updations` 视为旧机制遗留能力，P0 约束如下：

- 新导入链路不再向 `__updations` 写入
- 旧 UI 如仍依赖 `__updations`，只作为兼容读取
- 后续需要提供迁移或停用方案，但不属于 P0 范围

## 13. 表归属分类

根据仓库约束，新增表必须先归类到 `{game}`、`{game}_data` 或 `{game}_app`。

P0 对万智牌导入体系的分类结论如下：

### 13.1 `magic_data`

以下表属于外部来源数据、导入状态、规则与用户无关的导入留档，应归入 `magic_data`：

- `import_sources`
- `import_rule_sets`
- `import_field_rules`
- `import_policy_snapshots`
- `import_runs`
- `import_raw_records`
- `import_change_sets`
- `import_field_changes`
- `import_apply_logs`

### 13.2 `magic_app`

以下表涉及用户审批或维护动作，应归入 `magic_app`：

- `import_review_actions`

### 13.3 `magic`

以下表继续保持在 `magic` 主领域 schema：

- `cards`
- `card_localizations`
- `card_parts`
- `card_part_localizations`
- `prints`
- `print_parts`

## 14. 对 P1 的直接输入

P1 数据建模阶段必须直接采用以下 P0 结论：

- 固定来源目录与来源职责
- 固定 6 类实体与匹配键白名单
- 固定字段路径注册表
- 固定来源字段覆盖能力与单条记录字段状态
- 固定结构化 matcher 范围
- 固定 `auto_apply` / `batch_review` / `manual_review` 的准入边界
- 固定配置快照结构、生成边界与前端只读页面的读取方式
- 固定 `magic_data` / `magic_app` 的 authoritative 划分
- 固定 `__lockedPaths` 为导入硬约束、`__updations` 为兼容遗留

若 P1 想突破上述边界，必须先更新本设计文档并重新评审。

## 15. 进阶目标

P0 不实现更新日志冷热分层，但要把它作为后续明确目标保留：

- 在 `import_field_changes` 和 `import_apply_logs` 中预留：
  - `beforeValueStorageMode`
  - `afterValueStorageMode`
  - `beforeValueHash`
  - `afterValueHash`
  - `beforeValueRef`
  - `afterValueRef`
- 后续按值大小决定使用：
  - `inline`
  - `compressed_inline`
  - `object_storage_ref`
- 审批日志与应用日志长期保留，但允许：
  - 热表保留近期记录
  - 冷存储保留完整值快照
  - 热表只保存 hash、ref 与摘要

这样可以同时满足：

- 低风险自动应用减少人工工作量
- 全量留痕与可回溯
- 长期存储成本可控
