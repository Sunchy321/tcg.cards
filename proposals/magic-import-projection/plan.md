# 万智牌卡牌导入与投影 — 实现计划

## TODO

- [x] 1. Schema：事实表主键加入 version/source
- [x] 2. Schema：新增 slug 标注表（magic_data）
- [x] 3. Schema：扩充 magic_data.scryfall 导入表 + 事实表新列
- [x] 4. 更新 Zod model 定义
- [x] 5. 生成数据库迁移（commit 前生成，合并为一次）
- [x] 6. Schema：新建协作/同步表（替换旧 import_*）
- [x] 7. 数据源接入：Scryfall 导入任务
- [x] 8. 数据源接入：MTGCH / MTGJSON 导入任务
- [x] 9. 数据源接入：Gatherer 爬虫导入任务
- [x] 10. 匹配与 cardId 分配（含冲突预识别）
- [x] 修订：删除事实表「整卡正文」列（cards.text / card_localizations.text / flavorText / prints.text）——commit `4f606d1`
- [ ] 修订：`card_unified_localizations` 增加 `source` 列（与投影 schema 同批迁移）
- [ ] 11. 投影纯函数 + 单卡测试（事实表 base + unified）
- [ ] 12. 装配 + 投影任务接线（match → 装配 → project → 写 base / unified）
- [ ] 13. 协作机制落地（field_commits / field_winners / 审批）——后续，不在本轮
- [ ] 14. 控制台 UI（data-source 页 + 审批）——后续
- [ ] 15. API 复查与数据来源分工定稿——后续

---

## 0. 修订与锁定（2026-09-03，投影开工前）

本轮投影开工前，grill/评审对原设计做了以下修订，**以此为准**：

### 0.1 事实表只留面级正文；整卡正文不复存在

- **已删列**（commit `4f606d1`，含 local/remote 迁移）：
  - `magic.cards.text`
  - `magic.card_localizations.text`、`magic.card_localizations.flavorText`
  - `magic.prints.text`
- **正文唯一权威在面级**：`card_parts.text` / `card_part_localizations.text` / `print_parts.text`（+ `print_parts.flavorText`）。
- `cards` 保留 `name`/`typeline`（英文规范名 = 双面 ` // ` 连接，供排序/deck 导入/裁定）；`card_localizations` 保留 `name`/`typeline`（每 (locale × source) 的卡级展示标识，DFC 等用 ` // ` 连接）；`prints` 保留 `name`/`typeline`。
- 宽视图（card_view / print_view / card_print_view / card_editor_view）group 随之缩水；`site-magic` 的 chat `getCard` 改为从面级即时拼正文。

### 0.2 官方本地化来源改为 Scryfall 多语言行

- 本仓库 `magic_data.scryfall_cards` 由 Scryfall **all_cards** 灌入，**已含各语言印刷行**（zhs 约 4.1 万、zht 约 2.4 万等）。
- Scryfall 多语言行的 oracle 层字段（name/type_line/oracle_text）始终英文；本地化内容在 `printed_name` / `printed_type_line` / `printed_text` / `flavor_text`（印刷表面）。
- **结论**：官方本地化（`source=''`）直接取自 scryfall 各语言印刷行，**Gatherer 不再作为官方本地化来源**（本轮不使用其数据）。

### 0.3 本地化行（card_localizations / card_part_localizations）生成规则

- `en`：产 `(en,'')` 行（卡级 name/typeline 与面级 name/typeline/text 均为英文 oracle 的镜像，供宽视图/画像按 locale join）；英文正文权威在 `cards`/`card_parts`（oracle）。unified 不产 en 行。
- 其它语言：该卡在 scryfall 有该语言印刷 → 产 `(locale,'')`，文本取该语言 `releaseDate` 最新印刷的 `printed_*`；无则不产。
- `zhs` 另有民间 `(zhs,'mtgch')`：取自 `magic_data.mtgch_zhs_oracle` 的 oracle 对齐翻译。
- 每面文本缺该 (locale × source) 时回退该面英文 oracle。
- `card_localizations`/`print` 仅存 name/typeline；正文只存到 `card_part_localizations`/`print_parts`（面级）。

### 0.4 unified（magic_data.card_unified_localizations）语义

