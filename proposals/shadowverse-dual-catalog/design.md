# 影之诗双卡查库（Beyond / Evolve）路由与筛选框架设计

## 状态

提案待评审。

## 背景

`site-shadowverse` 当前是一个「单库 + 全局模式切换」结构：路由单一（`/search`、`/packs` 等），模式只切换文案与主题，卡查数据仍是 Evolve 一库。

用户明确要求：Beyond（线上版）与 Evolve（实体版）本质是两个独立的卡查库合并进一个站点展示，类似于游戏王的 RD / OCG 分开呈现。两者的扩展包列表、高级搜索筛选、卡牌数据都应各自独立，不是同一套内容换文案。

已确认方向：

- 路由带模式前缀，如 `/beyond/search` 与 `/evolve/search`，两库结构清晰互不干扰。
- 本轮实现「双库壳 + 筛选框架」，Beyond 数据源仍用占位，Evolve 沿用现有数据。

## 目标

- 建立带模式前缀的双路由结构：`/beyond/*` 与 `/evolve/*`。
- 首页模式切换后进入对应库的入口（搜索 / 高级搜索 / 卡包列表）。
- 两个库各自维护独立的「卡查配置」：高级搜索筛选项、扩展包列表、占位数据形态。
- 公共 UI 组件与页面壳在库之间复用，仅内容与配置按库区分。

## 非目标

- 本轮不接入 Beyond 官方 API（`https://shadowverse-wb.com/web/CardList/cardList`），Beyond 页面使用占位。
- 本轮不实现真正的卡牌搜索 / 详情数据，仅搭建框架与筛选配置。
- 不改动数据库、后端服务与其他站点。

## 关键设计决策

### 双路由结构

页面文件按库组织，利用 Nuxt 的目录路由：

```
app/pages/
  index.vue                 # 首页（模式切换 + 品牌展示）
  beyond/
    search/index.vue        # /beyond/search
    search/advanced.vue     # /beyond/search/advanced
    packs/index.vue         # /beyond/packs
    packs/[slug].vue        # /beyond/packs/[slug]
    cards/[id].vue          # /beyond/cards/[id]
  evolve/
    search/index.vue        # /evolve/search
    search/advanced.vue     # /evolve/search/advanced
    packs/index.vue         # /evolve/packs
    packs/[slug].vue        # /evolve/packs/[slug]
    cards/[id].vue          # /evolve/cards/[id]
```

旧的根路径页面（`/search`、`/packs` 等）不再使用，删除或仅保留首页。

### 模式与路由联动

- 首页保留 `useGameMode` 的 localStorage 持久化（键 `shadowverse.gameMode`）。
- 首页切换模式后，搜索等入口链接指向对应库前缀。
- 全局状态与路由前缀需保持一致：`mode` 与 URL 前缀一一对应（`beyond` ↔ `/beyond`，`evolve` ↔ `/evolve`）。
- 在 `useGameMode` 中补充按 URL 前缀解析模式的能力：进入 `/beyond/*` 时 `mode` 应为 `beyond`，进入 `/evolve/*` 时同理；若 URL 前缀与 localStorage 不一致，以 URL 为准。

### 库级卡查配置

提供 `app/composables/cardCatalog.ts` 集中定义每个库的元信息，页面从该配置派生内容：

- `beyond`：
  - 职业（class）：8 个，`0 neutral` / `1 elf` / `2 royal` / `3 witch` / `4 dragon` / `5 nightmare` / `6 bishop` / `7 nemesis`（映射自官方站）。
  - 稀有度（rarity）：数字 `1` / `2` / `3` / `4`（映射待定，占位）。
  - 费用（cost）：0–18（官方 `stats_list.cost` 实测）。
  - 卡牌类型（type）：`1` / `2` / `3` / `4`（映射待定，占位）。
  - 扩展包（card_set）：`10000`–`10008`、`90000`，名称中文（官方 `card_set_names`，当前以占位文本呈现）。
  - 种族（tribe）、技能（skill）、攻防区间：官方接口参数已确认存在，本轮在筛选框架中预留但不展示真实选项。
- `evolve`：
  - 沿用现有 `advanced.vue` 的职业（7 craft）、稀有度、费用（0–10）、卡牌类型。
  - 扩展包沿用 `app/data/shadowverse-sets.json`（47 个系列）。

配置结构设计为「页面壳 + 库配置」：页面模板共用，筛选项、标题、占位文案、数据源标识由配置决定。

### 高级搜索页复用

- `beyond/search/advanced.vue` 与 `evolve/search/advanced.vue` 共享同一个高级搜索组件（`app/components/AdvancedSearch.vue`），以 `catalog` 配置为输入。
- 组件内部根据配置渲染筛选项；Beyond 配置使用 Beyond 的筛选体系，Evolve 配置使用 Evolve 的筛选体系。
- 当前 Evolve 高级搜索页的筛选逻辑迁移到组件中，行为保持不变。

### 首页品牌展示

- 首页保留居中启动式布局。
- Beyond 模式：展示官方 Logo（`/logo/shadowverse_worlds_beyond_logo.png`）与角色壁纸背景（`/logo/shadowverse_worlds_beyond_Eudie.jpg`）。
- Evolve 模式：暂无 Logo 素材，继续使用图标 + 文字标题的占位品牌区。

## 页面结构

### `/` 首页

- 保留模式切换控件与 localStorage 记忆。
- 入口链接改为库前缀：搜索 → `/beyond/search` 或 `/evolve/search`，高级搜索、卡包列表同理。
- 进入任一库页面前，`useGameMode` 依据 URL 前缀同步模式。

### `/beyond/*` 与 `/evolve/*`

每个库都有：搜索页、高级搜索页、卡包列表页、卡包详情页壳、卡牌详情页壳。除首页外，页面全部带模式前缀，两库页面内容由各自配置驱动。

## 范围限制

- 不接入运行时数据 API，Beyond 与 Evolve 的搜索结果均为占位。
- 不实现库内的真实搜索 / 筛选执行，仅展示筛选控件与占位状态。
- 不新增图标库。
- 不改动 `packages/ui` 或其他站点。

## 验收标准

- 首页可切换 Beyond / Evolve，选择被 localStorage 持久化。
- 首页入口分别指向 `/beyond/*` 与 `/evolve/*`。
- 直接访问 `/beyond/search` 与 `/evolve/search` 均可渲染，且各自标题、说明、筛选项符合对应库配置。
- 直接访问 `/beyond/packs` 与 `/evolve/packs` 展示各自扩展包列表（Beyond 为占位，Evolve 为 47 系列）。
- `/beyond/cards/[id]` 与 `/evolve/cards/[id]`、`/beyond/packs/[slug]` 与 `/evolve/packs/[slug]` 均可渲染占位壳。
- `bun --filter site-shadowverse lint` 通过。

## 后续工作（不在本轮范围内）

- Beyond 官方 API 的接入与代理、中文卡表映射（class / rarity / type 名称、card_set 名称）。
- 两库真实搜索执行与详情数据。
