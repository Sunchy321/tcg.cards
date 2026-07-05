# 炉石图片渲染器协议

**协议版本：1**

## 目的

本文档定义一个炉石卡图渲染器的对外 HTTP 契约。

本文档规定渲染器接口的请求与响应要求，不定义调用方侧的批量拆分、任务编排、轮询或本地导入流程。

## 适用范围

本规范适用于一次同步渲染请求：

- 一次 HTTP 请求只渲染一张图
- 请求体是 JSON
- 成功响应体是 PNG

批量拆分与更高层的任务编排，不属于本规范范围。

## 接口

渲染器必须暴露以下接口：

- `POST /render`
- `GET /status`

### `POST /render`

渲染器必须接收：

- method: `POST`
- 请求 `Content-Type`: `application/json`
- 成功响应 `Content-Type`: `image/png`

对于成功请求，渲染器必须直接在响应体里返回一张 PNG 图片。

### `GET /status`

渲染器必须提供一个状态检查接口，用于服务可用性与协议兼容性检查。

该接口必须接收：

- method: `GET`

该接口必须返回：

- HTTP status: `200`，前提是服务可达且能够报告自身状态
- `Content-Type: application/json`

响应体必须包含以下字段：

- `service`
  稳定的渲染器服务标识。
- `version`
  渲染器实现版本。
- `protocolVersion`
  当前外部渲染器协议的实现版本。
- `requestShape`
  支持的请求对象形态标识。
- `outputFormat`
  成功响应的图片格式。期望值是 `png`。
- `ready`
  渲染器当前是否可以接收渲染请求。
- `message`
  可选的人类可读状态说明。

调用方通过以下条件检查服务可用性与兼容性：

- `GET /status` 是否可达
- `ready` 是否为 `true`
- `protocolVersion`、`requestShape`、`outputFormat` 是否与调用方期望值一致

## 请求模型

请求体必须是一个单图渲染请求对象。

渲染器必须能够从请求体中读取以下最小输入：

- 一个卡牌标识
- `variant`
- 输出宽高
- `renderModel`

当前约定下，卡牌标识可以来自以下任一位置：

- `card.cardId`
- `renderModel.cardId`

当前请求体中，渲染器直接依赖的字段是：

- `variant`
  请求的 zone、template、premium 组合。
- `output`
  输出图片要求。当前协议只要求 `output.width` 与 `output.height`。
- `renderModel`
  用于生成卡图的 canonical render-model 载荷。

`requestId` 可作为调用方追踪字段，但不是渲染成功的前提条件。

`card`、`style`、`target`、`output.fileName` 以及其他导出侧字段可以存在于请求体中，但不属于本规范要求渲染器必须依赖的最小输入集合。

本规范定义的接口只接收单个渲染请求对象，不接收批量 wrapper 文档。

## Post Body 结构

`POST /render` 请求体是一个 JSON 对象，遵循共享上游模型中定义的 `ImageRequirementRequest` schema。

### 必填与可选字段

渲染器只依赖请求体的一个子集：

- **渲染必需**：`variant`、`output.width`、`output.height`、`renderModel`，以及一个卡牌标识（`card.cardId` 或 `renderModel.cardId`）。
- **可选 / 渲染器不消费**：`requestId`、`card`（除 `cardId` 外）、`style`、`target`、`output.fileName`、`output.format`、`output.transparentBackground`。

渲染器不消费的字段随请求携带，供调用方追踪和导出/导入流程使用。

### 示例

