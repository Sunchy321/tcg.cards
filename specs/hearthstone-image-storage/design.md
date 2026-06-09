# 炉石图片 R2 存储与第三方导入设计

## 1. 背景

炉石卡牌模型已经在领域层维护 `renderModel` 与 `renderHash`。图片系统需要在此基础上支持批量生成、缺图查询、第三方渲染协作和 R2 分发。

新的第三方导入流程不再让第三方工具上传 R2，也不再要求第三方返回结果 JSONL。控制台只向第三方输出需求文件，第三方工具读取需求文件后返回一个包含 PNG 图片的压缩包；控制台或本地脚本负责读取压缩包并校验 PNG。控制台导入会把 PNG 转换成固定 WebP 产物并上传到 R2，同时回写数据库；本地脚本只把 PNG 转换成固定 WebP 产物并写入本地“类 R2 bucket 目录”，不更新数据库。

## 2. 目标

- 使用 R2 作为图片二进制文件的唯一生产存储位置
- 支持以下图片变体维度：
  - 展示区域：手牌 / 战场
  - 玩法模式：普通 / 战棋
  - 外观品质：普通 / 金卡 / 钻石 / 异画
- 生产环境只保留一种固定 WebP 产物
- 支持按语言、build、卡牌、变体查询缺失图片
- 支持控制台按缺图结果导出需求文件
- 支持通过单次导出上限限制需求文件中的图片数量
- 支持第三方工具按需求文件中的文件名输出 PNG 压缩包
- 支持控制台或本地脚本导入 PNG 压缩包；控制台上传 R2，本地脚本写本地 bucket 目录
- 保持图片 key 可预测、可批量扫描、可长期缓存

## 3. 非目标

- 不在本阶段实现第三方渲染工具本体
- 不把 R2 凭证写入需求文件
- 不允许第三方工具直接上传生产 R2
- 不要求图片 key 可逆还原 `renderModel`
- 不把图片二进制写入数据库
- 不在首版实现用户维度的图片审批流
- 不对单张图片做自适应 WebP preset 选择
- 不把高保真基准产物纳入生产 key 空间
- 不在前端接口或公开 URL 中暴露 WebP preset / format 维度

## 4. 术语

### 4.1 RenderModel

领域层保存的渲染输入 JSON，来自 `entity_localizations.renderModel`。需求文件必须携带完整 `renderModel`，第三方工具只依赖该字段和样式选择完成渲染。

### 4.2 RenderHash

由 canonical `renderModel` 计算的 SHA-256 hex 字符串，用来表示“渲染输入等价”。

### 4.3 ImageVariant

图片变体由以下维度组成：

| 维度 | 值 | 说明 |
|------|----|------|
| `zone` | `hand` | 手牌展示区 |
| `zone` | `play` | 对战展示区 |
| `template` | `normal` | 普通模板 |
| `template` | `battlegrounds` | 酒馆战棋模板 |
| `premium` | `normal` | 普通外观 |
| `premium` | `golden` | 金卡外观 |
| `premium` | `diamond` | 钻石外观 |
| `premium` | `signature` | 异画外观 |

首版 expected set 虽然仍由 `zone / template / premium` 组成，但导出时按旧版图片范围做兼容筛选：

- 所有非 `enchantment` 卡牌导出 `hand.normal.normal`
- 所有非 `enchantment` 卡牌导出 `hand.normal.golden`
- 具有 `has_diamond` 的卡牌追加 `hand.normal.diamond`
- 具有 `has_signature` 的卡牌追加 `hand.normal.signature`
- `set = bgs` 或 `techLevel != null` 的卡牌追加 `hand.battlegrounds.normal`

首版暂不导出任何 `play.*.*` 组合；对战区图片作为后续目标单独实现。

首版不导出其他组合，例如 `hand.battlegrounds.golden`、`hand.battlegrounds.diamond` 或任意 `play.*.*`。

### 4.4 ImageStyle

第三方渲染需要的样式选择。它不是 WebP 编码配置，而是渲染层样式契约，至少包含：

- `styleKey`：稳定样式标识，例如 `hand.normal.normal`
- `zone`
- `template`
- `premium`
- `layout`
- `width`
- `height`
- `transparentBackground`

### 4.5 Requirement File

控制台导出的第三方需求文件。首版格式为单个 JSON 文件：

```text
hearthstone-card-image-requirements.v1.json
```

它包含导出元信息、数量限制、每张图片的样式选择、`renderModel`、指定 PNG 文件名和最终 R2 目标信息。

### 4.6 PNG Result Archive

