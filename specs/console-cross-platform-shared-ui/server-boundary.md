# console 服务端边界清单

## 1. 目标

本清单用于完成本规格计划中的第 4 步：拆分 `site-console` 的 SSR / BFF 能力与 `service-internal` 的独立 app 后端能力。

本清单回答四个问题：

1. 当前 `site-console/server/*` 中哪些职责必须留在站点侧
2. 哪些职责属于 `app-*` 共用后端，应由 `service-internal` 承担
3. 哪些共享逻辑应抽到包内复用，而不是通过 HTTP 复用
4. 当前仓库里哪些模块已经出现重复，足以支持抽取共享模块

## 2. 当前现状总结

### 2.1 目标边界

本规格当前确认的运行时边界是：

1. `site-*` 的后端请求应在各自 Worker 内本地处理
2. `app-*` 的后端请求统一走 `service-*`
3. 两边共享能力时，应共享代码模块，不共享运行时路由

如果继续把 `site-*` 设计成“浏览器入口留站点、业务执行走外部 service”的结构，会直接带来以下问题：

- 站点首屏与登录态链路增加网络跳转与代理故障面
- 浏览器 cookie、压缩、重定向与同源语义更容易出现环境差异
- `service-internal` 会重新变成站点运行时的隐式依赖
- 共享边界会退化成“共享 HTTP 路由”而不是“共享代码模块”

### 2.2 当前冲突点

当前仓库里已经存在以下与目标边界冲突的实现或表述：

- `site-console` 的 `/auth/*` 仍被描述为转发到 `service-internal`
- `server-boundary.md` 旧版把多类能力定义为“入口留站点，执行迁服务”
- `service-internal-auth` proposal 旧版把站点同源转发作为推荐方案

这些内容需要统一修正为：

1. `site-*` 保留本地后端入口与本地执行
2. `service-internal` 只服务于 `app-*`
3. 共享逻辑通过 `packages/*` 抽取

## 3. 边界分类

### 3.1 保留在 `site-console` 的能力

这类能力依赖浏览器请求上下文、Nuxt SSR 或站点级页面行为，不适合直接迁到 `service-internal`。

| 模块 | 当前文件 | 结论 | 理由 |
|------|------|------|------|
| 同源认证入口 | `apps/site-console/server/routes/auth/[...].ts` | 保留在 `site-console` 且本地执行 | 站点认证属于浏览器同源会话入口，应直接在站点 Worker 内处理，不应代理到外部 service |
| 浏览器 RPC 入口 | `apps/site-console/server/routes/rpc/[...].ts` | 保留在 `site-console` 且本地执行 | 站点后端请求应在本地 Worker 内完成，不能把浏览器请求再转发到外部内部服务 |
| 页面级 SSR 聚合 | 未来新增或收敛后的 `site-console/server/*` 页面聚合逻辑 | 保留在 `site-console` | 依赖 cookie、header、URL、缓存策略、重定向策略，天然属于站点本地后端 |
| 站点页面直接依赖的领域 API | `apps/site-console/server/orpc/*` | 保留在 `site-console` | 如果站点页面需要这些能力，应本地装配共享逻辑，而不是把 HTTP 请求路由到 `service-internal` |

补充说明：

1. 这里的“保留”不仅是入口保留，也包括本地执行保留
2. 可共享的是内部模块、schema、仓储与服务逻辑，不是跨服务转发链路

### 3.2 迁移到 `service-internal` 的能力

这类能力不面向网页站点浏览器请求，而是面向独立 app 的统一服务能力。

| 模块 | 当前文件 | 结论 | 理由 |
|------|------|------|------|
| `app-*` 认证与 session 判定 | `apps/service-internal/src/index.ts` 的 `/auth/*` | 保留在 `service-internal` | 独立 app 需要统一认证服务，但不应反向成为 `site-*` 的认证后端 |
| `app-*` 共用管理 API | `apps/service-internal/src/orpc/*` | 保留在 `service-internal` | 这些接口属于独立 app 直接消费的服务能力 |
| `app-*` 长任务与后台处理 | 后续 `service-internal` 任务链 | 保留在 `service-internal` | 更适合作为统一服务后端存在 |

补充说明：

1. `service-internal` 是 `app-*` 的统一后端，不是 `site-*` 的下游执行面
2. `site-*` 如需相同能力，应复用共享代码，在自己的 Worker 内本地装配

