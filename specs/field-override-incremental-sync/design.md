# 通用字段 commit 合并同步设计（以 hearthstone tag 为首轮）

> 稳定的运行时边界、数据归属和同步规则以 [../../docs/project-architecture.zh-CN.md](../../docs/project-architecture.zh-CN.md) 为准。本文描述一套可复用的字段 `commit / merge / projection` 同步方案，并以 hearthstone tag 作为首轮落地对象；若有冲突，以主架构文档为准。

## 背景

当前 `hearthstone.tags` 同时承担了：

- hsdata 导入发现事实
- 人工维护的解析、规范化和投影配置
- `app` / `site` 的共同编辑对象

未来卡牌数据也会出现同类问题：

- 先通过导入批量写入主表
- 再由管理员手动修正部分错误字段
- 后续继续导入时，既不能丢失人工修正，也不能完全停止接收新导入值

上一版最简方案已经收敛出两个正确方向：

- `tags` 不必首轮拆表
- 主表继续保存当前有效值，字段当前 winner 通过通用 `field_winners` 表表达

但如果系统后续需要真正支持：

- desktop 本地先改再同步
- site 远端直接改
- 双端离线后增量补发
- 双端高频并发编辑同一字段
- 显式记录同步冲突
- 远端直接完成编辑、审批和落实

只同步“主表当前值 + 当前 winner 投影”会很快不够用。

因此本轮在保留“主表 + winner projection”作为当前态模型的同时，正式补上一层通用同步过程表。

## 目标

- 不拆 `hearthstone.tags` 主表
- 继续使用通用 `field_winners` 表保存当前 winner projection
- 新增一套可复用的通用同步过程表，而不是 tag 专用表
- 让 desktop 可以本地先生成 `commit`，再通过 `push` 异步同步远端
- 让 site 可以直接写远端共享 `commit history`，再由 desktop 通过 `pull` 拉取增量
- 让远端可以直接完成人工编辑、审批、冲突解决和当前态落实，而不依赖本地在线参与
- 为未来 `magic.cards` 一类卡牌主领域对象复用同一套同步基础设施

## 非目标

- 不在首轮引入每个对象各自的 `current` 表
- 不在首轮把所有同步事件都做成完整业务审计系统
- 不在首轮实现复杂自动合并策略
- 不在首轮改造公开站点读模型

## 核心方案

## 1. 当前态继续采用“主表 + winner projection”

本轮不推翻最简方案的当前态设计。

### 1.1 主表保存当前有效值

业务主表继续保存运行时真正使用的 effective value。

对 `hearthstone.tags` 来说，以下字段继续保留在主表中：

- `rawName`
- `rawType`
- `rawNames`
- `slug`
- `name`
- `valueKind`
- `normalize*`
- `project*`
- `status`
- `description`

对未来复杂人工修正场景，同样原则首先适用于卡牌主领域表，例如：

- `magic.cards`

这类主领域表继续保存当前实际使用的值，不额外引入整表镜像式 `current` 表。

这里特意不把未来复杂更新的主对象写成 `hearthstone.entities`。`entity` 仍然应被视为单一来源，或在未来受控扩展到少量来源，但这些来源之间不应形成人工冲突主战场。

### 1.2 通用 winner 表保存当前胜出来源

保留并正式采用通用表：

- `hearthstone_data.field_winners`

它不再被视为独立于 `commit history` 的真源，而是保存“当前哪个字段由哪个 source 胜出”的投影视图。它不保存完整对象当前态，只保存：

- 某个对象的某个字段当前由哪个 source 胜出
- 当前 winner value 是什么
- 这条 winner 记录是否仍然有效

建议字段：

- `id`
- `entityType`
- `entityKey`
- `fieldPath`
- `winnerValue`
- `winnerSource`
- `status`
- `sourceRuntime`
- `updatedBy`
- `baseRevision`
- `updatedAt`
- `clearedAt`

其中：

- `entityType` 例如 `tag`、`magicCard`
- `entityKey` 使用结构化 JSON，保存定位对象所需主键
- `fieldPath` 例如 `tag.slug`、`tag.projectKind`、`magic.card.cost`
- `status` 第一版建议支持 `active`、`cleared`
- `winnerSource` 记录当前胜出来源，例如 `manual:site`、`auto:gatherer`
- `baseRevision` 记录当前 winner 建立在哪一版 `resolved base` 之上

### 1.3 `field_winners` 最小 schema 约束

为避免这张表在实现阶段继续膨胀，本轮固定以下最小结构约束。

#### 1.3.1 列约束

- `id`
  - UUID 主键
- `entityType`
  - `text not null`
  - 首轮允许值至少包含 `tag`
  - 预留未来值：`magicCard`
- `entityKey`
  - `jsonb not null`
  - 使用稳定、可比较、无多余字段的结构化主键对象
- `fieldPath`
  - `text not null`
- `winnerValue`
  - `jsonb`
  - 当 `status = active` 时必须有值
  - 当 `status = cleared` 时允许为 `null`
- `winnerSource`
  - `text`
  - 当 `status = active` 时必须有值
  - 当 `status = cleared` 时允许为 `null`
- `status`
  - `text not null`
  - 第一版固定为 `active | cleared`
- `sourceRuntime`
  - `text not null`
  - 第一版固定为 `desktop | site | system`
- `updatedBy`
  - `text`
  - 首轮可为空，用于后续接入用户身份或系统身份
- `baseRevision`
  - `text not null`
  - 记录该 winner 建立时对应的 `resolved base revision`
- `updatedAt`
  - `timestamp not null`
- `clearedAt`
  - `timestamp`
  - 仅在 `status = cleared` 时非空

#### 1.3.2 `entityKey` 规范

`entityKey` 必须采用“按对象类型固定字段集合”的规范，不允许把临时上下文或展示字段塞进去。

首轮先固定：

