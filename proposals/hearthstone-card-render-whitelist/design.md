# 炉石卡牌渲染字段白名单提案

## 背景

当前 `hs-card-model` 已经引入 `renderModel` / `renderHash` 的设计方向，但“哪些字段真正影响渲染”尚未冻结。

旧仓库中的 `references/hearthstone/raw/into-json.ts` 可以视为一份现成的渲染输入契约：它把 `EntityView` 投影成 Apollo 渲染器消费的 JSON。只要某个输入字段会改变这份 JSON，它就应该进入当前模型的渲染字段白名单。

本提案基于 `references/hearthstone/raw/into-json.ts` 的现有逻辑，收敛首版渲染字段白名单，并补充 `mechanics` 的专门处理规则。

## 分析范围

以 `intoApolloJson()` 的实际输出为准，分析以下内容：

- `cardID`
- `cardName`
- `cardText`
- `tags`
- 变体输入：`premium`、`useBattlegroundsStyle`、`useHeroStyle`

如果某个字段不会改变上述输出，则不进入首版渲染字段白名单。

## 白名单结论

### 1. 直接渲染字段

以下字段直接参与旧渲染 JSON 的生成，应进入白名单：

- `cardId`
- `localization.name`
- `localization.richText`
- `type`
- `cost`
- `attack`
- `armor`
- `classes`
- `race`
- `spellSchool`
- `mercenaryFaction`
- `set`
- `rarity`
- `elite`
- `techLevel`
- `rune`

说明：

- `cardId` 虽然不是可见文字，但它直接进入输出的 `cardID`，并通常参与资源定位，因此必须视为渲染相关字段。
- `localization.text`、`displayText`、`targetText` 等字段在旧逻辑中未直接参与渲染输入，首版不纳入白名单。

### 2. 结构数值字段

`health` 和 `durability` 不需要额外收敛成 `displayHealth`。

原因：

- `type` 已经参与渲染输入
- 在当前卡牌类型语义下，`health` 与 `durability` 只有一个会对最终卡面生效
- 只要空值表示统一，直接保留这两个原始字段不会额外制造错误的 `renderHash` 分裂

因此首版建议直接把以下字段纳入 `renderModel`：

- `health`
- `durability`

规范化要求：

- 缺失值统一使用固定空值表示
- 不额外引入 `displayHealth` 这一层派生字段

### 3. 渲染上下文字段

以下字段不属于 `Entity` / `EntityLocalization` 的领域事实，但会改变最终卡面输出，应纳入渲染上下文：

- `lang`
- `variant`
- 渲染模板版本
- 资源版本

其中 `variant` 基于旧逻辑至少应区分：

- `normal`
- `golden`
- `diamond`
- `signature`
- `battlegrounds`
- `in-game`

原因是旧逻辑会把这些变体投影为：

- `premium`
- `useBattlegroundsStyle`
- `useHeroStyle`

若不把这些上下文纳入 `renderHash` 输入，会出现同一卡牌在不同模板或不同变体下错误复用卡图的问题。

本提案采用更直接的首版策略：

- 只要某字段已经进入白名单，就始终纳入 `renderHash`
- 不再为“某字段是否只在特定模板下生效”增加条件分支

原因：

- 当前数据源在字段不影响显示时，通常会提供稳定的默认值
- 在这种前提下，始终纳入这些字段不会明显破坏去重效果
- 这种策略比“按模板条件参与 hash”更简单、更稳定、更容易解释

## `mechanics` 的处理规则

### 问题

旧逻辑并不会使用全部 `mechanics`。如果把整个 `mechanics` 对象直接纳入渲染白名单，会带来两个问题：

- 某些仅影响查询或历史表达的 mechanic 变化，会错误触发重新渲染
- `mechanics` 未来扩展后，会让 `renderHash` 无控制地分裂

因此首版必须明确：**不能把整个 `mechanics` 直接放入渲染白名单。**

### 旧逻辑实际使用的 mechanic 子集

基于 `intoApolloJson()`，当前实际进入旧渲染输入的 mechanic 只有以下 7 个：

- `tradable`
- `forge`
- `hide_cost`
- `hide_attack`
- `hide_health`
- `in_mini_set`
- `hide_watermark`

首版白名单只保留这 7 个 mechanic。

### 首版建议的投影方式

在 `renderModel` 中不要保留原始 `mechanics`，而是单独生成一个固定结构：

```json
{
  "renderMechanics": {
    "tradable": false,
    "forge": false,
    "hideCost": false,
    "hideAttack": false,
    "hideHealth": false,
    "inMiniSet": false,
    "hideWatermark": false
  }
}
```

规则：

- 缺失值统一补 `false`
- 不保留与渲染无关的 mechanic
- 输出键使用固定语义名，不直接复用数据库里的动态键结构

这样可以同时满足：

- 与旧渲染输入语义对齐
- 避免把整包 `mechanics` 带入 hash
- 避免未来 mechanic 扩展造成 hash 抖动

### 与当前 `mechanics` 存储方案的衔接

当前 `field-decisions.md` 已确定：

- `entities.mechanics` 使用结构化对象保存
- 存储键优先使用 `enumId` 字符串

这与渲染层的需求并不冲突。建议做法是：

1. 领域层继续保留完整 `mechanics`
2. 渲染投影层维护一份固定的“渲染 mechanic 提取表”
3. 提取表把渲染语义映射为具体 `enumId`
4. 最终仅把提取后的 `renderMechanics` 写入 `renderModel`

也就是说：

- `entities.mechanics` 负责完整表达
- `renderMechanics` 负责渲染稳定性

二者不要合并为同一份 hash 输入。

