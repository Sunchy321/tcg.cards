# 游戏变更历史功能设计文档

## 1. 概述

为炉石传说（后续扩展至万智牌等）设计一套游戏变更历史系统，支持以公告、赛制、卡牌三个维度展示官方游戏版本更新中的有意义变更。

设计目标：
- 支持卡牌合法性变更、数值属性变更、系列变更、规则变更、赛制生命周期等多种变更类型
- 公告作为变更的顶层容器，一个公告对应一次官方发布
- 管理员手动录入为主，未来支持 AI 辅助解析官方公告文本
- 前端至少支持公告列表、赛制时间线、卡牌详情历史三个维度

## 2. 核心概念

### 2.1 变更类型 (type)

| type | 粒度 | 含义 | 示例 |
|------|------|------|------|
| `card_change` | card 级 | 卡牌合法性状态迁移 | 禁卡、解禁、核心系列轮换、酒馆战棋轮换 |
| `card_update` | card 级 | 卡牌数值/属性/文本变更 | buff、nerf、rework、text fix 等 |
| `set_change` | set 级 | 系列级别事件 | 迷你系列发售、系列退环境 |
| `rule_change` | — | 重大规则变更 | 酒馆战棋赛季机制更新 |
| `format_birth` | — | 赛制上线 | 新赛制正式启用 |
| `format_death` | — | 赛制下架/停止维护 | 经典模式下线 |

### 2.2 delta 与 glow

- **delta**: `Partial<RenderModel>`，卡牌数值变化后的新值。用于合成变更后的卡牌渲染模型
- **glow**: `{ part: string, type: "buff" | "nerf" | "rework" | "neutral" }[]`，卡牌展示时的部位级光效标记；分别表示增强、削弱、功能重做和不影响玩法的中性修改

### 2.3 status

`status` 为 `text` 类型，跨 type 共享值集，各 type 取子集使用：

**card_update**

| 值 | 含义 | 备注 |
|------|------|------|
| `buff` | 增强 | 不触发全额分解 |
| `nerf` | 削弱 | 触发全额分解 |
| `tweak` | 小更新 | 增强或削弱，范围小，不触发全额分解 |
| `revert` | 退环境回调 | 仅用于退环境时回调之前的改动。不完全回调通过 delta 的值区分 |
| `rework` | 重做 | 机制改变、参数替换、种族/类型变更等 |
| `text_fix` | 文本修复 | 错误的文本被修正 |
| `text_adjust` | 文本调整 | 有意的文本修改 |
| `bugged` | 数据异常 | 卡牌数据被错误修改（bug 出现） |
| `bugfix` | Bug 修复 | 修复之前的数据 bug |

**card_change / set_change / rule_change**（legality 值）

| 值 | 含义 |
|------|------|
| `banned` | 完全禁用 |
| `banned_in_card_pool` | 卡池禁用 |
| `banned_in_deck` | 卡组构建禁用 |
| `legal` | 完全合法可用。覆盖 `minor` |
| `unavailable` | 不可用（卡牌退环境、系列轮替、规则停用） |
| `minor` | 不完全可用：衍生出现，或可用但获取渠道受限 |
| `score` | 计分相关（Canadian Highlander 等） |

**set_change 专用**

| 值 | 含义 |
|------|------|
| `extend` | 系列内容扩展（如迷你系列发售） |

**format_birth / format_death** — 不使用 status。

### 2.4 format 与投影

源表 `format` 存储 **keyword**（`text`，nullable）：
- `null` — 所有赛制
- `"standard"` — 仅标准
- `"wild"` — 仅狂野
- `"constructed"` — 标准 + 狂野（keyword 展开）
- 其他自定义 keyword

keyword 到赛制列表的映射在应用层维护。管理员录入后执行**投影步骤**，将 keyword 展开并填充到 `formats[]` 数组列。

### 2.5 版本覆盖

两层版本控制，item 级可覆盖 announcement 默认值：

| 层级 | 字段 | 说明 |
|------|------|------|
| announcement | `version`, `lastVersion` | 公告默认值 |
| announcement_item | `version`, `lastVersion` | 可覆盖，用于热修等场景 |

渲染时使用的版本：`item.version ?? announcement.version`。

### 2.6 实体引用

- `cardId`: 直接等于卡牌表主键
- `setId`: 直接等于系列表主键
- `ruleId`: 自由文本。不带前缀 = 纯规则标识；带前缀（如 `set:core`, `bg-mechanics:anomaly`）= 指向特定系统的实体
- `relatedCards`: cardId 数组，用于非收藏卡牌变更指向真正受影响的可收藏卡牌

## 3. 存储架构

只建两张表。

### 3.1 `announcements` — 公告元信息

```typescript
interface Announcement {
  id: string;                                    // UUID PK
  source: string;                                // 来源，如 "blizzard"
  date: string;                                  // 发布日期
  name: string;                                  // 公告标题（单一主语言，不做 fallback）
  version: number;                               // 默认当前版本
  lastVersion: number;                           // 默认对比版本
  effectiveDate: string | null;                  // 默认生效日期
  link: { url: string; label?: string }[];       // 来源链接（label 自动识别 + 管理员可覆盖）
  createdAt: string;
  updatedAt: string;
}
```

