# console 三端共享与桌面壳选型设计

## 背景

当前仓库中已经存在两个与 console 相关的前端应用：

- `apps/site-console`：基于 Nuxt 的网页管理端
- `apps/app-console-desktop`：基于 Tauri + Vue Router + Vite 的桌面端

现阶段的主要问题不是“是否使用同一前端框架”，而是“页面层与页面逻辑的复用边界没有建立起来”。

从当前代码结构可以直接看到几类问题：

1. `site-console` 与 `app-console-desktop` 已经出现大面积页面复制
2. 复制后的页面仍然直接依赖各自壳层能力，导致跨壳复用失败
3. `site-console` 的 Nuxt 运行时能力与其 server 侧能力耦合较深
4. 桌面端已经出现把 Nuxt 风格页面复制到非 Nuxt 壳里后无法稳定构建的问题

当前可直接对应的现象包括：

- `site-console/app/pages` 与 `app-console-desktop/src/pages` 之间已有 19 个同路径页面
- `site-console/app/components/YamlEditor.vue` 与 `app-console-desktop/src/components/YamlEditor.vue` 也已经分叉
- 桌面端页面中直接出现 `@nuxt/ui/composables/useToast.js`、`#model/...` 等 `site-console` 壳层依赖

这说明当前的重复劳动已经进入“会持续扩大且难以回收”的阶段，需要先设计统一的共享边界。

## 目标

1. 为 `site-console`、`app-console-desktop`、未来的 `app-console-mobile` 建立可持续的前端复用结构
2. 明确哪些能力应该进入共享层，哪些能力应保留在各自平台壳层
3. 明确是否应立即把当前桌面端从 Vite 壳迁移为 Nuxt 壳
4. 明确后端迁移后的双落点：`site-console` 保留 SSR / BFF 能力，独立 app 的后端能力收口到 `service-internal`
5. 降低页面复制、样式分叉、状态逻辑重复和环境特定 API 泄漏
6. 为未来移动端接入提供前端结构基础，而不是再复制第三套页面

## 非目标

1. 本次不直接实现 `app-console-mobile`
2. 本次不直接迁移 `app-console-desktop` 到 Nuxt
3. 本次不改动 `site-console` 的部署形态
4. 本次不重新设计 ORPC、Auth 或数据库结构
5. 本次不处理所有现有页面的具体迁移，只定义结构与迁移顺序

## 现状分析

### 1. 共享层在迁移前曾经过薄

在本轮迁移启动前，仓库曾通过 `packages/app-console` 承载一小部分共享能力，例如：

- `createConsoleApiClient`
- 导航数据与游戏选择逻辑
- 基础错误处理

但它当时并没有承载以下真正决定复用价值的内容：

- 页面级状态模型
- 列表筛选与分页逻辑
- 表单编辑逻辑
- 编辑器与表单块组件
- 页面级通用容器
- 平台无关的 toast、router、session、storage 适配接口

这导致当时出现“共享包存在，但页面仍然只能复制”的问题。

### 1.1 `app-console` 已完成过渡并可删除

随着 `console-core`、`console-platform`、`console-ui` 落地，`packages/app-console` 的剩余职责已经被完全回收：

1. 对 `console-core` 的兼容重导出已移除
2. `createConsoleApiClient` 已迁入 `console-platform`
3. 应用侧对 `@tcg-cards/app-console` 的直接依赖已清空

因此，当前设计上的附加结论是：

- `app-console` 只是阶段性过渡包，不再是长期主包
- 在兼容入口清空后，应直接删除 `packages/app-console`

### 2. `site-console` 不是纯客户端壳

`site-console` 当前同时包含：

- Nuxt 页面层
- Nuxt 插件与 composable
- 服务端 ORPC 路由
- 服务端 auth 转发与 middleware
- `#model`、`#db`、`#schema` 等 Nuxt alias

因此它并不是一个可以直接被桌面端或移动端原样复用的“前端应用模板”，而是一个“网页壳 + 服务端壳 + 管理前端”的复合体。

### 2.1 `site-console` 的服务端能力需要进一步分层