- `tag`
  - `{ "enumId": number }`

未来预留但不在首轮实现：

- `magicCard`
  - `{ "cardId": string }`

同一 `entityType` 下，`entityKey` 的 JSON 序列化必须稳定，避免唯一键和比较逻辑受键顺序影响。

#### 1.3.3 活跃 winner 唯一键

本轮要求“同一个对象的同一个字段，在同一时刻最多只有一条活跃 winner 记录”。

因此需要固定唯一约束语义：

- `entityType + entityKey + fieldPath + status(active)`

实现上可采用：

- 部分唯一索引：仅对 `status = 'active'` 生效

这样可以同时满足：

- 当前态只有一条活跃 winner
- 历史清除记录仍可保留

#### 1.3.4 查询索引

本轮最少固定以下索引：

- `(entityType, entityKey, fieldPath)`
  - 用于读取单字段当前 winner
- `(entityType, entityKey, status)`
  - 用于读取某对象全部活跃 winner
- `(entityType, fieldPath, status)`
  - 用于导入或批量检查某类字段当前 winner source
- `(updatedAt)`
  - 用于后续排查和增量辅助查询

#### 1.3.5 状态一致性约束

为避免“状态改了但值没有同步收敛”，本轮应固定以下一致性规则：

- `status = active`
  - `winnerValue is not null`
  - `winnerSource is not null`
  - `clearedAt is null`
- `status = cleared`
  - `clearedAt is not null`

是否要求 `winnerValue` 在 `cleared` 时强制清空，可在实现阶段决定；首轮更建议保留最后一次胜出值，便于审计和回显。

## 2. 多来源基础值决策层先于 winner 计算

`field_winners` 与增量同步并不负责解决自动来源之间的权威竞争。自动来源先收敛为 `resolved base`，再与其他来源一起参与统一 merge，并计算当前 winner。

对于 `magic.cards` 这类对象，系统实际需要先解决的是：

- `scryfall`
- `gatherer`
- `mtgch`

之间对同一字段候选值的取舍问题。

因此本轮明确增加一个前置层：

- 多来源基础值决策层

它位于：

- 来源原始数据 / 标准化记录
- 与主表当前值、winner、同步过程

之间。

### 2.1 责任边界

多来源基础值决策层负责：

- 判断某个 `sourceId + fieldPath` 是否有资格参与该字段的基础值决策
- 根据来源职责、字段规则和匹配条件，生成该字段的候选 base 值
- 当多个来源都能提供候选值时，决定是否能收敛为唯一 `resolved base`
- 若不能收敛，则将该字段送入 `batch_review` 或 `manual_review`

它不负责：

- 各来源之间的最终 winner 计算
- app/site/desktop 之间的同步传播
- 双端并发编辑冲突

这三个问题分别属于：

- source merge 层
- 同步过程层

### 2.2 决策单位是 `sourceId + fieldPath`

对 `magic.cards` 来说，不存在“整张表由某个来源权威”的简单规则。

真正的决策单位应是：

- `sourceId + entityType + fieldPath`

例如：

- `magic/gatherer + card + card.text`
- `magic/scryfall + print + print.artist`
- `magic/mtgch + cardLocalization + cardLocalization.text`

也就是说：

- 一个来源是否可信
- 是否支持某个字段
- 是否允许覆盖当前基础值
- 是否只能在特定 matcher 条件下参与

都必须是字段级配置，而不是表级配置。

这与当前仓库已经存在的导入设计方向一致，应继续复用：

- `import_sources`
- `import_rule_sets`
- `import_field_rules`

### 2.3 主表中的自动值先收敛为 `resolved base`

在没有更高优先级来源胜出的前提下，主表中的自动写入值不应理解为“来自某个单一来源”，而应理解为：

- 多来源规则决策后的 `resolved base`

例如：

- `magic.cards.name` 可能最终来自 `gatherer`
- `magic.cards.artist` 可能最终来自 `scryfall`
- `magic.card_localizations.name[zhs]` 可能最终来自 `mtgch`

因此当前方案中的主表语义进一步明确为：

- 主表保存当前 effective value
- 如果某字段当前 winner 来自自动来源集合，则该 effective value 等于 `resolved base`
- 如果某字段当前 winner 来自其他高优先级来源，则该 effective value 等于该 winner value

### 2.4 不能确定唯一 base 时不得静默写主表

当多个来源对同一字段提供不同候选值，而规则层无法稳定决定唯一赢家时：

- 不得静默覆盖主表
- 不得直接进入 winner 计算或同步层
- 必须进入 `batch_review` 或 `manual_review`

只有两种情况允许继续进入主表：

- 规则层能确定唯一 `resolved base`
- 或人工 review 已明确选择其中一个候选值作为基础值

这意味着 source merge 层看到的永远不是“多个自动来源正在打架”的中间状态，而是：

- 已经决策完成的基础值
- 或明确被阻塞等待 review 的字段

### 2.5 `baseRevision` 指向的是 `resolved base revision`

本提案中的 `baseRevision` 需要进一步明确。

它不是：

- 某个单一来源的原始版本号

而是：

- 多来源规则决策完成后，这个字段当前基础值对应的 `resolved base revision`

因此一条 winner 记录的真实含义是：

- “在某个已决策完成的基础值版本之上，某个 source 当前在 merge 中胜出”

当后续来源重新导入并导致 `resolved base` 变化时：

- 若该字段当前 winner 仍来自自动来源集合，主表可直接更新为新的 `resolved base`
- 若该字段当前 winner 来自更高优先级来源，则系统应知道这条 winner 建立在旧的 `resolved base revision` 之上

这样后续才能判断：

- 保持当前 winner 继续胜出
- 提示 base 漂移
- 或要求人工重新确认

#### 2.5.1 revision 单位固定为“单字段”

`resolved base revision` 第一版固定为：

- 按 `entityType + entityKey + fieldPath` 单独生成

