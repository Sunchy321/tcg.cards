# P3 领域投影链路详细计划

## TODO List

- [x] 确认 P3 归属到现有 `specs/hearthstone-card-model` 规格包
- [x] 合并 P3 设计边界与实施计划
- [x] 建立投影输入、报告和 canonical hash 工具
- [x] 实现 raw snapshot 与 Tag 聚合读取
- [x] 实现结构字段投影和 `revisionHash`
- [x] 实现本地化字段投影、`renderModel` 和 `renderHash`
- [x] 实现 `entities` / `entity_localizations` upsert 与版本合并
- [x] 实现 `entity_relations` 投影与版本合并
- [x] 增加 fixture、幂等和跨 build 复用测试
- [x] 回写 P3 完成状态

## 当前状态（2026-04-22）

P3 已完成实现与定向验证。P2 已完成原始归档与验收测试，因此 P3 已可以直接从 `hearthstone_data` 原始事实层消费数据，并把单个已完成导入的 `sourceTag` 投影到默认 `hearthstone` schema。

当前已落地内容：

- 已新增 `apps/site-console/server/lib/hearthstone/hsdata-project.ts`
- 已实现 `source_versions` 状态校验、raw snapshot / Tag 聚合读取和显式 Tag 配置投影
- 已实现 `revisionHash`、`localizationHash`、`renderHash` 与 `renderModel` 构造
- 已实现 `entities`、`entity_localizations`、`entity_relations` 的 build 版本合并与重投影覆盖
- 已补齐 `apps/site-console/server/lib/hearthstone/hsdata-project.test.ts`
- 已通过幂等、跨 build 复用和关系投影定向测试
- 已在 `hearthstone/data-import` 页面增加手动 `P3` 投影入口

## 已确认边界

- P3 只负责领域投影，不重新解析 XML
- P3 输入来自 `hearthstone_data.source_versions`、`hearthstone_data.raw_entity_snapshots`、`hearthstone_data.raw_entity_snapshot_tags` 和 `hearthstone.tags`
- P3 输出固定为 `hearthstone.entities`、`hearthstone.entity_localizations`、`hearthstone.entity_relations`
- P3 计算 `revisionHash`、`localizationHash`、`renderHash`
- P3 构造并保存 `entity_localizations.renderModel`
- P3 不切换现有卡牌查询，查询兼容留给 P4
- P3 不做历史全量回填，历史回填留给 P5
- P3 不生成或迁移卡图，图片迁移留给 P5
- P3 不新增数据库表，优先使用 P1 已完成的 schema
- P3 不处理自动 upstream 同步，该能力已不在计划内

## 目标

P3 完成后，应满足：

- 可以从一个已完成导入的 `sourceTag` 投影出当前 build 对应的领域数据
- 可以写入并复用 `hearthstone.entities` 结构修订
- 可以写入并复用 `hearthstone.entity_localizations` 本地化修订
- 可以写入 `hearthstone.entity_relations` 版本感知关系事实
- 可以稳定计算 `revisionHash`、`localizationHash`、`renderHash`
- 可以稳定构造符合模型层 Zod 约束的 `renderModel`
- 重复投影同一 source version 保持幂等

## 非目标

P3 不做以下工作：

- 不导入多份历史 sourceTag
- 不负责旧查询接口切换
- 不迁移旧 `cards` / `card_relations` 兼容层
- 不根据未配置 Tag 自动猜测所有领域字段
- 不把未知 Tag 当成投影失败
- 不处理卡图生成、R2 图片路径或图片缓存迁移

这些属于 P4、P5 或后续 Tag 配置补齐工作。

## 输入与输出

### 输入参数

投影入口至少需要：

- `sourceTag`：定位 `hearthstone_data.source_versions.sourceTag`
- `dryRun`：可选，只解析和生成报告，不写库
- `force`：可选，允许重新投影同一个 sourceTag

### 输入数据

- `source_versions.sourceTag`
- `source_versions.build`
- `source_versions.status`
- `raw_entity_snapshots.cardId`
- `raw_entity_snapshots.dbfId`
- `raw_entity_snapshots.sourceTags`
- `raw_entity_snapshots.entityXmlVersion`
- `raw_entity_snapshots.snapshotHash`
- `raw_entity_snapshots.extraPayload`
- `raw_entity_snapshot_tags` 中的 raw payload 与类型化值列
- `tags` 中的 `valueKind`、`normalizeKind`、`projectTargetType`、`projectTargetPath`、`projectKind`、`projectConfig`