```json
{
  "requestId": "req_abc123",
  "card": {
    "cardId": "ABC_123",
    "lang": "zhs",
    "version": [35, 4, 0],
    "revisionHash": "abc123def456",
    "localizationHash": "loc_hash_001",
    "renderHash": "render_hash_001"
  },
  "variant": {
    "zone": "play",
    "template": "normal",
    "premium": "normal"
  },
  "renderMode": "full-set",
  "style": {
    "styleKey": "play_normal_normal_default",
    "zone": "play",
    "template": "normal",
    "premium": "normal",
    "layout": "default",
    "width": 512,
    "height": 768,
    "transparentBackground": false
  },
  "output": {
    "fileName": "ABC_123_play_normal_normal.png",
    "format": "png",
    "width": 512,
    "height": 768,
    "transparentBackground": false
  },
  "target": {
    "r2Bucket": "hearthstone-card-images",
    "r2Key": "base/play/normal/normal/ab/abc123def456.webp",
    "contentType": "image/webp"
  },
  "renderModel": {
    "cardId": "ABC_123",
    "lang": "zhs",
    "variant": "normal",
    "templateVersion": "35.4.0",
    "assetVersion": "35.4.0",
    "localization": {
      "name": "炎魔之王拉格纳罗斯",
      "richText": "<b>战吼：</b>造成8点伤害。"
    },
    "type": "minion",
    "cost": 8,
    "attack": 8,
    "health": 8,
    "classes": ["neutral"],
    "race": ["elemental"],
    "set": 3,
    "rarity": "legendary",
    "elite": false,
    "renderMechanics": {}
  }
}
```

### 字段参考

#### `requestId`

- **类型**：`string`
- **必填**：否

调用方追踪标识。渲染器不消费。

#### `card`

- **类型**：`object`
- **必填**：否，但 `card.cardId` 是两种卡牌标识来源之一。

| 字段 | 类型 | 说明 |
|-------|------|-------------|
| `cardId` | `string` | 卡牌标识 |
| `lang` | `string` | 语言代码（如 `zhs`、`enus`） |
| `version` | `number[]` | 游戏版本，格式为 `[major, minor, patch]` |
| `revisionHash` | `string` | 内容修订哈希 |
| `localizationHash` | `string` | 本地化内容哈希 |
| `renderHash` | `string` | 渲染身份哈希 |

#### `variant`

- **类型**：`object`
- **必填**：是

| 字段 | 类型 | 可选值 | 说明 |
|-------|------|--------|-------------|
| `zone` | `string` | `"hand"`、`"play"` | 卡牌显示区域 |
| `template` | `string` | `"normal"`、`"battlegrounds"` | 卡牌模板 |
| `premium` | `string` | `"normal"`、`"golden"`、`"diamond"`、`"signature"` | 卡牌品质 |

#### `renderMode`

- **类型**：`string`
- **必填**：是
- **默认值**：`"full-set"`
- **可选值**：`"full-set"`、`"partial-update"`

声明 `renderModel` 可选字段的字段存在性语义。

| 值 | 字段缺失 | 显式 `null` |
|----|---------|-------------|
| `"full-set"` | 清除 / 重置为默认值 | 清除 / 重置为默认值 |
| `"partial-update"` | 保持不变 | 清除 / 重置为默认值 |

当为 `"partial-update"` 时，`renderModel` 中标 `?` 的可选字段可以缺失，渲染器不得修改缺失字段对应的卡牌元素。

当为 `"full-set"` 时，所有字段均应存在。

#### `style`

- **类型**：`object`
- **必填**：否

导出/导入流程使用的渲染样式声明。渲染器不消费。

| 字段 | 类型 | 说明 |
|-------|------|-------------|
| `styleKey` | `string` | 样式标识 |
| `zone` | `string` | 同 `variant.zone` |
| `template` | `string` | 同 `variant.template` |
| `premium` | `string` | 同 `variant.premium` |
| `layout` | `string` | 布局标识 |
| `width` | `number` | 样式宽度（像素） |
| `height` | `number` | 样式高度（像素） |
| `transparentBackground` | `boolean` | 是否请求透明背景 |

#### `output`

- **类型**：`object`
- **必填**：是（至少需要 `width` 和 `height`）

| 字段 | 类型 | 说明 |
|-------|------|-------------|
| `fileName` | `string` | 输出 PNG 文件名。渲染器不消费。 |
| `format` | `"png"` | 输出格式，固定为 `"png"`。 |
| `width` | `number`（正整数） | 输出图片宽度（像素） |
| `height` | `number`（正整数） | 输出图片高度（像素） |
| `transparentBackground` | `boolean` | 输出是否使用透明背景。渲染器不消费。 |