- **不是搜索表**：它是「每 (card, version, locale) 一个权威整卡文本」的决定/winner 层。
- **无 `en` 行**：英文 canonical 直接用 oracle。
- 每行 = 值快照（name/typeline/text/flavorText，正文为**整卡拼合**，面间用一行 **20 个 `-`** 分隔；name/typeline 多面仍用 ` // `）+ winner 记录：
  - 加 `source` 列：`''` = 由官方印刷确立；`mtgch` = 由民间确立。
  - `sourceSet`/`sourceNumber`/`sourceReleaseDate`：官方确立时记确立的官方印刷；mtgch 确立时为空。
- 值决定规则：
  - `zhs`：mtgch 存在则用民间（oracle 对齐）；无 mtgch 则用官方最新简中印刷的 `printed_*`（记 provenance）。两者都有且正文不同 → **选 mtgch**，并写一条 `magic_data.base_change_review`（pending，entityType=`cardUnifiedLocalization`）记录差异，供事后审计/将来审批（事前可查、事后可追溯）。
  - `zht` 及其它语言：该语言官方最新印刷的 `printed_*`（记 provenance）；无该语言印刷则无行。
- 拼合副本：事实表已无整卡正文，unified 是唯一拼合正文副本；消费方需单面时按分隔符自行拆开。

### 0.5 prints 集合与可逆卡

- `prints`（`source=''`）= 官方 scryfall 印刷目录：`magic_data.scryfall_cards` 中**每条印刷对象（含各语言行）**映射一行 `(set, number, lang)`。
- **民间（mtgch）不产 prints 行**；mtgch 只在 `card_part_localizations` + unified 层贡献民间文本。
- **可逆卡（reversible_card）**：顶层 `oracle_id` 为空，两个 face 各指向已存在卡 → **拆成两张 print**，分别挂到对应卡上（alt-art 印刷），不单立 card。

---

## 1. Schema：事实表主键加入 version/source ✅

位置：`packages/db/src/schema/shared/magic/card.ts`、`print.ts`

- `cards`：`(cardId, version)`。
- `card_localizations`：`(cardId, version, locale, source)`。
- `card_parts`：`(cardId, version, partIndex)`。
- `card_part_localizations`：`(cardId, version, locale, source, partIndex)`。
- `prints`：`(cardId, version, set, number, lang, source)`。
- `print_parts`：`(cardId, version, set, number, lang, source, partIndex)`。
- 审计列 `createdAt`/`updatedAt`/`deletedAt`；移除 `__lockedPaths`/`__updations`/`__lastDate`。
- view 更新（card_view / print_view / card_print_view / card_editor_view）。

## 2. Schema：新增 slug 标注表（magic_data）✅

`magic_data.card_slug_annotations`（slug PK、oracleId、reason、notes）。

## 3. Schema：扩充 magic_data.scryfall 导入表 + 事实表新列 ✅

- `magic_data.scryfall_cards`（全字段）/ `scryfall_sets` / `scryfall_rulings`。
- `magic_data.gatherer`（+`url` 列）、`mtgch_zhs_*`（6 张）、`mtgjson_sets`。
- `magic_data.card_unified_localizations`（unified；本轮再加 `source` 列，见 §0.4）。
- 事实表新列：`tcgplayerEtchedId`/`imageUpdatedAt`（prints）、`mcmIdExtras`（sets）。
  - 注：`card_localizations.flavorText` 原随本任务加入，后因卡级本地化不存正文而删除（§0.1）。

## 4. 更新 Zod model 定义 ✅

各源 model（scryfall / gatherer / mtgch / mtgjson / unified）、事实表 model 同步。

## 5. 生成数据库迁移 ✅

commit `ed474d2` 已含 local + remote 迁移；修订删除迁移见 commit `4f606d1`。

## 6. Schema：新建协作/同步表（替换旧 import_*）✅

完成：commit `7fe0c9b`（新增协作/同步表，移除旧 import_*）。

位置：`packages/db/src/schema/`

