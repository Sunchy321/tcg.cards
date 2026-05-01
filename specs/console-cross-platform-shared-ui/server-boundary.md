# console 服务端边界清单

## 1. 目标

本清单用于完成本规格计划中的第 4 步：拆分 `site-console` 的 SSR / BFF 能力与 `service-internal` 的独立 app 后端能力。

本清单回答四个问题：

1. 当前 `site-console/server/*` 中哪些职责必须留在站点侧
2. 哪些职责应迁移到 `service-internal`
3. 哪些职责适合采用“入口留在站点，执行迁到服务”的双层结构
4. 当前仓库里哪些模块已经出现重复，足以支持收口判断

## 2. 当前现状总结

### 2.1 `site-console` 当前承担两类混合职责

`apps/site-console/server/*` 当前同时承担：

1. 面向网页 SSR 的站点侧职责
2. 独立 app 也需要消费的通用管理后端职责

这两类职责继续混放，会直接带来以下问题：

- 页面壳层与通用后端无法独立迁移
- Desktop / Mobile 需要绕过 `site-console`
- `service-internal` 无法成为真正稳定的独立 app 后端入口

### 2.2 `service-internal` 已经具备初始后端收口形态

`apps/service-internal/src/index.ts` 已经直接提供：

- `/auth/*`
- `/rpc/*`

其 ORPC 结构已经与 `site-console/server/orpc/*` 对齐。

当前已确认在两边同时存在的模块包括：

- `magic/announcement.ts`
- `hearthstone/announcement.ts`
- `hearthstone/set.ts`
- `hearthstone/tag.ts`
- 对应的 `index.ts` / `service.ts` 入口拼装

这说明至少这批通用管理 API 已经具备收口到 `service-internal` 的现实基础。

## 3. 边界分类

### 3.1 保留在 `site-console` 的能力

这类能力依赖浏览器请求上下文、Nuxt SSR 或站点级页面行为，不适合直接迁到 `service-internal`。

| 模块 | 当前文件 | 结论 | 理由 |
|------|------|------|------|
| 同源认证入口 | `apps/site-console/server/routes/auth/[...].ts` | 保留在 `site-console` | 该文件本质上是同源转发层，负责把浏览器认证请求转发到内部服务，属于典型 BFF / 站点入口能力 |
| 浏览器 RPC 入口 | `apps/site-console/server/routes/rpc/[...].ts` | 保留在 `site-console` | 这是浏览器同源访问的入口，后续即使底层执行迁到 `service-internal`，站点侧入口仍然有保留价值 |
| 页面级 SSR 聚合 | 未来新增或收敛后的 `site-console/server/*` 页面聚合逻辑 | 保留在 `site-console` | 依赖 cookie、header、URL、缓存策略、重定向策略，天然属于站点 BFF |

补充说明：

1. 这里的“保留”不等于继续保留全部业务实现
2. 这里保留的是浏览器入口、请求上下文控制和页面级服务端编排

### 3.2 迁移到 `service-internal` 的能力

这类能力不依赖网页 SSR 请求上下文，且独立 app 也需要直接消费，应收口为稳定的内部服务能力。

| 模块 | 当前文件 | 结论 | 理由 |
|------|------|------|------|
| Magic 公告 CRUD | `apps/site-console/server/orpc/magic/announcement.ts` | 迁移到 `service-internal` | 已经在 `apps/service-internal/src/orpc/magic/announcement.ts` 出现重复实现，属于典型通用管理 API |
| Hearthstone 公告 CRUD | `apps/site-console/server/orpc/hearthstone/announcement.ts` | 迁移到 `service-internal` | 已经在 `apps/service-internal/src/orpc/hearthstone/announcement.ts` 出现重复实现 |
| Hearthstone Set 管理 | `apps/site-console/server/orpc/hearthstone/set.ts` | 迁移到 `service-internal` | 已经在 `apps/service-internal/src/orpc/hearthstone/set.ts` 出现重复实现 |
| Hearthstone Tag 管理 | `apps/site-console/server/orpc/hearthstone/tag.ts` | 迁移到 `service-internal` | 已经在 `apps/service-internal/src/orpc/hearthstone/tag.ts` 出现重复实现 |
| Magic 数据源策略快照 | `apps/site-console/server/orpc/magic/data-source.ts` | 迁移到 `service-internal` | 该模块当前不依赖 SSR 请求上下文，也不是页面专属聚合，适合作为通用管理 API |

补充说明：

1. 这批模块应以 `service-internal` 为单一主实现
2. `site-console` 后续若仍需同源访问，应改由站点侧 BFF 入口转发或聚合，而不是继续保留完整执行实现

