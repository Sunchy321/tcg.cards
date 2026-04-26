# console-app 迁移清单

## 1. 目标

本清单用于完成 `P0` 的第一项工作：盘点 `site-console` 当前全部页面、接口与脚本，并为后续迁移给出明确归类。

清单目标不是描述最终实现，而是回答三个问题：

- 现在有哪些功能需要迁移
- 它们依赖哪些接口或本地能力
- 它们应该落到哪个迁移阶段

## 2. 页面清单

### 2.1 基础壳层页面

| 路由 | 文件 | 作用 | 主要依赖 | 复杂度 | 目标阶段 |
|------|------|------|------|------|------|
| `/` | `apps/site-console/app/pages/index.vue` | 首页跳转与会话入口 | `authClient` | 低 | P2 |
| `/login` | `apps/site-console/app/pages/login.vue` | 用户登录 | `better-auth` | 中 | P0 / P1 |
| `/user` | `apps/site-console/app/pages/user/index.vue` | 用户管理入口 | 登录态、角色 | 低 | P2 |
| `/settings` | `apps/site-console/app/pages/settings/index.vue` | 设置页 | 登录态 | 低 | P2 |
| `admin layout` | `apps/site-console/app/layouts/admin.vue` | 主导航、游戏切换、退出登录 | `authClient`、角色、导航结构 | 中 | P0 / P1 |

### 2.2 Magic 页面

| 路由 | 文件 | 作用 | 主要依赖接口 | 复杂度 | 目标阶段 |
|------|------|------|------|------|------|
| `/magic` | `apps/site-console/app/pages/magic/index.vue` | Magic 概览入口 | 会话、导航 | 低 | P2 |
| `/magic/announcement` | `apps/site-console/app/pages/magic/announcement/index.vue` | 公告管理 | `magic.announcement.*` | 中 | P3 |
| `/magic/card` | `apps/site-console/app/pages/magic/card/index.vue` | 卡牌入口占位 | 导航 | 低 | P2 或后置 |
| `/magic/data-source` | `apps/site-console/app/pages/magic/data-source/index.vue` | 数据源快照与状态 | `magic.dataSource.*` | 高 | P4 |
| `/magic/format` | `apps/site-console/app/pages/magic/format/index.vue` | 赛制入口占位 | 导航 | 低 | P2 或后置 |
| `/magic/rule` | `apps/site-console/app/pages/magic/rule/index.vue` | 规则版本列表与上传/同步 | `magic.rule.*` | 高 | P4 |
| `/magic/rule/changes` | `apps/site-console/app/pages/magic/rule/changes.vue` | 规则比对与审查 | `magic.rule.*` | 高 | P4 |
| `/magic/rule/view` | `apps/site-console/app/pages/magic/rule/view.vue` | 规则树查看 | `magic.rule.get`、`magic.rule.getNodes` | 高 | P4 |
| `/magic/set` | `apps/site-console/app/pages/magic/set/index.vue` | 系列入口占位 | 导航 | 低 | P2 或后置 |

### 2.3 Hearthstone 页面

| 路由 | 文件 | 作用 | 主要依赖接口/能力 | 复杂度 | 目标阶段 |
|------|------|------|------|------|------|
| `/hearthstone` | `apps/site-console/app/pages/hearthstone/index.vue` | Hearthstone 概览入口 | 会话、导航 | 低 | P2 |
| `/hearthstone/announcement` | `apps/site-console/app/pages/hearthstone/announcement/index.vue` | 公告管理 | `hearthstone.announcement.*` | 中 | P3 |
| `/hearthstone/data-import` | `apps/site-console/app/pages/hearthstone/data-import/index.vue` | hsdata 导入与投影 | `hearthstone.dataSource.hsdata.*` | 高 | P5 |
| `/hearthstone/data-source` | `apps/site-console/app/pages/hearthstone/data-source/index.vue` | hsdata 状态与归档概览 | `hearthstone.dataSource.hsdata.*` | 高 | P4 |
| `/hearthstone/image` | `apps/site-console/app/pages/hearthstone/image/index.vue` | 图片导入与处理 | `hearthstone.image.*`、浏览器导入工具 | 高 | P5 |
| `/hearthstone/set` | `apps/site-console/app/pages/hearthstone/set/index.vue` | 系列管理 | `hearthstone.set.*` | 中高 | P3 |
| `/hearthstone/tag` | `apps/site-console/app/pages/hearthstone/tag/index.vue` | 标签管理 | `hearthstone.tag.*` | 高 | P3 |

### 2.4 组件与组合式依赖

这部分不是独立页面，但对迁移影响明显：

