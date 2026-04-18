# 炉石传说卡牌模型设计文档

---

## 1. 概述

当前炉石数据主要来自 `hsdata` 历史标签中的 `CardDefs.xml`。这份 XML 既是卡牌结构事实的来源，也是完整历史归档的基础。现有 `hearthstone.cards`、`hearthstone.entities`、`hearthstone.entity_localizations` 已经能表达一部分历史，但仍存在几个核心问题：

- 上游 `Tag` 语义主要写死在代码里，未知 `Tag` 不够友好
- 原始 XML 结构、逻辑卡牌字段、渲染字段三层概念混在一起
- 历史版本虽然能存，但缺少更系统的去重和压缩策略
- 不能明确区分“数据变化”和“会影响卡图渲染的变化”
- `Tag` 重命名、补充解释、调整解析规则时，需要改代码甚至回填数据

本设计提出一套新的炉石卡牌模型，目标是围绕 `CardDefs.xml` 建立：

- **可归档的原始快照层**
- **可配置的 Tag 注册与映射层**
- **可压缩的完整历史存储层**
- **可去重的渲染模型层**

其中最重要的原则是：**先稳定保存原始语义，再配置化投影为领域字段，最后再提炼渲染字段。**

---

## 2. 设计目标

### 2.1 必须满足

- 基于 `CardDefs.xml` 建立稳定的归档结构
- 支持完整的卡牌历史存储，且对重复内容做压缩
- 支持卡牌渲染相关数据建模，并对渲染等价内容做去重
- `Tag` 的具体含义、slug、解析方式保存在数据库中，并可配置
- 未知 `Tag` 必须能被正确解析并自动登记，不能因未知字段导入失败
- `Tag` 必须支持方便地重命名，且不要求重写历史数据
- `Tag` 必须支持配置映射到实际领域字段，如 `cost`、`health`、`localization.name`
- 支持后续重新投影：当 `Tag` 解析规则变化时，不必重新解析原始 XML

### 2.2 期望满足

- 保持与现有 `hearthstone` 查询接口兼容，至少能平滑提供兼容视图
- 支持按版本查询、按卡牌查询、按 Tag 查询、按渲染哈希查询
- 支持后续把更多 XML 子结构纳入同一套可配置映射体系

### 2.3 非目标

- v1 不在数据库中保存整份原始 XML 文本副本；原始文件可继续放在对象存储或引用目录中
- v1 不直接负责存储最终卡图二进制文件，只负责渲染等价建模与索引
- v1 不处理用户态数据；所有新增表仅落在 `hearthstone` 或 `hearthstone_data`

---

## 3. 上游 XML 结构与术语

根据当前参考文件 `references/hearthstone/raw/CardDefs.xml`，可确认的主结构如下：

```xml
<CardDefs build="240397">
  <Entity CardID="AT_001" ID="2539" version="2">
    <Tag enumID="185" name="CARDNAME" type="LocString">...</Tag>
    <Tag enumID="45" name="HEALTH" type="Int" value="30" />
  </Entity>
</CardDefs>
```

本文统一区分以下概念：

- **源版本**：`hsdata` git tag，对应一份完整 `CardDefs.xml`
- **build**：`<CardDefs build="...">` 上的构建号
- **实体版本**：`<Entity version="...">` 上的局部版本号，不能替代源版本
- **卡牌标识**：`CardID`
- **实体标识**：`ID`，通常对应 `dbfId`
- **原始 Tag**：XML 中的 `<Tag>` 节点
- **逻辑 Tag**：系统内部识别出的稳定 Tag 定义，不直接等同于原始名字
- **原始快照**：一个 `Entity` 经过规范化后的完整 XML 语义快照
- **领域修订**：从原始快照投影得到的结构化卡牌事实
- **渲染模型**：从领域修订中抽取出的、只保留渲染相关字段的模型

特别注意：

- XML 中很多布尔语义实际通过 `Int` 表示，如 `0 / 1`
- 同一个逻辑 `Tag` 可能存在多个上游表现形式
- 不同版本的完整卡牌数据可能不同，但渲染结果完全相同

---

## 4. 总体分层

新方案拆成四层：

### 4.1 源归档层：`hearthstone_data`

负责记录：

- 哪些源版本被导入
- 每个源版本对应哪一份 `CardDefs.xml`
- 每张卡在每个源版本上对应哪个原始快照
- 原始快照里有哪些规范化后的 Tag 值

