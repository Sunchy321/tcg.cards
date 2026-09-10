# magic 卡图导入整合设计

**日期**：2026-09-09
**状态**：待评审
**前置文档**：

- [proposals/magic-image-import/design.md](../magic-image-import/design.md)——模块 A/B/C 总设计
- [specs/magic-manual-image-import/design.md](../../specs/magic-manual-image-import/design.md)——手动导入细化（来源分组、force 面级语义、zip 命名约定）
- [docs/magic/card-image-experiments.zh-CN.md](../../docs/magic/card-image-experiments.zh-CN.md)——质量指标与编码参数定稿

**一句话**：把「Scryfall 卡图导入 / Gatherer 卡图爬取 / 手动导入卡图」三个页面合成一个页面，同时把 runtime 的三个任务按输入形态重构成三个新任务类型 + 一条共享管线，并在同一页里新增「来源质量比对」能力。

---

## 1. 背景与目标

现状：magic 的卡图导入被拆成三个独立页面，导航里是一个父项带三个子项。

- `apps/app-console-desktop/src/pages/magic/image-import/scryfall/index.vue`（121 行）
- `apps/app-console-desktop/src/pages/magic/image-import/gatherer/index.vue`（116 行）
- `apps/app-console-desktop/src/pages/magic/image-import/manual/index.vue`（396 行）

痛点：

1. 三个页面并不对称——「手动导入卡图」已经覆盖全部 6 个图源（其中 Scryfall/Gatherer 是「按编号下载」），另外两个页面只是同样两个图源的「批量扫库」版本。用户要在三个入口之间来回切换才能完成一件连续的事。
2. 两个批量页与手动页的 `force` 默认值相反（批量页 `false`，手动页 `true`），文案也不统一（`Force` / 「覆盖已有卡图」）。
3. 三个 runtime 任务定义高度重复：同样的 `entry`/`block`/`exit` 骨架、同样的 `addCounts`、同样的取图 URL 取法、同样的编码与落库调用，只是各自抄了一遍。
4. 没有工具能回答「这张牌的 Scryfall 图和 Gatherer 图哪个质量更好」。

目标：

- 一个页面完成卡图导入的全部操作。
- runtime 侧消除重复，任务按输入形态收敛。
- 新增来源质量比对能力，帮助人工判断该用哪个来源。

---

## 2. 现状事实

以下均为设计前核对过的事实，后续章节直接引用。

### 2.1 页面与导航

- 三条路由是文件路由：`/magic/image-import/{scryfall,gatherer,manual}`，页面目录下没有 `index.vue`。
- 导航定义在 `packages/console-core/src/layout.ts:138-146`，位于 `game === 'magic'` 分支，「卡图导入」是一个父分组，三个子项分别指向上述三条路由。
- 导航被共享布局 `packages/console-shell/app/layouts/admin.vue` 消费（`getGameNavItems`）。该布局的 `filterAccessibleNav` 会丢弃路由不可达的链接并剪掉变空的分组——因此 site-console 上本就没有 magic 卡图页面，这个分组在那边已经被自动过滤，改导航对 site-console 无影响。
- `apps/app-console-desktop/src/components/MagicSourceImportPage.vue` 与本次改动**无关**，它服务于 `pages/magic/data-source/*` 四个数据源导入页，不在卡图导入链路里。

### 2.2 三个任务定义

| 任务类型 | 文件 | 输入要点 | 输出字段 |
|---|---|---|---|
| `magic_scryfall_image_import` | `apps/service-desktop-runtime/src/lib/magic/task/scryfall-image-import/definition.ts` | `scope: full\|set`、`set?`、`lang?`、`force=false`、`cleanupJpg=false` | 9 个计数（含 `placeholder`） |
| `magic_gatherer_image_import` | `.../gatherer-image-import/definition.ts` | `set` 必填、`lang?`、`force=false`、`cleanupJpg=false` | 9 个计数（含 `missingId`） |
| `magic_manual_image_import` | `.../manual-image-import/definition.ts` | `source` 6 值、`set?`/`lang?`、`force=true`、`cleanupJpg=false`、`number?`、`faceIndex?`、`fileName?`、`dataBase64?`、`zipPath?` | 11 个计数 + 3 个清单（`unmatchedNumbers`/`unrecognizedNames`/`warnings`） |

三者共同点（也就是重复的部分）：

