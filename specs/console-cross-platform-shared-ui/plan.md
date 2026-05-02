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
- [x] 清理 `app-console` 对 `console-core` 的兼容重导出
- [x] 收敛 ORPC client 工厂的长期归属，并减少应用对 `@tcg-cards/app-console` 的直接依赖
- [x] 在兼容入口清空后评估 `app-console` 是否可以归档或删除
- [x] 收敛 `app-console-capabilities` 的宿主能力协议归属，并删除空转包
- [x] 迁移 `hearthstone/data-source` 页面到共享页面层

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

先识别 `site-console/server/*` 中哪些能力必须保留在站点侧并在本地 Worker 中执行，用于：

- 请求上下文读取
- 同源认证与 session 判定
- 页面级重定向
- 首屏聚合
- 页面级错误映射

再识别哪些能力应保留给 `app-* -> service-internal` 作为共用后端，例如：

- 通用管理 API
- 领域层 CRUD 主实现
- 长任务执行链
- 不依赖 SSR 上下文的后台流程

同时识别哪些逻辑应抽到共享包，由 `site-*` 与 `service-*` 各自在本地装配，而不是通过 HTTP 路由复用。

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
4. `hearthstone/data-source`
5. `magic/announcement`
6. `magic/data-source`

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

### 9. 清理 `app-console` 过渡边界

在 `console-core`、`console-platform` 与共享页面层稳定后，`packages/app-console` 曾只剩两类残留职责：

- 对 `console-core` 的兼容重导出
- `createConsoleApiClient` 这一层 ORPC client 工厂

本轮清理按以下顺序完成：

1. 先去掉 `app-console` 对 `console-core` 的重导出，消除最明显的功能重叠
2. 再明确 `createConsoleApiClient` 的长期归属，优先避免继续把 `app-console` 作为平台边界的必经入口
3. 当应用侧不再依赖 `@tcg-cards/app-console` 后，再评估该包是保留为极薄兼容包、归档，还是直接删除

当前评估结论：

1. `site-console` 与 `app-console-desktop` 已不再直接依赖 `@tcg-cards/app-console`
2. `createConsoleApiClient` 已迁入 `console-platform`
3. `app-console` 已不再承载独有功能，仅剩对 `console-platform` 的单一转发
4. 因此不再保留兼容包，直接删除 `packages/app-console`

这一阶段的验收标准是：

1. `app-console` 不再承担 `console-core` 的兼容职责
2. 应用侧对 `@tcg-cards/app-console` 的依赖明显减少或完全消失
3. `app-console` 的存废可以基于真实剩余职责判断，而不是基于历史包名判断
4. 若兼容包已无真实职责，则应直接删除，而不是继续保留历史空壳

### 10. 清理 `app-console-capabilities` 过渡边界

在 `console-platform` 已经成为平台适配主边界后，`packages/app-console-capabilities` 的剩余职责只包括：

- 宿主能力等级定义
- 文件、Git、工具执行、上传等宿主能力接口
- 对不支持能力的默认报错实现

本轮清理按以下顺序完成：

1. 将宿主能力协议与默认兜底实现迁入 `console-platform`
2. 保持现阶段只收敛导出边界，不额外引入新的运行时耦合
3. 在确认工作区无实际依赖后，直接删除 `packages/app-console-capabilities`

当前评估结论：

1. `app-console-capabilities` 的内容语义上属于平台适配层，而不是独立业务层
2. 当前工作区几乎没有实际消费该包，迁移成本很低
3. 继续单独保留该包只会增加包边界数量，而不会带来明确隔离收益
4. 因此将其并入 `console-platform`，并删除独立包

这一阶段的验收标准是：

1. 宿主能力协议改由 `console-platform` 导出
2. 工作区不再依赖 `@tcg-cards/app-console-capabilities`
3. `packages/app-console-capabilities` 被删除，lockfile 完成同步