### 输出数据

- `entities`
- `entity_localizations`
- `entity_relations`

### 投影报告

投影完成后返回：

- `sourceTag`
- `build`
- `snapshotCount`
- `insertedEntities`
- `reusedEntities`
- `updatedEntities`
- `insertedLocalizations`
- `reusedLocalizations`
- `updatedLocalizations`
- `insertedRelations`
- `updatedRelations`
- `unprojectedTagCount`
- `dryRun`
- `skipped`

## Hash 规则

### `revisionHash`

每个 raw snapshot 会先转换为稳定结构 payload，再计算 `revisionHash`。

纳入 `revisionHash`：

- `cardId`
- `dbfId`
- 所有投影到 `entities` 的结构字段
- `mechanics`
- `referencedTags`
- `legacyPayload`

不纳入 `revisionHash`：

- `version`
- `sourceTag`
- 本地化文本字段
- `renderModel`
- `renderHash`

### `localizationHash`

每个语言的本地化 payload 单独计算 `localizationHash`。

纳入 `localizationHash`：

- `lang`
- `name`
- `text`
- `richText`
- `displayText`
- `targetText`
- `textInPlay`
- `howToEarn`
- `howToEarnGolden`
- `flavorText`
- `locChangeType`

不纳入 `localizationHash`：

- `version`
- `sourceTag`
- `renderHash`
- `renderModel`

### `renderHash`

`renderHash` 由 canonical `renderModel` 计算，不使用随机值或自增值。

首版 `renderModel` 上下文固定为：

- `variant = normal`
- `templateVersion = v1`
- `assetVersion = v1`

## `renderModel` 构造规则

`renderModel` 按模型层 `renderModel` Zod 结构构造，并只包含首版渲染白名单字段：

- `cardId`
- `lang`
- `variant`
- `templateVersion`
- `assetVersion`
- `localization.name`
- `localization.richText`
- `type`
- `cost`
- `attack`
- `health`
- `durability`
- `armor`
- `classes`
- `race`
- `spellSchool`
- `mercenaryFaction`
- `set`
- `overrideWatermark`
- `rarity`
- `elite`
- `techLevel`
- `rune`
- `renderMechanics`

`renderMechanics` 只从 `entities.mechanics` 提取：

- `tradable`
- `forge`
- `hide_cost`
- `hide_attack`
- `hide_health`
- `in_mini_set`
- `hide_watermark`

## Tag 投影规则

P3 优先使用 `hearthstone.tags` 中的显式配置：

- `projectTargetType`
- `projectTargetPath`
- `projectKind`
- `projectConfig`

首版支持以下 `projectKind`：

- `assign_scalar`：写入普通结构字段
- `assign_bool`：写入 boolean 字段
- `assign_int`：写入 integer 字段
- `assign_string`：写入 string 字段
- `assign_string_array`：写入 string 数组字段
- `assign_card_ref`：写入 card id 字段或关系字段
- `assign_localized_text`：写入 localization 字段
- `assign_mechanic`：写入 `mechanics[enumId]`
- `assign_referenced_tag`：写入 `referencedTags[enumId]`
- `assign_legacy`：写入 `legacyPayload`

未配置的 Tag 不阻塞投影，计入报告的 `unprojectedTagCount`。

P3 不在投影阶段自动猜测所有字段，避免错误字段污染默认层。

## 最小字段闭环

首轮实现必须保证 `entities` 和 `entity_localizations` 必填字段可稳定写入。

结构字段最小覆盖：

- `cardId`
- `dbfId`
- `version`
- `revisionHash`
- `set`
- `classes`
- `type`
- `cost`
- `attack`
- `health`
- `durability`
- `armor`
- `collectible`
- `elite`
- `rarity`
- `artist`
- `mechanics`
- `referencedTags`
- `textBuilderType`
- `changeType`
- `isLatest`

本地化字段最小覆盖：

- `cardId`
- `version`
- `lang`
- `revisionHash`
- `localizationHash`
- `renderHash`
- `renderModel`
- `isLatest`
- `name`
- `text`
- `richText`
- `displayText`
- `locChangeType`

