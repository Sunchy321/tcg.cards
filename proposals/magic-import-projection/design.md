# 万智牌卡牌导入与投影 — 设计文档

## 1. 背景与目标

万智牌（magic）站点目前只移植了基础 schema，卡牌数据的**导入 + 投影**尚未实现。本次设计需要同时解决三个问题：

1. **导入 + 投影**：从数据源拉取并投影到事实表，尚未实现。
2. **版本**：少数卡牌存在「效果被多次修改」的情况（hearthstone 式增强/削弱），投影需要预留版本维度。
3. **同语言多来源**：同一语言可能来自不同来源（官方简中 vs 民间简中），需要区分、共存，且方案要通用到游戏王等更多来源的游戏。

本文档固化领域模型与目标 schema，供后续评审与实现。

## 2. 核心概念（领域模型）

### 2.1 cardId（卡牌身份）

- cardId 是卡牌跨版本的**稳定身份**，默认由英文名 normalize 后取 slug 得到。
- 不变量：**同 cardId 必须逻辑上视为同一张牌**。即使 slug 无法可靠推导（重名、改名），该不变量仍成立。
- 同名冲突（不同 oracle 对象归到同一 slug）时，整组进入导入审核，由人工确认是合并还是拆卡，绝不静默合并、也不允许主键冲突。

### 2.2 card version（卡牌版本）

- 「版本」= 一张牌的效果被多次修改（hearthstone 式前后对比），**不是**「同一张牌的多个印刷」。
- base 版本不带日期；后续版本各带一个生效日期。日期即版本标识。
- 纸牌被重平衡成线上牌属于**性质分裂**（线上用线上版、线下用纸质版），应作为**两张独立卡牌**，不是版本。
- 版本数据来源：Scryfall 不记录纯线上牌的平衡改动历史，因此**版本数据由未来手工录入，不属于本次导入任务**。本次导入只产生 base 状态（version 为空串）。
- 每个版本是**完整记录**（全套字段），不做 delta 存储。

### 2.3 localization source（本地化来源）

- `source` 维度**只挂在本地化层**（名称/类别栏/异能文本），结构化字段（费用/攻防/颜色/关键词）不区分来源。
- `source` 为 text 列，`''` = 官方（前端不显示标记），`mtgch` = 民间简中（前端显示来源标签）。
- 来源集合**每游戏固定**，不是导入来源清单；新增来源不迁移（纯文本行）。
- 前端**并排显示所有（语言 × 来源）组合**，不自动只选一个。
- 印刷的本地化保持平铺行（可参与查询），不使用 JSON。

### 2.4 data source ownership（数据来源分工）

| 来源 | 职责 | 状态 |
|------|------|------|
| Scryfall | 绝大多数卡牌数据 + 数据骨架（oracle 卡、印刷、系列、裁定） | 确认 |
| Gatherer | Scryfall 缺失的**官方本地化**，以 multiverseId 为钩子；无官方 API，**逆向 Nuxt hydration** 提取 | 确认 |
| MTGCH | 非官方本地化（导出 JSONL 数据集，无网页 API） | 确认 |
| MTGJSON | Set 相关数据（仍以 Scryfall 为骨架）；**不作简中来源**（简中覆盖仅 33.9%，且局限 2018-2023 窗口，缺历史与 2024 后） | 确认 |

> 探测依据：`scripts/magic/probe-mtgjson-zhs.ts`（见 data-sources.md §4.4）。

## 3. 目标 Schema

### 3.1 事实表主键（version + source 进主键）

| 表 | 主键 |
|---|---|
| `magic.cards` | `(cardId, version)` |
| `magic.card_localizations` | `(cardId, version, locale, source)` |
| `magic.card_parts` | `(cardId, version, partIndex)` |
| `magic.card_part_localizations` | `(cardId, version, locale, source, partIndex)` |
| `magic.prints` | `(cardId, version, set, number, lang, source)` |
| `magic.print_parts` | `(cardId, version, set, number, lang, source, partIndex)` |

- `version`：base = `''`，未来版本 = 日期字符串。**本次迁移即加入**（即使当前导入只写空串），以减少未来迁移次数。
- `source`：官方 = `''`，民间 = `mtgch`。仅本地化相关表包含。
- 结构化字段仍单一权威来源，`cards` 的 Oracle 内容不分来源。

### 3.2 slug 手动标注表（magic_data）

新增 `magic_data.card_slug_annotations`（slug ↔ oracle_id 手动标注）：

- 用于解决同名冲突：匹配阶段发现同一 slug 对应多个不同 oracle 对象时，整组进入审核，不自动落库。
- 人工确认拆卡后，指定语义化 slug（如 `-alchemy`、`-token` 后缀），记录在本表。
- 保证主键永不冲突、且同 cardId = 同一张牌。

## 4. 导入管线设计

### 4.1 运行位置

- 与 hearthstone 对齐：跑在 `service-desktop-runtime` + 本地数据库，使用现有任务系统（executor/scheduler/worker），控制台触发。
- **此模式适用于所有未来游戏**（每源一个导入任务 + 一个整体投影任务）。

### 4.2 任务拆分