#### `target`

- **类型**：`object`
- **必填**：否

导入流程使用的存储目标元数据。渲染器不消费。

| 字段 | 类型 | 说明 |
|-------|------|-------------|
| `r2Bucket` | `string` | 目标 R2 bucket 名称 |
| `r2Key` | `string` | 目标 R2 对象 key |
| `contentType` | `"image/webp"` | 目标内容类型，固定为 `"image/webp"`。 |

#### `renderModel`

- **类型**：`object`
- **必填**：是

包含卡图渲染所需全部卡牌数据的 canonical render-model 载荷。这是渲染器驱动渲染的主要输入。

标记为 `?` 的字段为可选，当值为 null 或不适用时省略。字段存在性语义见 `renderMode`。

| 字段 | 类型 | 说明 |
|-------|------|-------------|
| `cardId` | `string` | 卡牌标识 |
| `lang` | `string` | 语言代码 |
| `variant` | `string` | 卡牌变体标识 |
| `templateVersion` | `string` | 模板版本 |
| `assetVersion` | `string` | 资源版本 |
| `localization` | `object` | 本地化文本载荷 |
| `localization.name` | `string` | 卡牌名称 |
| `localization.richText` | `string` | 带标记的卡牌描述文本 |
| `type` | `string` | 卡牌类型（如 `minion`、`spell`、`weapon`） |
| `cost` | `number` | 法力值消耗 |
| `attack` | `number?` | 攻击力。 |
| `health` | `number?` | 生命值。 |
| `durability` | `number?` | 耐久度（武器）。 |
| `armor` | `number?` | 护甲值。 |
| `classes` | `string[]` | 职业归属。 |
| `race` | `string[]?` | 随从种族。 |
| `spellSchool` | `string?` | 法术派系。 |
| `mercenaryRole` | `string?` | 佣兵角色（`protector`、`fighter`、`caster`、`neutral`）。 |
| `mercenaryFaction` | `string?` | 佣兵阵营（`alliance`、`horde`、`empire`、`explorer`、`legion`、`pirate`、`scourge`）。 |
| `colddown` | `number?` | 佣兵技能冷却（速度值）。 |
| `set` | `number` | 卡牌系列标识。 |
| `overrideWatermark` | `string?` | 覆盖水印。 |
| `rarity` | `string?` | 稀有度（如 `legendary`、`epic`）。 |
| `elite` | `boolean` | 精英标识。 |
| `techLevel` | `number?` | 酒馆战棋科技等级。 |
| `rune` | `string[]?` | 死亡骑士符文组合（`blood`、`frost`、`unholy`）。 |
| `renderMechanics` | `object` | 渲染机制标识。完整 key 列表见下方 `renderMechanics` 小节。 |

#### `renderMechanics`

一个 partial-record 对象，以 GAME_TAG 枚举 ID 字符串为 key。只有适用于该卡牌的机制才会出现，每个 key 均为可选。

值类型：`boolean | integer`

使用数字 ID 作为 key 可避免 slug 名称变更导致的 hash 不稳定。