不按整对象、整行或整表生成。

原因是当前 merge、winner 和冲突处理本身就是字段级的：

- 当前 winner 是字段级
- `base_drift` 是字段级
- 远端 `commit` 也是字段级

如果把 revision 做成整对象粒度，会导致：

- 某个无关字段变化也会使全部字段的 `baseRevision` 一起抖动
- 本地 replay 与远端 merge 更容易出现无意义冲突

#### 2.5.2 revision 输入固定为“当前胜出基础值的决策指纹”

每个字段的 `resolved base revision` 应由以下信息生成稳定指纹：

- `entityType`
- `entityKey`
- `fieldPath`
- `resolvedBaseValue`
- `resolvedSource`
- `resolutionMode`
  - 例如 `rule_auto`、`manual_review`
- `resolutionFingerprint`

其中：

- `resolvedBaseValue`
  - 当前字段自动来源层最终收敛出的基础值
- `resolvedSource`
  - 当前基础值最终来自哪个 source
- `resolutionMode`
  - 当前基础值是规则自动选出，还是人工 review 选出
- `resolutionFingerprint`
  - 用于表达“为什么是这个 source 赢”
  - 自动规则场景下，至少应包含：
    - 规则集版本
    - 命中的字段规则标识
    - 影响本字段选取结果的 matcher 指纹
  - 人工 review 场景下，至少应包含：
    - review 决议标识
    - 决议版本

第一版不要求把所有落败候选都编码进 revision。  
只要求 revision 能稳定表达“当前这个 `resolved base` 为什么成立”。

#### 2.5.3 revision 变化规则

第一版固定以下变化规则。

以下任一变化发生时，必须生成新的 `resolved base revision`：

- `resolvedBaseValue` 变化
- `resolvedSource` 变化
- `resolutionMode` 变化
- `resolutionFingerprint` 变化

因此：

- 相同值但来源变化时：
  - `revision` 必须变化
- 相同来源但规则变化时：
  - 只要影响最终决策指纹，`revision` 必须变化
- 相同来源、相同值、相同决策指纹时：
  - `revision` 不变化

这条规则的含义是：

- `revision` 跟踪的是“当前基础值及其成立原因”
- 不是单纯跟踪“值文本是否变化”

#### 2.5.4 revision 比较规则

第一版比较口径固定为：

- 直接比较完整 revision 字符串是否相等

也就是说：

- `baseRevisionA == baseRevisionB`
  - 视为建立在同一版 `resolved base` 之上
- `baseRevisionA != baseRevisionB`
  - 视为基础值上下文已经变化

第一版不引入：

- revision 偏序
- revision 包含关系比较
- 字段级三方自动合并

所有“不相等”的情况都先视为：

- 需要继续按 merge 规则判断
- 或进入 `base_drift` / replay 冲突处理

#### 2.5.5 tag 首轮落地口径

对首轮的 `hearthstone tag`，允许用更简单的实现近似上述语义：

- 仍按字段生成 `resolved base revision`
- `resolvedSource` 首轮可固定为当前实际生效的自动来源标识
- `resolutionMode` 首轮通常固定为 `rule_auto`
- `resolutionFingerprint` 首轮可简化为：
  - 导入链路版本
  - 发现规则版本
  - 该字段值的稳定摘要

### 2.6 直接复用现有导入规则模型，不再新建第二套来源规则

本提案对“多来源基础值决策输入”的结论是：

- 直接复用现有的 `import_sources`
- 直接复用现有的 `import_rule_sets`
- 直接复用现有的 `import_field_rules`
- 不再为字段同步方案额外设计一套平行的 `source_rules` / `base_rules` / `priority_rules`

三者在本提案中的责任分别固定为：

- `import_sources`
  - 定义 `sourceId`
  - 定义来源启用状态、可信度、默认策略与默认执行模式
  - 定义该来源在解释层面的职责说明
- `import_rule_sets`
  - 定义当前发布的规则版本
  - 为 `resolved base revision` 提供稳定的规则版本输入
- `import_field_rules`
  - 定义字段级参与资格
  - 定义字段级 matcher、策略、决策模式、优先级与空值处理规则

本提案首轮只复用这三张表表达“来源规则输入”，不把以下对象混入字段同步基础设施：

- `import_change_sets`
- `import_field_changes`
- `import_review_actions`
- `import_apply_logs`

这些对象属于导入批次、审批与应用留档层，不等价于通用字段 `commit history`。

### 2.7 `resolved base` 的最小输入合同

进入多来源基础值决策层的每个候选值，第一版至少要能回答以下问题：

- 它来自哪个 `sourceId`
- 它命中了哪个已发布 `ruleSet`
- 它命中了哪个 `fieldRule`
- 它是否真的有资格参与该字段的 base 决策
- 它若胜出，应以什么 `decisionMode` 落地

因此，第一版固定最小输入合同如下。

#### 2.7.1 `import_sources` 提供来源身份与默认语义

`import_sources` 至少提供：

- `sourceId`
- `status`
- `trustLevel`
- `defaultStrategy`
- `defaultDecisionMode`
- `role`

它解决的问题是：

- 这个来源是否整体可用
- 当字段规则没有显式收紧时，该来源默认按什么方式参与

#### 2.7.2 `import_rule_sets` 提供发布边界

`import_rule_sets` 至少提供：

- `id`
- `version`
- `status`
- `snapshotHash`

它解决的问题是：

- 当前基础值决策建立在哪个发布版本之上
- 同样的来源输入在不同规则版本下为何会得到不同 `resolved base revision`

第一版要求每次 `resolved base` 决策都绑定一个明确的发布规则集版本，不允许“按当前数据库里碰巧存在的规则实时拼接”。

#### 2.7.3 `import_field_rules` 提供字段级资格与优先级

`import_field_rules` 至少提供：

