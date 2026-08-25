# 万智牌卡牌导入与投影 — 实现计划

## TODO

- [x] 1. Schema：事实表主键加入 version/source
- [x] 2. Schema：新增 slug 标注表（magic_data）
- [x] 3. Schema：扩充 magic_data.scryfall 导入表 + 事实表新列
- [x] 4. 更新 Zod model 定义
- [x] 5. 生成数据库迁移（commit 前生成，合并为一次）
- [ ] 6. Schema：新建协作/同步表（替换旧 import_*）
- [ ] 7. 数据源接入：Scryfall 导入任务
- [ ] 8. 数据源接入：MTGCH / MTGJSON 导入任务
- [ ] 9. 数据源接入：Gatherer 爬虫导入任务
- [ ] 10. 匹配与 cardId 分配（含冲突预识别）
- [ ] 11. 投影纯函数 + 单卡测试（base）
- [ ] 12. 投影任务接入任务系统（match → 装配 → project → base/overlay 应用）
- [ ] 13. 协作机制落地（field_commits / field_winners / 审批）
- [ ] 14. 控制台 UI（data-source 页 + 审批）
- [ ] 15. API 复查与数据来源分工定稿

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
- `magic_data.card_unified_localizations`（unified）。
- 事实表新列：`tcgplayerEtchedId`/`imageUpdatedAt`（prints）、`mcmIdExtras`（sets）、`flavorText`（card_localizations）；`cards.resourceId` 移除。

## 4. 更新 Zod model 定义 ✅

各源 model（scryfall / gatherer / mtgch / mtgjson / unified）、事实表 model 同步。

## 5. 生成数据库迁移 ✅

commit `ed474d2` 已含 local + remote 迁移。

## 6. Schema：新建协作/同步表（替换旧 import_*）

位置：`packages/db/src/schema/`

- `magic_data`：`field_winners` / `field_commits` / `field_sync_cursors` / `field_conflicts` / `base_change_review` / `source_versions` / `raw_entity_snapshots`
- `magic_app`：`import_review_actions`
- remote：`PublishStreamRegistration` / `PublishLedger`
- 配置（per-game）：`source_catalog` / `field_policies` / `rule_sets`
- **移除**旧 `import_sources` / `import_rule_sets` / `import_field_rules` / `import_policy_snapshots` / `import_runs` / `import_raw_records` / `import_change_sets` / `import_field_changes` / `import_apply_logs`
- 参照 `docs/multi-user-data-import.md` §14 与 `shared/hearthstone/field-sync.ts`（field_winners/field_commits/field_conflicts 结构）。

## 7. 数据源接入：Scryfall 导入任务

位置：`apps/service-desktop-runtime/src/lib/magic/`

- `magic_scryfall_import`：下载 bulk（oracle_cards / default_cards / sets / rulings）→ 缓存到 `magic_data.scryfall_*`。

## 8. 数据源接入：MTGCH / MTGJSON 导入任务

- `magic_mtgch_import`：读本地导出 JSONL → `magic_data.mtgch_zhs_*`。
- `magic_mtgjson_import`：下载 set 文件 → `magic_data.mtgjson_sets`。

## 9. 数据源接入：Gatherer 爬虫导入任务

- `magic_gatherer_import`：从 Scryfall prints 收集 multiverseId，数字升序爬。
- 每 multiverseId：`gatherer` 有行则跳过；否则 `Details.aspx?multiverseid=N`（308 → 新页）→ 提取 flight CardData → 缓存（含 404 = null）。
- 状态 = `gatherer` 表本身，可断点续爬。

## 10. 匹配与 cardId 分配（含冲突预识别）

- 批次内 `slug → oracle_ids`；冲突组 → 审核（`card_slug_annotations`）→ 合并或拆卡（语义化 slug）。
- match 是投影任务的前置步骤。

## 11. 投影纯函数 + 单卡测试（base）

位置：`apps/service-desktop-runtime/src/lib/magic/project/`

- `projectCard(assembledCard, ...) → ProjectCardResult`：输入按 oracle_id 聚合的卡数据，输出全部事实表行（含 unified）。
- 单卡测试夹具（bun:test，无数据库）。

## 12. 投影任务接入任务系统

- `magic_project`：match → 按卡装配 → project（base）→ 写事实表（尊重 `field_winners`，manual-winner 不覆盖）。

## 13. 协作机制落地（field_commits / field_winners / 审批）

- base 换代 / 手动 overlay 的写入与 winner 维护。
- 冲突 / A、B 类提醒（base_change_review）。
- 审批（import_review_actions）与字段策略（field_policies）执行。

## 14. 控制台 UI（data-source 页 + 审批）

- 数据源展示（快照）+ 字段策略矩阵 + 审批队列。

## 15. API 复查与数据来源分工定稿

- 逐源核对字段，更新 data-sources.md / CONTEXT.md。

---

## 实现顺序

**Phase 1 — 数据层**（task 1-6）：schema + model + 迁移 + 协作表
**Phase 2 — 数据源**（task 7-9）：各源导入任务（含 Gatherer 爬虫）
**Phase 3 — 匹配与投影**（task 10-12）：cardId 分配 + 投影纯函数 + 投影任务
**Phase 4 — 协作机制**（task 13）：field_commits / field_winners / 审批
**Phase 5 — 控制台与定稿**（task 14-15）：UI + 分工定稿