这一层解决“**完整历史**”与“**原始语义可追溯**”。

### 4.2 Tag 注册与映射层：`hearthstone`

负责记录：

- 每个逻辑 Tag 的稳定主键
- 上游原始 `enumID / name / type` 如何匹配到逻辑 Tag
- 当前 slug 是什么，历史 alias 有哪些
- 该 Tag 如何被解析到领域字段

这一层解决“**可配置**”“**未知 Tag 自动接纳**”“**Tag 可重命名**”。

### 4.3 领域修订层：`hearthstone`

负责记录：

- 结构化的卡牌事实修订
- 本地化修订
- 某张卡在哪些源版本区间上使用哪个修订

这一层解决“**方便查询**”“**兼容现有卡牌接口**”“**完整历史压缩**”。

### 4.4 渲染模型层：`hearthstone`

负责记录：

- 会影响渲染的字段子集
- 渲染等价哈希
- 某个领域修订对应哪个渲染模型

这一层解决“**同图去重**”与“**渲染缓存复用**”。

---

## 5. Tag 模型设计

在确认炉石 `Tag.enumID` 稳定后，Tag 设计不再需要额外的 matcher 或独立规则表。核心原则调整为：

**直接使用 `enumID` 作为 Tag 的稳定主键，把含义、slug、解析方式、字段映射都配置在同一张 Tag 定义表中。**

这样可以显著减少表数量，同时仍满足：

- 未知 Tag 自动入库
- Tag 可重命名
- 原始值可规范化为 `bool` / `int` / `enum` / `card_ref`
- 规范化值可唯一投影到一个业务字段

### 5.1 Tag 定义表：稳定身份与唯一配置

建议引入表：`hearthstone.tags`

主要字段：

- `enumId`：Tag 主键，直接使用 XML `enumID`
- `slug`：当前推荐 slug，唯一，可修改
- `slugAliases`：历史 slug 列表，用于兼容旧查询
- `name`：展示名称，可为空
- `rawName`：当前观察到的 XML `name`
- `rawType`：当前观察到的 XML `type`
- `rawNames`：历史观察到的 XML `name` 列表
- `valueKind`：规范化值类型，如 `int`、`bool`、`string`、`enum`、`loc_string`、`card_ref`、`json`
- `normalizeKind`：解析方式，如 `identity_int`、`bool_from_int`、`enum_from_int`
- `normalizeConfig`：解析配置，如布尔值集合、枚举映射、语言映射
- `projectTargetType`：目标层，如 `entity`、`entity_localization`
- `projectTargetPath`：目标字段，如 `health`、`collectible`、`localization.name`
- `projectKind`：投影方式，如 `assign_scalar`、`assign_card_ref`、`assign_localized_text`
- `projectConfig`：投影配置，如语言选择、空值规则、枚举 fallback
- `status`：`active`、`discovered`、`deprecated`、`merged`
- `description`：Tag 说明
- `firstSeenVersionId`、`lastSeenVersionId`
- `createdAt`、`updatedAt`

约束：

- `enumId` 一旦出现不再变化
- 所有历史数据都引用 `tags.enumId`，而不是直接引用 slug
- 每个 `enumId` 只有一套当前有效的解析方式
- 每个 `enumId` 最多投影到一个业务字段

这保证了：

- 改 slug 不需要重写历史值
- UI 和 API 可以使用 slug，底层仍保持稳定主键
- 解析规则和字段映射可直接在数据库中配置

### 5.2 Tag 重命名

Tag 重命名只修改 `tags`：

- 将旧 `slug` 加入 `slugAliases`
- 写入新 `slug`
- 历史数据继续引用 `enumId`，无需迁移

如果需要通过旧 slug 查询，可以在服务层按以下顺序解析：

1. 先查 `tags.slug`
2. 再查 `tags.slugAliases`
3. 最终都解析到同一个 `enumId`

### 5.3 未知 Tag 的处理策略

导入时按以下顺序解析：

1. 先根据 `enumID` 查 `tags`
2. 命中则使用该 Tag 的配置
3. 未命中则自动创建 `tags`：
   - `enumId = enumID`
   - `rawName = XML name`
   - `rawType = XML type`
   - `rawNames = [XML name]`
   - `status = discovered`
   - `slug = unknown-<enumId>-<normalized-name>`
   - `valueKind`、`normalizeKind` 按 XML 原始类型自动推断
   - `projectTargetType = null`
   - `projectTargetPath = null`
