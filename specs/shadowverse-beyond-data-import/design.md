# 影之诗 Beyond 卡牌数据导入设计

> 稳定的运行时边界、能力分层和数据归属规则以 [../../docs/project-architecture.zh-CN.md](../../docs/project-architecture.zh-CN.md) 为准。本文只描述影之诗 Beyond（超凡世界）卡牌数据导入的需求级设计；若有冲突，以主架构文档为准。

## 背景

`apps/site-shadowverse` 目前只是静态站点脚手架，包含 `evolve`（进化对决）与 `beyond`（超凡世界）两个模式，卡包列表为手写静态 JSON（`app/data/shadowverse-sets.json`），卡图为示例图。仓库中没有任何影之诗数据导入能力：

- `packages/base` 的 `GAMES` 不含 `shadowverse`
- `packages/db` 无 `shadowverse` / `shadowverse_data` schema
- `packages/model` 无影之诗数据模型
- `service-desktop-runtime` 无影之诗导入任务
- `console-api` 与 desktop 无影之诗管理页面

本提案覆盖用户已确认的三项决策：

1. 先做 Beyond（超凡世界，数字版）模式，Evolve 另立提案
2. 数据来源以官方站点为主（shadowverse-wb.com Deck Portal）
3. 第一期导入范围为全量：卡牌数据 + 卡图 + 多语言（日/英/简中/繁中/韩）

## 数据源调研结论（已于 2026-08-30 实测验证）

官方 Deck Portal 卡牌库存在稳定的 JSON 接口，无官方公开文档，但接口无需登录即可访问。

### 接口定义

```
GET https://shadowverse-wb.com/web/CardList/cardList?include_token=1&offset={N}
Header: Lang: {ja|en|chs|cht|kor}
```

- `Lang` 头决定返回语言：`ja` 日文、`en` 英文、`chs` 简体中文、`cht` 繁体中文、`ko` 韩文。五种语言均已实测返回对应本地化文本（含本地化的 CV 名）。
- `offset` 分页，服务端默认每页约 30-40 条，返回体中的 `count` 为总条数（实测含 token 卡 904 条，不含 811 条），循环请求直到覆盖 `count`。
- `include_token=1` 包含衍生物（token）卡牌。
- 其余可用筛选参数：`class`、`type`、`cost`、`rarity`、`card_set`、`atk`、`life`、`tribe`、`skill`、`free_word`、`exists_card_style`、`battle_format`。全量导入只用 `include_token` + `offset`。

### 响应结构

```
data_headers.result_code          成功标记
data.count                        符合条件的卡牌总数
data.card_details                 分页返回的卡牌详情，以 card_id 为键
data.cards                        卡牌关联关系（related_card_ids、specific_effect_card_ids）
data.card_set_names               卡包/系列 ID → 本地化名称映射
data.tribe_names                  种族 ID → 本地化名称映射
data.skill_names / skill_replace_text_names
data.sort_card_id_list / stats_list
```

单张卡牌详情（`card_details[id]`）：

- `common`：`card_id`、`name`、`name_ruby`、`base_card_id`、`card_resource_id`、`cost`、`atk`、`life`、`type`、`class`、`tribes`、`rarity`、`card_set_id`、`skill_text`（含 `<b>`/`<color=Keyword>` 等自定义标记，导入时原样保存）、`flavour_text`、`cv`、`illustrator`、`questions`（官方 FAQ）、`is_token`、`is_include_rotation`、`deck_enabled_num`、`card_image_hash`、`card_banner_image_hash`、`original_card_id`、`is_starter_ability_changed`
- `evo`：进化后状态，含 `card_resource_id`、`flavour_text`、`skill_text`、`card_image_hash`、`card_banner_image_hash`（本地化文本随 Lang 请求返回；无进化状态的卡为空）
- `style_card_list`：卡面样式列表，每项含 `hash`、`evo_hash`、`name`、`name_ruby`、`cv`、`illustrator`、`skill_text`、`flavour_text`、`evo_flavour_text`

### 卡图 URL 规律

```
/uploads/card_image/{resourceLang}/card/{card_image_hash}.png
resourceLang ∈ {jpn, eng, cht, chs, kor}（与 Lang 的映射已实测确认）
```

关键规律：**`card_image_hash` 按语言独立**。同一张卡在 `en` 与 `chs` 响应中 hash 不同，且各语言 hash 只在该语言的资源目录下有效（错配返回 403）。因此卡图下载必须先按五种语言分别拉取卡牌列表，取各自响应中的 hash 再下载。进化后卡图与样式卡图同理（进化图与样式图的确切子目录在实现期以实际请求为准）。

### 数据量与频率估算

- 卡牌数据：约 30 次请求/语言 × 5 语言 ≈ 150 次请求
- 卡图：约 904 卡 × (基础图 + 进化图) × 5 语言，首次全量下载量较大但一次性；后续按 hash 增量更新
- 合规注意：仅访问官方公开 Deck Portal 页面所用接口，保持合理请求间隔（串行 + 每次请求间数百毫秒延时），不绕过任何访问控制；卡图等素材的使用范围遵循仓库现有 LEGAL 约定