- `sourceId`
- `entityType`
- `fieldPath`
- `coverage`
- `strategy`
- `decisionMode`
- `reasonCode`
- `priority`
- `enabled`
- `allowExplicitNull`
- `lockedPathAware`
- `matcherSummary`
- `fallbackAction`

它解决的问题是：

- 该来源是否支持这个字段
- 该字段是直接忽略、自动应用，还是必须进入 review
- 当多个自动来源都能提供候选值时，哪个来源在规则层更优先

其中：

- `priority`
  - 用于自动来源之间的字段级优先级比较
- `reasonCode`
  - 用于稳定标识命中的规则分支
- `matcherSummary`
  - 用于把“为什么命中这条规则”折叠进 `resolutionFingerprint`

#### 2.7.4 候选值资格判定顺序

第一版固定以下资格判定顺序：

1. 来源必须处于 `enabled` / 可参与状态
2. 规则集必须是已发布版本
3. 字段规则必须存在且 `enabled = true`
4. `coverage` 必须是 `supported`，或是命中条件后的 `conditional`
5. `strategy` 不能是 `ignore`
6. 若值为显式空值，必须满足 `allowExplicitNull = true`
7. 若字段受锁定语义影响，必须满足 `lockedPathAware` 约束

只有通过这套判定的候选值，才允许进入 `resolved base` 竞争。

#### 2.7.5 决策输出必须可回填到 revision 指纹

自动来源层一旦为某字段选出当前 `resolved base`，其输出至少要能回填：

- `resolvedBaseValue`
- `resolvedSource`
- `resolutionMode`
- `resolutionFingerprint`

其中 `resolutionFingerprint` 第一版至少包含：

- `ruleSet.version` 或等价稳定版本标识
- 命中的 `fieldRule.id` 或等价稳定规则标识
- 命中的 `reasonCode`
- 影响命中的 matcher 指纹

若字段没有自动收敛为唯一结果，而是进入：

- `batch_review`
- `manual_review`

则最终被选中的结果仍然必须产出同结构输出，只是：

- `resolutionMode` 改为 review 类模式
- `resolutionFingerprint` 改为 review 决议指纹

### 2.8 tag 首轮对导入规则模型的最小映射

`hearthstone tag` 首轮不需要真的实现 `magic.cards` 那样的多自动来源竞争，但仍然要按同一输入模型落地，避免后续返工。

#### 2.8.1 自动来源固定为本地 hsdata 发现事实

首轮固定：

- tag 自动更新只来自本地 hsdata 导入发现事实
- 不引入第二个 tag 自动来源
- 不引入远端自动导入对 tag 直接写 base

也就是说，首轮 tag 的 `resolved base` 在运行时通常只会看到一个自动候选来源；但候选值、规则集、字段规则、revision 口径仍按多来源模型组织。

#### 2.8.2 发现类字段

首轮 tag 的发现类字段固定为：

- `rawName`
- `rawType`
- `rawNames`
- `valueKind`
- `firstSeenSourceTag`
- `lastSeenSourceTag`

这些字段表达的是：

- hsdata 原始标签名称与类型事实
- 来源侧观察到的首次 / 最后一次枚举值

#### 2.8.3 会进入统一 merge 的 tag 字段

首轮 tag 中，真正进入统一 `commit / winner / merge` 模型的自动基础值字段固定为：

- `rawName`
- `rawType`
- `rawNames`
- `valueKind`

原因是这些字段既可能被自动发现更新，也可能被后续来源修正或被人工来源覆盖，因此必须参与：

- `source_edit`
- `winner_clear`
- `base_drift`

#### 2.8.4 导入只写发现事实、不进入 merge 的字段

首轮 tag 中，以下字段允许由导入链路维护发现事实，但不进入统一字段 merge：

- `firstSeenSourceTag`
- `lastSeenSourceTag`

它们是来源观察留档，不应被建模为可被不同来源竞争的业务字段 winner。

#### 2.8.5 导入必须永远跳过的 tag 字段

首轮 tag 中，以下字段固定为人工维护字段，导入必须永远跳过：

- `slug`
- `slugAliases`
- `name`
- `normalizeKind`
- `normalizeConfig`
- `projectTargetType`
- `projectTargetPath`
- `projectKind`
- `projectConfig`
- `status`
- `description`

这些字段表达的是：

- 命名规范
- 归一化规则
- 投影策略
- 生命周期管理
- 维护说明

它们不是 hsdata 原始发现事实，不能被自动导入直接改写。

#### 2.8.6 `status` 的首轮特殊约束

`status` 虽然有 `discovered` 语义，但第一版仍固定为：

- 仅允许新建 tag 行时由导入默认写入初始值
- 一旦行已存在，后续导入不得再自动改写 `status`

这样可以避免把“对象生命周期决策”误建模成普通自动来源覆盖。

### 2.9 首轮不做的事

为了避免本轮边界继续膨胀，以下事项明确不在首轮实现：

- 不为 hearthstone 额外新建一套通用 `import_sources` / `import_rule_sets` / `import_field_rules` UI
- 不把 tag 首轮扩展成多自动来源竞争实装
- 不把 `firstSeenSourceTag`、`lastSeenSourceTag` 也塞进 `field_winners`
- 不把导入批次审批流直接并入字段 `commit history`

但即使首轮来源较少，也必须继续满足两条硬约束：

- 相同值但来源变化时，revision 能变化
- 相同来源但规则决策变化时，revision 能变化

### 2.6 与当前通用同步层的关系

多来源基础值决策层与通用同步过程层仍然是两个不同问题。

基础值决策层解决：

- 自动来源之间谁赢
- 哪些字段可自动收敛
- 哪些字段必须进入 review

通用同步过程层解决：

- 自动化更新与人工修改如何统一表达为 `commit`
- 本地和远端各自如何保有自己的 `commit history`
- 双端如何按 `push / pull` 同步缺失的 `commit`
- 双端如何导入外来 `commit` 并执行 `merge`
- 双端如何只基于“已通过审核的 `commit` 子集”执行 `projection`

