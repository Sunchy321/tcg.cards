# console-shell 统一 admin 布局设计

> 稳定的运行时边界、能力分层和数据归属规则以 [../../docs/project-architecture.zh-CN.md](../../docs/project-architecture.zh-CN.md) 为准。本文只描述 console 壳层复用的需求级设计；若有冲突，以主架构文档为准。

## 背景

当前 console 的后台壳已经出现两套实现：

- `apps/site-console/app/layouts/admin.vue` 是网页端真正的后台布局
- `apps/app-console-desktop/src/layouts/default.vue` 实际承担了 desktop 的后台布局职责，而 `apps/app-console-desktop/src/layouts/admin.vue` 只是一个薄包装

这带来两个直接问题：

1. `admin` 这个布局名在两个宿主中的语义不一致
2. 后台壳的 UI 结构已经重复，后续改动会继续双写

与此同时，两个宿主都已经把 `@tcg-cards/console-shell` 作为 Nuxt layer 引入：

- `site-console` 通过 `extends: ['../../packages/ui', '@tcg-cards/console-shell']`
- `app-console-desktop` 通过 `extends: ['@tcg-cards/console-shell']`

这意味着共享 admin 布局放进 `console-shell` 在结构上是可行的，真正需要解决的是宿主运行时差异：

- `site-console` 只有网页端会话与路由行为
- `desktop` 还包含本地 session 恢复、路由恢复、窗口切换与登录窗口跳转

同时还存在一个额外的层级问题：`site-console` 目前仍然继承了 `packages/ui`，但 `packages/ui` 承载的是公共站点层能力，不是 console 后台层本身。若把这层依赖继续向上提升到 `console-shell`，会把公共站点的默认布局、i18n、routeRules 和其他站点级配置一起传递给 desktop。

因此，本次设计的重点不是“复制一份更公共的模板”，而是把后台壳本身收敛到 `console-shell`，再把运行时差异留在宿主适配层。

## 目标

- 统一 `site-console` 与 `app-console-desktop` 的后台布局语义，统一使用 `admin` 布局
- 将后台壳的共享 UI 结构收敛到 `packages/console-shell`
- 将宿主特有的后台生命周期逻辑保留在各自应用中，不泄漏到共享层
- 消除 desktop 当前“真正后台壳在 `default.vue` 中”的结构分叉

## 非目标

- 本轮不统一登录页或公共页面布局
- 本轮不重构认证协议、ORPC 路由或数据库结构
- 本轮不把 Tauri 窗口逻辑放进通用平台能力接口
- 本轮不把 `packages/ui` 变成后台壳承载层

## 现状问题

### 1. 布局名语义分裂

`site-console` 中，`admin` 表示后台壳本身。

`desktop` 中，`admin` 只是包一层 `default`，而 `default` 才是真正的后台壳。

这会导致：

- 新页面落在哪个布局上没有统一标准
- 阅读代码时无法通过布局名直接判断页面所在壳层
- 后续要抽共享布局时，desktop 需要先拆掉错误的承载位置

### 2. 后台壳结构已经重复

两边后台布局都包含同类结构：

- 左侧游戏选择与导航
- 用户管理入口
- 顶部标题区与用户区
- 设置入口
- 主内容区

这些结构已经足够稳定，继续留在宿主内只会让样式和交互继续分叉。

### 3. desktop 把运行时职责和布局结构写在一起

desktop 当前后台壳不仅负责渲染，还负责：

- 刷新 session
- 恢复上次游戏与路由
- 根据权限修正初始页面
- 在 session 失效时切换到登录窗口

这些逻辑必须保留在 desktop 宿主内，但不应继续和共享 UI 写在同一个布局文件中。

### 4. 现有 `console-platform` 还不足以直接承载后台壳

`console-platform` 当前只抽象了：

- `api`
- `router`
- `session`
- `storage`
- `toast`

