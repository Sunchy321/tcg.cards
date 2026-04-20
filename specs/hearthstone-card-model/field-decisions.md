# 炉石传说卡牌模型字段取舍

本文只记录字段取舍结论，不代表立即修改现有 schema。后续实施时再按本表分批调整。

## 当前边界摘要

- 原始归档层使用规范化 `sourceTag[]`，默认层使用规范化 `build[]`，不再使用 `sourceSpan`
- 旧字段和边缘兼容字段进入 `legacyPayload`
- 通用 `bool / int` 机制进入 `mechanics`
- 佣兵 / 战棋专属属性继续作为平铺独立列保留
- 强单值卡牌关系保留独立字段，并同步写入 `entity_relations`
- 弱关系 `heroicHeroPower` 只进入 `entity_relations`
- `card_relations` 标记为弃用兼容层

## 直接删除

| 字段 | 所属表 | 结论 | 原因 | 替代方案 |
|------|--------|------|------|----------|
| `slug` | `entities` | 删除独立列 | `cardId` 已是卡牌自然键；slug 是旧版本上游字段，不应作为结构修订核心列 | 如需完整导出旧版本，进入 `entities.legacyPayload.slug` |
| `entourages` | `entities` | 删除独立列 | 更像旧版本 XML 子结构或卡牌关系，不适合压成核心结构字段 | 如需完整导出旧版本，进入 `entities.legacyPayload.entourages`；若后续需要高频查询，再升格为关系表 |
| `localizationNotes` | `entities` | 删除独立列 | 属于边缘兼容字段，不适合继续污染核心结构列 | 进入 `entities.legacyPayload.localizationNotes` |
| `sellValue`、`deckOrder`、`deckSize` | `entities` | 删除独立列 | 更适合作为结构化 bool / int 机制表达，而不是单独列散落在主表中；`sellValue` 对应原始 `BACON_SELL_VALUE`，旧映射中的 `coin` 是误名 | 统一投影到 `entities.mechanics` |

## 保留

| 字段 | 所属表 | 结论 | 原因 |
|------|--------|------|------|
| `cardId` | `entities`、`entity_localizations` | 保留 | 上游稳定卡牌标识，也是自然键的一部分 |
| `sourceTags` | `raw_entity_snapshots` | 保留 | 原始归档层使用 `sourceTag[]` 表达导入源版本集合，避免与默认层 `build[]` 混淆 |
| `version` | `entities`、`entity_localizations`、`entity_relations` | 保留 | 默认层版本本质是离散 build 集合；使用规范化 `int[]` 更贴近语义，也更利于导出和现有查询兼容 |
| `dbfId` | `entities` | 保留 | 上游实体数值标识，兼容旧数据和部分资源路径 |
| `revisionHash` | `entities`、`entity_localizations` | 保留 | 结构修订去重和结构-本地化关联都依赖它 |
| `localizationHash` | `entity_localizations` | 保留 | 本地化修订去重依赖它 |
| `renderHash` | `entity_localizations` | 保留 | 渲染等价去重和图片缓存复用依赖它 |
| `renderModel` | `entity_localizations` | 保留 | 保存渲染所需的规范化 payload，避免另建 `render_models` |
| `isLatest` | `entities`、`entity_localizations` | 保留 | 作为最新查询的快捷字段，避免每次解析范围上界 |
| `legalities` | `cards` | 保留 | 属于卡牌层面的非 XML 侧事实，当前页面和 API 已使用 |
| `legacyPayload` | `entities` | 保留 | 保存旧版本存在、现在不再升格为核心列但仍属于领域导出信息的字段，保证 `hearthstone` 层可独立完整导出 |
| `set`、`classes`、`type`、`cost`、`attack`、`health`、`durability`、`armor` | `entities` | 保留 | 高频查询和渲染都会使用，适合核心结构化字段 |
| `overrideWatermark` | `entities` | 保留 | 表示覆盖原卡牌的系列名（水印名），语义是 set override，不适合归入只支持 `bool / int` 的 `mechanics` |
| `rune`、`race`、`spellSchool`、`questType`、`rarity`、`faction`、`textBuilderType` | `entities` | 保留 | 属于常见分类或渲染字段；数据库中用 `text` / `text[]` 保存，避免上游新增值阻塞导入 |
| `techLevel`、`colddown`、`mechanics`、`referencedTags` | `entities` | 保留 | 当前查询或卡牌详情页已使用，且具备明确业务含义 |
| 本地化文本字段 | `entity_localizations` | 保留 | 直接影响查询、展示和渲染 |

### `version` / `sourceTags` 存储约束

默认层与原始归档层的版本语义必须分开：

- `hearthstone_data.raw_entity_snapshots.sourceTags` 使用规范化的 `sourceTag[]`
- `hearthstone.entities.version`、`entity_localizations.version`、`entity_relations.version` 使用规范化的 `build[]`