4. 继续导入，不报错

这保证未知 Tag：

- 不阻塞历史归档
- 不丢失值
- 后续可以在后台补充说明、解析配置和字段映射

默认规则建议如下：

- 原始 `Int` -> 规范化为 `int`
- 原始 `String` -> 规范化为 `string`
- 原始 `LocString` -> 规范化为 `loc_string`
- 原始 `Card` -> 规范化为 `card_ref`
- 其他无法识别结构 -> 规范化为 `json`

这样即使某个 Tag 暂时没有业务语义，也能先被稳定接住。

### 5.4 Tag 值类型：区分原始值与规范化值

为了同时满足“未知 Tag 不报错”和“方便查询”，建议把 Tag 值拆成两层：

- **原始值**：忠实保留 XML 中的输入形态
- **规范化值**：按规则转换后的查询友好形态

原始值类型主要对应 XML：

- `int_raw`
- `string_raw`
- `loc_string_raw`
- `card_raw`
- `json_raw`

规范化值类型建议支持：

- `int`
- `bool`
- `string`
- `enum`
- `loc_string`
- `card_ref`
- `json`

说明：

- XML 中的布尔语义通常来自 `Int`，因此原始值与规范化值不能混为一谈
- `bool`、`enum` 等通常是从 `int_raw` 通过规则派生出来的
- `LocString` 建议保存为规范化的多语言 JSON 结构
- `Card` 类型同时保留 `cardID` 与数值 `value`
- 无法可靠结构化的值统一落入 `json`

### 5.5 Tag 规范化配置

`tags.normalizeKind` 推荐支持：

- `identity_int`
- `identity_string`
- `identity_loc_string`
- `identity_card_ref`
- `bool_from_int`
- `enum_from_int`
- `json_wrap`

`tags.normalizeConfig` 示例：

- `trueValues` / `falseValues`
- `enumMap`
- `allowUnknownEnumValue`
- `localeMap`
- `preferCardId`
- `fallbackToRaw`

例如：

- `COLLECTIBLE`：`int_raw -> bool`
- `CLASS`：`int_raw -> enum`
- `HEALTH`：`int_raw -> int`
- `CARDTEXT`：`loc_string_raw -> loc_string`
- `HERO_POWER`：`card_raw -> card_ref`

### 5.6 Tag 字段映射配置

由于每个 Tag 只会对应唯一业务字段，字段映射直接保存在 `tags` 中：

- `projectTargetType`
- `projectTargetPath`
- `projectKind`
- `projectConfig`

`projectKind` 推荐支持：

- `assign_scalar`
- `assign_enum`
- `assign_card_ref`
- `assign_localized_text`
- `append_array`
- `union_array`
- `merge_json`

`projectConfig` 典型内容：

- `nullValues`
- `langSelector`
- `cardRefField`
- `enumFallback`
- `sortBeforeWrite`

示例：

- `CARDNAME` -> `entity_localization.name`，`projectionKind = assign_localized_text`
- `CARDTEXT` -> `entity_localization.text`，`projectionKind = assign_localized_text`
- `HEALTH` -> `entity.health`，`projectionKind = assign_scalar`
- `COLLECTIBLE` -> `entity.collectible`，`projectionKind = assign_scalar`
- `HERO_POWER` -> `entity.heroPower.cardId`，`projectionKind = assign_card_ref`

好处：

- Tag 的业务含义、解析方式和字段映射都可在数据库中维护
- 不需要为单一规则再引入额外规则表
- 新增或修正规则时，只需重跑投影，不需要重读 XML
- 如果某个 Tag 还没有业务字段，`projectTargetPath` 保持为空即可

---

## 6. Tag 查询与存储策略

Tag 查询优先基于 `raw_entity_snapshot_tags` 中的类型化值列完成。这样能避免在常见查询中解析 JSON，也不需要额外的值池表。

常见查询包括：

- `enumId = 45` 且 `intValue >= 10`
- `slug = collectible` 且 `boolValue = true`
- `slug = hero-power` 且 `cardRefCardId = 'HERO_10bp'`
- `status = discovered` 的未知 Tag 清单