| 文件 | 作用 | 迁移建议 |
|------|------|------|
| `apps/site-console/app/components/YamlEditor.vue` | YAML 编辑能力 | 抽成共享组件，优先在 P3 前处理 |
| `apps/site-console/app/components/RuleTreeItem.vue` | 规则树节点渲染 | 跟随 Magic 规则模块在 P4 抽离 |
| `apps/site-console/app/composables/auth.ts` | 认证 client 与角色判断 | 在 P1 抽离成宿主无关认证层 |
| `apps/site-console/app/composables/game.ts` | 当前游戏切换与标签 | 在 P1 抽离成共享导航层 |
| `apps/site-console/app/composables/hearthstone-hsdata.ts` | hsdata 展示辅助格式化 | 在 P4 / P5 继续复用或下沉到共享工具层 |
| `apps/site-console/app/plugins/orpc.ts` | ORPC client 注入 | 在 P1 替换为共享 API client |
| `apps/site-console/app/middleware/auth.global.ts` | 全局认证中间件 | 在 P0 / P1 改写为桌面端路由守卫 |

## 3. 接口清单

### 3.1 当前接口结构

当前 `site-console` 的服务端接口主要由两部分组成：

- ORPC：`apps/site-console/server/orpc/*`
- Auth API：`apps/site-console/server/routes/api/auth/[...].ts`

路由总入口为：

- `apps/site-console/server/orpc/service.ts`

当前顶层分组为：

- `magic`
- `hearthstone`

### 3.2 Magic 接口分组

| 分组 | 文件 | 页面调用方 | 后续归属 |
|------|------|------|------|
| `magic.announcement` | `apps/site-console/server/orpc/magic/announcement.ts` | `magic/announcement` | 远端管理 API |
| `magic.dataSource` | `apps/site-console/server/orpc/magic/data-source.ts` | `magic/data-source` | 远端管理 API |
| `magic.rule` | `apps/site-console/server/orpc/magic/rule.ts` | `magic/rule`、`magic/rule/view`、`magic/rule/changes` | 远端管理 API，部分长任务后续可接任务系统 |

### 3.3 Hearthstone 接口分组

| 分组 | 文件 | 页面调用方 | 后续归属 |
|------|------|------|------|
| `hearthstone.announcement` | `apps/site-console/server/orpc/hearthstone/announcement.ts` | `hearthstone/announcement` | 远端管理 API |
| `hearthstone.set` | `apps/site-console/server/orpc/hearthstone/set.ts` | `hearthstone/set` | 远端管理 API |
| `hearthstone.tag` | `apps/site-console/server/orpc/hearthstone/tag.ts` | `hearthstone/tag` | 远端管理 API |
| `hearthstone.image` | `apps/site-console/server/orpc/hearthstone/image.ts` | `hearthstone/image` | 查询/状态接口保留远端，导入执行链转桌面能力或任务系统 |
| `hearthstone.dataSource.hsdata` | `apps/site-console/server/orpc/hearthstone/data-source/hsdata.ts` | `hearthstone/data-source`、`hearthstone/data-import` | 状态查询保留远端，导入与投影执行链后续接桌面能力或任务系统 |

### 3.4 认证接口

| 接口 | 文件 | 当前作用 | 迁移建议 |
|------|------|------|------|
| `/api/auth/[...]` | `apps/site-console/server/routes/api/auth/[...].ts` | `better-auth` 登录、会话、登出 | 保持远端认证服务，桌面端改用独立 auth client 消费 |

## 4. 脚本与本地能力清单

### 4.1 现有脚本

| 脚本 | 文件 | 当前作用 | 本地依赖 | 目标阶段 |
|------|------|------|------|------|
| hsdata 上传 | `apps/site-console/scripts/hsdata-upload.ts` | 读取本地 hsdata 仓库并上传 XML 到 R2 | 本地 Git 仓库、文件系统、R2 上传 | P5 |
| Hearthstone 图片导入 | `apps/site-console/scripts/hearthstone-image-import.ts` | 处理图片压缩、归档与导入流程 | 本地文件系统、临时目录、图片处理 | P5 |

### 4.2 当前浏览器侧辅助工具

| 工具 | 文件 | 当前作用 | 迁移建议 |
|------|------|------|------|
| 浏览器图片导入工具 | `apps/site-console/app/utils/hearthstone-image-import.ts` | 在浏览器内准备导入压缩包 | 桌面端优先替换为原生文件能力；必要时保留浏览器兼容实现 |
| Zip 归一化工具 | `apps/site-console/app/utils/hearthstone-image-import-zip.ts` | 处理压缩包条目 | 可下沉为共享工具 |

## 5. 迁移结论

基于当前盘点，后续迁移顺序应明确为：

1. 先迁认证、布局、路由与 API client
2. 再迁基础页面与常规 CRUD 页面
3. 再迁规则、数据源等复杂读写页
4. 最后迁移图片导入、仓库上传、导入投影等本地重任务

其中需要特别保持边界清晰的点包括：

- 认证继续走远端服务，不嵌入桌面本地
- 数据查询与保存继续优先走远端管理 API
- 本地文件、Git、工具链流程通过桌面 capability 进入
- 长任务最终应进入统一任务系统，而不是继续作为页面内联流程长期存在