### 3.2 `{game}.announcement_items` — 变更记录

```typescript
interface AnnouncementItem {
  id: string;                                    // UUID PK
  type: GameChangeType;                          // card_change | card_update | set_change | rule_change | format_birth | format_death
  announcementId: string;                        // FK → announcements.id

  // 通用列
  source: string;                                // 来源（冗余自 announcement，方便查询）
  date: string;                                  // 变更日期（冗余自 announcement）
  effectiveDate: string | null;                  // 生效日期，item 级可覆盖
  name: string;                                  // 变更名称/标题
  format: string | null;                         // 赛制 keyword（管理员录入）
  status: string | null;                         // legality 或方向值
  score: number | null;                          // 赛制合法性计分
  group: string | null;                          // 前端展示分组键

  // 版本覆盖（item 级可覆盖 announcement 默认值）
  version: number | null;
  lastVersion: number | null;

  // 关联
  patchId: number | null;                        // FK → patches.build_number

  // 扩展
  delta: Partial<RenderModel> | null;
  glow: { part: string; type: "buff" | "nerf" | "rework" | "neutral" }[] | null;

  // 实体引用
  cardId: string | null;                         // 卡牌表主键
  setId: string | null;                          // 系列表主键
  ruleId: string | null;                         // 自由文本，可选前缀指向实体
  relatedCards: string[];                        // 间接受影响的卡牌

  // 投影列（管理员录入后由投影步骤填充）
  formats: string[];                             // keyword 展开后的单赛制列表
  cardIds: string[];                             // cardId + relatedCards 全部展开

  createdAt: string;
  updatedAt: string;
}

type GameChangeType =
  | "card_change"
  | "card_update"
  | "set_change"
  | "rule_change"
  | "format_birth"
  | "format_death";
```

### 3.3 投影

投影步骤填充两个数组列：

1. **format → formats[]**：将 keyword 展开为单赛制数组。`"constructed"` → `["standard", "wild"]`，`null` → `[]`
2. **cardId + relatedCards → cardIds[]**：合并去重，`[cardId, ...relatedCards]`

投影操作独立于录入，管理员先录入再触发。

### 3.4 关系

```
announcements     1 ──── n announcement_items
patches           1 ──── n announcement_items (可选)
```

## 4. 前端查询维度

### 4.1 公告列表

- 按时间倒序展示公告卡片
- 每条显示：标题、日期、来源、变更摘要（按 type 自动聚合数量）、外部链接
- 链接按 label 分组展示，支持多语言/多来源

### 4.2 赛制时间线

- 选择赛制后按时间线展示该赛制下所有历史变更
- 查询：`WHERE 'standard' = ANY(formats)`

### 4.3 卡牌详情历史

- 卡牌详情页嵌入该卡的所有历史变更（含相关卡牌推导）
- 查询：`WHERE 'AT_001' = ANY(cardIds)`

## 5. 图片渲染

### 5.1 无 delta/glow

使用版本的卡牌渲染数据，直接用已有的 renderHash 请求渲染。

### 5.2 有 delta

1. 取 `lastVersion`（或 announcement.lastVersion）的 base RenderModel
2. 将 delta（Partial\<RenderModel\>）合并到 base 上
3. 计算新 hash
4. 请求 base 渲染

### 5.3 有 glow

同上流程，但 variant.category = `"glow"`，渲染带光效的图片。

### 5.4 渲染版本选择

```
effectiveVersion = item.version ?? announcement.version
effectivePrevVersion = item.lastVersion ?? announcement.lastVersion
```

## 6. 数据录入

### 6.1 手动录入

管理员在后台逐条创建：公告 → 公告下添加 announcement_item → 选择类型、填充字段 → 触发投影。

### 6.2 AI 辅助识别（未来）

管理员粘贴 Blizzard 公告链接 → AI 解析出变更列表 → 管理员审核确认 → 生成记录。

## 7. 设计决策摘要

1. **两张表**：`announcements` + `{game}.announcement_items`，type 区分变更类型
2. **细粒度 card 级存储**，前端合并展示（如迷你系列 35 张新卡 = 35 条记录，公告列表合并显示）
3. **format 使用 keyword**，投影步骤填充 `formats[]` 和 `cardIds[]` 数组列
4. **数组查询**：`WHERE 'standard' = ANY(formats)` / `WHERE 'AT_001' = ANY(cardIds)`
5. **两层 version 覆盖**，announcement 默认值 + item 级覆盖
6. **status 使用 text**，跨 type 共享值集，DB 层无 enum 约束
7. **delta 为 Partial\<RenderModel\>**，渲染时与 base 合并
8. **glow 已由 renderer 协议支持**（variant.category = "glow"）
9. **link 使用 label 标识**，支持多来源链接（语言、委员会等）
10. **投影独立操作**，管理员录入后触发，不自动执行