第三方工具返回的 ZIP 压缩包。压缩包只需要包含 PNG 图片文件，图片文件名必须与需求文件中指定的 `output.fileName` 完全一致。

### 4.7 ProductionPreset

生产环境固定使用一种 WebP 编码产物：

- 固定 preset：`q86-m4-fast`
- 固定格式：`webp`

高保真标准只用于 benchmark 与回归，不进入生产对象 key、生产 URL 或生产索引主键。

### 4.8 ImageSpecVersion

图片产物协议版本。首版固定为：

```text
v1
```

当 R2 路径规则、变体枚举、输出尺寸、关键渲染语义、需求文件格式或默认生产 WebP preset 发生不兼容变化时，必须升级 `imageSpecVersion`。

## 5. 数据分层与表分类

图片索引、导出记录和导入记录均属于 `{game}_data`，即 `hearthstone_data`。

分类理由：

- 它们是系统侧生成与导入状态
- 它们不携带用户语义
- 它们依赖 `hearthstone.entities` / `entity_localizations`
- 它们不应污染可独立导出的 `hearthstone` 主领域事实
- 它们不依赖 `hearthstone_app`

依赖方向：

```text
hearthstone_data.card_image_assets
  -> hearthstone.entity_localizations(renderHash, renderModel)

hearthstone_data.card_image_exports
  -> hearthstone.entity_localizations(renderHash, renderModel)

hearthstone_data.card_image_imports
  -> hearthstone_data.card_image_exports(exportId)
```

该方向符合规则：`{game}_data` 可以依赖 `{game}`，但不能依赖 `{game}_app`。

## 6. R2 对象路径

### 6.1 图片对象 key

生产图片对象 key：

```text
hearthstone/card/{imageSpecVersion}/{zone}/{template}/{premium}/{hashPrefix}/{renderHash}.webp
```

其中：

- `imageSpecVersion`：首版固定为 `v1`
- `zone`：`hand` / `play`
- `template`：`normal` / `battlegrounds`
- `premium`：`normal` / `golden` / `diamond` / `signature`
- `hashPrefix`：`renderHash.slice(0, 2)`
- `renderHash`：完整 64 位 hex

示例：

```text
hearthstone/card/v1/hand/normal/normal/9f/9f2c0f6e4e0c7f4d0f0b8c2e9c8d7a1a3c6b4e5f60123456789abcdef01.webp
```

### 6.2 为什么变体放在 hash 前面

- 可以按变体 prefix 扫描 R2
- 可以批量重生成某一类图片
- 可以按品质做清理与迁移
- 运维路径更可读
- 同一个 `renderHash` 下的不同变体不会互相覆盖

### 6.3 是否需要 cardId

生产图片对象 key 不包含 `cardId`。

原因：

- `renderHash` 表示渲染输入等价，天然支持跨卡复用
- 多张卡如果 `renderModel` 完全一致，可以共享一份图片
- `cardId` 会破坏去重

如需调试，可在需求文件中保留 `card.cardId`，但不能把它作为生产对象身份。

## 7. 数据表

### 7.1 `hearthstone_data.card_image_assets`

用于记录 R2 中已经可用的图片资产。

建议字段：

| 字段 | 类型 | 说明 |
|------|------|------|
| `imageSpecVersion` | text | 图片协议版本 |
| `renderHash` | text | 对应渲染输入 hash |
| `lang` | text | 冗余字段，便于筛选 |
| `zone` | text | `hand` / `play` |
| `template` | text | `normal` / `battlegrounds` |
| `premium` | text | `normal` / `golden` / `diamond` / `signature` |
| `r2Bucket` | text | R2 bucket 逻辑名，例如 `R2_ASSETS` |
| `r2Key` | text | R2 object key |
| `contentType` | text | 固定 `image/webp` |
| `byteSize` | integer | WebP 文件大小 |
| `width` | integer | 图片宽度 |
| `height` | integer | 图片高度 |
| `sha256` | text | WebP 二进制 hash |
| `sourceExportId` | text nullable | 来源需求文件批次 |
| `sourceImportId` | text nullable | 来源压缩包导入批次 |
| `status` | text | `ready` / `failed` / `stale` |
| `errorMessage` | text nullable | 最近失败原因 |
| `createdAt` | timestamp | 创建时间 |
| `updatedAt` | timestamp | 更新时间 |
| `verifiedAt` | timestamp nullable | 最近一次 R2 校验时间 |

主键：

```text
(imageSpecVersion, renderHash, zone, template, premium)
```

唯一约束：

```text
r2Key
```

### 7.2 `hearthstone_data.card_image_exports`

用于记录控制台导出的需求文件。