因此：

- 自动来源竞争的原始候选不应直接写入 `field_commits`
- 只有已经收敛完成、会影响当前态的变化才进入 `field_commits`
- 双端导入外来 `commit` 与本地 base / replay 阶段的冲突统一进入 `field_conflicts`
- `processingSide + processingStage` 区分远端 apply、本地 apply 与本地 replay 的处理上下文

## 3. 同步过程改为“双端各自 `field_commits` + 轻审核状态”

本轮不再恢复早期的 tag 专用表：

- `tag_rule_edit_outbox`
- `tag_rule_edit_events`
- `tag_rule_pull_cursors`
- `tag_rule_conflicts`

首轮固定采用以下通用表：

- `local hearthstone_data.field_commits`
- `remote hearthstone_data.field_commits`
- `local hearthstone_data.field_sync_cursors`
- `local hearthstone_data.field_conflicts`
- `remote hearthstone_data.field_conflicts`

其中：

- `field_commits`
  - 双端各自的正式 `commit history`
- `field_sync_cursors`
  - 本地记录 push / pull 的同步位置
- `field_conflicts`
  - 任一端导入外来 `commit` 时发现的冲突
  - 本地 base / replay 阶段的冲突

### 3.0 同步语义

这一层明确区分：

- 本地仓库 `field_commits`
- 远端共享上游仓库 `field_commits`
- 双端各自的 projection
- 可选的下游发布产物

语义固定如下：

- `commit`
  - 自动化更新与人工修改统一表达为可重放 `commit`
- `push`
  - 本地把远端尚未拥有的本地 `commit` 发送到远端
- `pull`
  - 本地拉取自己尚未拥有的远端 `commit`
- `merge`
  - 任一端导入外来 `commit` 时执行 revision 校验、幂等判断、冲突登记与解决
- `project`
  - 双端都基于当前 `resolved base` 与“已通过审核的 `commit` 子集”投影主表和 `field_winners`

这里的 `commit` 至少分为：

- `row_create`
  - 仅用于自动化导入在对象首次进入仓库时写入一条整行基线快照
- `source_edit`
- `conflict_resolution`
- `winner_clear`

原始抓取数据、中间候选值和无效抖动不属于 `commit`，只有会参与 merge、会影响最终 projection 的收敛后变化才进入 history。

其中 `row_create` 的额外约束固定为：

- 只允许用于“自动化导入使该对象首次进入本仓库”
- payload 保存整行业务快照，而不是单字段 `value`
- 同一逻辑对象在同一仓库中最多只有一条生效的 `row_create`
- 人工创建新行不得写 `row_create`，仍然写普通 `source_edit`
- `row_create` 之后的普通修改必须继续拆成字段级 `commit`
- 不允许把“整行最新值覆盖”伪装成第二条 `row_create`

### 3.0.1 轻审核直接放在 `field_commits` 中

第一版不额外新建 review 表，而是在 `field_commits` 中直接保存当前审核状态。

固定增加以下字段：

- `reviewStatus`
- `reviewedBy`
- `reviewedAt`
- `reviewReason`
- `projectionStatus`
- `syncStatus`

第一版 `reviewStatus` 固定为：

- `auto_approved`
- `pending_review`
- `approved`
- `rejected`
- `superseded`

第一版 `projectionStatus` 固定为：

- `pending`
- `projected`
- `skipped`

第一版 `syncStatus` 固定为：

- `pending_push`
- `synced`
- `pulled`

语义如下：

- `auto_approved`
  - 无需额外审核，可直接参与 projection
- `pending_review`
  - 已进入 history，但暂不参与 projection
- `approved`
  - 已完成审核，可参与 projection
- `rejected`
  - 保留在 history 中，但不参与 projection
- `superseded`
  - 已被后续 `commit` 或解决动作取代，不再参与 projection
- `pending_push`
  - 本地创建、远端尚未确认拥有
- `synced`
  - 本地创建，且远端已经确认拥有
- `pulled`
  - 本地从远端拉取而来，不应再次作为新提交推回远端

因此“未通过审核的变更放哪”的答案固定为：

- 仍然放在 `field_commits`
- 只是 `reviewStatus != auto_approved | approved`
- 主表与 `field_winners` 只消费 `auto_approved | approved` 的 `commit`

### 3.0.2 与 Git / GitHub 的类比

这套模型在心智上更接近 Git：

- 本地 `field_commits`
  - 类似本地仓库的 `commit history`
- 远端 `field_commits`
  - 类似共享上游仓库的 `commit history`
- 本地 `push`
  - 类似 `git push`
- 本地 `pull`
  - 类似 `git fetch / pull`
- `field_conflicts`
  - 类似导入外来提交时的 merge conflict / review decision
- `field_winners` 与主表
  - 类似基于已接受提交重建出来的工作树当前态

### 3.1 `field_commits`

双端都保存各自仓库中的 `commit history`。

最小字段：

- `id`
- `sequence`
- `entityType`
- `entityKey`
- `fieldPath`
- `value`
- `operation`
- `commitKind`
- `clientMutationId`
- `editorRuntime`
- `editorIdentity`
- `expectedRowRevision`
- `expectedWinnerRevision`
- `baseRevision`
- `reviewStatus`
- `reviewedBy`
- `reviewedAt`
- `reviewReason`
- `projectionStatus`
- `syncStatus`
- `createdAt`
- `projectedAt`

最小约束：

- `clientMutationId` 必须支持幂等判断
- `sequence` 是各自仓库内的单调递增序号，不要求双端共用同一序列
- 同一条 `commit id` 导入同一仓库时必须幂等
- `reviewStatus = pending_review | rejected | superseded` 的 `commit` 不得直接参与 projection
- `commitKind = row_create` 时：
  - `fieldPath` 允许固定为 `row`
  - `value` 保存整行快照
  - 该快照必须足以恢复该对象的初始投影基线