- 都是 `createDefinition(...).scope(z.object({}), { type, resolve: () => ({ key: 'global', snapshot: {} }) })`——单槽作用域、全局键。
- 都是单 chunked stage（`progressMode: 'bounded'`、`resumeMode: 'durable'`），`entry` 建队列 → `block` 分批处理 → `exit` 返回累计计数。
- 都调用同一组底层能力：`encodeWebp` → `assessQuality` → `writeCanonical` → 合并 `image_info` → 按面更新 `image_status` → 可选 `removeSameStemJpg`。
- 各自都有一份 `addCounts`，以及各自的取图 URL 取法（scryfall 的 `faceUrl`、gatherer 的 `pickImageUrl`、manual 的 `faceUrlOf`/`gathererUrlOf`——后两者其实是前两者的复制）。

差异点：

- 数据源查询不同（scryfall 走 `scryfall_cards`，gatherer 走 `Gatherer` 缓存，本地走文件系统）。
- 并发与批次不同（远程批量 `BATCH=24` + `mapWithConcurrency(..., 4, ...)`；本地批量 `BATCH=10` 串行）。
- 覆盖判定不同（远程批量用 `importablePrintCondition` 在 SQL 层筛行；本地/单条用 `mayOverwrite`/`applySkipRules` 在内存里按面判定）。
- 输出差异字段不同。

### 2.3 质量判定与比对能力现状

- 生产指标是**细节损失率**：`detailLossScore`（`image-import/common.ts:308`），阈值 `qualityGoodThreshold = 0.75`（`common.ts:24`），短边小于 `smallEdgePx = 370` 直接判 `lowres`（`common.ts:26`）。
- `assessQuality(encoded, input)`（`common.ts:332`）把尺寸档与细节损失率合成 `highres_scan | lowres`，并带回 `score`（可能为 `null`）。
- 编码参数 `WEBP_QUALITY = 50`（`common.ts:14`），与实验结论一致。
- 图库每个面只存**一份**图，文件名由 `imageFileName(set, lang, number, faceIndex)` 派生（`common.ts:53`）；`prints.image_info` 是按面下标的数组。**因此库里不存在「两个来源的同一张图」，比对必须当场从两个来源各取一张。**
- `prints` 主键为 `(card_id, version, set, number, lang, source)`（`packages/db/src/schema/shared/magic/print.ts:114`）——**语言是印张身份的一部分**，比对必须指定语言。
- 仓库里目前没有任何比对 UI。

### 2.4 任务框架

- 任务定义注册在 `apps/service-desktop-runtime/src/lib/task/task-definitions.ts`，`getTaskDefinition` 对未注册类型直接抛错（`lib/task/registry.ts:20`）。
- `createAndRunTask`（`orpc/task.ts:27`）会先放弃同类型的残留活跃任务，再创建并启动。
- 桌面端**没有任务历史列表 UI**；`task_runs` 里旧类型的行不会被任何界面读取，只有「重试当前卡片上的任务」会按类型反查定义。
- `TaskController` 的 `operations` 是数组，多操作按钮的既有先例是 `pages/hearthstone/image/index.vue`（渲染 / 下载两个操作同页）。
- `TaskResultCard`（`apps/app-console-desktop/src/components/TaskResultCard.vue`）把结果对象的**键名原样打印**，被 6 处使用（3 个卡图页 + `MagicSourceImportPage` + `magic/project` + `magic/publish`）。

---

## 3. 设计决策

本节是本次设计的评审要点，逐条给出结论与依据。

### 3.1 页面：单页 + 单一来源轴

三个页面合并为一个页面，**「来源」是唯一的顶层轴**，不拆成「图源 / 机制」两个概念（用户明确要求保持耦合）。来源共 6 个值：手动上传、MTGCH、MTGFlame、Hunterer、Scryfall、Gatherer。

选 Scryfall 或 Gatherer 时，参数区多出一个「导入范围」选项：批量（全量 / 指定系列）或按编号。其余来源只有单张与压缩包两种形态。参数区随来源与范围重排，报告区复用同一个卡片。

不采用「顶部 tab」形态：tab 只是把三个页面换个壳，没有消除分散感。

### 3.2 导航

删除 `packages/console-core/src/layout.ts` 中 magic 分支的「卡图导入」父分组，在 magic 的「数据管线」组内新增一个**叶子项**：

```
数据管线：Scryfall / Gatherer / MTGJSON / MTGCH / 卡图导入 / 投影 / 评审
```

- 位置在 MTGCH 之后、投影之前，与四个数据导入相邻。
- 路由沿用 `/magic/image-import`，页面文件为 `apps/app-console-desktop/src/pages/magic/image-import/index.vue`。
- 页面标题「卡图导入」。