- `magic_data`：`field_winners` / `field_commits` / `field_sync_cursors` / `field_conflicts` / `base_change_review` / `source_versions` / `raw_entity_snapshots`
- `magic_app`：`import_review_actions`
- remote：`PublishStreamRegistration` / `PublishLedger`
- 配置（per-game）：`source_catalog` / `field_policies` / `rule_sets`
- **移除**旧 `import_sources` / `import_rule_sets` / `import_field_rules` / `import_policy_snapshots` / `import_runs` / `import_raw_records` / `import_change_sets` / `import_field_changes` / `import_apply_logs`
- 参照 `docs/multi-user-data-import.zh-CN.md` §14 与 `shared/hearthstone/field-sync.ts`（field_winners/field_commits/field_conflicts 结构）。

## 7. 数据源接入：Scryfall 导入任务 ✅

完成：commit `50d80d9`（bulk 下载 → `magic_data.scryfall_*` + orpc 触发）。

位置：`apps/service-desktop-runtime/src/lib/magic/`

- `magic_scryfall_import`：下载 bulk（all_cards 等）→ 缓存到 `magic_data.scryfall_*`。
  - 注：本地实际灌的是 **all_cards**（各语言都有），与 §0.2 依赖一致。

## 8. 数据源接入：MTGCH / MTGJSON 导入任务 ✅

完成：commit `c4ed4a5`（mtgch 导入 + mtgjson 导入，bun-native 文件解析）。

- `magic_mtgch_import`：读本地导出 JSONL → `magic_data.mtgch_zhs_*`。
- `magic_mtgjson_import`：下载 set 文件 → `magic_data.mtgjson_sets`。

## 9. 数据源接入：Gatherer 爬虫导入任务 ✅

完成：commit `9671f5b`（自适应缓存、粒度级别、连续区间爬取）。

- `magic_gatherer_import`：从 Scryfall prints 收集 multiverseId，数字升序爬。
- 每 multiverseId：`gatherer` 有行则跳过；否则 `Details.aspx?multiverseid=N`（308 → 新页）→ 提取 flight CardData → 缓存（含 404 = null）。
- 状态 = `gatherer` 表本身，可断点续爬。
- 注：§0.2 后 Gatherer 不再供官方本地化，本任务爬取的数据本轮投影不使用（保留爬虫，用途待定）。

## 10. 匹配与 cardId 分配（含冲突预识别）✅

完成：commit `bfa8fdb`（slugifyCard + shared slugifyName）+ matchBatch 接通 slugifyCard、dft 拆分、冲突预识别（待提交）。

- 批次内 `slug → oracle_ids`；冲突组 → 审核（`card_slug_annotations`）→ 合并或拆卡（语义化 slug）。
- match 是投影任务的前置步骤；`double_faced_token` 按面拆 unit；`reversible_card` 无 unit（身份由面解析）。

## 11. 投影纯函数 + 单卡测试（事实表 base + unified）

位置：`apps/service-desktop-runtime/src/lib/magic/project/`

### 11.1 建模（领域模型 v2）

投影的单位不是 cardId（cardId 是投影中 match **产生**的），而是 **unit**：

- 普通卡（含 transform/split/adventure/meld 等多面卡）：`unit = oracleId`，一个 unit 产一张卡（该行 en faces 即卡的全部 part）。
- `double_faced_token`：`unit = oracleId:0 / oracleId:1` → 同一 en 行产 **两张卡**，各自只用自己那一 face 作内容。
- `reversible_card`：不产 unit；按两个 face 的 oracleId **给对应卡补印刷**（两 face 同 oracle → 同一张卡补两条 print；不同 → 各补一条）。若某 face 的 oracle 没有别的 en 定义行，则该 face 自身立一个 unit。
- 不存在「多行拼成一张卡」：每张卡的 oracle/面内容单一起源；印刷/本地化行只是归附，不参与构成。
- match 的 unit→cardId（`cardIdByUnit`）即遍历依据；conflicts 组不投递。

**装配（每 unit 收齐原料 → `AssembledCard`）**
- oracle 内容：该 unit 的 en 面数据（DFT 面 unit 只有那一面）。
- prints：归到该 unit 的所有官方印刷行（普通=该卡各语言印刷；DFT/reversible 按 face 拆补成各卡的 print）。
- localizations：每 (locale×source) 已挑好的面文案；mtgchOracle：oracle 级民间翻译。

