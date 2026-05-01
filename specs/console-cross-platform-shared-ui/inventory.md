# console 三端共享盘点清单

## 1. 目标

本清单用于完成本规格计划中的第 1 步：盘点 `site-console` 与 `app-console-desktop` 的重复页面、重复组件与环境特定依赖，并为后续抽离共享层提供明确输入。

本清单重点回答三个问题：

1. 目前有哪些前端实现已经在 Web 与 Desktop 之间重复
2. 这些重复实现分别依赖了哪些平台或运行时能力
3. 后续抽共享层时，哪些内容应先抽核心逻辑，哪些内容可直接抽组件或页面块

## 2. 重复页面清单

当前 `apps/site-console/app/pages` 与 `apps/app-console-desktop/src/pages` 之间共存在 19 个同路径页面：

| 相对路径 | Web 文件 | Desktop 文件 | 当前状态 | 迁移优先级 |
|------|------|------|------|------|
| `index.vue` | `apps/site-console/app/pages/index.vue` | `apps/app-console-desktop/src/pages/index.vue` | 都负责入口跳转，但宿主路由与会话来源不同 | 中 |
| `settings/index.vue` | `apps/site-console/app/pages/settings/index.vue` | `apps/app-console-desktop/src/pages/settings/index.vue` | 页面较简单，样式与壳层差异明显 | 低 |
| `user/index.vue` | `apps/site-console/app/pages/user/index.vue` | `apps/app-console-desktop/src/pages/user/index.vue` | 页面较简单，依赖登录态来源不同 | 低 |
| `magic/index.vue` | `apps/site-console/app/pages/magic/index.vue` | `apps/app-console-desktop/src/pages/magic/index.vue` | 都是概览入口 | 低 |
| `magic/card/index.vue` | `apps/site-console/app/pages/magic/card/index.vue` | `apps/app-console-desktop/src/pages/magic/card/index.vue` | 当前主要是占位页 | 低 |
| `magic/format/index.vue` | `apps/site-console/app/pages/magic/format/index.vue` | `apps/app-console-desktop/src/pages/magic/format/index.vue` | 当前主要是占位页 | 低 |
| `magic/set/index.vue` | `apps/site-console/app/pages/magic/set/index.vue` | `apps/app-console-desktop/src/pages/magic/set/index.vue` | 当前主要是占位页 | 低 |
| `magic/data-source/index.vue` | `apps/site-console/app/pages/magic/data-source/index.vue` | `apps/app-console-desktop/src/pages/magic/data-source/index.vue` | 复杂读写页，重复价值高 | 高 |
| `magic/announcement/index.vue` | `apps/site-console/app/pages/magic/announcement/index.vue` | `apps/app-console-desktop/src/pages/magic/announcement/index.vue` | 中等复杂度 CRUD 页，结构高度相似 | 高 |
| `magic/rule/index.vue` | `apps/site-console/app/pages/magic/rule/index.vue` | `apps/app-console-desktop/src/pages/magic/rule/index.vue` | 复杂页，后续仍需专门拆分 | 中 |
| `magic/rule/view.vue` | `apps/site-console/app/pages/magic/rule/view.vue` | `apps/app-console-desktop/src/pages/magic/rule/view.vue` | 复杂页，依赖路由参数与编辑器 | 中 |
| `magic/rule/changes.vue` | `apps/site-console/app/pages/magic/rule/changes.vue` | `apps/app-console-desktop/src/pages/magic/rule/changes.vue` | 复杂页，后续应跟随规则模块一起整理 | 中 |
| `hearthstone/index.vue` | `apps/site-console/app/pages/hearthstone/index.vue` | `apps/app-console-desktop/src/pages/hearthstone/index.vue` | 都是概览入口 | 低 |
| `hearthstone/announcement/index.vue` | `apps/site-console/app/pages/hearthstone/announcement/index.vue` | `apps/app-console-desktop/src/pages/hearthstone/announcement/index.vue` | 中等复杂度 CRUD 页，结构高度相似 | 高 |
| `hearthstone/data-import/index.vue` | `apps/site-console/app/pages/hearthstone/data-import/index.vue` | `apps/app-console-desktop/src/pages/hearthstone/data-import/index.vue` | 复杂任务页，包含长流程状态 | 中 |
| `hearthstone/data-source/index.vue` | `apps/site-console/app/pages/hearthstone/data-source/index.vue` | `apps/app-console-desktop/src/pages/hearthstone/data-source/index.vue` | 复杂读写页，重复价值高 | 高 |
| `hearthstone/image/index.vue` | `apps/site-console/app/pages/hearthstone/image/index.vue` | `apps/app-console-desktop/src/pages/hearthstone/image/index.vue` | 复杂任务页，平台差异较大 | 中 |
| `hearthstone/set/index.vue` | `apps/site-console/app/pages/hearthstone/set/index.vue` | `apps/app-console-desktop/src/pages/hearthstone/set/index.vue` | 表单和列表结构清晰，适合优先抽离 | 高 |
| `hearthstone/tag/index.vue` | `apps/site-console/app/pages/hearthstone/tag/index.vue` | `apps/app-console-desktop/src/pages/hearthstone/tag/index.vue` | 表单和列表结构清晰，适合优先抽离 | 高 |