| Key (string) | GAME_TAG | Slug | 说明 |
|-------------|----------|------|------|
| `"2"` | DATA_NUM_1 | `data-num-1` | {0} 替换 |
| `"3"` | DATA_NUM_2 | `data-num-2` | {1} 替换 |
| `"682"` | HIDE_HEALTH | `hide-health` | 在渲染卡面上隐藏生命值 |
| `"683"` | HIDE_ATTACK | `hide-attack` | 在渲染卡面上隐藏攻击力 |
| `"684"` | HIDE_COST | `hide-cost` | 在渲染卡面上隐藏法力值消耗 |
| `"955"` | USE_ALTERNATE_CARD_TEXT | `use-alternate-card-text` | @ 分隔选第 N 段可选文本 |
| `"1107"` | HIDE_WATERMARK | `hide-watermark` | 在渲染卡面上隐藏职业水印 |
| `"1671"` | LETTUCE_PASSIVE_ABILITY | `lettuce-passive-ability` | 佣兵技能为被动 |
| `"1676"` | LETTUCE_ABILITY_SUMMONED_MINION | `lettuce-ability-summoned-minion` | 佣兵技能召唤随从 |
| `"1720"` | TRADEABLE | `tradeable` | 卡牌具有可交易机制 |
| `"1824"` | IN_MINI_SET | `in-mini-set` | 卡牌属于迷你系列 |
| `"1852"` | LETTUCE_MERCENARY_EXPERIENCE | `lettuce-mercenary-experience` | 佣兵经验值（转为等级显示） |
| `"1855"` | LETTUCE_EQUIPMENT | `lettuce-equipment` | 佣兵卡牌为装备 |
| `"2170"` | LETTUCE_IS_TREASURE_CARD | `lettuce-is-treasure-card` | 佣兵卡牌为宝藏 |
| `"2493"` | LETTUCE_ABILITY_TIER | `lettuce-ability-tier` | 佣兵技能等级（1–3） |
| `"2494"` | LETTUCE_EQUIPMENT_TIER | `lettuce-equipment-tier` | 佣兵装备等级（1–4） |
| `"2785"` | FORGE | `forge` | 卡牌具有锻造机制 |
| `"2889"` | DATA_NUM_3 | `data-num-3` | {2} 替换 |
| `"2890"` | CARD_NAME_DATA_1 | `card-name-data-1` | 卡名 {0} 替换 |
| `"2919"` | DATA_NUM_4 | `data-num-4` | {3} 替换 |
| `"2920"` | DATA_NUM_5 | `data-num-5` | {4} 替换 |
| `"2921"` | DATA_NUM_6 | `data-num-6` | {5} 替换，可选 CardDBID 引用 |
| `"4354"` | PREPARE | `prepare` | 卡牌具有预备机制 |
| `"4503"` | TIMEWARPED | `timewarped` | 卡牌具有酒馆战棋时空扭曲机制 |
| `"4519"` | BACON_ALT_TAVERN_SYSTEM_ACTIVE | `bacon-alt-tavern-system-active` | 是否时空扭曲酒馆 |
| `"4579"` | HAS_TIMEWARPED_TAVERN_ALT_TEXT | `has-timewarped-tavern-alt-text` | 时空扭曲下 alt text 索引 |

## 功能约束

渲染器必须满足以下行为约束：

- 对一个有效请求返回一个有效 PNG 二进制
- 每次请求只渲染一张图
- 把请求体视为完整、自包含的渲染输入
- 遵守 `output.width` 和 `output.height`
- 支持炉石卡图渲染所需的 `variant` 与 `renderModel`
- 提供 `GET /status` 供可用性与兼容性检查

对于等价的请求载荷，除非渲染器版本或资源集发生变更，否则渲染器应当产出等价的视觉结果。

## 成功响应

成功时，渲染器应当返回：

- HTTP status: `200`
- `Content-Type: image/png`
- body: PNG 字节流

成功响应体只包含 PNG 字节流。

## 失败响应

失败时，渲染器应当返回一个非 2xx 响应。

错误响应体可以是纯文本，也可以是 JSON，但应当包含一条调用方可直接展示或记录的人类可读错误信息，用于诊断。

建议行为：

- `400` 用于非法输入
- `422` 用于请求结构合法但无法渲染
- `500` 用于渲染器自身的意外失败

这些状态码只是建议，不是强制枚举；但渲染器在没有产出有效 PNG 时，不能返回 `200`。

## 范围外

本规范不定义：

- 多图批量提交
- 异步任务
- 任务状态轮询
- 进度事件
- zip 包上传或下载
- 远端存储上传
- 持久化任务历史
- 鉴权或授权
- `/status` 返回字段之外的调用方兼容性策略
- 背景透明度语义
- 导出侧 requirements 文档的完整字段约束

如果需要这些能力，应当通过单独的协议或调用方实现进行定义。

## 实现参考

- 共享上游模型：[`packages/model/src/hearthstone/schema/data/image.ts`](../packages/model/src/hearthstone/schema/data/image.ts)