`site-console` 当前服务端能力里混合了两类不同职责：

- 贴近 SSR 渲染与浏览器请求上下文的能力
- 可供独立 app 复用的通用管理后端能力

这两类能力后续不应继续长期混放在同一应用内。

需要明确后续双落点：

- `site-console` 保留 SSR / BFF 所需的薄后端能力
- `service-internal` 承担独立 app 共用的业务后端能力

这里的 BFF 指 `Backend for Frontend`，即专门面向某个前端壳层的薄后端，用于处理：

- 请求上下文读取
- 会话判断
- SSR 首屏聚合
- 页面级重定向
- 页面级错误映射
- 同源认证转发

### 3. 桌面端当前问题不是少了 Nuxt，而是复制页面后缺少共享边界

桌面端已经在复制 `site-console` 页面，但复制后仍保留了原始页面对 Nuxt 环境的假设，例如：

- 直接引用 `useToast`
- 直接引用 `#model` alias
- 页面逻辑默认依赖 Nuxt 注入的运行时上下文

这意味着即使桌面端切换成 Nuxt，也只是缓解“环境不兼容”的一部分问题，而不是从根上消除页面复制与壳层耦合。

### 4. 移动端若沿当前模式推进，将复制第三份页面

如果未来 `app-console-mobile` 继续沿用“先起壳、再复制页面”的方式：

- 现有网页端页面分叉继续扩大
- 桌面端已存在的适配逻辑无法直接沉淀
- 移动端还会带来第三套交互与生命周期差异

届时再回头收敛共享层，成本会显著提高。

## 决策标准

本次关于“桌面端是否要迁 Nuxt”的判断，应以以下标准为准：

1. 是否降低页面复制，而不是只更换壳层名称
2. 是否让共享页面摆脱对单一平台运行时的直接依赖
3. 是否能同时覆盖 Web、Desktop、Mobile，而不是只优化其中两端
4. 是否为 SSR / BFF 能力与独立 app 后端能力建立清晰边界
5. 是否保留平台特定能力的清晰边界
6. 是否让后续迁移可以分阶段进行，而不是一次性大迁移

## 备选方案

### 方案 A：保留桌面端当前 Vite 壳，先抽共享前端层

核心思路：

- `site-console` 继续作为 Nuxt 网页壳
- `app-console-desktop` 继续作为 Tauri + Vite 桌面壳
- 优先抽离平台无关的前端逻辑、组件和页面块到共享包
- 等共享层稳定后，再重新评估桌面壳是否要迁到 Nuxt

优点：

1. 先解决真正的问题，即页面与逻辑复用边界
2. 不需要立即动桌面端启动链路、Tauri 配置和多窗口模型
3. 迁移风险较低，可逐页迁移
4. 对未来移动端也更友好，因为共享层不绑定 Nuxt

缺点：

1. 短期内仍需维护 Nuxt 壳与 Vite 壳两套外层集成
2. 需要额外设计一层平台适配接口
3. 若未来最终决定桌面端也用 Nuxt，仍会有第二阶段迁移

### 方案 B：立即把桌面端改成 Nuxt 壳，再做共享

核心思路：

- `app-console-desktop` 从 `Vue Router + Vite` 迁移到 `Nuxt + Tauri`
- 优先统一桌面与网页端框架，再逐步回收页面复制

优点：

1. 网页端与桌面端表面上使用同一前端框架
2. 一部分 Nuxt 特有写法可以直接在桌面端运行
3. 对当前已经复制过去的 Nuxt 风格页面更“兼容”

缺点：

1. 没有先解决共享边界，容易把 `site-console` 的壳层耦合整体复制到桌面端
2. 会把桌面端绑到 Nuxt 运行时、Nuxt 构建链和 Nuxt 目录结构
3. 仍然无法自然解决移动端问题，因为移动端未必适合直接复用完整 Nuxt 壳
4. 迁移成本较高，但收益主要是“环境对齐”，不是“结构降重”

### 方案 C：建设单一共享客户端，Web/Desktop/Mobile 都只包壳