它适合页面级能力注入，但不适合直接塞入后台壳特有的生命周期逻辑。若强行把 admin 布局控制逻辑继续塞进 `console-platform`，会让一个原本通用的平台接口被后台页面结构反向污染。

### 5. `site-console` 仍残留对 `packages/ui` 的过渡依赖

`site-console` 当前仍通过 `extends: ['../../packages/ui', '@tcg-cards/console-shell']` 继承 `packages/ui`。

这份依赖主要来自两类过渡能力：

- 默认布局兜底
- i18n 与 locale 配置

但 `packages/ui` 当前并不是纯 design system，而是一个带公共站点语义的 Nuxt layer，其中包含：

- 公共站点布局
- 公共站点头尾组件
- i18n 模块与 locale 配置
- routeRules 与部分 app 级配置

这意味着它不适合作为 `console-shell` 的直接上游。正确方向应当是让 `site-console` 逐步移除这份依赖，而不是把这份依赖推广给所有 console 宿主。

## 设计决策

### 1. `console-shell` 不直接依赖 `packages/ui`

`console-shell` 只承载 console 后台共享页面与后台壳，不直接依赖 `packages/ui`。

原因是 `packages/ui` 当前承载的是公共站点层，而不是纯后台共享 UI 层。若让 `console-shell` 直接依赖 `packages/ui`，会带来以下问题：

- 将公共站点默认布局语义传递给所有 console 宿主
- 将 i18n、routeRules 和其他站点级配置隐式传递给 desktop
- 让 `console-shell` 的职责从“console 后台共享层”退化为“继承上游站点 layer 的后台层”

因此，本次设计明确采取相反方向：

- 保持 `console-shell` 直接面向后台场景
- 将 `site-console` 对 `packages/ui` 的残余依赖逐步迁回宿主自身
- 若后续存在真正需要三端复用的轻量 UI 资产，再单独抽取更窄的共享层，而不是继续沿用 `packages/ui`

### 2. `console-shell` 提供唯一的 `admin` 布局入口

在 `packages/console-shell/app/layouts/admin.vue` 中提供共享后台布局，作为 console 后台页面唯一的 `admin` 布局来源。

此布局负责统一后台壳的共享结构：

- 左侧边栏
- 游戏选择
- 游戏导航与用户导航
- 顶部标题与用户信息区
- 设置入口
- 主内容区与基础错误/加载占位

共享层只承载结构、样式和与后台壳强相关的通用交互，不直接依赖 Tauri 或站点私有服务端实现。

### 3. 新增后台壳宿主适配接口，而不是扩张 `console-platform`

新增一组仅服务于后台布局的宿主适配接口，例如：

- `provideConsoleAdminHost()`
- `useConsoleAdminHost()`

该接口与 `console-platform` 分离，专门表达后台壳需要的运行时控制面，例如：

- 当前 session 与展示名称
- 当前角色、可访问游戏与用户管理可见性
- 当前游戏值与切换行为
- 页面标题解析结果
- 加载态与错误态
- 登出行为
- 初始化与 session 校验行为
- 宿主特有的失效处理，例如 desktop 切登录窗口

这样可以保持边界清晰：

- `console-platform` 继续承载通用平台能力
- `console-shell admin` 通过专用宿主接口读取后台壳状态

### 4. `site-console` 与 `desktop` 各自实现宿主适配

`site-console` 适配层负责：

- 读取当前 session 状态
- 基于现有权限逻辑计算可访问游戏
- 执行网页端登出与跳转

`desktop` 适配层负责：

- 复用现有 session 恢复逻辑
- 恢复最近游戏与最近路由
- 在 session 失效时切换到登录窗口
- 保留窗口切换与本地存储恢复行为

共享布局不直接知道自己跑在网页还是桌面，只消费宿主适配接口暴露的状态与动作。

### 5. `site-console` 逐步移除对 `packages/ui` 的依赖

