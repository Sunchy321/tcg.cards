# 游戏变更历史功能 — 实现计划

## TODO

- [x] 1. 废弃旧表，创建新 schema
- [ ] 2. 生成数据库迁移（commit 前生成）
- [x] 3. 更新 Zod model 定义
- [ ] 4. 实现投影逻辑
- [x] 5. 迁移 console-api（announcement CRUD 适配新表）
- [x] 6. 实现 site-hearthstone ORPC API
- [x] 7. 实现公告列表页
- [x] 8. 实现赛制时间线页
- [x] 9. 卡牌详情页嵌入变更历史
- [ ] 10. 实现图片渲染逻辑（delta/glow 合成）
- [ ] 11. 管理后台：公告 + items CRUD 页面
- [ ] 12. 管理后台：delta/glow 卡图预览面板
- [ ] 13. AI 辅助识别功能

---

## 1. 废弃旧表，创建新 schema

### 1.1 需删除的旧表（hearthstone schema）

- `card_changes`
- `set_changes`
- `format_changes`
- `announcement_items`
- `announcement_view`（view，依赖上面几张表）

### 1.2 需修改的表

- `announcements`：移除旧字段，对齐新结构
  - 新增：`version`(integer), `prevVersion`(integer), `link`(jsonb)
  - 移除：`effectiveDate`, `lastVersion`（下沉到 items）
  - 保留：`id`, `source`, `date`, `name`

### 1.3 新建表 `{game}.announcement_items`

在当前 `hearthstone` shared schema 下创建，后续 magic 同理。

主要列：
- `id` uuid PK
- `type` text (card_change | card_update | set_change | rule_change | format_birth | format_death)
- `announcement_id` uuid FK → announcements
- `source`, `date`, `name` text
- `effective_date` text nullable
- `format` text nullable（keyword）
- `status` text nullable
- `score` integer nullable
- `group` text nullable
- `version`, `last_version` integer nullable
- `patch_id` integer nullable FK → patches
- `delta` jsonb nullable
- `glow` jsonb nullable
- `card_id` text nullable
- `set_id` text nullable
- `rule_id` text nullable
- `related_cards` text[] default '{}'
- `formats` text[] default '{}'
- `card_ids` text[] default '{}'
- `created_at`, `updated_at` timestamptz

需要 GIN index 在 `formats` 和 `card_ids` 上：
```sql
CREATE INDEX idx_announcement_items_formats ON announcement_items USING GIN (formats);
CREATE INDEX idx_announcement_items_card_ids ON announcement_items USING GIN (card_ids);
```

### 1.4 需删除的数据库枚举（hearthstone schema）

- `game_change_type`
- `legality`
- `status`

这些改为 text 列，枚举约束由 Zod 层提供。

## 2. 生成数据库迁移

- 使用 `drizzle-kit generate` 生成迁移 SQL
- 确认 migration 包含：drop 旧表、drop 旧 enum、alter announcements、create announcement_items + indexes
- 手动补充：如有现网数据需要迁移，编写数据迁移脚本

## 3. 更新 Zod model 定义

位置：`packages/model/src/hearthstone/schema/`

- 新增 `announcement-item.ts`：`AnnouncementItem` schema（含 type、status、delta、glow 的 discriminated union）
- 修改 `announcement.ts`：更新 `Announcement` schema
- 删除或标记废弃 `game-change.ts` 中的旧 schema
- 更新 model 导出 index

### 3.1 type 和 status 枚举

```typescript
export const gameChangeType = z.enum([
  'card_change', 'card_update', 'set_change',
  'rule_change', 'format_birth', 'format_death',
]);

export const changeStatus = z.enum([
  // card_update
  'buff', 'nerf', 'tweak', 'revert', 'rework',
  'text_fix', 'text_adjust', 'bugged', 'bugfix',
  // card_change / set_change / rule_change
  'banned', 'banned_in_card_pool', 'banned_in_deck',
  'legal', 'unavailable', 'minor', 'score',
  // set_change 专用
  'extend',
]);
```

## 4. 实现投影逻辑

位置：`apps/service-desktop-runtime/src/lib/hearthstone/` 或 console-api 中

投影函数：
```typescript
function projectFormats(format: string | null): string[] {
  // keyword → format[]
  // null → []
  // "constructed" → ["standard", "wild"]
  // 单值直接返回 ["standard"]
}

function projectCardIds(cardId: string | null, relatedCards: string[]): string[] {
  // 合并去重
  return [...new Set([cardId, ...relatedCards].filter(Boolean))];
}
```

投影触发方式：管理员在后台点击"投影"按钮，或录入完成后自动调用。

## 5. 迁移 console-api

位置：`packages/console-api/src/orpc/hearthstone/announcement.ts`

