# 炉石传说高级搜索交互重构

## 概述

重新设计炉石传说高级搜索交互方式：删除独立的 `/search/advanced` 页面，将高级搜索面板嵌入到搜索结果页 `/search` 的 USlideover 中。桌面端从上方滑入，移动端从底部滑入。

## 动机

当前高级搜索需要跳转到独立页面，打断了"搜索 → 调条件 → 看结果"的完整流程。用户需要在两个页面之间来回切换，体验割裂。

## 方案

### 页面变更

- **删除** `apps/site-hearthstone/app/pages/search/advanced.vue`
- **改造** `apps/site-hearthstone/app/pages/search/index.vue`

### 交互流程

```
用户访问 /search
    │
    ├─ 普通搜索：输入 DSL → Enter → 显示结果
    │
    └─ 点击"高级搜索"按钮
         │
         ▼
    USlideover 打开（桌面从上方滑入 / 移动端从底部滑入）
         │
         ├─ DSL 从当前 `?q=` 解析回填到筛选器状态
         │
         ├─ 用户调整筛选器 → 实时同步到输入框 DSL
         │
         ├─ 点击"搜索" → Slideover 关闭 → 导航到 /search?q=<dsl> → 显示新结果
         │
         └─ 点击关闭 / 点击遮罩 → Slideover 关闭，不回滚
```

### 关键行为

| 行为 | 规则 |
|------|------|
| 打开时状态初始化 | 从当前 URL `?q=` 使用 `#search/parser` 解析反填 |
| 筛选器调整 | 实时同步 DSL 到顶部搜索输入框，但不触发搜索 |
| 提交搜索 | 点击 Slideover 内的"搜索"按钮，导航到新 URL |
| 取消关闭 | Slideover 直接关闭，输入框保留已有 DSL |
| 结果与筛选器 | 不同时显示，筛选器在 Slideover 中 |

### USlideover 布局

```
┌──────────────────────────────────────┐
│ USlideover (桌面: side="top" + inset) │
│  USlideover (移动端: side="bottom")   │
│                                      │
│  ┌─ Header ───────────────────────┐  │
│  │  DSL 预览（只读）    [关闭]      │  │
│  └─────────────────────────────────┘  │
│                                      │
│  ┌─ Body（可滚动）─────────────────┐  │
│  │  关键词输入                     │  │
│  │  费用 chip + 数值输入           │  │
│  │  职业 chip                      │  │
│  │  类型 chip                      │  │
│  │  种族 chip                      │  │
│  │  阵营 chip                      │  │
│  │  法术派系 chip                  │  │
│  │  稀有度 chip                    │  │
│  │  攻击力 chip + 数值输入          │  │
│  │  生命值 chip + 数值输入          │  │
│  │  赛制下拉框                     │  │
│  └─────────────────────────────────┘  │
│                                      │
│  ┌─ Footer ───────────────────────┐  │
│  │  [浏览系列]        [搜索]       │  │
│  └─────────────────────────────────┘  │
└──────────────────────────────────────┘
```

### 移动端适配

- 使用 `window.matchMedia('(max-width: 768px)')` 判断屏幕尺寸
- 桌面端：`side="top" inset` → 从顶部滑入带边距的面板
- 移动端：`side="bottom" inset` → 从底部滑入带圆角的 sheet

### DSL 反向解析

利用 `#search/parser` 包解析 DSL 文本，将表达式树映射到 `AdvancedSearchState`：

| DSL 命令 | 状态字段 | 处理方式 |
|----------|----------|----------|
| 裸文本 (raw) | `keyword` | 直接赋值 |
| `cost=N` / `cost>=N` | `costs[]` / `cost[N]` | 0-9 的精确值走 chip；带运算符走数值输入 |
| `class:X` | `classes[]` | 多值追加 |
| `type:X` | `types[]` | 多值追加 |
| `race:X` | `races[]` | 多值追加 |
| `faction:X` | `factions[]` | 多值追加 |
| `spell-school:X` | `spellSchools[]` | 多值追加 |
| `rarity:X` | `rarities[]` | 多值追加 |
| `attack=N` / `attack>=N` | `attacks[]` / `attack[N]` | 同上 |
| `health=N` / `health>=N` | `healths[]` / `health[N]` | 同上 |
| `format:X` | `format` | 直接赋值 |
| 不支持的命令 | 静默忽略 | 在 `cannotParse` 标记中记录 |

### 文件影响范围

| 操作 | 文件 |
|------|------|
| 修改 | `apps/site-hearthstone/app/composables/advanced-search.ts` |
| 修改 | `apps/site-hearthstone/app/pages/search/index.vue` |
| 删除 | `apps/site-hearthstone/app/pages/search/advanced.vue` |
| 删除 | `apps/site-hearthstone/app/components/search/FieldRow.vue` |

### 视觉规范

沿用旧 `advanced.vue` 已有的深色炉石风格样式，不做额外 UI 改动。包括：
- 深蓝渐变背景
- 半透明面板 + 发光蓝色边框
- Chip 按钮的选中/未选中状态
- 费用水晶按钮
- 职业颜色圆点
