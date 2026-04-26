# console-app 迁移设计草案

## 1. 背景

当前仓库中已经存在两个相关项目：

- `apps/site-console`：基于 Nuxt 的现有管理网站，已经承载登录、公告、规则、数据源、导入、图片处理等功能
- `apps/app-console-desktop`：已经初始化的 Tauri 桌面端项目，目前仍是空白宿主

当前问题不再是“是否做桌面端”，而是“如何在不中断现有管理功能的前提下，把 `site-console` 的能力逐步迁移到 `console-app`”。

由于 `site-console` 同时混合了：

- 管理前端页面
- Nuxt 内嵌认证
- ORPC 服务端接口
- 本地脚本入口

因此迁移不能简单理解为“把 `.vue` 页面复制到 Tauri 项目中”。如果直接逐页搬运，会立刻遇到以下问题：

- Nuxt 页面生命周期、路由、插件体系与 Vite + Vue + Tauri 宿主不同
- 当前页面大量直接依赖 `useNuxtApp()`、`$orpc`、`better-auth`、Nuxt middleware
- 部分能力实际上依赖本地脚本、Git 仓库、文件系统和大文件处理
- 后续还需要支持 `app-console-mobile`，因此不能把桌面端实现写成不可复用的一次性代码

本提案的目标是为 `console-app` 制定一条**可持续、可回退、可逐步验证**的迁移路线。

## 2. 目标

- 以 `apps/app-console-desktop` 作为第一个正式宿主，开始落地 `console-app`
- 参考 `site-console` 的现有功能，制定逐步迁移全部功能的实施顺序
- 在迁移过程中优先抽离共享层，而不是直接复制页面
- 保证 `site-console` 在迁移期间仍可继续作为现有管理入口运行
- 为后续 `app-console-mobile` 预留共享能力层

## 3. 非目标

- 本提案不在第一阶段直接废弃 `site-console`
- 本提案不要求第一阶段同步完成 `app-console-mobile`
- 本提案不要求直接把 Nuxt 服务端逻辑整体搬入桌面端
- 本提案不要求一步迁完所有页面

## 4. 当前功能盘点

基于当前 `site-console` 代码，已有功能大致可分为以下几组。

### 4.1 基础壳层

- 登录页
- 首页
- 管理布局
- 用户页
- 设置页
- 游戏入口页

这些页面本身复杂度不高，但依赖：

- `better-auth`
- 全局登录态
- 管理布局
- 页面级权限判断

### 4.2 Magic 管理功能

- 公告管理
- 规则列表
- 规则查看
- 规则变更比对
- 数据源快照
- 卡牌页、系列页、赛制页入口

其中：

- `magic/rule/index`
- `magic/rule/view`
- `magic/rule/changes`
- `magic/data-source`

属于复杂度较高的模块。

### 4.3 Hearthstone 管理功能

- 公告管理
- 系列管理
- 标签管理
- 数据源状态
- 数据导入与投影
- 图片导入与处理

其中：

- `hearthstone/tag`
- `hearthstone/data-source`
- `hearthstone/data-import`
- `hearthstone/image`

属于复杂度较高或强本地耦合模块。

### 4.4 服务端接口与本地脚本

当前 `site-console` 同时包含：

- `server/orpc/*`：当前管理接口
- `server/lib/*`：导入、规则、图片等领域逻辑
- `scripts/hsdata-upload.ts`
- `scripts/hearthstone-image-import.ts`

这些能力未来不能直接原样留在桌面前端中，而应分别归位到：

- 远端管理 API
- 桌面能力桥接
- 桌面任务执行链

## 5. 迁移原则

### 5.1 先拆层，再迁页

不建议直接按照页面顺序把 `site-console` 的 `.vue` 文件逐个复制到 `app-console-desktop`。

更合理的顺序是：

1. 抽离认证与 API client
2. 抽离共享布局、路由模型、页面状态模型
3. 抽离能力接口
4. 再逐页迁移 UI

### 5.2 先迁轻页，再迁复杂模块，再迁本地重任务

建议迁移顺序固定为：

- 先迁基础壳层
- 再迁公告、系列、标签等常规管理页
- 再迁规则、数据源等复杂读写页
- 最后迁本地重任务页与脚本

### 5.3 保持 `site-console` 可运行，采用绞杀式替换

迁移期间不建议同时重写所有功能并一次性切换。

更稳的方式是：

- 每完成一组能力，就让 `app-console-desktop` 接管该组功能
- `site-console` 继续承接尚未迁移的能力
- 直到桌面端具备完整替代能力后，再决定网页端如何收口为 `site-admin`

### 5.4 前端共享优先于宿主复制

后续桌面端完整包含手机端能力，因此不应做成两套完全独立实现。

迁移时应优先形成以下共享结构：

- `packages/app-console`：页面状态、领域模型、管理路由、组合式逻辑
- `packages/app-console-capabilities`：宿主能力接口与错误模型
- `packages/app-api-client`：认证、请求、错误处理、轮询

## 6. 目标代码结构