- `commitKind != row_create` 时：
  - `fieldPath` 必须定位到单字段
  - `value` 只保存该字段的新值

最小索引建议：

- `(sequence)`
- `(clientMutationId)`
- `(entityType, entityKey, fieldPath, sequence)`
- `(reviewStatus, projectionStatus, createdAt)`

### 3.2 `field_sync_cursors`

保存本地同步位置。

最小字段：

- `consumer`
- `stream`
- `lastPulledSequence`
- `lastPushedSequence`
- `updatedAt`

最小语义：

- `stream`
  - 首轮固定为 `field_commits`
- `lastPulledSequence`
  - 表示已经完整拉取并成功重放到本地的最大远端序号
- `lastPushedSequence`
  - 表示已经确认远端拥有的最大本地序号

唯一键建议：

- `(consumer, stream)`

### 3.3 `field_conflicts`

保存任一端导入外来 `commit` 时发现的冲突、本地 replay 冲突与解决结果。

最小字段：

- `id`
- `processingSide`
- `processingStage`
- `conflictKind`
- `entityType`
- `entityKey`
- `fieldPath`
- `sourceSummary`
- `candidateBaseValue`
- `localValue`
- `remoteValue`
- `effectiveValue`
- `winnerValue`
- `baseRevision`
- `status`
- `reason`
- `createdAt`
- `resolvedAt`
- `resolution`

第一版 `processingSide` 固定为：

- `local`
- `remote`

第一版 `processingStage` 固定为：

- `apply`
- `replay`

第一版 `conflictKind` 固定为：

- `expected_row_revision_mismatch`
- `expected_winner_revision_mismatch`
- `source_resolution`
- `base_drift`
- `history_replay`

第一版 `status` 固定为：

- `open`
- `in_review`
- `resolved`
- `dismissed`

第一版 `resolution` 建议固定为：

- `accept_incoming`
- `keep_current_winner`
- `require_followup_commit`
- `winner_clear`

处理原则：

- 远端导入外来 `commit` 的 merge 冲突与本地 replay / `base_drift` 冲突都进入 `field_conflicts`
- 通过 `processingSide + processingStage` 区分冲突发生位置
- 解决结果最终仍应通过新的 `conflict_resolution commit` 回写到 `field_commits`

### 3.4 通用同步过程表的最小部署边界

首轮固定如下：

- `local hearthstone_data.field_commits`
- `remote hearthstone_data.field_commits`
- `local hearthstone_data.field_sync_cursors`
- `local hearthstone_data.field_conflicts`
- `remote hearthstone_data.field_conflicts`

首轮不再把 `field_commit_outbox` 作为核心真源。

如果后续为了发送性能需要额外增加本地发送队列表，它也只能是：

- 从本地 `field_commits` 派生出的优化结构
- 不能替代本地正式 `commit history`

## 4. 同步单位以字段级 `commit` 为主，自动创建时允许 `row_create`

无论是 tag 还是 `magic.cards` 一类卡牌主领域对象，双端同步默认都使用字段级 `commit`。

唯一例外是：

- 自动化导入使对象首次进入仓库时，可以写一条 `row_create`
- `row_create` 只承担“初始整行基线”职责
- 人工创建新行仍然写普通 `source_edit`
- 后续普通修改一律继续用字段级 `commit`

每个 `commit` 至少包含：

- `entityType`
- `entityKey`
- `fieldPath`
- `value`
- `operation`
- `clientMutationId`
- `expectedRowRevision`
- `expectedWinnerRevision`
- `baseRevision`

其中：

- `expectedRowRevision` 用于检测主表当前态是否已经被其他编辑改动
- `expectedWinnerRevision` 用于检测该字段当前 winner 是否已变化
- `baseRevision` 用于判断本次来源修正是否建立在旧的 `resolved base` 之上

因此真正同步的是：

- “哪一个运行时，针对哪个对象，提交了一次可重放的 `row_create` 或字段级 `commit`”

而不是：

- “把整行最新值整包覆盖过去”

### 4.1 为什么允许 `row_create`

允许 `row_create` 的原因不是为了重新退回整行同步，而是为了控制初始历史体积。

对于 `magic.cards` 这类大对象，如果首次导入就把每一行拆成“每字段一条 commit”，历史表会在初始装载阶段膨胀得过快。

因此第一版固定以下折中策略：

- 自动化导入首次创建对象时：
  - 允许写一条整行 `row_create`
- 后续修改对象时：
  - 仍然拆成字段级 `commit`
- merge / winner / conflict 的主战场：
  - 仍然是字段级，而不是整行级

这样可以同时满足：

- 降低首轮导入生成的 commit 数量
- 保留后续字段级 merge 精度
- 不让普通更新退化成整行覆盖

## 5. tag 的本地 `commit / push / pull`

在当前升级版方案下，本地编辑 `tag` 的流程如下。

### 5.1 加载阶段

页面读取：

- 本地 `hearthstone.tags`
- 本地 `hearthstone_data.field_winners`
- 本地 `field_commits`
- 本地 `field_conflicts`
- 本地基于 `pull` 缓存的远端冲突状态
- 本地未解决的 replay / `base_drift` 冲突

### 5.2 保存阶段

用户修改 `slug`、`normalize*`、`project*`、`status` 等字段并保存时：

1. 本地事务更新 `hearthstone.tags` 主表当前有效值
2. 同时 upsert `field_winners`
3. 同时写入本地 `field_commits`
4. 首轮 tag 人工编辑默认写成 `reviewStatus = auto_approved`

这样保存后：

- 本地 UI 立即看到新值
- 本地 projection 也能立即使用新值
- 同步层有一条 `syncStatus = pending_push` 的本地 `commit`

### 5.3 `push` 阶段