核心思路：

- 抽出一个真正的平台无关的共享客户端层
- Web 用 Nuxt 壳承载它
- Desktop 用 Tauri 壳承载它
- Mobile 用未来的移动壳承载它

优点：

1. 最符合长期三端复用目标
2. 平台边界清晰
3. 共享层可以逐渐形成稳定的 console UI 基础设施

缺点：

1. 初期设计成本最高
2. 需要明确哪些功能允许依赖服务端上下文，哪些必须客户端可运行
3. 迁移过程需要阶段性双轨维护

## 推荐方案

推荐采用“方案 A 作为第一阶段，方案 C 作为最终目标”，明确不建议当前立即执行方案 B。

即：

1. 先不把当前 Tauri 桌面端改为 Nuxt
2. 先抽离真正的共享前端层
3. 同时逐步建立 `site-console` 与 `service-internal` 的后端职责边界
4. 在共享层完成后，再根据实际收益决定桌面壳是否迁移到 Nuxt

这是当前最稳妥、也最符合三端复用目标的路径。

## 目标结构

### 1. 当前共享层结构

当前共享能力已经收敛为以下层次：

#### `packages/console-core`

负责平台无关的前端业务逻辑：

- 导航元数据
- 权限到页面可见性的映射
- 查询参数与筛选状态模型
- 分页状态
- 列表与详情页的领域层操作
- 表单输入模型与校验前转换
- 平台无关的错误归一化

约束：

- 不依赖 Nuxt
- 不依赖 Tauri
- 不直接依赖浏览器存储
- 不直接依赖 `window`

#### `packages/console-ui`

负责平台无关的 Vue 组件与页面块：

- 页面框架组件
- 面板、详情卡片、筛选区块
- 通用编辑器组件
- 可复用的列表页、详情页片段
- 通用表单区块

约束：

- 可以依赖 Vue、Vue Router、`@nuxt/ui`
- 不依赖 Nuxt runtime API
- 不直接依赖 Tauri API

#### `packages/console-platform`

负责定义平台适配接口：

- `ConsoleRouter`
- `ConsoleToast`
- `ConsoleSession`
- `ConsoleStorage`
- `ConsoleApi`
- 宿主能力等级定义
- 文件、Git、工具执行、上传等宿主能力接口
- 宿主能力默认兜底实现

不同壳层分别提供实现：

- `site-console` 提供 Nuxt 适配
- `app-console-desktop` 提供 Tauri/Vite 适配
- `app-console-mobile` 提供移动端适配

### 2. 各应用壳层职责

#### `apps/site-console`

保留：

- Nuxt 页面入口与布局壳
- SSR 与请求上下文
- 同源认证转发与会话判断
- 页面级重定向、缓存与错误映射
- SSR / BFF 所需的 server routes 与聚合逻辑
- 浏览器会话处理

不再承担：

- 大量只属于 console 客户端本身的页面实现细节
- 独立 app 也需要直接消费的业务后端主实现

说明：

`site-console` 后续保留的是“贴近 SSR 的薄后端”，不是完整的独立业务后端。

#### `apps/service-internal`

保留：

- 独立 app 共用的管理 API
- 领域逻辑主实现
- 长任务与后台执行链
- Desktop / Mobile 直接消费的后端能力
- 可被 `site-console` 的 BFF 调用的内部服务接口

不再承担：

- 网页端 SSR 页面专属的请求上下文处理
- 直接面向浏览器页面的重定向与首屏渲染控制

#### `apps/app-console-desktop`

保留：

- Tauri 多窗口
- 系统代理绕过
- 系统凭据存储
- 本地配置与文件访问
- 桌面专用 fetch / auth bridge

不再承担：

- 从 `site-console` 复制完整页面并手工改造

#### `apps/app-console-mobile`

未来保留：

- 移动端权限
- 生命周期管理
- 设备存储与深链
- 触屏交互差异

不应承担：

- 第三份独立页面实现

### 3. 后端迁移落点

后端迁移时，需要明确区分“SSR / BFF 能力”和“独立 app 共用业务后端能力”。