其余字段保持 schema 默认值或 null。后续通过补充 Tag 配置扩展覆盖面。

## `ReferencedTag` 投影

P2 已将 XML `ReferencedTag` 规范化保留到 `raw_entity_snapshots.extraPayload.referencedTags`。

P3 需要把它投影到 `entities.referencedTags`：

- key 使用 `enumId` 字符串
- value 允许 `bool | int`
- 缺失时写入空对象

## 关系投影

强关系字段：

- `heroPower`
- `buddy`
- `tripleCard`

弱关系字段：

- `heroicHeroPower`

写入规则：

- 强关系同时写入 `entities` 独立字段和 `entity_relations`
- 弱关系只写入 `entity_relations`
- `entity_relations.version` 与对应 `entities.version` 保持一致
- `entity_relations.isLatest` 跟随当前 build 的投影结果

## 幂等与版本合并

P3 写库规则：

1. 读取 `source_versions`，确认 `status = completed`
2. 读取当前 `sourceTag` 对应的 raw snapshots
3. 聚合 snapshots 对应的 raw Tag 事件
4. 生成结构 payload 和 `revisionHash`
5. 若 `(cardId, revisionHash)` 已存在，则合并 `version`
6. 若不存在，则插入新 `entities` 行
7. 生成每个语言的 localization payload、`localizationHash`、`renderModel`、`renderHash`
8. 若 `(cardId, lang, revisionHash, localizationHash)` 已存在，则合并 `version`
9. 若不存在，则插入新 `entity_localizations` 行
10. 根据关系字段写入或更新 `entity_relations`
11. 当前 build 对应的行标记 `isLatest = true`
12. 同 card 不包含当前 build 的旧 latest 行标记为 false

`version` 必须始终升序、去重、非空。

## 错误处理

- sourceTag 不存在：失败
- sourceTag 未完成：失败
- 找不到 raw snapshot：失败
- 无法满足 `entities` 必填字段：失败，并在错误中包含 `cardId` 和字段名
- 单张卡投影失败时，首版选择整体事务失败，避免半成品领域层

## 实施分步

### Step 1：投影基础工具

输出：

- `apps/site-console/server/lib/hearthstone/hsdata-project.ts`
- canonical JSON 序列化工具
- `sha256` hash 工具
- `mergeVersion` 工具
- 投影报告类型

完成标准：

- 相同输入稳定生成相同 hash
- `version` 合并后升序、去重、非空

### Step 2：raw 数据读取

输出：

- 读取 `source_versions`
- 读取当前 `sourceTag` 对应的 `raw_entity_snapshots`
- 读取对应 `raw_entity_snapshot_tags`
- 读取 Tag 投影配置

完成标准：

- 未完成或不存在的 sourceTag 会失败
- 能按 snapshot 聚合 Tag 事件

### Step 3：结构投影

输出：

- raw Tag 到结构 payload 的投影器
- `mechanics` 投影
- `referencedTags` 投影
- `legacyPayload` 投影
- `revisionHash` 计算

完成标准：

- 基础字段可写入 `entities`
- 未配置 Tag 不阻塞并进入报告

### Step 4：本地化与渲染投影

输出：

- LocString 到 localization 的投影器
- `renderModel` 构造器
- `localizationHash` / `renderHash` 计算

完成标准：

- 至少 `enUS` / `zhCN` 可投影
- 相同 renderModel 得到相同 renderHash

### Step 5：写库与幂等

输出：

- `entities` upsert
- `entity_localizations` upsert
- `entity_relations` upsert
- `isLatest` 更新

完成标准：

- 同一 sourceTag 重复投影行数稳定
- 跨 build 相同内容会合并 `version`

### Step 6：测试与文档回写

输出：

- P3 fixture 测试
- 幂等测试
- 跨 build 复用测试
- P3 状态回写

完成标准：

- P3 TODO 全部完成
- `specs/hearthstone-card-model/plan.md` 中 P3 标记为完成

## 验收标准

- 一组 P2 fixture 可投影到三张领域表
- 重复投影同一 sourceTag 行数稳定
- 同一结构跨 build 复用同一 `revisionHash` 并合并 `version`
- 同一本地化跨 build 复用同一 `localizationHash` 并合并 `version`
- `renderHash` 对相同 `renderModel` 稳定
- 未配置 Tag 不阻塞投影，并在报告中可见