如果未来实际数据量证明值重复率非常高，再考虑增加 `tag_values` 值池作为二次压缩优化；v1 不需要先做。

---

## 7. 原始归档与压缩存储设计

### 7.1 源版本表

建议引入表：`hearthstone_data.source_versions`

主要字段：

- `id`
- `sourceTag`：`hsdata` 历史 tag，数值型
- `sourceCommit`
- `build`
- `sourceHash`
- `sourceUri`
- `status`
- `importedAt`

说明：

- 数据库只保存源文件元数据与校验信息
- 原始 XML 文件本体继续保存在对象存储或参考目录
- `sourceHash` 用于幂等校验

### 7.2 原始快照池

建议引入表：`hearthstone_data.raw_entity_snapshots`

主要字段：

- `id`
- `cardId`
- `dbfId`
- `sourceSpan`
- `entityXmlVersion`
- `snapshotHash`
- `extraPayload`
- `isLatest`
- `createdAt`

说明：

- `snapshotHash` 基于规范化后的完整 `Entity` 内容生成
- `extraPayload` 用于存放当前未拆成独立表的结构，如 `Power`、`ReferencedTag`、`EntourageCard`
- 完全相同的 `Entity` 内容只保存一份
- `sourceSpan` 记录这份原始快照在哪些源版本中出现，支持不连续版本集合

### 7.3 原始快照 Tag 事件表

建议引入表：`hearthstone_data.raw_entity_snapshot_tags`

主要字段：

- `snapshotId`
- `enumId`
- `tagOrder`
- `rawName`
- `rawType`
- `rawPayload`
- `valueKind`
- `boolValue`
- `intValue`
- `stringValue`
- `enumValue`
- `locStringValue`
- `cardRefCardId`
- `cardRefDbfId`
- `jsonValue`
- `parseStatus`

唯一约束建议：

- `(snapshotId, enumId, tagOrder)` 唯一

说明：

- 一个快照由若干规范化 Tag 组成
- 如果未来发现少量 Tag 允许重复，可通过 `tagOrder` 保留顺序
- `rawPayload` 保存原始输入信息，便于后续修正规则时重新规范化
- `parseStatus` 建议支持 `parsed`、`fallback`、`discovered`
- 类型化值列直接用于查询，不再通过独立值池跳转

索引建议：

- `(enumId, intValue)` 部分索引
- `(enumId, boolValue)` 部分索引
- `(enumId, stringValue)` 部分索引
- `(enumId, enumValue)` 部分索引
- `(enumId, cardRefCardId)` 部分索引
- `jsonValue` 可按需要补 GIN

### 7.4 Tag 查询视图

为了方便查询，建议提供一个只读视图：`hearthstone_data.tag_value_view`

字段建议至少包含：

- `snapshotId`
- `cardId`
- `dbfId`
- `enumId`
- `tagSlug`
- `tagName`
- `valueKind`
- `boolValue`
- `intValue`
- `stringValue`
- `enumValue`
- `locStringValue`
- `cardRefCardId`
- `cardRefDbfId`
- `jsonValue`

这个视图由以下表拼接：

- `raw_entity_snapshot_tags`
- `raw_entity_snapshots`
- `tags`

典型查询示例：

- 查询某版本所有 `collectible = true` 的卡
- 查询某版本所有 `health >= 10` 的卡
- 查询所有未配置业务含义但已经出现过的 `discovered` Tag
- 查询某个 `hero_power` 指向特定 `cardId` 的卡

---

## 8. 领域层压缩设计

原始快照层解决“保真”，领域层解决“好查”和“好渲染”。在当前约束下，以下表可以取消：

- `entity_revisions`：与 `entities` 语义重叠，可直接用 `entities` 表承载结构修订
- `entity_revision_localizations`：与 `entity_localizations` 语义重叠，可直接用 `entity_localizations` 表承载本地化修订
- `card_timelines`：只负责版本区间映射，可把 `sourceSpan` 直接放入 `entities` 和 `entity_localizations`
- `render_models`：渲染模型依赖结构修订和本地化修订，可内联到 `entity_localizations`

压缩后的领域层只保留两张核心事实表：

- `hearthstone.entities`
- `hearthstone.entity_localizations`

### 8.1 `entities`：结构修订与版本范围

`hearthstone.entities` 一行表示：

**某张卡的一份结构修订，在一组源版本中生效。**