建议字段：

| 字段 | 类型 | 说明 |
|------|------|------|
| `exportId` | text | 导出 ID |
| `imageSpecVersion` | text | 图片协议版本 |
| `filters` | jsonb | 控制台筛选条件 |
| `requestCount` | integer | 实际导出图片数量 |
| `maxRequestCount` | integer | 本次文件允许的最大图片数量 |
| `fileFormat` | text | 固定 `json` |
| `fileName` | text | 需求文件名 |
| `fileSha256` | text nullable | 需求文件 hash |
| `createdAt` | timestamp | 创建时间 |

该表不记录用户 ID。若未来需要记录用户导出行为，应新增 `hearthstone_app` 表。

### 7.3 `hearthstone_data.card_image_imports`

用于记录 PNG 压缩包导入批次。

建议字段：

| 字段 | 类型 | 说明 |
|------|------|------|
| `importId` | text | 导入 ID |
| `exportId` | text | 对应需求文件 ID |
| `imageSpecVersion` | text | 图片协议版本 |
| `archiveFileName` | text | ZIP 文件名 |
| `archiveSha256` | text nullable | ZIP 文件 hash |
| `expectedCount` | integer | 需求文件中的图片数量 |
| `importedCount` | integer | 成功转换并上传数量 |
| `missingCount` | integer | ZIP 中缺少但被忽略的图片数量 |
| `rejectedCount` | integer | 校验失败或未知图片数量 |
| `status` | text | `completed` / `partial` / `failed` |
| `errorMessage` | text nullable | 批次失败原因 |
| `createdAt` | timestamp | 创建时间 |

## 7.4 本地脚本目录配置

本地导入脚本不直接写生产 R2，而是把一个本地目录视为“类 R2 bucket 根目录”。

该目录通过当前仓库的本地 Git 配置提供：

```text
hearthstone.image-bucket-dir
```

示例：

```bash
git config --local hearthstone.image-bucket-dir /absolute/path/to/asset-bucket
```

脚本写入时直接复用生产 key，相当于：

```text
{bucketDir}/{r2Key}
```

这样可以在本地先验证：

- 文件名映射
- PNG 校验
- WebP 转换
- 路径规则
- 前端 URL 读取结果

本地脚本首版明确不做以下事情：

- 不上传真实 R2
- 不回写 `card_image_assets`
- 不写入 `card_image_imports`
- 对缺失 PNG 仅统计为 `missingCount`，不把批次判定为失败

## 8. 缺图查询

### 8.1 Expected Image Set

控制台查询缺图时，先从领域层生成期望图片集合：

```text
CardEntityView rows with renderHash != null
  × selected zone values
  × selected template values
  × selected premium values
  -> intersect legacy-compatible styles for each card
```

首版默认筛选：

- `isLatest = true`
- `lang = 当前控制台选择语言`
- `zone = hand`
- `template = normal`
- `premium = normal`

### 8.2 Missing 判定

某个期望图片缺失，当且仅当：

- 在 `card_image_assets` 中不存在对应主键的 `status = ready` 记录

可选增强：

- 当控制台选择 `verifyR2 = true` 时，对候选 `r2Key` 做 R2 HEAD 校验
- HEAD 校验失败时将资产标记为 `stale`

首版不默认实时 HEAD 校验，避免缺图页面过慢。

### 8.3 查询输出

控制台缺图查询返回：

- `totalExpected`
- `readyCount`
- `missingCount`
- `staleCount`
- `failedCount`
- 当前页 missing rows

每个 missing row 包含：

- `cardId`
- `lang`
- `version`
- `revisionHash`
- `localizationHash`
- `renderHash`
- `zone`
- `template`
- `premium`
- `r2Key`
- `renderModel`

## 9. 需求文件导出

### 9.1 文件格式

当前需求文件为单个 JSON 文件：

```text
hearthstone-card-image-requirements.v1.json
```

详细格式见同目录 `schema.md`。

选择 JSON 而不是 JSONL 的原因：

- 需求文件需要包含全局限制、批次信息和第三方输出契约
- 单文件 JSON 更方便第三方工具校验整体任务数量
- 导入压缩包时需要按 `requestId` 和 `output.fileName` 建立完整映射
- 首版通过数量上限控制文件体积，不依赖无限流式任务

### 9.2 数量限制

需求文件必须限制图片数量：

- 默认单文件上限：`200`
- 首版硬上限：`500`
- 控制台导出前必须展示预计缺图数量和本次导出数量
- 如果缺图数量超过上限，只导出当前批次，并返回下一批查询游标或继续导出入口
- 导入端必须拒绝超过硬上限的需求文件
- 导入端必须拒绝 PNG 文件数量超过需求数量的压缩包，忽略系统垃圾文件除外