## 3. 重复组件清单

当前确认存在同路径重复的组件为：

| 相对路径 | Web 文件 | Desktop 文件 | 当前状态 | 迁移优先级 |
|------|------|------|------|------|
| `YamlEditor.vue` | `apps/site-console/app/components/YamlEditor.vue` | `apps/app-console-desktop/src/components/YamlEditor.vue` | 功能高度相似，但细节行为与样式已有分叉 | 高 |

说明：

1. `YamlEditor` 已经是明确的共享组件候选
2. 它当前同时承担了编辑器初始化、深色模式适配、链接上下文菜单与外部打开行为
3. 抽离时应拆出平台无关编辑器主体，与平台相关的“打开链接”行为适配

## 4. 环境特定依赖盘点

### 4.1 Web / Nuxt 侧运行时依赖

`site-console` 页面层当前直接依赖的 Nuxt 能力主要包括：

- `definePageMeta`
- `navigateTo`
- `useRoute`
- `useRouter`
- `useRequestEvent`
- `defineNuxtPlugin`
- `useState`

这些依赖主要分布在：

- `apps/site-console/app/pages/*`
- `apps/site-console/app/layouts/admin.vue`
- `apps/site-console/app/composables/game.ts`
- `apps/site-console/app/plugins/orpc.ts`

对共享层的直接影响：

1. 共享页面不应直接依赖 `definePageMeta`
2. 共享导航逻辑不应直接调用 `navigateTo`
3. 共享 API 注入层不应直接依赖 `defineNuxtPlugin` 或 `useRequestEvent`

### 4.2 Web / Nuxt alias 与 server 侧依赖

`site-console` 当前还依赖大量仅在 Nuxt 壳内成立的 alias：

- `#model`
- `#db`
- `#schema`

其中：

- `#model` 同时出现在页面层与 server 层
- `#db`、`#schema` 主要出现在 `site-console/server/*`

对共享层的直接影响：

1. 共享客户端层不得直接依赖 `#db` 或 `#schema`
2. 页面若需要模型类型，应优先改为从工作区包显式导入，而不是依赖 Nuxt alias
3. `site-console/server/*` 中的实现不属于共享客户端层，应保持在宿主壳内

### 4.2.1 `site-console/server/*` 后续需要继续拆成两类

`site-console/server/*` 当前不应被看作单一整体，后续需要继续拆分为：

1. 应保留在 `site-console` 的 SSR / BFF 能力
2. 应迁移到 `service-internal` 的独立 app 共用后端能力

应保留在 `site-console` 的典型职责：