建议迁移后的结构逐步演进为：

```text
apps/
  app-console-desktop/
  app-console-mobile/
  site-admin/

packages/
  app-console/
  app-console-capabilities/
  app-api-client/
```

其中职责建议如下：

- `app-console-desktop`：桌面宿主、桌面能力实现、桌面专属入口
- `app-console-mobile`：移动宿主、移动能力实现、移动端特化导航
- `site-admin`：轻量网页端入口
- `packages/app-console`：共享页面模块、共享领域逻辑、共享路由定义
- `packages/app-console-capabilities`：文件、Git、工具调用、上传、通知等能力抽象
- `packages/app-api-client`：认证与远端管理接口访问

## 7. 分阶段迁移策略

### 阶段 0：迁移基建落位

目标：

- 让 `app-console-desktop` 从空白宿主变成可承载业务的管理应用骨架

内容：

- 选定桌面端前端栈与 UI 方案
- 建立路由、布局、主题、通知、错误边界
- 抽离共享登录态与 API client
- 定义 capability 接口与桌面默认实现

完成后，桌面端应至少具备：

- 登录
- 导航
- 会话保持
- 基础页面容器

### 阶段 1：迁移基础壳层与轻页面

目标：

- 先让桌面端具备“能用”的管理入口

优先迁移：

- 首页
- 用户页
- 设置页
- Magic / Hearthstone 入口页

原因：

- 页面简单
- 可尽快验证路由、权限、布局和登录态
- 可作为后续复杂模块的宿主壳层

### 阶段 2：迁移常规 CRUD 模块

目标：

- 迁移不依赖本地重能力、但已经具备完整业务价值的常规管理页

建议顺序：

- Magic 公告
- Hearthstone 公告
- Hearthstone 系列
- Hearthstone 标签

这批页面的价值在于：

- 可验证表格、筛选、详情弹层、表单编辑、保存、删除等基础交互
- 可沉淀通用页面模式，供后续复杂页面复用

### 阶段 3：迁移复杂读写模块

目标：

- 接管当前最复杂但仍主要依赖远端数据的管理页面

建议顺序：

- Magic 规则列表
- Magic 规则查看
- Magic 规则变更
- Magic 数据源
- Hearthstone 数据源

这一步重点不在“把页面搬过去”，而在：

- 抽离共享状态模型
- 抽离复杂树形视图与编辑器封装
- 把 Nuxt 依赖替换为宿主无关实现

### 阶段 4：迁移桌面专属重任务

目标：

- 把最适合桌面端承接的能力真正迁入桌面端

建议顺序：

- Hearthstone 图片导入
- hsdata 本地仓库上传
- hsdata 导入与投影
- 其他本地文件、Git、第三方工具相关流程

这一步是 `console-app` 相比 `site-console` 最关键的价值升级。

重点是：

- 前端页面只表达任务与状态
- 本地执行通过 capability / Tauri command 进入桌面桥接
- 长任务状态统一接入任务系统，而不是继续直接在页面里跑大流程

### 阶段 5：网页端收口与功能归位

目标：

- 在桌面端完成主要迁移后，重新定义网页端剩余职责

建议结果：

- `site-console` 逐步收口为 `site-admin`
- 网页端仅保留 `light` 能力
- 桌面端承接全部 `full` 能力
- 中间共享层继续服务后续 `app-console-mobile`

## 8. 功能迁移优先级建议

建议按以下优先级推进：

### P0 必须先做

- 认证模型迁移
- API client 抽离
- 管理布局与路由骨架
- 桌面 capability 抽象

### P1 高价值且适合早迁

- 首页
- 用户页
- 设置页
- 游戏入口页
- 公告管理
- 系列管理
- 标签管理

### P2 复杂但必要

- Magic 规则系列页面
- Magic 数据源
- Hearthstone 数据源

### P3 桌面价值核心

- Hearthstone 图片导入
- hsdata 上传
- hsdata 导入与投影

## 9. 风险与控制点

### 9.1 最大风险

最大的风险不是迁移速度，而是迁移时把桌面端直接写成 `site-console` 的复制品。

如果发生这种情况，会出现：

- 共享层抽不出来
- 以后手机端无法复用
- 本地能力与页面逻辑重新耦合
- 远端 API 与桌面能力边界混乱

### 9.2 控制点

因此建议每个迁移阶段都强制检查以下问题：

- 这个模块有没有新增 Nuxt 专属依赖
- 这个模块是否可以沉淀到共享层
- 这个功能属于远端 API 还是桌面 capability
- 这个页面未来手机端是否可复用部分逻辑

## 10. 结论

`console-app` 的迁移不应理解为“把 `site-console` 重写到 Tauri”，而应理解为：

- 以 `app-console-desktop` 为第一个宿主
- 逐步把 `site-console` 的前端能力、管理模型、本地重任务能力拆解重组
- 最终形成“共享管理核心 + 多宿主承载”的结构

建议下一步按本提案配套的实施计划，先完成阶段 0 与阶段 1。