上限选择理由：

- PNG 源图体积明显大于 WebP，过大压缩包会拖慢上传与转换
- 第三方工具通常需要图形渲染资源，过大批次不利于失败重试
- 小批次更容易定位字体、模板或单卡渲染问题

### 9.3 每条请求必须包含的信息

每条请求至少包含：

- `requestId`
- `card` 调试元数据
- `variant`
- `style`
- `renderModel`
- `output.fileName`
- `target.r2Key`

其中 `output.fileName` 是第三方工具必须写入 ZIP 的 PNG 文件名。

### 9.4 RequestId 规则

`requestId` 必须稳定生成：

```text
sha256(
  imageSpecVersion + "\n" +
  renderHash + "\n" +
  zone + "\n" +
  template + "\n" +
  premium
)
```

`requestId` 用于第三方工具幂等执行、导入匹配和错误定位。

## 10. 第三方 PNG 压缩包

第三方工具读取需求文件后，返回 ZIP 压缩包：

```text
hearthstone-card-image-results.{exportId}.zip
```

压缩包要求：

- 图片格式必须是 PNG
- 每个 PNG 文件名必须等于需求文件中对应请求的 `output.fileName`
- PNG 应放在 ZIP 根目录
- 不允许路径穿越、绝对路径或重复文件名
- 不要求第三方工具生成 WebP
- 不要求第三方工具提供 R2 凭证或执行 R2 上传

导入端行为：

- 忽略 `__MACOSX/` 和 `.DS_Store`
- 拒绝未知文件名
- 拒绝重复文件名
- 拒绝非 PNG 文件
- 校验 PNG 尺寸与需求文件中的 `style.width/style.height`
- 对缺失 PNG 的请求不生成产物；本地脚本仅累计到 `missingCount` 并继续处理其他文件

## 11. 控制台 / 本地脚本导入流程

导入流程：

```text
读取需求文件
  -> 读取 ZIP
  -> 建立 fileName 到 request 的映射
  -> 校验 PNG 文件名、数量、格式、尺寸
  -> 使用固定生产 preset 转换 PNG 为 WebP
  -> 根据 imageSpecVersion + variant + renderHash 重新计算 R2 key
  -> 上传 WebP 到 R2
  -> upsert hearthstone_data.card_image_assets
  -> 写入 hearthstone_data.card_image_imports
```

关键约束：

- R2 key 必须由控制台或本地脚本重新计算，不能信任需求文件中的 `target.r2Key`
- WebP 编码配置固定为 `q86-m4-fast`
- WebP `contentType` 固定为 `image/webp`
- 同一 R2 key 不允许被不同 `sha256` 静默覆盖
- 本地脚本必须复用与控制台相同的校验与转换逻辑；上传目标改为本地 bucket 目录
- 本地脚本遇到缺失 PNG 时仅跳过对应请求，不中断整批导入

### 11.1 本地脚本输入形式

本地脚本输入支持两种形式：

- 一个目录：目录中必须包含且只包含一个需求 JSON，其他文件必须为 PNG
- 一个 ZIP：ZIP 中必须包含且只包含一个需求 JSON，其他文件必须为 PNG

首版约束：

- 目录输入不递归扫描子目录
- ZIP 输入忽略 `__MACOSX/`、`.DS_Store` 和 `._*`
- 除需求 JSON 与 PNG 外的其他文件一律拒绝

### 11.2 控制台导入输入形式

控制台导入只接受 ZIP 文件上传。

控制台收到 ZIP 后执行：

- 浏览器侧提取唯一需求 JSON
- 浏览器侧校验 PNG 文件集合
- 浏览器侧使用 `libwebp` Wasm 按固定 `q86-m4-fast` 等价参数转换 WebP
- 通过控制台接口上传 WebP 到 `R2_ASSET`
- 服务端回写 `card_image_assets` 与 `card_image_imports`

控制台导入与本地脚本的职责边界：

- 控制台导入：生产导入路径，上传真实 R2，并回写数据库
- 本地脚本：本地验证路径，只写本地 bucket 目录，不更新数据库；缺失 PNG 仅统计不失败

### 11.3 浏览器端 PNG -> WebP 转换可行性评估

浏览器端把 PNG 转成 WebP 在技术上是可行的。

如果使用浏览器原生 Canvas / `toBlob('image/webp')`，通常只能控制质量，无法稳定复现 `cwebp q86-m4-fast`。

因此首版控制台正式导入方案采用：