依据：这个页面的职责是**改本地图库**（导入 + 比对），而 magic 的「数据浏览」组里全是只读查看器（卡牌 / 系列 / 赛制 / 公告 / 规则），把写操作放进去是分类错误；「数据管线」组里已经有一整排数据导入，语义一致。它也不需要单独成组，一个叶子项即可。

### 3.3 表单与状态

- `force` 统一默认**不勾**，文案统一为「覆盖已有卡图」。理由：`force=true` 会逐面重下覆盖，是破坏性操作；统一默认不勾，需要覆盖时手动勾选，同时保留既有面级语义（不勾也能补背面）。
- 表单持久化改用**一个新的键**（如 `magic-image-import`），从默认值开始，不迁移旧的三个键（`magic-image-import:scryfall` / `:gatherer` / `:manual`）。理由：`force` 默认值语义已变，迁移旧值会把旧默认带回来；旧键留在本地无害。
- 报告区改用中文标签渲染，不再暴露 `missingId` 这类内部键名。

### 3.4 runtime：三个任务类型 + 一条共享管线

按**输入形态**把三个任务收敛为三个新任务类型，图源成为输入参数：

| 新任务类型（建议名） | 职责 | 图源 |
|---|---|---|
| `magic_image_import_remote` | 远程批量扫库 | scryfall / gatherer |
| `magic_image_import_local` | 本地压缩包（或目录）批量 | manual / mtgch / mtgflame / hunterer |
| `magic_image_import_single` | 单条：单张上传或按编号下载 | 全部 6 个 |

重复的取图、图源描述、编码、质量评估、落库、批次骨架抽成共享模块，三个任务类型都组合它。

**不做数据迁移**：旧的 `task_runs` 行保持原样，不做类型改写；启动时也不清理（当前本地库里没有旧任务）。代价是「重试一条旧记录」会因找不到定义而报错——桌面端没有历史入口，可以接受。

不采用「保留旧类型名、只重构内部」的方案：名字会与实际语义脱节（例如 `magic_scryfall_image_import` 被用来跑本地压缩包导入），是长期负债。

### 3.5 输出结构：统一 + 保留差异字段

三个任务的输出统一为**同一个扁平结构**（13 个计数 + 3 个清单），任务不涉及的字段置 `0` 或空数组；报告区只渲染非零计数与非空清单。

```
processed, written, unchanged, failed, skipped, lowQuality, cleanedJpg,
missingUrl, missingId, placeholder,
skippedUpload, unmatched, unrecognized,
unmatchedNumbers[], unrecognizedNames[], warnings[]
```

差异字段（`missingId` 只对 Gatherer 有意义、`placeholder` 只对 Scryfall 有意义、三个清单只对本地/单条有意义）全部保留，只是统一放在一个结构里。

### 3.6 来源质量比对

- **位置**：同一个页面，导入区下方的可折叠卡片「来源质量比对」。
- **输入**：严格复用上方表单的系列 + 语言 + 编号，卡片本身零输入。因此**只有单条形态可用**（三者任一缺失时卡片禁用并提示）。理由：避免同一字段输两次，并把「比对 → 决定来源 → 导入」串成一条不重复输入的路。
- **范围**：只比 Scryfall 与 Gatherer 两个来源，**印张级**、**按面各比一组**。
- **实现形态**：普通 oRPC 查询，不进任务系统、不写库、不缓存。
- **指标**：复用生产口径（短边尺寸档 + 细节损失率 + 字节数），不引入 SSIM 等实验期指标。
- **结论规则**：先比尺寸档（`highres_scan` > `lowres`），档位不同则高者胜；档位相同再比细节损失率，差值 ≥ 0.05 判高者胜，差值 < 0.05 显示「两者相当」；某侧无分数时无法判定。
- **边界**：某一侧不可用时**逐侧降级**——另一侧照常出结果，不可用的一侧写明原因（缺 `multiverseId`、被标 `placeholder`、取图失败、图片无法解码等）。「Gatherer 没有这张」本身就是有价值的结论，不该被当成错误吞掉。

---

## 4. 页面设计

### 4.1 结构