#### 应保留在 `site-console` 的能力

- SSR 请求上下文读取
- 浏览器同源认证入口与 session 判定
- 页面级重定向
- 页面首屏聚合
- 页面级缓存控制
- 页面级错误映射

这些能力天然依赖 Nuxt 页面壳、浏览器请求上下文和站点级渲染策略，不适合下沉到 `service-internal`。

#### 应迁移到 `service-internal` 的能力

- 独立 app 也需要消费的管理 API
- 领域层 CRUD 主实现
- 长任务执行链
- 导入、同步、后台处理流程
- 不依赖 SSR 请求上下文的通用业务接口

这些能力应作为稳定的内部服务能力存在，由：

- `app-console-desktop`
- 未来的 `app-console-mobile`
- `site-console` 的 SSR / BFF 层

共同消费。

## 关于“桌面端是否应改用 Nuxt”的最终判断

### 当前阶段判断

不建议立即迁移。

原因如下：

1. 当前主要痛点在共享边界，而不是框架不一致
2. 立即迁移 Nuxt 只能让桌面端更容易运行被复制的 Nuxt 页面，但不会自动消除复制
3. `site-console` 当前同时承载 server 侧能力，直接对齐到桌面端会扩大耦合面
4. 移动端复用目标要求共享层尽量独立于 Nuxt 壳
5. 当前更关键的工作是把 `site-console` 的 SSR / BFF 职责和独立 app 后端职责拆清，而不是先统一桌面壳

### 共享层落地后的复评结果

在本规格实施到当前阶段后，已经完成以下前端收口：

1. `packages/console-core` 已承载导航与基础错误处理等平台无关核心逻辑
2. `packages/console-platform` 已提供 `router`、`toast`、`session`、`storage`、`api client` 的统一适配接口
3. `packages/console-ui` 已承载共享 `YamlEditor` 与以下共享页面：
   - `magic/announcement`
   - `hearthstone/announcement`
   - `hearthstone/set`
   - `hearthstone/tag`
   - `hearthstone/data-source`
4. `site-console` 与 `app-console-desktop` 已将上述页面回收为薄 wrapper

基于这轮真实落地结果，复评结论维持不变：

1. 当前不应把 `app-console-desktop` 从 `Vite + Vue Router + Tauri` 迁移到 `Nuxt SPA + Tauri`
2. 共享层已经显著减少页面复制，说明当前主要收益来自共享层本身，而不是来自桌面壳切换
3. 当前桌面端剩余壳层代码已经收缩到较小范围，继续迁 Nuxt 不会带来同等量级的降重收益
4. 若此时迁 Nuxt，新增的主要是 Nuxt runtime、目录约束与构建链复杂度，而不是新的复用边界
5. 对未来 `app-console-mobile` 而言，保留平台适配层优先、而不是桌面壳先向 Nuxt 收敛，仍然更稳妥

因此，本规格实施后的阶段性结论是：

- Web 继续保留 `Nuxt`
- Desktop 继续保留 `Vite + Vue Router + Tauri`
- 三端复用继续以 `console-core`、`console-platform`、`console-ui` 为主轴推进
- 桌面壳迁移 Nuxt 暂不立项

### 未来可以重新评估的条件

只有当以下条件同时满足时，才建议重新评估桌面端迁移到 Nuxt：

1. 共享客户端层已经建立
2. 大部分 console 页面已经从 `site-console` 壳中抽离
3. 桌面端剩余的 Tauri 专属能力主要集中在少量 adapter 中
4. 迁移到 Nuxt 能明显减少桌面端样板代码，而不是只增加运行时复杂度

若届时满足条件，则可以把桌面端改为：

- `Nuxt SPA + Tauri`

但这个动作应是“第二阶段收敛壳层”，而不是“第一阶段解决复用问题”的起点。

## 迁移顺序建议

### 阶段 1：抽共享核心

1. 以 `console-core` 为核心承载平台无关的状态模型、筛选逻辑、分页逻辑与错误处理
2. 将页面中可复用的业务逻辑持续收敛到 `console-core`
3. 保持共享逻辑不直接依赖 `navigateTo`、`useState`、`useRequestEvent` 等 Nuxt API