### 3.3 采用“入口留站点，执行迁服务”的能力

这类能力通常既有浏览器同源入口需求，又有明显的独立 app 复用价值。最合适的结构是：

- 浏览器入口保留在 `site-console`
- 主要业务执行迁到 `service-internal`

| 模块 | 当前文件 | 结论 | 理由 |
|------|------|------|------|
| Hearthstone hsdata 数据源状态与导入 | `apps/site-console/server/orpc/hearthstone/data-source/hsdata.ts` | 双层结构 | 浏览器页可继续走同源 `/rpc`，但导入与投影执行链不应长期留在站点侧 |
| Hearthstone hsdata 导入实现 | `apps/site-console/server/lib/hearthstone/hsdata-import.ts` | 执行迁到 `service-internal` | 属于通用后台导入逻辑，不依赖 SSR 请求上下文 |
| Hearthstone hsdata 投影实现 | `apps/site-console/server/lib/hearthstone/hsdata-project.ts` | 执行迁到 `service-internal` | 属于通用后台投影逻辑，不依赖 SSR 请求上下文 |
| Hearthstone 图片导入与导出 | `apps/site-console/server/orpc/hearthstone/image.ts` | 双层结构 | 浏览器上传入口可保留站点侧，但核心图片处理与写库 / 写 R2 流程应迁服务 |
| Hearthstone 图片处理实现 | `apps/site-console/server/lib/hearthstone/card-image.ts` | 执行迁到 `service-internal` | 属于通用后台处理能力，独立 app 也可直接复用 |
| Magic 规则管理 API | `apps/site-console/server/orpc/magic/rule.ts` | 双层结构 | 页面入口可继续走同源，但规则导入、重匹配、审查等执行逻辑不应长期留站点侧 |
| Magic 文档导入 / 审查 / 历史实现 | `apps/site-console/server/lib/magic/document/*` | 执行迁到 `service-internal` | 这些逻辑本质上是通用业务执行，不依赖浏览器 SSR 请求上下文 |

补充说明：

这类模块后续最推荐的形态是：

1. `service-internal` 提供稳定业务后端 API
2. `site-console` 的 `/rpc` 入口根据需要做代理、裁剪或聚合
3. Desktop / Mobile 直接消费 `service-internal`

### 3.4 清理或过渡中的能力

| 模块 | 当前文件 | 结论 | 理由 |
|------|------|------|------|
| 旧站点侧 auth 实例 | `apps/site-console/server/lib/auth/index.ts` | 倾向清理或仅保留过渡引用 | 当前认证主服务已由 `service-internal` 直接提供，站点侧完整 auth 实例不应再继续作为长期主实现 |
| 站点侧 ORPC 拼装入口 | `apps/site-console/server/orpc/index.ts`、`service.ts` | 过渡保留 | 在站点侧仍存在本地执行模块期间需要保留，后续应收敛为 BFF 入口或转发层 |

## 4. 推荐迁移顺序

### 4.1 第一批：消除已存在的重复主实现

优先收口到 `service-internal`：

1. `magic/announcement`
2. `hearthstone/announcement`
3. `hearthstone/set`
4. `hearthstone/tag`

理由：

- 两边已经存在重复实现
- 这批模块属于标准管理 CRUD
- 与 SSR 请求上下文耦合最弱

### 4.2 第二批：迁移后台执行链

在第一批稳定后继续迁移：

1. `hearthstone/data-source/hsdata`
2. `hearthstone/image`
3. `magic/rule`
4. `server/lib/hearthstone/*`
5. `server/lib/magic/document/*`

理由：

- 这批能力更偏后台执行与长流程
- 独立 app 复用价值高
- 与 SSR 页面壳的耦合主要体现在入口，而不是执行逻辑本身

### 4.3 最后收敛站点侧 ORPC 入口

当共享后端主实现收口完成后，再逐步把 `site-console/server/orpc/*` 收敛为：

1. SSR / BFF 聚合逻辑
2. 面向浏览器的同源入口
3. 必要的请求裁剪、权限补充与错误映射

而不是继续承担完整业务执行。

## 5. 结论

本次第 4 步的边界结论为：

1. `site-console` 必须保留同源 `/auth`、同源 `/rpc` 和 SSR / BFF 所需的薄后端能力
2. `announcement / set / tag / data-source policy` 这类通用管理 API 应收口到 `service-internal`
3. `hsdata`、`image`、`magic rule` 这类复杂模块应采用“站点入口保留、业务执行迁服务”的双层结构
4. `site-console/server/*` 后续应逐步从“业务执行层”收敛为“SSR / BFF 层”