主要字段：

- `id`
- `cardId`
- `dbfId`
- `sourceSpan`
- `revisionHash`
- `rawSnapshotId`
- `isLatest`
- 结构化字段，如：
  - `set`
  - `classes`
  - `type`
  - `cost`
  - `attack`
  - `health`
  - `durability`
  - `armor`
  - `race`
  - `spellSchool`
  - `collectible`
  - `elite`
  - `rarity`
  - `artist`
  - `mechanics`
  - `referencedTags`
  - `entourages`
  - `heroPower`
  - `textBuilderType`

约束建议：

- `(cardId, revisionHash)` 唯一
- 同一 `cardId` 的 `sourceSpan` 不允许互相重叠

说明：

- `revisionHash` 只覆盖结构字段，不覆盖本地化字段
- `sourceSpan` 支持不连续版本集合，因此版本 `123` 和 `678` 相同、版本 `45` 不同的情况可以由一行表示
- 结构化字段由 `tags` 中的字段映射配置从原始快照投影得出

### 8.2 `entity_localizations`：本地化修订、结构关联与渲染模型

`hearthstone.entity_localizations` 一行表示：

**某张卡、某语言、某结构修订、某文本修订，在一组源版本中生效，并对应一份渲染模型。**

主要字段：

- `id`
- `cardId`
- `lang`
- `sourceSpan`
- `revisionHash`
- `localizationHash`
- `renderHash`
- `renderModel`
- `isLatest`
- 本地化字段：
  - `name`
  - `text`
  - `richText`
  - `displayText`
  - `targetText`
  - `textInPlay`
  - `howToEarn`
  - `howToEarnGolden`
  - `flavorText`

约束建议：

- `(cardId, lang, revisionHash, localizationHash)` 唯一
- 同一 `cardId + lang` 的 `sourceSpan` 不允许互相重叠

说明：

- `localizationHash` 覆盖 `lang` 和所有本地化字段
- `renderHash` 不使用随机值，而是基于所有影响渲染的字段生成确定性指纹
- 推荐流程为：先构造稳定的 `renderModel`，再对规范化后的 `renderModel` 做哈希，如 `sha256(canonical_json(renderModel))`
- `renderModel` 保存渲染所需的规范化 payload，不再单独建 `render_models`
- 如果结构字段变化但文本未变，也会生成新的 `entity_localizations` 行，因为 `revisionHash` 不同，渲染结果可能不同

---

## 9. 渲染去重设计

渲染去重不再依赖独立 `render_models` 表，而是内联到 `entity_localizations`：

- `renderHash` 用于判断某语言下最终卡面是否相同
- `renderModel` 用于保存渲染所需 payload
- 图片缓存可以用 `renderHash` 作为 key

`renderHash` 的生成规则必须满足以下约束：

- 不允许使用随机值或自增值
- 必须仅由所有影响渲染结果的字段决定
- 字段序必须稳定
- 若数组顺序不影响渲染，则先做规范化排序
- 空值、缺省值、布尔值、数字格式必须统一表示
- `lang`、渲染模板版本、资源版本等会影响最终卡面的上下文也必须纳入输入

推荐做法：

1. 从 `entities` 和 `entity_localizations` 中抽取所有影响渲染的字段
2. 生成一份稳定的 `renderModel`
3. 对 `renderModel` 做 canonical JSON 序列化
4. 对序列化结果计算哈希，得到 `renderHash`

这样可以少一张表，同时仍能表达：

- 结构字段不同但本地化文本相同，卡图可能不同
- 结构字段相同但本地化文本不同，卡图可能不同
- 结构字段和本地化文本都变化，但渲染字段没变，卡图可以复用

渲染字段白名单仍然需要单独冻结，避免 `renderHash` 过度敏感或过度复用。

---

## 10. 查询能力设计

### 10.1 常见查询路径

新模型需要优先支持以下查询：

- 按 `cardId + 版本` 查询结构化卡牌
- 按 `cardId` 查询完整历史时间线
- 按 `cardId + 版本` 查询渲染模型
- 按逻辑 `Tag` 查询卡牌，如“某版本中 `HEALTH = 30` 的卡”
- 按 `renderHash` 查询有哪些版本复用了同一渲染
- 查询所有 `status = discovered` 的未知 Tag，便于补配置

### 10.2 推荐视图

为兼容现有接口，建议提供兼容视图：