```
┌─────────────────────────────────────────────────┐
│ 页头：图标 + 标题「卡图导入」+ 打开设置 / 刷新      │
├─────────────────────────────────────────────────┤
│ 数据根未配置 / 加载失败的告警条                    │
├─────────────────────────────────────────────────┤
│ 导入区                                           │
│   来源：[手动上传 ▾]                              │
│   系列 / 语言 / 覆盖已有卡图 / 清理 JPG            │
│   （来源为 Scryfall/Gatherer 时）导入范围：         │
│       批量（全量 / 指定系列） | 按编号             │
│   （批量）                                       │
│   （本地批量）压缩包路径 + 识别结果 + 疑似系列       │
│   （单条上传）编号 / 面序号 / 选择图片              │
│   （单条下载）编号                                │
│   [开始导入]                                     │
│   TaskController 的进度与阶段卡片                  │
│   导入报告卡片（中文标签）                          │
├─────────────────────────────────────────────────┤
│ ▼ 来源质量比对（可折叠）                           │
│   说明：使用上方「系列 / 语言 / 编号」             │
│   [开始比对]                                     │
│   并排展示：正面 / 背面 各一组                     │
│     每侧：来源、尺寸、字节数、细节损失率、判档       │
│     结论：Scryfall 更清晰 / Gatherer 更清晰 /       │
│           两者相当 / 无法判定                      │
└─────────────────────────────────────────────────┘
```

### 4.2 来源与形态的映射

| 来源 | 可选形态 |
|---|---|
| 手动上传 / MTGCH / MTGFlame / Hunterer | 单张图片、压缩包 |
| Scryfall | 批量（全量 / 指定系列）、按编号 |
| Gatherer | 批量（指定系列）、按编号 |

Gatherer 没有「全量」——它按系列爬取，这与既有任务输入一致。

### 4.3 来源到任务的映射

| 来源 + 形态 | 调用的任务类型 |
|---|---|
| Scryfall / Gatherer + 批量 | `magic_image_import_remote` |
| 上传组 + 压缩包 | `magic_image_import_local` |
| 任意来源 + 单张 / 按编号 | `magic_image_import_single` |

压缩包的目录结构模式（`{前缀}/{set}/{lang}/{编号}[-{面}].ext`）继续禁用系列与语言输入，由路径推断——这一分支沿用现状。

### 4.4 比对卡片的可用性

- 上方表单的系列、语言、编号三者齐全时，卡片可用。
- 否则卡片禁用，并提示「请先在上方选择单条形态，并填写系列、语言、编号」。
- 卡片不读上方的来源选择——比对固定是 Scryfall vs Gatherer。

---

## 5. 任务层重构

### 5.1 共享模块

在既有目录 `apps/service-desktop-runtime/src/lib/magic/image-import/` 下新增三个模块（`common.ts` 的底层能力保持不变，只往上抽一层）：

**`fetch.ts`——统一取图**

- `fetchImageBuffer(url)`：带 60s 超时与 `user-agent: tcg-cards/desktop` 的取图，返回 `Buffer | null`。
- 合并来源：scryfall 定义的 `fetchToBuffer`（`scryfall-image-import/definition.ts:78`）与 manual 定义里内联的 fetch（`manual-image-import/definition.ts:445`）。

**`source.ts`——图源描述**

- 每个图源一份描述：面 URL 取法、期望面数 SQL、是否需要 Scryfall 关联行、是否受上传保护。
- 合并来源：scryfall 的 `faceUrl`、gatherer 的 `pickImageUrl`、manual 的 `faceUrlOf`/`gathererUrlOf`（后两者是前两者的复制）。
- 比对查询也复用这里的 URL 取法，保证「比对看到的图」与「导入会写的图」来自同一套规则。

**`ingest.ts`——单面落库**

- `ingestFace(...)`：把「一个面的图片字节」变成「库里的一行更新」——`encodeWebp` → `assessQuality` → `writeCanonical` → 合并 `image_info` → 按面更新 `image_status` → 可选 `removeSameStemJpg`，返回本次的计数增量。
- 合并来源：scryfall 的 `processRow`（`definition.ts:94`）与 manual 的 `processUploadItem`/`processDownloadItem`（`definition.ts:381`、`definition.ts:442`）里重复的那一段。
- 覆盖判定（`mayOverwrite` / `applySkipRules`）一并收进来，远程批量的 SQL 层筛选与本地/单条的按面判定共用同一套语义。

**批次骨架**

三个任务类型仍是「`entry` 建队列 → `block` 分批 → `exit` 汇总」的形状；把 checkpoint 状态推进与计数累加抽成共享 helper（`createBatchState` / `advanceBatch`），三个 `definition.ts` 只保留各自的队列构造逻辑。

### 5.2 三个任务类型的输入

