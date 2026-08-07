# 公告投影、发布与站点卡图展示 设计

## 背景

炉石公告系统（`announcement_items`）本应有"投影"步骤：把条目的作者字段推导成站点可查询的展示数据。现状：

- `resolved_formats` / `resolved_cards` 两列投影结果几乎没被真正填充（投影步骤只做 cardId+relatedCards 合并，且要手动触发）。
- 站点（公告详情页、时间线、卡牌历史）只有纯文本展示，无卡图。
- 公告数据没有发布到站点库的通道。

设计目标：

1. **投影落地**：条目投影结果写入 jsonb `projection` 列，支持 set→cards 展开。
2. **发布**：新增轻量全量同步任务，把本地公告表镜像到 remote 库。
3. **展示**：站点公告详情页、时间线、卡牌历史展示卡图。

## 已定决策（讨论共识）

1. **压缩方向**：单表 + 投影列，不恢复"展示条目"独立表。
2. **投影结果用 jsonb 单列 `projection`**，形状开放，避免未来形态变化时的迁移。
3. **状态统一**：条目 `status` 作用于所有 fan-out 卡，不逐卡存状态；单条目内状态必然一致，不一致就拆成多条。
4. **set→cards 展开是投影的一部分**：`set_change` 条目投影时展开其系列下所有卡。
5. **`format_birth` / `format_death` 不产生卡 fan-out**；`rule_change` 视规则能否指到卡属性（本期暂缓）。

## 数据模型

### `announcement_items.projection`（jsonb）

当前最小形状：

```json
{ "formats": ["standard"], "cards": ["AT_001", "AT_002", ...] }
```

- `formats`：format keyword 展开后的单赛制数组（`constructed` → `["standard","wild"]`）。
- `cards`：平铺受影响卡 ID 数组（`cardId ∪ relatedCards ∪ set→cards`）。

形状开放，未来扩展（per-card 状态、排除列表等）直接加 key，不改表。

### 弃用 resolved_* 列

`resolved_formats` / `resolved_cards` 两列弃用，站点查询改走 `projection`。因投影几乎未真正落地、无存量数据，迁移可直接删列。

### 边界

作者字段（type/status/cardId/setId/ruleId/format/group/version/lastVersion/delta/glow/relatedCards）保持强类型 + Zod 校验；只有派生的 `projection` 是 jsonb。

## 投影（公告页）

### 展开规则

| 条目类型 | formats | cards |
|---|---|---|
| card_change | 该条目 format 展开 | cardId ∪ relatedCards |
| card_update | 同上 | cardId ∪ relatedCards |
| set_change | 该条目 format 展开 | 系列下所有卡（`Entity.set = setId`） |
| rule_change | 同上 | 视规则（暂缓） |
| format_birth / format_death | 同上 | 无 |

format keyword 映射保持在应用层（`standard` / `wild` / `constructed`→`[standard, wild]` / `twist` / `mercenaries` / 自定义 keyword 原样）。

### 运行位置

公告编辑器页"投影"按钮 → `projectItems` ORPC（service-desktop-runtime），读本地库卡数据（`Entity.set`）做 set→cards 展开，写回 `projection`。

### 信任约定

发布信任本地已投影结果：先投影、后发布。投影依赖本地卡数据已导入（某个系列没导入卡，展开为空，需重投影）。

## 发布（publish）

### 语义

全量镜像：把本地 `announcements` + `announcement_items`（含 `projection`）镜像到 remote 库，远端多出的行删除。与卡牌发布同目标库、同触发页面。

### 实现方式

新增 task 定义（`hearthstone_announcement_publish`），复用现有 task 系统（`createDefinition` / stage / scope），内部为轻量同步：

- 读本地公告两张表全量。
- upsert 到 remote；删除远端不存在于本地的行。
- 不复用 PublishBatch / 基线 / lease / manifest 重型机制（公告表小，全量同步便宜且一致）。

## 站点查询与渲染 hash

### 查询改写

- 时间线：`WHERE projection->'formats' @> '["<format>"]'`。
- 卡牌历史：`WHERE projection->'cards' @> '["<cardId>"]'`。
- 公告条目数据量小，顺序扫描足够，不为 projection 建索引。

### renderHash 派生（站点现场算）

共享工具（canonicalize + sortGlow + SHA256）抽到共享层，编辑器和站点同一份：

- prev / base（无 glow）：hash = `entity_localizations.renderHash`（与已有卡图去重）。
- curr（有 glow）：hash = `SHA256(canonicalize(renderModel + delta.curr + sortedGlow))`，renderModel 取站点 `entity_localizations.renderModel`。

站点 ORPC（get / timeline / cardHistory）按 lang 批量查 `entity_localizations`，为每条卡条目派生各侧 hash。

## 站点展示

### 展示面

- 公告详情页 + 赛制时间线：带卡图。
- 卡牌详情页历史区：放得下也带。

### 条目渲染

| 条目类型 | 渲染 |
|---|---|
| card_update | prev/curr 并排（curr 带 glow），按卡对比 |
| card_change | base 单图 + status 徽标 + group 折叠（core_rotation / bg_rotation） |
| set_change / rule_change / format_* | 纯文本行 |

### relatedCards 归组展示

共享同一关联卡 X 的条目归为一组：X 显示在前面（没变 = 标准单图；变了 = 它自己的前后对比），各主卡 A/B/C 作为各自的内部前后对比展示。

**对比粒度按卡**：每张变更卡内部 before/after 相邻（`[X] [A0→A1] [B0→B1]`），未变的卡单图；不做整体（`[X A0] → [X A1]`）对比。

### 其他

- delta 原始 JSON 不再展示（图就是 diff）。
- 站点图语言跟随用户 `locale` 配置。

## 涉及改动

- **数据**：`packages/db`（announcement 表加 `projection`，删 resolved_*）、`packages/model`（announcement 模型加 `projection`）。
- **共享 hash 工具**：新建 `@tcg-cards/shared`（公共函数包，computeRenderHash/sortGlow/toIdentifier）；原 `@tcg-cards/shared` 改名 `@tcg-cards/base`（GAMES 等基础数据）。
- **投影**：`service-desktop-runtime` `projectItems` 扩展 set→cards 展开、写 `projection`。
- **发布**：新增 `hearthstone_announcement_publish` task，与卡牌发布共用触发页面。
- **站点**：`site-hearthstone` ORPC 查询改写 + hash 派生；`announcement/[id].vue`、`timeline/[format].vue`、`card/[id].vue` 展示改造。

## 开放问题 / 后续

- `rule_change` 的展开规则（能否指到卡属性时展开）。
- `extend`（发售）在卡牌页的显示映射。
- 站点多语言：图跟随用户 locale，是否需语言切换。
