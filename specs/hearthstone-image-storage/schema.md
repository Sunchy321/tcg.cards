# 炉石图片第三方需求文件格式

## 1. 文件范围

本文定义控制台导出的第三方需求文件，以及第三方工具返回 PNG 压缩包时必须遵守的文件契约。

首版文件：

```text
hearthstone-card-image-requirements.v1.json
```

第三方返回：

```text
hearthstone-card-image-results.{exportId}.zip
```

## 2. 总体流程

```text
控制台导出 requirements JSON
  -> 第三方工具读取 requirements JSON
  -> 第三方工具按 output.fileName 生成 PNG
  -> 第三方工具打包 PNG ZIP
  -> 控制台或本地脚本导入 ZIP
  -> 控制台或本地脚本转换 WebP 并上传 R2
```

第三方工具不需要也不应该：

- 生成 WebP
- 上传 R2
- 写数据库
- 修改需求文件中的 `target.r2Key`

## 3. 数量限制

需求文件必须包含数量限制信息。

首版建议：

- `limits.defaultMaxRequests = 200`
- `limits.hardMaxRequests = 500`
- `requests.length <= limits.maxRequests`
- `limits.maxRequests <= limits.hardMaxRequests`

当缺图数量超过 `limits.maxRequests` 时，控制台只导出当前批次，并在 `batch` 中提供剩余数量和下一批提示。

导入端必须拒绝：

- `requests.length > limits.maxRequests`
- `limits.maxRequests > limits.hardMaxRequests`
- PNG 文件数量超过 `requests.length` 的 ZIP，系统垃圾文件除外

## 4. 顶层结构

```json
{
  "schema": "tcg.cards.hearthstone.card-image-requirements.v1",
  "exportId": "hsimg_20260423_001",
  "imageSpecVersion": "hs-card-image-v1",
  "generatedAt": "2026-04-23T10:00:00.000Z",
  "toolContract": {
    "inputFormat": "json",
    "outputArchiveFormat": "zip",
    "outputImageFormat": "png",
    "fileNamePolicy": "exact"
  },
  "limits": {
    "defaultMaxRequests": 200,
    "hardMaxRequests": 500,
    "maxRequests": 200,
    "requestCount": 2,
    "remainingEstimate": 1280
  },
  "batch": {
    "index": 1,
    "cursor": "eyJvZmZzZXQiOjIwMH0",
    "hasMore": true
  },
  "defaults": {
    "png": {
      "color": "rgba",
      "transparentBackground": true
    },
    "target": {
      "contentType": "image/webp",
      "webpPreset": "q86-m4-fast"
    }
  },
  "requests": []
}
```

## 5. 顶层字段

| 字段 | 必需 | 类型 | 说明 |
|------|------|------|------|
| `schema` | 是 | string | 固定 `tcg.cards.hearthstone.card-image-requirements.v1` |
| `exportId` | 是 | string | 控制台生成的导出批次 ID |
| `imageSpecVersion` | 是 | string | 图片协议版本，首版为 `hs-card-image-v1` |
| `generatedAt` | 是 | string | ISO 时间 |
| `toolContract` | 是 | object | 第三方工具输入输出契约 |
| `limits` | 是 | object | 数量限制 |
| `batch` | 是 | object | 当前批次信息 |
| `defaults` | 是 | object | 默认输出契约 |
| `requests` | 是 | array | 渲染请求数组 |

## 6. Request 结构

```json
{
  "requestId": "sha256:3f67c0d8b5d15d5d2f1d4d56f13b0fd8f3b8d4f6b31c2d7ad0d4fb8354e2f7b1",
  "card": {
    "cardId": "CORE_EXAMPLE_001",
    "lang": "zhs",
    "version": [31001, 31002],
    "revisionHash": "8f1c...",
    "localizationHash": "7aa9...",
    "renderHash": "9f2c0f6e4e0c7f4d0f0b8c2e9c8d7a1a3c6b4e5f60123456789abcdef01"
  },
  "variant": {
    "zone": "hand",
    "template": "normal",
    "premium": "normal"
  },
  "style": {
    "styleKey": "hand.normal.normal",
    "zone": "hand",
    "template": "normal",
    "premium": "normal",
    "layout": "card.hand.v1",
    "width": 512,
    "height": 768,
    "transparentBackground": true
  },
  "output": {
    "fileName": "3f67c0d8b5d15d5d2f1d4d56f13b0fd8f3b8d4f6b31c2d7ad0d4fb8354e2f7b1.png",
    "format": "png",
    "width": 512,
    "height": 768,
    "transparentBackground": true
  },
  "target": {
    "r2Bucket": "R2_ASSETS",
    "r2Key": "hearthstone/card-images/hs-card-image-v1/hand/normal/normal/9f/9f2c0f6e4e0c7f4d0f0b8c2e9c8d7a1a3c6b4e5f60123456789abcdef01.webp",
    "contentType": "image/webp"
  },
  "renderModel": {
    "cardId": "CORE_EXAMPLE_001",
    "lang": "zhs",
    "variant": "normal",
    "templateVersion": "v1",
    "assetVersion": "v1",
    "localization": {
      "name": "示例卡牌",
      "richText": "造成 3 点伤害。"
    },
    "type": "spell",
    "cost": 2,
    "attack": null,
    "health": null,
    "durability": null,
    "armor": null,
    "classes": ["mage"],
    "race": null,
    "spellSchool": "fire",
    "mercenaryFaction": null,
    "set": "CORE",
    "overrideWatermark": null,
    "rarity": "common",
    "elite": false,
    "techLevel": null,
    "rune": null,
    "renderMechanics": {}
  }
}
```