- **每个来源一个导入任务**：
  - `magic_scryfall_import`（bulk 下载 → 缓存到 `magic_data.scryfall_*`）
  - `magic_gatherer_import`（爬虫，见 4.3 → `magic_data.gatherer`）
  - `magic_mtgch_import`（导出文件 → `magic_data.mtgch_zhs_*`）
  - `magic_mtgjson_import`（set 文件 → `magic_data.mtgjson_sets`）
- **一个整体投影任务** `magic_project`：match → 按卡装配 → 投影纯函数产出 base → 写事实表（尊重 overlay）。
- 导入与投影都**自动、确定**；审核/冲突解决走协作机制（见 4.6）。

### 4.3 Gatherer 爬虫

- **目标**：从 Scryfall prints 收集全部 multiverseId，**数字升序**。
- **每个 multiverseId**：
  - `magic_data.gatherer` 已有行（含 404）→ 跳过（状态 = 表本身）。
  - 否则 fetch `Details.aspx?multiverseid=N`（308 重定向到新卡页）→ 提取 flight 数据中的**全部 CardData**（该卡所有印刷 + 语言）→ 按 multiverseId 缓存。
  - 404 → 缓存 `data=null`（记录「不在 Gatherer」）。
- `url` 列存重定向后的规范卡页 URL。
- **断点续爬**：数字升序 + 表即状态；**长期缓存**（结果稳定，无需担心过期）。

### 4.4 匹配与 cardId 分配

match 是投影任务内部的**前置步骤**（批次级）。

- 默认 `cardId = slug(normalized 英文名)`。
- 批次内建立 `slug → oracle_ids` 映射：
  - 同一 slug 仅一个 oracle 对象 → 直接归属该 cardId。
  - 同一 slug 多个**不同** oracle 对象 → 整组标记「cardId 待定 + 冲突候选」，进入审核，不自动落库。
- 查 `card_slug_annotations`：命中（已人工指定）→ 用指定 slug。
- 审核决策：合并（同卡，scryfallOracleId 累积）或拆卡（分配语义化 slug，写入标注表）。冲突组跳过投影，解决后再跑。

### 4.5 投影（base 纯函数 + 单卡测试）

投影任务 = ① 批次 match → ② 按卡装配（collect 同 oracle_id 的所有印刷）→ ③ 纯函数产出 base → ④ 写事实表（尊重 overlay）。

- 纯函数：`projectCard(assembledCard, ...) → ProjectCardResult`，输入按 oracle_id 聚合的卡数据，输出该卡全部事实表行（cards / card_localizations / card_parts / prints / ...，可多行），含 unified。
- 配套「单卡测试」夹具（bun:test，无数据库），投影行为变更时重新生成夹具。

### 4.6 base + overlay 协作模型（以 docs/multi-user-data-import.md 为准）

- **base**（自动层）= 投影输出，不落表；字段无手动 overlay 时直接作为事实表当前值。
- **overlay**（手动层）= 字段级 `field_commits`；`accepted` 后物化进事实表并更新 `field_winners`。
- **field_winners**：每字段当前 winner 来源（`auto:xxx` / `manual:...`）。投影写表时：auto-winner 字段写 base；manual-winner 字段**不覆盖**，保留手动值并对比新 base 判漂移 / 冲突 / A、B 类提醒。
- **轨道**：默认全字段 `collaborative`（允许手动 overlay）；`publish-owned`（纯 base、换代整体替换）为窄例外，按字段策略个别标记。
- **切换轻量**：轨道是字段策略配置；投影始终 overlay-aware，切换不改投影机制。collaborative → publish-owned 且已有已接受 overlay 时做一次性清理（折叠/清除）。

### 4.7 导入机制（新表替换旧 import_*）

旧 `magic_data.import_*` 表未与 `docs/multi-user-data-import.md` 对齐，**移除**，替换为：

- `magic_data`：`field_winners` / `field_commits` / `field_sync_cursors` / `field_conflicts` / `base_change_review` / `source_versions` / `raw_entity_snapshots`
- `magic_app`：`import_review_actions`
- remote：`PublishStreamRegistration` / `PublishLedger`
- 配置（per-game schema）：`source_catalog` / `field_policies` / `rule_sets`

链路：源适配器 → 原始载荷入库 → 标准化记录 → 实体匹配 → 字段级 diff → 规则评估 / 基础值决策 → 生成变更集与执行模式（auto_apply / batch_review / manual_review）→ 应用 → 应用日志与回滚。

## 5. 待确认项

- **字段策略初始配置**：来源目录、字段规则/策略的默认值（哪些字段 auto_apply / batch_review / manual_review）与默认协作轨道。
- **协作机制首次落地**：magic 是首个真正使用 `field_commits` / `field_winners` 的游戏，具体用法需在实现中打磨。
- **版本手工功能**：未来设计（`version` 列已预留）。
- **批量审批分组与 UI**：按来源/字段/规则分组的批量审批界面。

## 6. 关联文档

- `docs/multi-user-data-import.md` — base + overlay 多用户导入与同步设计（权威）。
- `CONTEXT.md` — Magic 段（cardId / card version / localization source / data source ownership / unified localization / slug annotation）。
- `docs/adr/0001-magic-cardid-identity.md` — cardId 身份模型决策。
- `data-sources.md` — 数据源结构与字段增量对比。