```ts
// 远程批量
z.strictObject({
  source:     z.enum(['scryfall', 'gatherer']),
  scope:      z.enum(['full', 'set']),      // gatherer 只允许 'set'
  set:        z.string().optional(),        // scope='set' 时必填
  lang:       z.string().optional(),
  force:      z.boolean().optional().default(false),
  cleanupJpg: z.boolean().optional().default(false),
})

// 本地批量
z.strictObject({
  source:     z.enum(uploadImageSources),   // manual | mtgch | mtgflame | hunterer
  set:        z.string().min(1).optional(), // 目录结构模式下可省
  lang:       z.string().min(1).optional(),
  force:      z.boolean().optional().default(false),
  cleanupJpg: z.boolean().optional().default(false),
  zipPath:    z.string().min(1),
})

// 单条
z.strictObject({
  source:     z.enum([...uploadImageSources, 'scryfall', 'gatherer']),
  set:        z.string().min(1),
  lang:       z.string().min(1),
  number:     z.string().min(1),
  force:      z.boolean().optional().default(false),
  cleanupJpg: z.boolean().optional().default(false),
  // 上传单张时
  faceIndex:  z.number().int().min(0).max(15).optional(),
  fileName:   z.string().optional(),
  dataBase64: z.string().optional(),
})
```

- 三个任务的 `force` 默认值统一为 `false`（原 manual 的 `true` 取消）。
- 下载来源的面序号继续由 `scryfall_face` 经 `faceIndexOf` 推导，不接受调用方输入。
- 单条任务处理「一个印张」：上传单张只写指定的一个面，按编号下载写该印张的全部面。

### 5.3 阶段形态

| 任务类型 | 阶段 | 批次 | 并发 |
|---|---|---|---|
| 远程批量 | chunked（durable） | 24 | 4 |
| 本地批量 | chunked（durable） | 10 | 串行（zip 读取按批） |
| 单条 | simple | — | — |

单条任务用简单 stage：目标只有一个印张，断点续传与进度分段没有意义。

### 5.4 oRPC 接口

```
magic.createTask.imageImportRemote    // 替代 scryfallImageImport / gathererImageImport
magic.createTask.imageImportLocal     // 替代 manualImageImport 的压缩包分支
magic.createTask.imageImportSingle    // 替代 manualImageImport 的单条分支
magic.analyze.imageArchive            // 原 analyze.manualImportZip，改名为与任务无关的名字
magic.images.sets                     // 不变
magic.images.compare                  // 新增，见第 6 节
```

被替代的三个 procedure 直接删除（调用方只有这三个页面，仓库内无其他引用）。

---

## 6. 来源质量比对

### 6.1 接口

```ts
magic.images.compare
  输入：{ set: string, lang: string, number: string }
  输出：{
    set, lang, number,
    faces: Array<{
      faceIndex: number,
      scryfall: Side | null,
      gatherer: Side | null,
      verdict: 'scryfall' | 'gatherer' | 'equal' | 'inconclusive',
    }>,
  }

Side = {
  status:       'ok',
  source:       'scryfall' | 'gatherer',
  width:        number,
  height:       number,
  byteSize:     number,
  qualityScore: number | null,   // 细节损失率
  tier:         'highres_scan' | 'lowres',
  preview:      string,          // data URL，见 6.3
} | {
  status: 'unavailable',
  source: 'scryfall' | 'gatherer',
  reason: string,                // 面向用户的中文原因
}
```

### 6.2 取图与判定

- 印张按 `(set, lang, number)` 定位（`prints` 中同编号可能有多行，取主面行）。
- 两侧各按 `source.ts` 的图源规则取面 URL，`fetchImageBuffer` 下载，`encodeWebp` 编码，`assessQuality(encoded, 原始字节)` 评估——与导入完全同一套代码路径。
- 面数取两侧的最大值；某一侧缺该面则记为该侧的 `unavailable`。
- 判定规则见 3.6。

### 6.3 图片预览的传输方式

比对结果里的 `preview` 返回**按生产参数（q50 webp）编码后的图片**的 data URL。

理由：两个来源的原始 URL 都需要自定义 `user-agent`，Gatherer 还有防盗链风险，让浏览器直连不可靠；返回编码后的产物同时也保证「比对看到的图」与「导入会写入的图」是同一张。代价是 RPC 负载增加约 120KB/印张（单面约 60KB × 2），在本地 RPC 上可接受。

> 评审关注点：如果认为负载偏大，可改为把编码结果写入临时目录、由 Tauri 侧读取本地文件——但这会引入临时文件的清理责任，默认方案不采用。