- 浏览器请求上下文读取
- 同源认证入口与 session 判定
- 页面级重定向
- 首屏聚合
- 页面级缓存与错误映射

应迁移到 `service-internal` 的典型职责：

- 独立 app 共用管理 API
- 领域层 CRUD 主实现
- 长任务执行链
- 不依赖 SSR 请求上下文的后台处理流程

### 4.3 Desktop / Tauri 侧依赖

`app-console-desktop` 当前页面与前端壳层直接依赖的桌面能力主要包括：

- `@tauri-apps/api/window`
- `@tauri-apps/api/core`
- 自定义 `auth_fetch`
- 桌面窗口切换逻辑
- 本地持久化行为

这些依赖主要分布在：

- `apps/app-console-desktop/src/components/MainWindow.vue`
- `apps/app-console-desktop/src/components/LoginWindow.vue`
- `apps/app-console-desktop/src/windows.ts`
- `apps/app-console-desktop/src/composables/useApiClient.ts`

对共享层的直接影响：

1. 共享页面不应直接依赖 Tauri 窗口 API
2. 共享 API 层不能假设请求一定走桌面 `invoke`
3. 共享登录态与持久化逻辑应通过平台适配接口进入

### 4.4 已经泄漏到 Desktop 页面的 Nuxt 依赖

当前桌面端页面里已经存在本不属于 Vite/Tauri 壳的 Nuxt 风格依赖：

- `@nuxt/ui/composables/useToast.js`
- `#model/...`

已确认分布在：

- `apps/app-console-desktop/src/pages/hearthstone/tag/index.vue`
- `apps/app-console-desktop/src/pages/hearthstone/set/index.vue`
- `apps/app-console-desktop/src/pages/hearthstone/announcement/index.vue`
- `apps/app-console-desktop/src/pages/magic/announcement/index.vue`

这说明当前复制页面后，环境依赖并未被清理，而是继续外溢到桌面端。

## 5. 对后续共享拆分的直接结论

### 5.1 应优先抽离的共享核心

优先候选包括：

1. 游戏导航与页面可见性映射
2. 列表筛选与分页状态
3. Tag / Set / Announcement 的表单输入模型与保存前转换
4. 统一错误归一化与 toast 输入模型

这些内容与具体平台壳的关系较弱，适合优先进入共享核心层。

### 5.2 应优先抽离的共享 UI

优先候选包括：

1. `YamlEditor`
2. 列表筛选面板
3. 详情表单区块
4. 公告条目编辑区块
5. 只读概览卡片

这些组件在 Web 与 Desktop 中已经有明显重复，且平台差异主要集中在外层注入而不是主体视图。

### 5.3 暂不应优先整页共享的内容

以下页面虽然有重复，但不应作为第一批整页共享目标：

1. `magic/rule/*`
2. `hearthstone/image/index.vue`
3. `hearthstone/data-import/index.vue`

原因是：

- 路由参数和任务流更复杂
- 平台侧文件能力与长任务交互差异更大
- 若过早整页共享，容易把平台耦合继续带进共享层

## 6. 盘点结论

当前重复现象已经足够明确：

1. Web 与 Desktop 之间已存在 19 个重复页面和 1 个重复组件
2. 重复页面中至少有 5 个高价值候选页适合优先进入共享迁移
3. 当前最大阻碍不是视图差异，而是 Nuxt 运行时依赖、Nuxt alias 与 Tauri 平台能力没有被适配层隔离
4. `site-console/server/*` 还承担了混合职责，后续必须把 SSR / BFF 逻辑与独立 app 共用后端逻辑拆开

因此，后续第 2 步应聚焦于：

- 先定义共享层包边界
- 再明确 `site-console` 与 `service-internal` 的后端职责边界
- 再定义平台适配接口
- 然后从 `YamlEditor`、`hearthstone/tag`、`hearthstone/set`、两类 `announcement` 页面开始实际迁移