结论：

- `sourceTags` 与 `version` 都必须升序、去重、非空
- 版本集合交集使用 `&&`
- 版本集合求交使用 `&`
- `&` 依赖 PostgreSQL `intarray` 扩展
- 指定默认层版本命中优先使用 `version @> ARRAY[x]`
- 同一 `cardId` 的不同结构记录不能出现版本集合交集
- 同一 `cardId + lang` 的不同本地化记录不能出现版本集合交集
- 默认层版本号本身是离散 build，不再用 `sourceSpan` / `int4multirange` 表达
- `sourceTag` 允许保留在 `hearthstone_data.source_versions` 中，作为导入追溯身份

### `legacyPayload` 边界

`hearthstone` 领域数据层必须能独立表达可导出的卡牌信息，不能为了完整导出依赖 `hearthstone_data`。因此旧版本存在、但不值得继续作为核心列维护的字段，不只保存在 `raw_entity_snapshots.extraPayload`，还需要投影到 `entities.legacyPayload`。

推荐内部形态：

```json
{
  "slug": "old-slug",
  "entourages": ["CARD_001", "CARD_002"],
  "localizationNotes": "legacy note"
}
```

结论：

- `raw_entity_snapshots.extraPayload` 负责原始归档、追溯和重投影
- `entities.legacyPayload` 负责领域层完整导出
- `entities.legacyPayload` 不作为高频查询路径设计
- `slug`、`entourages`、`localizationNotes` 这类旧字段或边缘字段优先进入 `legacyPayload`
- `revisionHash` 应包含 `legacyPayload`
- `renderHash` 默认不包含 `legacyPayload`，除非其中某个字段确认影响渲染
- 如果某个 legacy 字段后续成为高频查询或明确领域关系，再从 `legacyPayload` 升格为独立列或关系表

### `mechanics` 存储键

`mechanics` 只需要支持布尔值和数字值，不需要设计成复杂的多类型关系表。为保持导出简单，`mechanics` 优先作为 `entities` 上的结构化字段保留，但不再使用 `text[]` 混合编码。

推荐内部形态：

```json
{
  "190": true,
  "317": 2
}
```

结论：

- 数据库存储键使用 `enumId` 字符串，而不是 `slug`
- `enumId` 与上游和 `hearthstone.tags.enumId` 保持一致，适合作为稳定身份
- `slug` 可配置且可重命名，只适合展示、查询参数和导出 JSON
- 导出时将 `enumId` 映射为当前 `slug`
- 未知 mechanic 可以先用 `enumId` 正常入库，后续补充 `tags` 配置后再改善展示和导出
- `sellValue`、`deckOrder`、`deckSize` 不再保留独立列，统一投影到 `mechanics`
- `overrideWatermark` 继续保留独立列，值使用 set slug，表示覆盖卡牌默认水印名
- 只有仍需要独立数值查询或明确领域含义的字段才保留独立列；其余可表达为 bool / int 机制的字段尽量收敛到 `mechanics`

### 模式专属字段

佣兵 / 战棋的专属字段继续保留为 `entities` 的独立列，不引入 `modePayload`，也不增加模式前缀。

结论：

- 数据库表结构保持当前平铺模式
- 导出结构也保持平铺模式
- 不为了结构分组而牺牲查询简单性
- 仍保留为独立列的典型字段包括：
  - `techLevel`
  - `inBobsTavern`
  - `tripleCard`
  - `raceBucket`
  - `armorBucket`
  - `buddy`
  - `bannedRace`
  - `mercenaryRole`
  - `mercenaryFaction`

### 卡牌关系字段

`card_ref` 字段按关系强弱分层处理，不统一只放独立列，也不统一只放关系表。

结论：

- `heroPower`、`buddy`、`tripleCard` 保留为 `entities` 的独立字段
- 上述强关系同时写入 `entity_relations`，作为版本感知的关系事实与查询入口
- `heroicHeroPower` 降级为弱关系，不再要求保留独立字段，只进入 `entity_relations`
- `entity_relations` 负责关系遍历、反向查询、related cards 聚合
- `entities` 上保留的关系字段仍然是领域事实源；`entity_relations` 是关系事实扩展表
- 旧 `card_relations` 标记为弃用，仅在迁移期间作为兼容层保留

## 模式属性继续保留

| 字段 | 所属表 | 结论 | 原因 |
|------|--------|------|------|
| `armorBucket`、`bannedRace` | `entities` | 继续保留 | 当前仍属于有效的模式专属属性，平铺列查询和导出都更直接 |
| `mercenaryRole`、`mercenaryFaction` | `entities` | 继续保留 | 当前已具备明确模式语义和查询价值，不再作为待移出字段处理 |