### 阶段 2：拆分 SSR / BFF 与独立 app 后端能力

1. 识别 `site-console/server/*` 中哪些逻辑属于 SSR / BFF
2. 识别哪些逻辑属于独立 app 可共用后端能力
3. 将后者逐步迁移或沉淀到 `service-internal`
4. 保留 `site-console` 的同源认证、首屏聚合与页面级服务端控制能力

### 阶段 3：抽共享 UI

1. 抽离 `YamlEditor`、筛选面板、详情编辑区等共享组件
2. 抽离页面区块，而不是一开始就追求完整页面 100% 共享
3. 逐步把 `site-console` 与 `app-console-desktop` 的重复页面收敛到共享组件组合

### 阶段 4：建设平台适配器

1. 为 toast、router、session、storage、api 注入定义抽象接口
2. `site-console` 与桌面端分别提供实现
3. 消除共享页面中对平台运行时 API 的硬编码

### 阶段 5：按页面迁移

建议优先迁移：

1. `YamlEditor`
2. `hearthstone/tag`
3. `hearthstone/set`
4. `hearthstone/announcement`
5. `hearthstone/data-source`
6. `magic/announcement`

这些页面当前重复度高、复杂度中等、复用收益直接。

### 阶段 6：再评估桌面壳

在共享层和适配器稳定后，再比较：

- 保留 `Vite + Vue Router`
- 迁移为 `Nuxt SPA + Tauri`

届时再做壳层收敛决策，成本和风险都会更可控。

## 风险与约束

### 1. 共享层抽象过早可能导致接口失真

若在没有梳理页面共性的前提下直接设计大而全的共享层，容易形成新的抽象债务。

因此应按“先共享高重复页面块，再提升到整页复用”的顺序推进。

### 2. `site-console` 的服务端能力不能误入共享客户端层

共享层必须避免直接依赖：

- `#db`
- `#schema`
- `#model` 的 Nuxt alias 形式
- `useRequestEvent`
- server-only ORPC 实现

必要时应改成工作区包的显式导入路径。

### 3. SSR / BFF 与通用业务后端若不拆开，会继续互相污染

若 `site-console` 继续同时承载：

- 页面 SSR 专属能力
- 独立 app 共用业务后端能力

则后续会继续出现：

- 页面层与服务层一起迁不动
- Desktop / Mobile 需要绕过 `site-console`
- `service-internal` 无法成为真正稳定的独立 app 后端入口

因此这条边界必须在迁移早期明确。

### 4. 移动端壳尚未确定

由于 `app-console-mobile` 还不存在，移动端的实际技术选型仍有不确定性。

因此本次设计必须优先保证共享层对平台壳中立，而不能提前绑定到 Nuxt。

## 验收标准

本提案被接受时，应形成以下明确结论：

1. 当前不应立即把 `app-console-desktop` 迁移为 Nuxt
2. 应优先建设平台无关的 console 共享前端层
3. `site-console` 应保留 SSR / BFF 所需的薄后端能力
4. 独立 app 共用的后端能力应逐步收口到 `service-internal`
5. `site-console`、`app-console-desktop`、`app-console-mobile` 的平台边界应被显式定义
6. 后续实施应按“核心逻辑 -> SSR / BFF 与后端拆分 -> 共享 UI -> 平台适配 -> 页面迁移 -> 壳层复评”的顺序推进

## 决策结论

本次结论为：

- **不建议现在为了三端复用而直接把当前 Tauri 桌面端改成 Nuxt**
- **建议先抽离共享前端核心与共享 UI，并同时明确 `site-console` 的 SSR / BFF 角色与 `service-internal` 的独立 app 后端角色**
- **在这两条边界稳定后，再在第二阶段重新评估桌面壳是否迁移到 Nuxt**

这样才能同时服务于 `site-console`、`app-console-desktop` 与未来 `app-console-mobile`，并避免把当前网页壳层耦合继续扩散到桌面端和移动端。