### 3.3 应抽到共享包复用的能力

这类能力同时被 `site-*` 与 `app-*` 需要，但不应通过跨服务 HTTP 复用。最合适的结构是：

- 共享逻辑下沉到 `packages/*`
- `site-*` 在自己的 Worker 中本地装配
- `service-internal` 在自己的 Worker 中本地装配

| 模块 | 当前文件 | 结论 | 理由 |
|------|------|------|------|
| 公告、Set、Tag 领域逻辑 | `apps/site-console/server/orpc/*` 与 `apps/service-internal/src/orpc/*` 的重复部分 | 抽到共享包 | 两边都需要，但应共享实现模块，而不是共享 HTTP 路由 |
| `hsdata` 导入与投影逻辑 | `apps/site-console/server/lib/hearthstone/hsdata-*` | 抽到共享包 | 站点与 app 可能都需要，应拆成可复用的纯服务逻辑 |
| Hearthstone 图片处理逻辑 | `apps/site-console/server/lib/hearthstone/card-image.ts` | 抽到共享包 | 适合作为平台无关的处理能力，再由不同 Worker 本地装配 |
| Magic 规则导入、匹配、审查逻辑 | `apps/site-console/server/lib/magic/document/*` | 抽到共享包 | 领域执行逻辑可以复用，但站点与 service 的请求入口应继续分离 |

补充说明：

这类模块后续最推荐的形态是：

1. 共享逻辑优先沉淀到 `packages/console-api`，复杂领域逻辑后续再视情况细分
2. `site-console` 的 `/auth`、`/rpc` 在本地 Worker 中直接调用共享逻辑
3. Desktop / Mobile 通过 `service-internal` 调用相同共享逻辑

其中第一阶段应优先收敛到 `packages/console-api` 的模块为：

- `magic/announcement`
- `hearthstone/announcement`
- `hearthstone/set`
- `hearthstone/tag`

### 3.4 清理或过渡中的能力

| 模块 | 当前文件 | 结论 | 理由 |
|------|------|------|------|
| `site-console` 的 auth 代理实现 | `apps/site-console/server/routes/auth/[...].ts` | 应回收为本地 handler | 该文件不应再作为到 `service-internal` 的转发层存在 |
| 站点侧 auth 实例 | `apps/site-console/server/lib/auth/index.ts` | 保留并作为站点主实现 | `site-*` 应保留自己的认证服务，仅复用共享 auth 工厂 |
| 站点侧 ORPC 拼装入口 | `apps/site-console/server/orpc/index.ts`、`service.ts` | 保留 | 这是站点本地后端入口，不应被收敛为外部 service 转发层 |

## 4. 推荐迁移顺序

### 4.1 第一批：回收跨服务运行时依赖

优先处理：

1. 恢复 `site-console` 本地 `/auth/*` 处理
2. 清理 `site-* -> service-*` 的运行时路由依赖
3. 明确 `site-*` 与 `app-*` 的后端入口边界

理由：

- 先消除站点首屏、cookie 与代理链路的不必要故障面
- 先固定运行时边界，再抽取共享代码会更稳定

### 4.2 第二批：抽取共享服务逻辑

在第一批稳定后继续抽取：

1. `announcement / set / tag` 的重复领域逻辑
2. `hearthstone/data-source/hsdata`
3. `hearthstone/image`
4. `magic/rule`
5. `server/lib/hearthstone/*`
6. `server/lib/magic/document/*`

理由：

- 这批能力更适合沉淀为平台无关模块
- 站点与 app 都能通过本地装配复用
- 与运行时边界相比，代码抽取是后续步骤

### 4.3 最后统一装配方式

当共享逻辑稳定后，再逐步把 `site-console/server/orpc/*` 与 `service-internal/src/orpc/*` 收敛为：

1. 各自的本地入口与平台适配层
2. 对共享模块的薄装配
3. 必要的权限补充、错误映射与平台差异处理

而不是继续保留重复的业务执行实现。

## 5. 结论

本次第 4 步的边界结论为：

1. `site-*` 的后端请求必须在各自 Worker 中本地处理，不能路由到外部内部服务
2. `app-*` 统一使用 `service-*` 作为后端入口
3. 站点与 service 共享能力时，应共享代码模块，而不是共享 HTTP 路由
4. `site-console/server/*` 后续应保留为完整站点本地后端，而不是被收敛为外部 service 的转发层
