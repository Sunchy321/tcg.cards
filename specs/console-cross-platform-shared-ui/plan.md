# console 三端共享与桌面壳选型实施计划

## TODO List

- [x] 盘点 `site-console` 与 `app-console-desktop` 的重复页面、重复组件与环境特定依赖
- [x] 设计并创建平台无关的 console 共享层目录与包边界
- [x] 抽离共享核心逻辑，消除对 Nuxt 运行时 API 的直接依赖
- [x] 拆分 `site-console` 的 SSR / BFF 能力与 `service-internal` 的独立 app 后端能力
- [x] 抽离共享 UI 组件与页面区块，优先覆盖高重复页面
- [x] 为 Web、Desktop、Mobile 预留统一的平台适配接口
- [x] 按页面迁移顺序逐步回收 `site-console` 与桌面端的复制实现
- [x] 在共享层稳定后重新评估桌面壳是否迁移到 Nuxt

## 实施步骤

### 1. 重复面盘点

先系统梳理以下内容：

- `site-console/app/pages` 与 `app-console-desktop/src/pages` 的重复页面
- `site-console/app/components` 与桌面端组件的重复实现
- 页面内直接依赖的 Nuxt API、Tauri API、alias 与注入能力

这一步的目标不是立刻改代码，而是形成“哪些内容真正可共享、哪些内容只是外观相似”的清单。

### 2. 建立共享层边界

在工作区中建立面向 console 的共享前端层，建议至少拆出以下职责：

- 平台无关的业务核心层
- 平台无关的 Vue UI 层
- 平台适配接口层

这一阶段应优先定义依赖方向，避免后续再把 `site-console` 的 server 侧能力带入共享层。

### 3. 抽离共享核心逻辑

优先从最不依赖视图壳层的内容开始迁移，例如：

- 导航与权限映射
- 查询参数、筛选与分页状态
- 表单输入模型与保存前转换
- 错误归一化与接口调用包装

这一阶段的验收标准是：共享核心逻辑不再直接引用 Nuxt 运行时 API，也不直接依赖 Tauri。

### 4. 拆分 SSR / BFF 与独立 app 后端能力

先识别 `site-console/server/*` 中哪些能力必须保留在站点侧用于：

- 请求上下文读取
- 同源认证与 session 判定
- 页面级重定向
- 首屏聚合
- 页面级错误映射

再识别哪些能力应迁移到 `service-internal` 作为独立 app 共用后端，例如：

- 通用管理 API
- 领域层 CRUD 主实现
- 长任务执行链
- 不依赖 SSR 上下文的后台流程

这一阶段的验收标准是：`site-console` 与 `service-internal` 的 server 侧职责边界形成明确清单。

### 5. 抽离共享 UI 组件

在核心逻辑稳定后，逐步抽离高重复组件与页面块，例如：

- `YamlEditor`
- 筛选面板
- 列表卡片与分页区
- 详情编辑区块
- 公告编辑条目块

优先抽“页面块”，而不是强行一次性抽整页。

### 6. 建立平台适配器

为共享页面与组件提供统一适配接口，至少覆盖：

- router
- toast
- session
- storage
- api client

其中：

- `site-console` 提供 Nuxt 适配
- `app-console-desktop` 提供 Tauri/Vite 适配
- `app-console-mobile` 后续提供移动端适配

### 7. 按优先级迁移页面

建议优先迁移以下高重复页面：

1. `hearthstone/tag`
2. `hearthstone/set`
3. `hearthstone/announcement`
4. `magic/announcement`
5. `magic/data-source`

这些页面重复度高、表单和列表结构明确，迁移后能快速验证共享层设计是否成立。

### 8. 复评桌面壳选型

当共享层已覆盖主要页面并稳定运行后，再单独评估：

- 继续保留 `Vite + Vue Router + Tauri`
- 迁移为 `Nuxt SPA + Tauri`

复评时应基于真实收益判断，而不是基于框架一致性的表面诉求判断。

只有当迁移 Nuxt 能显著减少桌面端壳层样板与维护成本时，才建议进入该阶段。

当前复评结论：

1. 继续保留 `Vite + Vue Router + Tauri`
2. 不把桌面端迁移到 `Nuxt SPA + Tauri` 作为当前阶段任务
3. 后续仍以共享层扩展为主，而不是以桌面壳替换为主