后台同步任务读取本地 `field_commits` 中 `syncStatus = pending_push` 的记录，发送到远端。

远端执行 `merge` 后：

- 写入 `field_commits`
- 更新远端 `field_winners`
- 将对应本地 `commit` 收敛为 `syncStatus = synced`

若远端导入该 `commit` 时发现 revision 不匹配或同字段并发 `commit`，则：

- 远端写入 `field_conflicts`
- 当前 `push` 返回冲突结果
- 本地等待后续 `pull` 获取远端冲突结论或 follow-up commit
- 本地等待后续 `pull` 获取远端冲突结论

### 5.4 本地重放与可选下游发布

本地在以下条件满足时执行重放：

- 当前 `resolved base` 已完成收敛
- 相关远端 `commit` 已 `pull` 到本地
- 当前字段不存在未解决的 replay / `base_drift` 冲突

本地先执行与远端相同的 `project` 规则：

- 基于当前 `resolved base`
- 重放本地仓库中 `reviewStatus = auto_approved | approved` 的 `commit`
- 重放远端冲突解决结果
- 计算最终 effective value

如有下游产物，再执行可选发布：

- 更新本地主表当前值
- 将最终 effective data 发布到本地下游产物

## 6. site 的远端直写流程

site 直接写远端仓库 `field_commits`。

### 6.1 保存阶段

site 保存时直接在远端生成 `commit`：

1. 先调用共享 TS `apply commit / merge / project` 逻辑
2. 写入 `field_commits`
3. 根据来源策略决定 `reviewStatus`
4. 如有 revision 冲突，则写入远端 `field_conflicts`
5. 只有 `reviewStatus = auto_approved | approved` 的 `commit` 才参与远端 projection

这里特意不要求第一版增加独立的 remote service 接收入口。

第一版固定为：

- 远端接收 `commit` 的权威点是共享 TS `apply commit / merge / project` 逻辑
- site 远端直写与 desktop 后续 `push` 都复用这套逻辑
- 两边运行时不同，但不应各自维护两套远端接收规则

这样做的原因是：

- 保持与 Git 心智模型一致
- 避免为 desktop `push` 额外引入一层 service hop
- 避免在 CF Workers 中承担不必要的同步接收开销

### 6.1.1 desktop `push` 到 remote DB

desktop 本地保存后，后续 `push` 阶段允许直连 remote 数据库。

但直连不等于“绕过远端规则直接写最终表”。

第一版要求：

- desktop `push` 时仍然调用与 site 相同的共享 TS `apply commit / merge / project` 逻辑
- 该逻辑在写 remote `field_commits` 前完成幂等判断、revision 校验、merge 与 projection 决策
- 远端主表和远端 `field_winners` 只接受这套共享逻辑的输出

### 6.2 desktop `pull` 阶段

desktop 后续同步时：

1. 读取 `field_sync_cursors`
2. 从远端 `field_commits` 拉取 `lastPulledSequence` 之后的新 `commit`
3. 同步读取本地关心对象上的远端 `field_conflicts` 变化与解决结果
4. 将远端 `commit` 导入本地 `field_commits`
5. 用与远端相同的 `project` 规则尝试更新本地主表
6. 若在当前本地 base 上无法得到一致结果，则写入 `field_conflicts`
7. 更新本地 `field_sync_cursors`

这样 desktop 不需要轮询整表，也不直接抄远端目标表，只需 `pull` 远端 `commit` 并在本地重放。

## 7. 导入、基础值决策与 winner 的协作规则

导入不应直接把任意来源原值写入主表，而应先经过基础值决策层，再与当前 winner 协作。

### 7.1 自动来源先收敛为 `resolved base`

对于 `magic.cards` 一类多来源对象：

- 先按 `sourceId + fieldPath` 规则评估候选值
- 若能确定唯一 `resolved base`，再考虑是否写主表
- 若无法确定，则进入 review，不写主表

对于自动化导入首次创建对象时：

- 若该对象此前在本仓库中不存在，可先生成一条 `row_create`
- `row_create` 只表达“初始整行基线已建立”
- 之后新的自动来源变化，仍然应继续按字段级 `source_edit` 参与 merge

对于人工创建对象时：

- 不生成 `row_create`
- 直接写普通 `source_edit`
- 后续 merge、projection、push / pull 与其他普通编辑一致

### 7.2 当前 winner 来自自动来源集合的字段

- 当字段已经得到新的 `resolved base`，且当前 winner 仍来自自动来源集合时，系统可以更新主表当前值

### 7.3 当前 winner 来自更高优先级来源的字段

- 即使来源层已生成新的 `resolved base`，导入也不更新该字段的主表当前值
- 但如果新的 `resolved base` 与当前 winner value 不一致，必须写入 `field_conflicts`

此时系统行为应固定为：

- 主表继续保留当前 winner value
- `field_winners` 继续保持 `active`
- `field_conflicts` 中新增一条 `base_drift` 冲突记录

这样维护者之后可以：

- 保持当前 winner 继续胜出
- 提交新的 `source_edit` 或 `conflict_resolution`
- 提交 `winner_clear`，重新接受新的 `resolved base`

### 7.4 `winner_clear`

当管理员明确撤销当前 winner 时：

- 更新主表当前值
- 将 `field_winners.status` 改为 `cleared`
- 同时写入 `winner_clear commit`

该字段重新回到自动来源 merge 结果驱动。

## 8. 统一冲突处理入口

本轮改为统一使用 `field_conflicts` 作为冲突记录表。

### 8.1 远端 apply 冲突

远端通过：

- `processingSide = remote`
- `processingStage = apply`

记录导入外来 `commit` 时的 merge 冲突。

典型场景包括：

- 多个来源提交的 `commit` 在远端发生并发
- 本地 `push` 与远端已接受 `commit` 并发
- 远端发现当前 `commit` 的预期状态已过期