**`projectCard(AssembledCard)` → 该卡全部行**：cards / card_parts / card_localizations / card_part_localizations / prints / print_parts / unified（无 en unified；正文面间 20 个 `-`；zhs 民间覆盖官方写 `base_change_review`）。

**DFT 拆卡的卡级结构化默认（先用此，夹具以真实数据校正）**：token 无费用 → `manaValue=0`；`colorIdentity` 取该 face 的 `colors`；无颜色则为空。

### 11.2 `projectCard(assembledCard, ...) → ProjectCardResult`

- 输出（version=''）：
  - `cards`（name/typeline/结构化/partCount/category/tags/legalities/…）。
  - `card_parts`（每面：name/typeline/text/cost/颜色/type_*/攻防等）。
  - `card_localizations`（每 (locale × source)：仅 name/typeline，多面用 ` // ` 连接；规则见 §0.3）。
  - `card_part_localizations`（每 (locale × source × 面)：name/typeline/text，缺面回退英文 oracle）。
  - `prints`（官方 scryfall 印刷目录，含各语言 `source=''`；可逆卡拆两条 print；民间不产）。
  - `print_parts`（每印刷面：printed 表面 name/typeline/text/flavor/artist/watermark…）。
  - `card_unified_localizations`（unified：无 en 行；按 §0.4 决定 source/值/provenance；mtgch 覆盖官方差异写 `base_change_review`）。
- 结构化字段单一权威；category/tags/各类 print 列按旧代码映射 + 夹具校正。
- 纯函数返回行集 + 差异报告（insert/update/unchanged/delete 计数与 unified override 记录）。

### 11.3 单卡夹具（bun:test，无数据库）

- 参照 hearthstone `task/project/cards/*.test.ts` + `runner.ts` 模式：
  - 每个夹具 = 一卡 raw 快照（`AssembledCard`）→ 期望 `ProjectCardResult` 行。
  - 覆盖：普通单面、split/adventure、modal DFC/transform、meld、token、可逆卡、zhs 官方/民间、官方 vs 民间差异（override + review）、各印刷语言行。
  - 投影行为变更时重新生成夹具。

## 12. 装配 + 投影任务接线（match → 装配 → project → 写 base / unified）

- 任务 `magic_project`（沿用任务系统约定：`lib/magic/task/magic-project/definition.ts` + index；注册到 task-definitions；orpc 触发）。
- 流程：批次 match → 逐卡装配 → `projectCard`（纯函数）→ 单事务写事实表 + unified（复用 `upsertBatch`/`softDeleteMissing`，PK 集合软删陈旧行）→ 汇总报告（含 unified override 审计条数）。
- 本轮只写 **base**：不 consult `field_winners`、不做 overlay 写保护（overlay 属 §13）。
- `effectModel: 'reconcilable'`；bounded + durable resume，按 cardId 分块 checkpoint（对齐 hearthstone project 任务）。

## 13. 协作机制落地（field_commits / field_winners / 审批）——后续

- base 换代 / 手动 overlay 的写入与 winner 维护。
- 冲突 / A、B 类提醒（base_change_review）。
- 审批（import_review_actions）与字段策略（field_policies）执行。

## 14. 控制台 UI（data-source 页 + 审批）——后续

- 数据源展示（快照）+ 字段策略矩阵 + 审批队列（含 §0.4 的 unified override review）。

## 15. API 复查与数据来源分工定稿——后续

- 逐源核对字段，更新 data-sources.md / CONTEXT.md（含 §0.2 官方本地化来源变更）。

---

## 实现顺序

**Phase 1 — 数据层**（task 1-6）：schema + model + 迁移 + 协作表 ✅
**Phase 2 — 数据源**（task 7-9）：各源导入任务（含 Gatherer 爬虫）✅
**Phase 3 — 修订**（2026-09-03）：删除整卡正文列（commit `4f606d1`）+ unified 加 `source` 列
**Phase 4 — 投影**（task 11-12）：纯函数 + 单卡夹具 + 装配 + `magic_project` 任务
**Phase 5 — 协作机制**（task 13）：field_commits / field_winners / 审批
**Phase 6 — 控制台与定稿**（task 14-15）：UI + 分工定稿