## 不纳入首版白名单的字段

基于旧逻辑，以下字段当前不应纳入首版渲染白名单：

- 整个 `mechanics`
- `localization.text`
- `localization.displayText`
- `localization.targetText`
- `localization.textInPlay`
- `localization.howToEarn`
- `localization.howToEarnGolden`
- `localization.flavorText`
- `colddown`
- `mercenaryRole`
- `adjustment`
- `nerf`
- `outName`

说明：

- `colddown`、`mercenaryRole` 只在旧代码的注释掉 nerf 逻辑中出现，当前不会改变渲染 JSON
- `adjustment` / `nerf` 当前逻辑未启用，不应提前纳入白名单
- `outName` 仅出现在类型定义中，当前返回值并未输出

## 首版 `renderModel` 建议结构

建议首版使用以下 canonical 结构作为渲染模型输入：

```json
{
  "cardId": "string",
  "lang": "en",
  "variant": "normal",
  "templateVersion": "v1",
  "resourceVersion": "v1",
  "name": "string",
  "richText": "string",
  "type": "minion",
  "cost": 0,
  "attack": 0,
  "health": 0,
  "durability": null,
  "armor": 0,
  "classes": ["neutral"],
  "race": ["beast"],
  "spellSchool": null,
  "mercenaryFaction": null,
  "set": "core",
  "rarity": "common",
  "elite": false,
  "techLevel": 0,
  "rune": [],
  "renderMechanics": {
    "tradable": false,
    "forge": false,
    "hideCost": false,
    "hideAttack": false,
    "hideHealth": false,
    "inMiniSet": false,
    "hideWatermark": false
  }
}
```

要求：

- 所有数组在进入 hash 前按稳定规则规范化
- 空值、缺省值、布尔值统一表示
- `health`、`durability` 使用统一空值表示

## 实施建议

首版实现建议采用“两层投影”：

1. 从 `entities` / `entity_localizations` 中提取完整领域字段
2. 构造一份专用 `renderModel`
3. 对 `renderModel` 做 canonical JSON 序列化
4. 基于序列化结果生成 `renderHash`

### 白名单逻辑变更时的更新策略

只要以下任一内容发生变化，都应视为“渲染白名单逻辑变更”：

- 白名单字段集合变化
- 字段规范化规则变化
- `renderMechanics` 子集变化
- 模板版本或资源版本的参与规则变化

在这种情况下，仍然需要全量重算当前规则下的 `renderModel` 与 `renderHash`，但**不应把这件事直接等价为全量图片迁移**。

原因：

- 图片由第三方工具批量生成，无法依赖按需生成兜底
- 图片对象全量存储在 R2 上，全量重生成和全量上传会带来明显的吞吐、存储和切换风险
- 如果把“白名单逻辑变化”直接建模为一次强制 hash 命名空间切换，即使最终图片没有变化，也会触发不必要的全量迁移

因此本提案采用以下原则：

- `renderHash` 绑定第三方工具实际消费的规范化渲染输入
- 不把“白名单版本号变化”直接作为 `renderHash` 的强制输入
- 白名单逻辑变化后，先全量重算，再根据新旧 hash 差异决定图片迁移范围

建议区分两层：

- 数据层：白名单逻辑变化后，必须全量回填 `entity_localizations.renderModel`
- 哈希层：基于新的 `renderModel` 全量回填 `entity_localizations.renderHash`
- 图片层：只迁移 `newRenderHash != oldRenderHash` 的差异图片

首版推荐迁移流程：

1. 基于新规则全量重算 `renderModel`
2. 基于新 `renderModel` 全量重算 `renderHash`
3. 产出差异清单：仅保留 `newRenderHash != oldRenderHash` 的记录
4. 仅对差异清单调用第三方工具生成图片
5. 将差异图片上传到新的对象路径或命名空间
6. 完成数量校验与抽样校验后，再切换线上引用
7. 切换稳定后，延迟清理旧图片对象

这种策略的核心优点是：

- 数据模型始终与当前白名单逻辑保持一致
- 只有真正影响最终渲染结果的记录才触发图片迁移
- 避免因为 hash 命名空间整体变化而造成全量 R2 迁移

因此本提案的默认结论是：

- 白名单逻辑变化时，必须全量更新 `renderModel` 与 `renderHash`
- 白名单逻辑变化时，不默认执行全量图片更新
- 图片迁移范围应由 `oldRenderHash` / `newRenderHash` 差异决定
- 全量图片更新只应在确实出现“全部记录 hash 都变化”的情况下被动发生，而不是作为默认策略

不建议：

- 直接对 `entities` 的整行字段做 hash
- 直接把 `mechanics` 全量并入 `renderModel`
- 在缺少统一空值规范的情况下直接把 `health`、`durability` 原样入 hash

## 待确认项

以下问题仍建议在正式冻结前补一次确认：

- `in_mini_set` 与 `hide_watermark` 是否足以覆盖当前 watermark 逻辑
- 后续若第三方工具的实际输入契约变化，是否需要为迁移流程补充更细的批次与回滚设计

## 最终建议

首版渲染字段白名单应按“旧 Apollo 渲染输入等价”原则冻结，而不是按“字段看起来可能影响渲染”进行主观扩张。

其中最关键的两条规则是：

- 直接使用 `health` / `durability`，但统一空值表示
- 用固定的 `renderMechanics` 子集取代整个 `mechanics` 对象入 hash

并且首版对已纳入白名单的字段采用“始终参与 hash”的静态策略，不再为不同模板增加条件分支。

只要把这几个边界先收紧，首版 `renderHash` 的稳定性和可解释性就会明显提升。
