# 影之诗 Evolve 卡牌数据导入设计

> 稳定的运行时边界、能力分层和数据归属规则以 [../../docs/project-architecture.zh-CN.md](../../docs/project-architecture.zh-CN.md) 为准。本文只描述影之诗 Evolve（进化对决，实体 TCG）卡牌数据导入的需求级设计；若有冲突，以主架构文档为准。影之诗 Beyond 的导入设计见 [../../specs/shadowverse-beyond-data-import/design.md](../../specs/shadowverse-beyond-data-import/design.md)，本提案复用其模式但不复用其表结构。

## 背景

Beyond 导入已完成（specs/shadowverse-beyond-data-import）。`apps/site-shadowverse` 的另一个模式 Evolve（进化对决，实体集换式卡牌）目前仍只有静态脚手架：47 个卡包的日文名列表（`app/data/shadowverse-sets.json`）与示例卡图。本提案覆盖 Evolve 卡牌数据与卡图的导入。

## 数据源调研结论（已于 2026-08-30 实测验证）

Evolve 官方站点为 WordPress 架构，**无 JSON API**，数据需通过服务端渲染 HTML 解析获取。

### 官方日文卡查

```
列表：GET https://shadowverse-evolve.com/cardlist/cardsearch?{筛选参数}
详情：GET https://shadowverse-evolve.com/cardlist/?cardno={卡号}   例 BP21-001
卡图：https://shadowverse-evolve.com/wordpress/wp-content/images/cardlist/{卡包}/{小写卡号}.png
```

- 列表页筛选参数：`card_name`、`class[]`、`expansion_name`、`cost[]`、`card_kind[]`、`rare[]`、`power_from/to`、`hp_from/to`、`type`、`ability`、`keyword` 等（具体取值格式实施期确认）
- 当前收录约 7366 张卡
- 详情页字段：卡名、职业、卡牌种类、种族、稀有度、收录商品、费用/攻击力/体力、能力文本（含关键词标记）、风味文本、画师、卡号、关联卡、**官方 Q&A（带编号与日期）**、发售日期、附加收录信息（如 additional pack）
- 卡图 URL 规律可预测，按卡号直接构造，无需从页面解析

### 其他语言

- 英文官方站 `en.shadowverse-evolve.com/cards/`：按卡包的服务端渲染列表（`/cards/searchresults/?expansion=BP01`，有分页），卡号带 `EN` 后缀（BP01-001EN），卡图规律与日文站同款（`/wordpress/wp-content/images/cardlist/{卡包}/{卡号EN}.png`）
- 简体中文：网易代理简中版无公开 API，但社区工具 **SVE Helper**（svehelperwin.com）提供公开 JSON 接口（`POST /api/card/getCardList`，无需登录），收录约 6661 张卡，字段含 `name_jp/name_cn/desc_jp/desc_cn/.drawer/related_card_nos` 等完整数据，简中文本来自官方简中版翻译（最新卡包简中名可能滞后为空）

### 与 Beyond 导入的关键差异

1. 日文/英文站为 HTML 解析（`cheerio` 已是 runtime 现有依赖）；简中为公开 JSON API
2. 三语言三来源：日文官方、英文官方、简中社区聚合（官方翻译），按卡号关联（英文卡号带 EN 后缀，映射规则实施期确认）
3. 详情页按卡号逐张请求，日文全量约 7400 次请求；简中列表接口一次分页即可全量
4. 字段模型是实体 TCG 语义（卡号 BP01-001、进化元数据、画师、官方 Q&A），与 Beyond 的数字卡牌模型差异大，表结构独立设计

## 目标

1. Evolve 作为 shadowverse 游戏内独立于 Beyond 的数据集接入导入体系（表结构与 Beyond 分开，同一 `shadowverse`/`shadowverse_data` schema 命名空间内以表名区分）
2. 从官方站点全量导入卡牌数据与卡图，幂等可重跑
3. 卡图按卡号规律下载至本地 bucket（`data/shadowverse-evolve/images`，gitignore），增量跳过
4. desktop 新增 Evolve 导入任务入口，复用任务框架

## 非目标

1. 不做卡牌能力文本的渲染适配（官方 HTML 标记原样保存）
2. 不做 deck/比赛数据、价格数据
3. 中文本地化不在官方来源范围内，是否引入社区来源见待决策项

## 方案

### 1. 表分类

`{game}`（shared，shadowverse schema 内，表名以 `evolve_` 前缀与 Beyond 区分）：

- `evolve_cards`：卡牌静态事实（卡号主键、所属卡包、职业、卡牌种类、种族、稀有度、费用/攻/体、关联卡号等）
- `evolve_card_sets`：卡包（卡包代码主键、日文名、发售日、卡数）
- `evolve_card_localizations`：本地化（lang、卡名、能力文本、风味文本）
- `evolve_card_questions`：官方 Q&A（卡号 + Q/A 编号 + 日期 + 文本）

`{game}_data`（local，shadowverse_data schema 内，`evolve_` 前缀）：

- `evolve_import_batches` / `evolve_import_failures` / `evolve_import_states`：导入记账（对齐 Beyond 模式）
- `evolve_image_assets`：卡图下载状态

依赖方向遵循仓库规则：`shadowverse_data` 可依赖 `shadowverse`，反向禁止。

### 2. 导入任务（service-desktop-runtime）

新增 `lib/shadowverse-evolve/`：

- `card-list-source.ts`：卡包枚举 + 卡号枚举（解析 cardsearch 列表页）+ 详情页解析（cheerio）
- `cards-import.ts`：幂等 upsert 领域表 + 记账（模式对齐 Beyond `cards-import.ts`）
- `image-source.ts` / `image-import.ts`：按卡号规律下载卡图，hash/存在性增量跳过
- 任务定义 `shadowverse_evolve_cards_import`、`shadowverse_evolve_images_import`，注册进 `task-definitions.ts`
- 请求间隔与退避策略对齐 Beyond（串行 + 数百毫秒延时 + 空响应重试）

### 3. desktop 入口

设置页「游戏 → Shadowverse」扩为两个模式区块（Beyond / Evolve），或新增独立页，复用任务 UI。

### 4. 增量更新

- 新卡包上线重跑导入即可；卡图按文件存在性/卡号增量
- 详情页全量请求一次约 7400 次（数百毫秒间隔约 1-1.5 小时）；若列表页字段已够用，可仅对新卡抓详情

## 待决策项（请评审时拍板）

1. **语言范围**：仅日文（官方最完整）/ 日文 + 英文（英文站需额外解析一套）/ 中文如何处理（无官方来源；引入社区来源则质量与维护依赖第三方）
2. **抓取深度**：每卡抓详情页（含画师、风味、Q&A，全量约 7400 请求）/ 仅列表页字段（请求少但字段不全，具体差异实施期确认）
3. **官方 Q&A** 是否入库（建议入库，实体 TCG 规则查询价值高）
4. **Q&A 变化与 errata（卡牌修正）** 是否第一期处理（官方有 ERRATA 内容类型；建议第一期只存 Q&A 快照，errata 后续）

## 已确认决策（评审结论，2026-08-30）

1. 语言范围：**日文官方 + 英文官方 + 简中（SVE Helper 公开接口，官方简中翻译）**；简中覆盖约 6661 张、最新卡包可能滞后，缺失置空
2. 抓取深度：**详情页全量**（画师、风味、Q&A 全字段）
3. 官方 Q&A：**入库**
4. errata：**第一期不做**