- 浏览器侧 ZIP 解压
- 浏览器侧 `libwebp` Wasm 编码
- 显式传入与文档对齐的固定参数：
  - `quality = 86`
  - `method = 4`
  - `alpha_quality = 100`
- 由原始 PNG 像素数据重新编码 WebP，不保留额外 metadata，等价于 `-metadata none`

结论：

- 浏览器端转换“能做”
- 浏览器原生 Canvas 编码不满足文档要求
- 首版控制台按钮采用 `libwebp` Wasm，对齐固定生产参数后再上传 R2

## 12. 控制台能力

新增控制台页面建议：

```text
/hearthstone/images
```

首版能力：

- 查询图片覆盖率
- 查询缺失图片
- 按筛选条件导出需求 JSON
- 显示导出数量上限与剩余缺图数量
- 上传需求 JSON 与第三方 PNG ZIP
- 导入 ZIP、转换 WebP、上传 R2 并 upsert `card_image_assets`
- 对单个 `r2Key` 执行 HEAD 校验

筛选条件：

- `lang`
- `cardId`
- `build`
- `isLatest`
- `zone`
- `template`
- `premium`
- `status`
- `limit`

## 13. 读取图片 URL

前端读取图片时，用当前卡牌视图中的：

- `renderHash`
- `type`
- 用户选择的 `zone`
- 用户选择的 `template`
- 用户选择的 `premium`

计算候选公开 URL。首版公开 URL 规则与生产 `r2Key` 保持一致：

```text
{assetBaseUrl}/hearthstone/card/v1/{zone}/{template}/{premium}/{hashPrefix}/{renderHash}.webp
```

如果需要更严格的可用性判断，可由后端查询 `card_image_assets.status = ready` 后返回 URL。

前端不需要显式暴露额外编码参数作为业务接口参数。

## 14. 幂等与一致性

- 同一 `requestId` 可以重复渲染和导入
- 同一 R2 key 不允许被不同内容 hash 覆盖
- 导入以 `requestId + renderHash + variant + fileName` 校验请求一致性
- ZIP 中的文件名必须等于需求文件指定值
- R2 key 必须等于服务端根据规则重新计算出的 key
- `card_image_assets` upsert 只允许从 `failed/stale` 变为 `ready`，或用相同 `sha256` 刷新元数据
- 不在需求文件或 ZIP 中携带 R2 密钥

## 15. 安全边界

- 需求文件包含完整 `renderModel`，应视为内部数据文件
- 第三方工具获得的是渲染任务，不获得数据库访问权限
- 第三方工具不获得 R2 写权限
- 导入 ZIP 时必须防止 zip bomb、路径穿越、重复文件和未知文件
- PNG 解码前必须执行文件大小与数量限制
- 控制台上传 R2 前必须重新计算目标 key；本地脚本写入本地 bucket 目录前也必须重新计算目标 key

## 16. 后续扩展

- 增加更多尺寸层级，例如 `thumb`、`full`
- 增加图片生成批次看板
- 增加 R2 全量 reconcile
- 增加自动拆分导出
- 增加自动导出缺图任务的定时任务
- 在后续图片迁移阶段按 `renderHash + variant` 做差异迁移

## 17. WebP 标准与当前推荐

### 17.1 高保真基准标准

高保真标准沿用当前 `excellent / good / review` 逻辑，仅用于：

- 高保真评估
- 回归检查
- 上限参考

在当前样本下，高保真标准对应的统一推荐为：

- `near-lossless-60`

### 17.2 生产标准

生产标准用于统一选择前端海量分发的 WebP preset。

基于当前样本，建议采用以下单图通过条件：

- `psnrCompositeRgb >= 35`
- `ssimCompositeLuma >= 0.9975`
- `visibleChangedPixelRatio <= 0.25`
- `alpha.mae <= 0.2`
- `alpha.maxDiff <= 2`

统一候选门槛：

- `passRate >= 0.95`
- `errorCount = 0`

在满足门槛的候选中，按以下成本分选择统一 preset：

```text
productionCostScore =
  normalizedAverageSizeRatio * 60
  + normalizedAverageEncodeMs * 30
  + normalizedQualityPenalty * 10
```

### 17.3 当前默认生产 preset

按当前样本，生产标准对应的统一推荐为：

- `q86-m4-fast`

含义：

- 同一目标类型图片在生产中使用完全一致的 WebP preset
- 不对单张图片做自适应配置选择
- 生产路径与前端 URL 中只保留这一种固定 WebP 产物
- 如果后续样本集合变化，应重新执行 benchmark，再决定是否升级 `imageSpecVersion`
