# 实施计划

## Todo List

- [x] 1. 共享 hash 工具：新建 `@tcg-cards/shared`（函数包）放 computeRenderHash/sortGlow/toIdentifier；原 `@tcg-cards/shared` 改名 `@tcg-cards/base`（GAMES）
- [x] 2. 数据模型：`announcement_items` 加 `projection` jsonb 列，弃用 resolved_formats/resolved_cards
- [ ] 3. 生成数据库迁移
- [x] 4. 投影：扩展 `projectItems`，set→cards 展开 + format 展开，写 `projection`
- [x] 5. 发布 task：新增 `hearthstone_announcement_publish`（轻量全量镜像）
- [x] 6. 发布触发：与卡牌发布共用页面（发布类型 `announcement_data` 分支到 announcementPublish task）
- [x] 7. 站点查询改写：timeline/cardHistory 用 jsonb 包含 `@>`（数据量小，不建索引）
- [x] 8. 站点 hash 派生：ORPC 按 lang 批量派生各侧 renderHash（announcement-image.ts）
- [x] 9. 站点展示：公告详情页卡图（card_update/card_change/group 折叠/relatedCards 标签；反置归组布局待细化）
- [x] 10. 站点展示：时间线卡图
- [x] 11. 站点展示：卡牌详情页历史区带图
- [ ] 12. 端到端验证：投影 → 发布 → 站点看到卡图

## 详细步骤

### 1. 共享 hash 工具

- 将 `canonicalize` + SHA256 的 `buildRenderHash` 与 `sortGlow` 从 `service-desktop-runtime` 抽到共享层（`packages/shared`）。
- 统一导出：`computeRenderHash(renderModel)`、`sortGlow(glow)`。
- 编辑器 `render.ts` 与站点 ORPC 都引用这份实现，保证推导一致。

### 2. 数据模型

- `packages/db`：`announcement_items` 加 `projection` jsonb 列；删除 `resolved_formats` / `resolved_cards` 两列及其 GIN 索引。
- `packages/model`：`announcementItem` 加 `projection`，移除 resolved 两字段。

### 3. 数据库迁移

- 改 schema 后，在提交时用 `drizzle-kit generate` 生成迁移（含新增列、删列、索引）。

### 4. 投影

- `projectItems`（service-desktop-runtime ORPC）改为写 `projection`：
  - format keyword → `formats`（复用 FORMAT_KEYWORD_MAP）。
  - `cardId ∪ relatedCards` → `cards`。
  - `set_change`：查 `Entity` 中 `set = setId` 的卡 ID，并入 `cards`。
- 保存（create/update）后仍不自动投影，保持"先投影后发布"约定。

### 5. 发布 task

- 新增 `hearthstone_announcement_publish` task 定义（createDefinition）。
- 内部：读本地 `announcements` + `announcement_items` 全量 → upsert 到 remote → 删除远端多出行。
- 不复用 PublishBatch / 基线 / lease 机制。

### 6. 发布触发

- 与卡牌发布共用触发页面，同一发布目标（publishTarget/environment）。

### 7. 站点查询改写

- `timeline`：`projection->'formats' @> '["<format>"]'`。
- `cardHistory`：`projection->'cards' @> '["<cardId>"]'`。
- 建表达式 GIN 索引：`GIN ((projection->'formats'))`、`GIN ((projection->'cards'))`。

### 8. 站点 hash 派生

- get / timeline / cardHistory ORPC 增加 lang 参数。
- 批量查 `entity_localizations`（renderModel / renderHash），按条目 side 派生：
  - prev / base：`entity_localizations.renderHash`。
  - curr：共享工具算 `computeRenderHash(model + delta.curr + glow)`。
- 响应中为每条卡条目附上各侧 hash + category。

### 9. 公告详情页展示

- 条目卡图：card_update prev/curr 并排、card_change base 单图、group 折叠。
- relatedCards 归组：共享关联卡 X 前置，主卡 A/B/C 各自内部前后对比。
- 去掉 delta 原始 JSON。
- 语言跟随用户 locale。

### 10. 时间线展示

- 复用详情页的条目渲染规则，紧凑化。

### 11. 卡牌详情页历史区

- 放得下时带图：该卡的 card_change / card_update 条目显示其图；set_change / rule_change 保持文本。

### 12. 端到端验证

- 编辑器：建公告 → 投影 → 发布；站点：详情页 / 时间线 / 卡牌历史看到卡图。