- `hearthstone.entity_view`
- `hearthstone.card_entity_view`

这些视图从：

- `entities`
- `entity_localizations`
- `cards`

拼装出当前 API 所需结构。

这样可以做到：

- 底层模型重构
- 上层查询接口尽量少改

---

## 11. 导入流程

### 11.1 导入主链路

1. 读取某个 `sourceVersion`
2. 解析 `CardDefs.xml`
3. 对每个 `Entity` 做规范化
4. 对每个原始 `Tag` 按 `enumID` 查找 `tags`
5. 若 Tag 未知，则自动注册到 `tags`
6. 按 `tags` 中的解析配置生成类型化值，并写入 `raw_entity_snapshot_tags`
7. 生成或复用 `raw_entity_snapshot`，并更新其 `sourceSpan`
8. 根据 `tags` 中的字段映射配置投影为 `entities`
9. 生成对应语言的 `entity_localizations`
10. 计算 `renderHash` 与 `renderModel`，并内联写入 `entity_localizations`

### 11.2 重新投影

当出现以下情况时，不需要重读 XML：

- 某个 Tag 新增了解释
- 某个 Tag 更改了 slug
- 某个 Tag 新增了目标字段映射
- 某个 Tag 修正了 `bool / enum / card_ref` 解析方式
- 渲染字段白名单有调整

只需：

1. 基于已有 `raw_entity_snapshots` 重新跑投影
2. 重建 `entities`
3. 重建 `entity_localizations`

这也是该设计最重要的工程收益之一。

---

## 12. 表分类建议

按照仓库约定，建议这样分类：

### 12.1 `hearthstone_data`

这些表属于导入与系统侧投影，不携带用户语义：

- `source_versions`
- `raw_entity_snapshots`
- `raw_entity_snapshot_tags`

### 12.2 `hearthstone`

这些表属于可导出的静态领域事实：

- `tags`
- `cards`
- `entities`
- `entity_localizations`

当前设计中不需要新增 `hearthstone_app` 表。

---

## 13. 与现有模型的关系

现有表中：

- `hearthstone.cards` 可以继续保留，作为卡牌稳定身份与非 XML 侧领域事实承载
- `hearthstone.entities`
- `hearthstone.entity_localizations`

建议逐步调整为：

- 新数据继续写入 `entities`、`entity_localizations`
- 为这两张表补充 `sourceSpan`、`revisionHash`、`localizationHash`、`renderHash`、`renderModel` 等字段
- 旧接口通过兼容视图读取

这样可以避免一次性大迁移导致上层大量改动。

---

## 14. 风险与开放问题

### 14.1 `Power` 等非 Tag 子结构

当前设计把重点放在 `Tag`，但 `Power`、`ReferencedTag`、`EntourageCard` 也可能参与领域投影。

建议：

- v1 先保存在 `raw_entity_snapshots.extraPayload`
- 当确实出现稳定查询需求时，再为这些子结构补专门的配置字段或独立子结构表

### 14.2 `int4multirange` 的落地成本

从模型上看，`int4multirange` 很适合表示版本区间压缩；但如果当前 ORM 支持不足，则可先采用：

- `versionStart`
- `versionEnd`

等 ORM 能力补齐后再切换。

### 14.3 渲染字段白名单需要独立评审

“哪些字段影响渲染”是整套设计的关键边界。这个列表必须单独确认，否则：

- 去重过度会错误复用卡图
- 去重不足会造成缓存浪费

### 14.4 `enumID` 稳定性的前提

当前简化方案依赖一个前提：`enumID` 是稳定且一义的。如果后续发现同一个 `enumID` 在不同历史阶段承载了不同语义，需要再引入版本化配置或特殊覆盖规则。

---

## 15. 建议的下一步

1. 先对这份设计做评审，重点确认：
   - `enumID` 作为 Tag 主键是否正式确认
   - Tag 解析与字段映射是否都合并到 `tags`
   - 是否接受取消 `card_timelines`、`render_models` 等中间表
   - `sourceSpan` 是否统一使用 `int4multirange`
2. 评审通过后，再补实施计划，分阶段落地：
   - P0：Tag 注册与原始快照层
   - P1：`entities` 与 `entity_localizations` 字段调整
   - P2：渲染 hash 与 payload 内联
   - P3：兼容视图与查询接口迁移