## 7. Request 字段

| 字段 | 必需 | 类型 | 说明 |
|------|------|------|------|
| `requestId` | 是 | string | 稳定请求 ID |
| `card` | 是 | object | 调试与定位用卡牌元数据 |
| `card.cardId` | 是 | string | 卡牌 ID |
| `card.lang` | 是 | string | 本地化语言 |
| `card.renderHash` | 是 | string | canonical `renderModel` hash |
| `variant` | 是 | object | 图片变体 |
| `style` | 是 | object | 第三方渲染样式选择 |
| `output` | 是 | object | 第三方需要生成的 PNG 输出 |
| `output.fileName` | 是 | string | ZIP 中的 PNG 文件名 |
| `target` | 是 | object | 控制台导入后上传 R2 的目标信息 |
| `renderModel` | 是 | object | 第三方渲染所需完整模型 |
| `renderModel.renderMechanics` | 是 | object | 影响卡牌视觉渲染的机制标记 |

## 8. Variant 枚举

| 字段 | 允许值 |
|------|--------|
| `variant.zone` | `hand` / `play` |
| `variant.template` | `normal` / `battlegrounds` |
| `variant.premium` | `normal` / `golden` / `diamond` / `signature` |

`style.zone`、`style.template`、`style.premium` 必须与 `variant` 完全一致。

### 8.1 首版导出兼容规则

需求文件仍使用通用的 `zone / template / premium` 三维结构，但控制台首版导出要兼容旧版图片产物范围，因此不是所有组合都会对每张卡导出。

按单卡规则，首版只导出以下样式：

| 条件 | 导出样式 |
|------|----------|
| 所有非 `enchantment` 卡牌 | `hand.normal.normal` |
| 所有非 `enchantment` 卡牌 | `hand.normal.golden` |
| 具有 `has_diamond` mechanic | `hand.normal.diamond` |
| 具有 `has_signature` mechanic | `hand.normal.signature` |
| `set = bgs` 或 `techLevel != null` | `hand.battlegrounds.normal` |

首版暂不导出任何 `play.*.*` 组合；对战区图片作为后续目标单独实现。

以下组合首版不会自动导出：

- 任意 `play.*.*`
- `hand.battlegrounds.golden`
- `hand.battlegrounds.diamond`
- `hand.battlegrounds.signature`

## 9. RenderMechanics

`renderModel.renderMechanics` 是从领域层 `mechanics` 中投影出来的渲染相关子集。

它只包含会影响卡牌图片外观的机制，不等同于完整游戏机制列表。第三方工具必须识别以下 key；遇到未知 key 时应忽略，不应中断整批渲染。

值类型为：

- `boolean`
- `integer`

首版已使用的 key 都按开关语义处理：

- `true` 或非 `0` 整数表示启用
- `false`、`0` 或字段不存在表示不启用

### 9.1 支持的 RenderMechanic

| key | 作用 | 渲染要求 |
|-----|------|----------|
| `tradable` | 表示卡牌具有“可交易”机制 | 按当前 `style.layout` 渲染可交易相关视觉元素，例如关键字、图标或布局保留区 |
| `forge` | 表示卡牌具有“锻造”机制 | 按当前 `style.layout` 渲染锻造相关视觉元素，例如关键字、图标或布局保留区 |
| `hide_cost` | 隐藏费用 | 不渲染费用水晶、费用数字或等价费用区域 |
| `hide_attack` | 隐藏攻击力 | 不渲染攻击力宝石、攻击力数字或等价攻击区域 |
| `hide_health` | 隐藏生命值 / 耐久度 | 不渲染生命值、耐久度或等价右下角数值区域 |
| `in_mini_set` | 表示卡牌属于迷你系列 | 使用迷你系列对应的系列标识、水印或布局修饰；具体表现由 `style.layout` 定义 |
| `hide_watermark` | 隐藏系列水印 | 不渲染由 `set` 或 `overrideWatermark` 推导出的水印 |

### 9.2 示例

```json
{
  "renderMechanics": {
    "tradable": true,
    "hide_cost": true,
    "hide_watermark": true
  }
}
```

第三方工具应优先把这些字段作为视觉控制信号，而不是尝试从 `localization.richText` 反向推断。

## 10. RequestId 规则

`requestId` 由控制台生成，第三方工具只需要原样使用。

生成规则：

```text
sha256(
  imageSpecVersion + "\n" +
  renderHash + "\n" +
  zone + "\n" +
  template + "\n" +
  premium
)
```

序列化形式：

```text
sha256:{64位hex}
```