### 6.4 边界情况

| 情况 | 表现 |
|---|---|
| 该 `(set, lang, number)` 无印张 | 整体返回「未找到该印张」 |
| Scryfall 无关联行或 `image_uris` 缺失 | 该侧 `unavailable`：「Scryfall 无该印张的图源信息」 |
| Scryfall `image_status = placeholder` | 该侧 `unavailable`：「Scryfall 为占位图」 |
| Gatherer 无 `multiverse_id` | 该侧 `unavailable`：「Gatherer 无对应印张」 |
| Gatherer 缓存缺 `imageUrls` | 该侧 `unavailable`：「Gatherer 无图源信息」 |
| Gatherer 缺背面图（无 `compositeCard`） | 背面该侧 `unavailable`：「Gatherer 无背面图」 |
| 下载失败 / 超时 | 该侧 `unavailable`：「取图失败」 |
| 解码或编码失败 | 该侧 `unavailable`：「图片无法解码」 |

---

## 7. 改动清单

**前端（`apps/app-console-desktop`）**

- 新增 `src/pages/magic/image-import/index.vue`（合并后的页面）。
- 删除 `src/pages/magic/image-import/{scryfall,gatherer,manual}/` 三个目录。
- 新增 `src/components/ImageCompareCard.vue`（比对卡片）。
- `src/components/TaskResultCard.vue`：新增可选的 `labels?: Record<string, string>` prop，用于中文标签映射；不传时保持现有行为（不影响 `magic/project`、`magic/publish`、`MagicSourceImportPage`）。

**导航（`packages/console-core`）**

- `src/layout.ts`：删除 magic 分支的「卡图导入」父分组，在「数据管线」组内新增叶子项「卡图导入」。

**runtime（`apps/service-desktop-runtime`）**

- 新增 `src/lib/magic/image-import/{fetch,source,ingest}.ts` 与批次骨架 helper。
- 新增 `src/lib/magic/task/image-import-{remote,local,single}/definition.ts`。
- 删除 `src/lib/magic/task/{scryfall-image-import,gatherer-image-import,manual-image-import}/`。
- `src/lib/task/task-definitions.ts`：注册三个新定义，移除三个旧定义。
- `src/orpc/magic.ts`：`createTask` 收敛为三个新 procedure，新增 `images.compare`，`analyze.manualImportZip` 改名。
- 新增比对查询的实现（复用 `image-import/source.ts` 与 `common.ts`）。

**不需要改动**

- `packages/db`（无表结构变化）。
- `apps/site-console`（导航会自动过滤不可达路由）。
- `apps/site-magic`（展示侧只读已生成的图）。
- `MagicSourceImportPage.vue` 与 `pages/magic/data-source/*`。

---

## 8. 影响面与风险

1. **旧任务记录失效**：新类型名下，`task_runs` 里旧类型的行无法被重试。已确认桌面端没有任务历史 UI，且当前本地库没有旧任务，影响可接受。
2. **任务输出结构变化**：`task_runs.result` 的形状变了，旧行仍存旧形状。由于没有历史 UI，不处理。
3. **`force` 默认值变化**：原 manual 页默认覆盖，新页面默认不覆盖。这是有意的行为变更，需要在发布说明里点明。
4. **单条任务的简单 stage**：如果将来单条需要支持「一个压缩包里多条」之类的形态，需要回到 chunked stage——届时应新建任务类型，而不是把单条重新变成批量。
5. **比对查询的取图成本**：每次比对会向两个外部来源各发一次请求。频率由人工点击决定，不做缓存与限流；若后续要批量比对，需要重新设计（本设计明确不含批量比对）。

---

## 9. 非目标

- 不改动图片的存储格式、编码参数、质量阈值与 `prints` 表结构。
- 不合并「数据源导入」链路（`pages/magic/data-source/*` 与 `MagicSourceImportPage.vue`）。
- 不引入批量比对、比对结果落库、或「比对后一键采用」。
- 不处理 site-magic 展示侧的取图逻辑。
- 不清理 `task_runs` 里的历史行。

---

## 10. 待定项

1. **任务类型的最终命名**：`magic_image_import_remote` / `_local` / `_single` 是建议名，评审时确认。
2. **比对图片的传输方式**：默认返回 data URL（见 6.3），备选是临时文件 + Tauri 本地读取。
3. **「数据管线」组内的排序**：暂定「卡图导入」排在 MTGCH 之后、投影之前。
4. **比对卡片的默认折叠状态**：暂定默认折叠。
