# 影之诗双卡查库（Beyond / Evolve）路由与筛选框架实现计划

## 设计依据

设计见 `proposals/shadowverse-dual-catalog/design.md`（提案待评审，本轮按已确认方向实施：带前缀双路由 + 双库壳与筛选框架）。

## Todo 清单

- [ ] 1. 重构 `useGameMode`：支持按 URL 前缀解析模式（`/beyond` / `/evolve`），URL 优先于 localStorage，并在进入库页面时同步状态
- [ ] 2. 新建 `app/composables/cardCatalog.ts`：集中定义 Beyond 与 Evolve 两库的卡查配置（标题、副标题、筛选项、扩展包、占位文案）
- [ ] 3. 抽取 `app/components/AdvancedSearch.vue`：从现有 `pages/search/advanced.vue` 迁移高级搜索 UI 与逻辑，改为以库配置为输入
- [ ] 4. 新建 `app/pages/beyond/` 页面：`search/index.vue`、`search/advanced.vue`、`packs/index.vue`、`packs/[slug].vue`、`cards/[id].vue`
- [ ] 5. 新建 `app/pages/evolve/` 页面：同上五个页面
- [ ] 6. 更新首页 `app/pages/index.vue`：入口链接带库前缀，品牌区按模式展示（Beyond 用 Logo + 壁纸）
- [ ] 7. 删除旧的根路径页面：`app/pages/search/`、`app/pages/packs/`、`app/pages/cards/`
- [ ] 8. 验证：typecheck 通过，全部库页面与占位壳路由返回 200

## 实施要点

### 1. useGameMode 按 URL 前缀解析

- `mode` 状态默认 `beyond`。
- 内部读取 `useRoute()`：路径以 `/evolve` 开头则 `mode = evolve`，以 `/beyond` 开头则 `mode = beyond`。
- 有 URL 前缀时以 URL 为准，并同步写入 localStorage；无前缀（首页）时使用 localStorage 记忆值。
- 首页切换后入口链接跟随 `mode`。

### 2. cardCatalog.ts

每个库提供：

- `id`：`beyond` | `evolve`
- `title`、`subtitle`：库标题与副标题
- `searchTitle`、`packsTitle`：各页标题
- `advancedSearch`：高级搜索配置（cardKinds、sections、stats 开关）
- `packs`：扩展包列表（Beyond 为占位条目，Evolve 来自 `shadowverse-sets.json`）

Beyond 筛选项（来自官方实测）：职业 8 个（neutral/elf/royal/witch/dragon/nightmare/bishop/nemesis）、稀有度 1–4、费用 0–18、卡牌类型 1–4、扩展包 10000–10008 + 90000（中文名占位）。

### 3. AdvancedSearch.vue

- 从现有 `advanced.vue` 迁移模板与逻辑。
- props 接收库配置；筛选项、标题、攻防开关由配置驱动。
- 提交行为保持：`router.push` 到当前库的 `/search`，query 携带筛选条件。
- Evolve 现有行为保持不变。

### 4/5. beyond/ 与 evolve/ 页面

- `search/index.vue`：占位搜索结果壳，标题来自库配置。
- `search/advanced.vue`：包裹 `AdvancedSearch.vue`。
- `packs/index.vue`：Beyond 为占位扩展包列表；Evolve 渲染 47 系列。
- `packs/[slug].vue`：占位详情壳。
- `cards/[id].vue`：占位详情壳。
- 页面返回链接指向对应库的上一级。

### 6. 首页

- 入口链接：`/search` → `/{mode}/search`，高级搜索、卡包列表同理。
- Beyond 品牌区：Logo 图 + 壁纸背景；Evolve：图标 + 文字。

### 7. 删除旧页面

移除 `app/pages/search/`、`app/pages/packs/`、`app/pages/cards/`（连同原 `advanced.vue` 等），仅保留首页。