### 8.2 本地 replay 冲突

本地通过：

- `processingSide = local`
- `processingStage = replay`

记录 replay / `base_drift` 冲突。

典型场景包括：

- 自动来源无法收敛出唯一 `resolved base`
- 新 base 已出现，但当前字段 winner 不是自动来源
- 外来 `commit` 无法直接在当前本地 base 上重放

### 8.3 统一入口下的处理原则

- 冲突统一写入 `field_conflicts`
- 冲突详情与解决动作统一读取 `field_conflicts`
- 远端和本地通过 `processingSide + processingStage` 区分处理上下文
- 解决结果仍回写到 `field_commits`、主表与 `field_winners`
- 远端冲突解决后，本地仍可能出现 merge 冲突
- 本地 merge 冲突解决后，双端 projection 才能重新收敛

## 9. 为什么仍然不拆 `tags` 主表

即使升级到事件化同步，本轮仍不拆 `hearthstone.tags`，原因如下。

### 9.1 当前复杂点不在主表结构，而在同步过程

tag 的主要问题已经不是“字段该放哪张表”，而是：

- 本地如何立即生效
- 远端如何独立处理来源提交、审批和冲突解决
- 双端如何 `pull / push`
- 双端如何按同一套规则重放权威过程
- 本地如何解决 merge 冲突，并在需要时继续发布下游产物

这些都由：

- 主表 + winner 当前投影
- 双端 `field_commits` + cursors + conflicts 过程态

来解决，不需要先拆主表。

### 9.2 `magic.cards` 更适合复用通用 winner 表和通用同步表

`magic.cards` 的复杂点是：

- 同一个字段先由导入写入，再由管理员人工纠正

这类问题更适合：

- 主表保存当前有效值
- `field_winners` 作为当前 winner projection
- 通用同步表同步字段操作

而不是为 `magic.cards` 再建立一张整表 `current`。

## 10. 表设计建议

### 10.1 当前态表

继续沿用或新增：

- `hearthstone.tags`
- `magic.cards`
- `hearthstone_data.field_winners`

### 10.2 过程态表

新增：

- `local hearthstone_data.field_commits`
- `remote hearthstone_data.field_commits`
- `local hearthstone_data.field_sync_cursors`
- `local hearthstone_data.field_conflicts`
- `remote hearthstone_data.field_conflicts`

### 10.3 用户动作表

若后续需要记录谁做了操作、填写了什么备注，不应继续塞到同步过程表中，建议单独增加：

- `remote hearthstone_app.field_edit_actions`

首轮可先不做。

## 11. 迁移策略

### 阶段一：建立当前 winner projection、基础值决策输入与同步过程表

- 新增 `hearthstone_data.field_winners`
- 新增本地 `field_commits`
- 新增远端 `field_commits`
- 新增本地 `field_sync_cursors`
- 新增本地 `field_conflicts`
- 新增远端 `field_conflicts`
- 明确复用 `import_sources`、`import_rule_sets`、`import_field_rules` 作为多来源基础值决策输入

### 阶段二：tag 页面改为“本地双写 + local commits”

- 保存 tag 时更新本地 `hearthstone.tags`
- 同时写本地 `field_winners`
- 同时写本地 `field_commits`

### 阶段三：远端接收与 desktop 拉取

- 实现共享 TS 远端 apply 逻辑
- 将接收结果 `merge` 到远端 winner projection
- 远端按同一套 `project` 规则更新远端目标表
- desktop 按 cursor 增量 `pull` 远端 `commit`
- desktop 同步拉取远端冲突状态与解决结果
- desktop 在本地重放同一过程，并写入可能的 `field_conflicts`

### 阶段四：导入链路接入基础值决策与 winner merge

- tag 自动发现更新时，若当前字段 winner 不是自动来源，则不直接覆盖
- `magic.cards` 先生成 `resolved base`，再按 source priority 与 `winner_clear` 规则决定是否更新主表
- 如有下游产物，本地仅在 merge 冲突已解决时再发布

### 阶段五：冲突展示与解决动作

- 页面展示本地 `commit` 的审核 / 同步状态
- 页面展示未解决冲突
- 提供刷新与重试入口

## 12. 风险与取舍

### 12.1 复杂度高于“只同步当前态”

这是有意升级。

代价是新增多张通用过程表，以及“双端 `field_commits` + 轻审核状态 + 同构重放”这套逻辑。

收益是：

- 支持离线补发
- 支持增量同步
- 支持断点续传
- 支持显式冲突处理

### 12.2 主表仍然不是纯 base

这点没有改变。

主表保存的是 effective value，不是纯导入原值；自动值部分也不是单一来源原值，而是 `resolved base`。

### 12.3 仍未实现复杂自动合并

本轮只做：

- 字段级操作
- revision 检查
- conflict 持久化

不做复杂自动 merge。

## 最终方案

本轮正式升级为：

- 不拆 `hearthstone.tags`
- 主表继续保存当前有效值
- `hearthstone_data.field_winners` 保存当前 winner projection
- `magic.cards` 等多来源对象先经过基础值决策层生成 `resolved base`
- 新增一套通用同步过程表：
  - `local / remote field_commits`
  - `field_sync_cursors`
  - `field_conflicts`
- desktop 采用“本地立即生效 + 本地 `commit` 再 `push`”
- site 采用“远端直接写共享上游 `commit history` 并触发 `merge`”
- 远端独立承接来源提交、轻审核、冲突解决，并更新远端 projection
- desktop 再通过 cursor `pull` 远端 `commit` 与冲突决议
- 本地按与远端相同的规则重放过程，解决 merge 冲突后与远端 projection 收敛

这样可以同时满足：

- 当前 tag 不拆表
- 未来 `magic.cards` 可复用同一套模型
- 不为每个对象维护专用同步表
- 又具备升级后的增量同步、统一 `commit history` 与双端重放能力