在 `admin` 布局收敛到 `console-shell` 后，`site-console` 不再继续依赖 `packages/ui` 提供 console 所需的后台能力。

`site-console` 应将当前仍从 `packages/ui` 继承的能力逐步迁回宿主自身，至少包括：

- i18n 模块与 locale 配置
- 默认布局兜底
- 仅对公共站点有意义、但对 console 后台非必要的默认插件或布局行为

这样可以保持层次清晰：

- `packages/ui` 继续服务公共站点
- `console-shell` 继续服务 console 后台
- `site-console` 作为宿主只保留自己真正需要的站点配置

### 6. desktop 后台页面统一显式使用 `admin` 布局

当前 desktop 把后台壳挂在 `default.vue` 上，这会继续放大布局语义混乱。

本轮应将 desktop 的后台页面统一显式声明 `layout: 'admin'`，让页面和布局语义与 `site-console`、`console-shell` 保持一致。

这包括：

- `settings`
- 各游戏首页
- 数据源页
- 导入页
- 卡牌、规则、图片、用户等后台页

### 7. desktop 的 `default.vue` 不再承载后台壳

`apps/app-console-desktop/src/layouts/default.vue` 不再继续作为后台壳主实现。

调整后的职责应为：

- 作为非后台页的默认兜底布局，保持最小职责
- 或仅作为过渡兼容层，内部转到 `admin`，但不再承载真正后台逻辑

长期目标是让后台壳只有一个事实来源，即 `console-shell` 中的 `admin`。

### 8. `console-shell` 页面继续使用 `admin` 布局

`packages/console-shell/app/pages/**` 中已经声明 `layout: 'admin'` 的后台页面保持不变。

在共享布局进入 `console-shell` 后，这些页面会自然落到统一后台壳中，而不再依赖宿主各自补一套 `admin.vue`。

## 结构建议

建议新增以下共享与宿主文件：

- `packages/console-shell/app/layouts/admin.vue`
- `packages/console-shell/app/composables/admin-host.ts`
- `apps/site-console/app/composables/useConsoleAdminHost.ts`
- `apps/app-console-desktop/src/composables/useConsoleAdminHost.ts`

其中：

- `admin.vue` 直接承载共享后台壳实现与布局入口
- `admin-host.ts` 定义后台壳宿主接口与注入 key
- 两个宿主分别提供自己的实现

## 风险与取舍

### 1. 需要为 desktop 页面补齐布局声明

desktop 当前不少后台页面没有显式写 `layout: 'admin'`。切换后需要一次性补齐，否则页面会继续落到默认布局上。

### 2. 宿主接口设计过大时会重新形成耦合

如果宿主适配接口把太多页面细节暴露出来，`console-shell` 会重新反向依赖宿主实现。接口必须只覆盖后台壳控制面，不承载业务页状态。

### 3. `site-console` 脱离 `packages/ui` 时需要补齐宿主配置

一旦移除 `packages/ui` 依赖，`site-console` 需要自行补齐当前仍在继承的默认布局和 i18n 配置。这个迁移成本应显式纳入本轮设计，而不是隐含假设可以零成本移除。

### 4. 不应把 desktop 专有窗口行为塞进共享层

例如：

- `ensureLoginWindow`
- `getCurrentWindow().close()`

这些逻辑只能留在 desktop 宿主适配中，由共享布局通过统一动作调用。

## 验收标准

- `packages/console-shell` 提供统一的 `admin` 布局入口
- `packages/console-shell` 不直接依赖 `packages/ui`
- `site-console` 不再维护独立后台壳实现，只保留宿主适配
- `site-console` 不再把 `packages/ui` 作为 console 后台能力来源
- `app-console-desktop` 不再让 `default.vue` 成为后台壳主实现
- desktop 后台页面统一显式使用 `admin` 布局
- 页面标题、游戏切换、用户导航、设置入口在两端保持一致结构
- desktop 的 session 恢复、路由恢复和登录窗口切换在迁移后仍然可用