## 11. 文件名规则

`output.fileName` 由控制台生成，第三方工具必须严格使用。

规则：

- 必须以 `.png` 结尾
- 必须是 ZIP 根目录文件名
- 不允许包含 `/`
- 不允许包含 `\`
- 不允许包含 `..`
- 不允许是绝对路径
- 不允许重复
- 建议格式为 `{requestIdHex}.png`

推荐正则：

```text
^[a-z0-9][a-z0-9._-]{1,127}\.png$
```

## 12. PNG 输出要求

第三方工具必须输出 PNG：

- 文件名等于 `output.fileName`
- 宽度等于 `output.width`
- 高度等于 `output.height`
- 如果 `output.transparentBackground = true`，应保留透明背景
- 不需要嵌入额外 metadata
- 不需要压缩为 WebP

## 13. ZIP 要求

ZIP 文件要求：

- 文件名建议为 `hearthstone-card-image-results.{exportId}.zip`
- PNG 文件放在 ZIP 根目录
- 只包含需求文件中声明的 PNG 文件
- 不包含未知图片
- 不包含重复文件名
- 不包含目录穿越路径

导入端会忽略：

- `__MACOSX/`
- `.DS_Store`

导入端会拒绝：

- 未在 `requests[].output.fileName` 中声明的文件
- 非 PNG 文件
- 重复文件名
- 尺寸不匹配的 PNG
- 超过数量上限的压缩包

## 14. R2 目标字段

`target` 字段用于让第三方工具了解最终目标，但第三方工具不能上传 R2。

导入端必须重新计算并校验：

```text
hearthstone/card-images/{imageSpecVersion}/{zone}/{template}/{premium}/{hashPrefix}/{renderHash}.webp
```

如果需求文件中的 `target.r2Key` 与重新计算结果不一致，导入端必须拒绝该请求。

## 15. 最小完整示例

```json
{
  "schema": "tcg.cards.hearthstone.card-image-requirements.v1",
  "exportId": "hsimg_20260423_001",
  "imageSpecVersion": "hs-card-image-v1",
  "generatedAt": "2026-04-23T10:00:00.000Z",
  "toolContract": {
    "inputFormat": "json",
    "outputArchiveFormat": "zip",
    "outputImageFormat": "png",
    "fileNamePolicy": "exact"
  },
  "limits": {
    "defaultMaxRequests": 200,
    "hardMaxRequests": 500,
    "maxRequests": 200,
    "requestCount": 1,
    "remainingEstimate": 0
  },
  "batch": {
    "index": 1,
    "cursor": null,
    "hasMore": false
  },
  "defaults": {
    "png": {
      "color": "rgba",
      "transparentBackground": true
    },
    "target": {
      "contentType": "image/webp",
      "webpPreset": "q86-m4-fast"
    }
  },
  "requests": [
    {
      "requestId": "sha256:3f67c0d8b5d15d5d2f1d4d56f13b0fd8f3b8d4f6b31c2d7ad0d4fb8354e2f7b1",
      "card": {
        "cardId": "CORE_EXAMPLE_001",
        "lang": "zhs",
        "version": [31001, 31002],
        "revisionHash": "8f1c...",
        "localizationHash": "7aa9...",
        "renderHash": "9f2c0f6e4e0c7f4d0f0b8c2e9c8d7a1a3c6b4e5f60123456789abcdef01"
      },
      "variant": {
        "zone": "hand",
        "template": "normal",
        "premium": "normal"
      },
      "style": {
        "styleKey": "hand.normal.normal",
        "zone": "hand",
        "template": "normal",
        "premium": "normal",
        "layout": "card.hand.v1",
        "width": 512,
        "height": 768,
        "transparentBackground": true
      },
      "output": {
        "fileName": "3f67c0d8b5d15d5d2f1d4d56f13b0fd8f3b8d4f6b31c2d7ad0d4fb8354e2f7b1.png",
        "format": "png",
        "width": 512,
        "height": 768,
        "transparentBackground": true
      },
      "target": {
        "r2Bucket": "R2_ASSETS",
        "r2Key": "hearthstone/card-images/hs-card-image-v1/hand/normal/normal/9f/9f2c0f6e4e0c7f4d0f0b8c2e9c8d7a1a3c6b4e5f60123456789abcdef01.webp",
        "contentType": "image/webp"
      },
      "renderModel": {
        "cardId": "CORE_EXAMPLE_001",
        "lang": "zhs",
        "variant": "normal",
        "templateVersion": "v1",
        "assetVersion": "v1",
        "localization": {
          "name": "示例卡牌",
          "richText": "造成 3 点伤害。"
        },
        "type": "spell",
        "cost": 2,
        "attack": null,
        "health": null,
        "durability": null,
        "armor": null,
        "classes": ["mage"],
        "race": null,
        "spellSchool": "fire",
        "mercenaryFaction": null,
        "set": "CORE",
        "overrideWatermark": null,
        "rarity": "common",
        "elite": false,
        "techLevel": null,
        "rune": null,
        "renderMechanics": {}
      }
    }
  ]
}
```