## 目标

1. `shadowverse` 作为新游戏接入既有导入体系（`GAMES` 注册、db schema、model、desktop runtime 任务）
2. 从官方 Deck Portal 接口全量导入 Beyond 卡牌数据，覆盖五种语言
3. 按语言下载并本地存储卡图（基础/进化/样式），基于 hash 增量更新
4. 导入幂等可重跑，过程状态与失败记录落在 `shadowverse_data`
5. desktop 提供影之诗导入入口，复用既有任务框架与任务 UI

## 非目标

1. 不做 Evolve（实体 TCG）模式的数据导入，另立提案
2. 第一期不做本地 → 远端 publish；本地闭环验证后再扩展。原因：当前只能在本分支工作、无法合入主干，远端发布不具备实际执行条件，publish 另立提案
3. 不做 `service-watcher` 的自动定时更新
4. 不做站内 skill_text 自定义标记的渲染适配（导入原样保存，渲染属于站点侧后续工作）

## 方案

### 1. 游戏接入

- `packages/base`：`GAMES` 增加 `'shadowverse'`（drizzle 配置经 `GAMES` 自动拾取）
- `packages/db` 新增 schema：
  - `schema/shared/shadowverse/`：声明 `pgSchema('shadowverse')`，领域事实表
  - `schema/local/shadowverse/`：声明 `pgSchema('shadowverse_data')`，导入状态表

### 2. 表分类（遵循仓库分类规则）

`{game}`（shared，可导出静态领域事实）：

- `cards`：卡牌静态事实（card_id 主键、base_card_id、card_resource_id、cost/atk/life、type、class、tribes、rarity、card_set_id、is_token、deck_enabled_num、is_include_rotation 等）
- `card_sets`：卡包/系列（card_set_id 主键、发布顺序等）
- `card_styles`：卡面样式（card_id、序号、hash 关联）
- 本地化表：`card_localizations`、`card_set_localizations`、`card_style_localizations`（lang、name、name_ruby、skill_text、flavour_text、cv、illustrator 等）
- 关联事实：`card_relations`（related_card_ids、specific_effect_card_ids 物化）等

`{game}_data`（local，导入侧、用户无关）：

- `import_batches` / `import_failures`：导入记账与失败隔离（对齐游戏王模式）
- `import_states`：按语言/分页的断点状态
- `image_import_*`：卡图下载状态（语言、kind、hash、文件路径、下载时间）

依赖方向：`shadowverse_data` 可依赖 `shadowverse`，反向禁止。

### 3. model 层

`packages/model/src/shadowverse/` 新增 zod 模型：

- 响应 payload 模型（cardList 响应、common/evo/style 子对象），字段校验 + 失败隔离
- 领域模型（卡牌、本地化、卡包、样式），与 schema 对齐

### 4. 导入任务（service-desktop-runtime）

对齐游戏王 `cards-source.ts` + `cards-import.ts` 的结构，新增 `lib/shadowverse/`：

- `cards-source.ts`：接口客户端（Lang 头、串行分页、延时、重试），返回原始 payload
- `cards-import.ts`：zod 校验 → 以 `card_id` 为键幂等 upsert `shadowverse.*` 领域表（含软删除语义：不再出现的卡牌按仓库规则使用 `deleted_at` 标记，不做硬删除）→ 写 `shadowverse_data.*` 记账表
- `image-source.ts` + `images-import.ts`：按语言取 hash，下载 PNG 至本地 bucket 目录（对齐炉石/游戏王卡图的本地存储模式），hash 未变化的跳过
- 任务定义：`shadowverse_cards_import`（数据）与 `shadowverse_images_import`（卡图）两个任务，注册进 `task-definitions.ts`，支持从 desktop 触发、查看进度与失败明细

### 5. desktop 入口

- `app-console-desktop` 设置页新增「游戏 → 影之诗」，提供导入触发与进度展示，复用 `TaskController` 任务 UI
- `console-api` 按需新增影之诗 router（第一期最小化：触发导入与读取导入状态）

### 6. 增量更新策略

- 卡牌数据：每次全量拉取 + 幂等 upsert（数据量小，约 150 次请求）
- 卡图：以「语言 + kind + hash」为增量键，hash 不变即跳过下载
- 新卡包上线时重跑导入即可，无需专门逻辑

## 已确认决策（评审结论，2026-08-30）

1. 第一期不做 publish 到远端：当前只能在本分支工作、无法合入主干，远端发布不具备实际执行条件；publish 在条件具备后另立提案
2. token 卡包含入库（`include_token=1`），站点检索与详情页需要展示衍生物
3. 卡面样式（`style_card_list`）数据与异画卡图（含进化样式图）均在第一期导入
4. 卡包列表接受依赖导入数据，暂无发售日等元数据；后续如需发售日另找补充数据源