- 重写 `list`：返回 `announcements` 列表
- 重写 `get`：返回 announcement + items
- 重写 `create`：创建 announcement + 批量创建 items
- 重写 `update`：更新 announcement + 同步更新 items
- 重写 `remove`：级联删除 items
- 新增 `project`：触发指定 announcement 的投影

## 6. 实现 site-hearthstone ORPC API

位置：`apps/site-hearthstone/server/orpc/hearthstone/`

- 新增 `announcement.ts`（或扩展现有）：
  - `list`：公告分页列表（含聚合摘要）
  - `get`：公告详情 + items
  - `timeline`：按赛制查询 items（`WHERE 'standard' = ANY(formats)`）
  - `cardHistory`：按卡牌查询 items（`WHERE 'AT_001' = ANY(card_ids)`）

## 7. 实现公告列表页

位置：`apps/site-hearthstone/app/pages/`

- 新页面：`announcements/index.vue`（或 `updates/index.vue`）
- 公告卡片组件：标题、日期、来源、变更摘要（type 聚合数量）、外部链接
- 链接按 label 分组渲染
- 分页加载

## 8. 实现赛制时间线页

位置：`apps/site-hearthstone/app/pages/`

- 新页面：`timeline/[format].vue` 或作为 announcements 的子视图
- 赛制选择器
- 时间线组件：按日期分组展示变更

## 9. 卡牌详情页嵌入变更历史

位置：`apps/site-hearthstone/app/pages/card/[id].vue`

- 在现有版本历史旁边新增"变更历史"板块
- 查询 `WHERE 'AT_001' = ANY(card_ids)` 获取该卡的所有变更
- 每条展示：公告名称、变更类型标签、status、delta 摘要

## 10. 实现图片渲染逻辑

### 10.1 无 delta/glow
直接使用卡牌版本的 renderHash 请求渲染，无需改动。

### 10.2 有 delta
1. 从数据库获取 `prevVersion` 对应版本的 RenderModel
2. 将 delta 做 shallow merge 到 RenderModel 上
3. 计算 merge 后的 renderHash
4. 请求渲染

实现位置：在 card API 的 image 生成逻辑或独立函数中。

### 10.3 有 glow
同 10.2 流程，但 `variant.category = "glow"`。

## 11. 管理后台：公告 + items CRUD 页面

位置：`app-console-desktop` 或 `site-console`

- 公告列表 + 新建/编辑/删除
- 公告详情页内含 items 列表（可拖拽排序）
- item 编辑表单：根据 type 动态切换字段
- 投影按钮
- link 输入：URL + label 自动识别
- **delta/glow 卡图预览面板**：编辑 item 时内嵌预览，实时显示变更后的卡图渲染效果

## 12. 管理后台：delta/glow 卡图预览面板

在 item 编辑表单中嵌入预览面板。

### 流程

1. 管理员编辑 item，填写 delta（如攻击力 3→4）和 glow（如 attack: buff）
2. 预览面板从 `prevVersion` 获取 base RenderModel
3. 将 delta merge 到 RenderModel，计算 hash
4. 调用渲染服务，展示变更后的卡图
5. 有 glow 时同时展示 glow 版本卡图

### 技术要点

- 预览面板需要访问渲染服务（本地 renderer 或远程）
- merge 逻辑与 task 10 的渲染合成逻辑共用
- 支持实时更新：编辑 delta/glow 后自动刷新预览

## 13. AI 辅助识别

管理员粘贴官方公告链接 → AI 解析 → 生成 item 列表 → 人工审核确认。

### 13.1 输入

- Blizzard 公告 URL
- 或粘贴的公告纯文本

### 13.2 输出

结构化变更列表，每条包含：
- type（card_change / card_update / set_change 等）
- cardId / setId / ruleId（从文本中识别的实体引用）
- status（buff / nerf / banned 等）
- delta（从文本中提取的数值变化）
- relatedCards（如文本提到"also affects X"）

### 13.3 流程

1. 管理员在创建公告页面粘贴 URL 或文本
2. 点击"AI 解析"
3. 系统调用 AI 接口（服务端 LLM）
4. 返回预填充的 items 列表
5. 管理员逐条审核：确认、修改、删除、补充
6. 确认后批量创建 items

### 13.4 Prompt 设计要点

- 提供 hearthstone 卡牌名称→cardId 的映射上下文
- 提供 status 枚举值列表
- 要求 AI 输出结构化 JSON
- 对低置信度字段标记 `needs_review`

---

## 实现顺序

**Phase 1 — 数据层**（task 1-3）：schema + migration + model
**Phase 2 — 服务层**（task 4-6）：投影 + console API + site API
**Phase 3 — 前端展示**（task 7-9）：公告列表 → 赛制时间线 → 卡牌详情
**Phase 4 — 渲染**（task 10）：delta/glow 图片合成
**Phase 5 — 管理后台**（task 11-12）：CRUD 页面 + 预览面板
**Phase 6 — AI 识别**（task 13）：辅助识别功能
