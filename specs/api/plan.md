# 统一 API 服务与 API 文档站实施计划

> 稳定的运行时边界、能力分层、命名规则和数据归属规则以 [../../docs/project-architecture.zh-CN.md](../../docs/project-architecture.zh-CN.md) 为准。本文只记录本需求的实施计划；若有冲突，以主架构文档为准。
> 设计依据见 [./design.md](./design.md)。

## TODO List

- [x] P0 创建 `packages/api` 共享包（oRPC 基础实例、机械端点工厂、magic/hearthstone catalog/fact tables/utils、registry 聚合）【机械端点部分完成；搜索定义抬升、views 扩展待做】
- [ ] P0.5 整理 `packages/model`：内联枚举抬升为命名枚举（保持校验行为不变）
- [x] P1 创建 `apps/service-api` 应用骨架（Hono worker、`/v1` 挂载、`/openapi.json`）
- [ ] P2 实现强制 API Key 鉴权中间件（Bearer 校验、enabled/过期、`allowedGames` 按路径判断）+ CORS
- [ ] P3 实现按 key 限流、统一错误体与 `requestId`
- [ ] P4 创建 `apps/site-docs` 应用骨架（Nuxt + packages/ui + hybrid routeRules）
- [ ] P5 实现参考页自建渲染（zod 内省 + Nuxt UI 组件，支持 zod 类型集 + 降级）
- [ ] P6 实现模型/枚举文档（命名枚举 key 注册表、`en`/`zhs` vue-i18n、结构检查脚本）
- [ ] P7 实现 guide/changelog（`@nuxt/content`）与文档版本化（`/v1`、`/latest`、根路径重定向）
- [ ] P8 实现 `/settings` API Key 管理（better-auth 登录、key 增删查）与测试功能（懒生成测试 key）
- [ ] P9 部署两站（wrangler、Hyperdrive、域名、构建检查）

## 目标

基于 `specs/api/design.md` 交付两个独立服务：

1. **service-api**：`api.tcg.cards`，公共只读数据 API，强制 API Key，`/v1` 版本化。
2. **site-docs**：`docs.tcg.cards`，与 API 同步版本化的 API 文档站（自建参考页 + 模型文档 + 测试功能 + key 管理）。

以及支撑两者的单一真源 `packages/api`（按游戏分目录的 oRPC routers）。

## 实施原则

- 先共享包，后两个应用；先骨架，后逻辑，最后补鉴权/限流/错误处理
- `packages/api` 的查询为 API 侧自持，游戏站点不共用、不动
- 所有共享基础设施（鉴权、限流、错误体、OpenAPI 生成、文档渲染）游戏无关，一次写好
- 鉴权/限流/错误体/CORS 作为 HTTP 边界逻辑实现于 `service-api` 消费侧，`packages/api` 保持纯路由/查询定义
- 每个阶段完成后可独立验证（构建/启动/关键路径）

## 阶段计划

| 阶段 | 目标 | 核心任务 | 验收标准 |
|------|------|----------|----------|
| P0 共享包 | 建立 `packages/api` | 创建包骨架；oRPC 基础实例；机械端点工厂（catalog/fact tables/utils 声明式生成）；magic/hearthstone 声明 + search/utils；`index.ts` 聚合 registry | 包可编译；`registry.magic`/`registry.hearthstone` 可引用。【已完成】机械端点部分（catalog/fact tables/utils）；搜索定义抬升、views 扩展为 P0 内后续项 |
| P0.5 模型整理 | 命名枚举 | 把 `packages/model` 内联枚举抬升为命名导出；保持校验行为不变 | 现有测试/typecheck 通过 |
| P1 service-api 骨架 | 可跑空服务 | Hono worker；聚合 registry → `OpenAPIHandler` 挂载 `/v1`；`/openapi.json`、`/health` | 启动无报错；`GET /openapi.json` 返回有效 spec |
| P2 鉴权 | 强制 key | API Key 中间件（Bearer、enabled、过期、`allowedGames` 按路径判断游戏）；CORS | 无 key 401；无效 key 401；越权 403；有效 key 通过 |
| P3 限流与错误 | 统一行为 | 按 key 限流（复用 `apikeys` 字段）；`X-RateLimit-*` 头；统一错误体 + `requestId` + 错误码表 | 触发限流 429 带头；错误响应含 `code`/`message`/`requestId` |
| P4 site-docs 骨架 | 可跑文档站 | Nuxt + `packages/ui`；hybrid routeRules；wrangler 配置；页面骨架（index/reference/model/guide/changelog/settings） | 启动无报错；页面风格与现有站点一致 |
| P5 参考页 | 自建渲染 | zod 内省渲染器（支持集 + 降级）；从 registry 渲染参数/返回值/错误码 | 参考页正确展示各端点；`any` 类降级为占位 |
| P6 模型文档 | 详细说明 | 命名枚举 key 注册表（从 registry 内省推导）；`en`/`zhs` 消息文件；结构检查脚本 | 模型/枚举页展示说明；缺失/孤儿 key 阻断构建 |
| P7 内容与版本化 | 完整文档站 | `@nuxt/content` guide/changelog；`/v1` 版本化路径；`/latest` 与根路径 302 重定向；版本切换器 | 文档站按版本浏览；`/latest`、根路径重定向正确 |
| P8 key 管理 + 测试 | 闭环体验 | better-auth 登录；`/settings` key 增删查；测试 key 懒生成（`docs-test`、展示式、可管理）；测试面板接入 | 登录后建 key、注入测试可用；删除后重建 |
| P9 部署 | 上线 | 两站 wrangler 部署；域名；Hyperdrive secrets；CI 构建检查 | 两个域名可访问；鉴权/限流/文档/测试符合设计 |

## 任务拆解

### P0 `packages/api` 共享包

| 序号 | 任务 | 说明 |
|------|------|------|
| 0.1 | 创建包骨架 | `package.json`（依赖 `@orpc/server`、`@tcg-cards/model`、`@tcg-cards/db`、`@tcg-cards/search`、`zod`）、`tsconfig.json`、`eslint.config.mjs` |
| 0.2 | 创建 oRPC 基础实例 | `src/orpc.ts`，供各游戏 procedure 使用 |
| 0.3 | 机械端点工厂 | `src/factory.ts`：按枚举/表/视图声明生成 constants / fact-table / view 只读 procedures（处理主键、复合主键、自定义覆盖出口） |
| 0.4 | 搜索定义抬升 | 把站点 `server/search/` 的 command-list/action 抬到 `src/{game}/search/`，站点改为从 `packages/api` 引入（site-magic/site-hearthstone 重构） |
| 0.5 | magic 声明 | `src/magic/`：声明 constants（命名枚举）、fact tables、views；编写 search 定义与 utils（random/named） |
| 0.6 | hearthstone 声明 | 同 magic，`src/hearthstone/` |
| 0.7 | registry 聚合 | `index.ts` 导出 `registry = { magic, hearthstone }` |

### P0.5 `packages/model` 命名枚举整理

| 序号 | 任务 | 说明 |
|------|------|------|
| 0.5.1 | 盘点内联枚举 | 找出 `packages/model` 中内联 `z.enum([...])` 的字段 |
| 0.5.2 | 抬升命名枚举 | 为文档/OpenAPI 需要的枚举建立命名导出（如 `rarity`、`color`、`legality`），字段引用改指命名枚举 |
| 0.5.3 | 校验回归 | 确认抬升后校验行为与类型推断不变，通过现有检查 |

### P1 `apps/service-api` 应用骨架

> 技术栈为 Hono + Wrangler（Cloudflare Worker），对齐 `service-internal` 惯例，不使用 Nuxt。

| 序号 | 任务 | 说明 |
|------|------|------|
| 1.1 | 创建应用骨架 | `package.json`（hono、`@orpc/openapi`、`@orpc/server`、`@tcg-cards/api`、`@tcg-cards/db`）、`tsconfig.json`、`eslint.config.mjs`、`wrangler.toml`（`api.tcg.cards`、Hyperdrive） |
| 1.2 | 入口与 db 注入 | `src/index.ts`（Hono 应用）、`src/env.ts`（`HYPERDRIVE` binding）；`installRuntimeBindings` + 每请求 `createDb` + `runWithDb`（复用 service-internal 模式）；`/health` |
| 1.3 | 聚合挂载 | 引入 `packages/api` 的 registry，经 `OpenAPIHandler` 挂载 `/v1`（`prefix: '/v1'`） |
| 1.4 | spec 端点 | `GET /openapi.json`：`OpenAPIGenerator` 从聚合 router 生成 |

### P2 鉴权与 CORS

| 序号 | 任务 | 说明 |
|------|------|------|
| 2.1 | API Key 中间件 | 提取 `Authorization: Bearer <key>`；查 `apikeys`（存在性、`enabled`、过期时间） |
| 2.2 | 游戏路由授权 | 解析 `permissions.allowedGames`；按请求路径判断目标游戏，校验是否在列 |
| 2.3 | 注入 context | 校验通过后将 key/游戏信息注入 oRPC context |
| 2.4 | CORS | `Allow-Origin: *`、支持 `Authorization` header、无 `credentials` |

### P3 限流与错误体

| 序号 | 任务 | 说明 |
|------|------|------|
| 3.1 | 按 key 限流 | 复用 `apikeys` 字段（`rateLimitEnabled`/`rateLimitTimeWindow`/`rateLimitMax`/`requestCount`/`remaining`/`lastRequest`）；默认 1000ms/100 |
| 3.2 | 限流响应头 | `X-RateLimit-Limit`/`Remaining`/`Reset`（Unix 秒） |
| 3.3 | 统一错误体 | 拦截器统一输出 `{ code, message, requestId }`；`requestId` 用 `crypto.randomUUID()` |
| 3.4 | 错误码表 | 实现 `UNAUTHORIZED`/`FORBIDDEN`/`RATE_LIMITED`/`INTERNAL_ERROR` 等（见 design §4.5） |

### P4 `apps/site-docs` 应用骨架

| 序号 | 任务 | 说明 |
|------|------|------|
| 4.1 | 创建应用骨架 | `package.json`（依赖 `@nuxt/content`、`@nuxtjs/i18n`、`better-auth`、`@better-auth/api-key`、`@tcg-cards/ui`）、`nuxt.config.ts`（extend `packages/ui`、hybrid routeRules）、`tsconfig.json`、`wrangler.toml`（`docs.tcg.cards`、Hyperdrive）、`app.vue`、`eslint.config.mjs` |
| 4.2 | 页面骨架 | `pages/index.vue`、`pages/reference/[...].vue`、`pages/model/[...].vue`、`pages/guide/[...].vue`、`pages/changelog.vue`、`pages/settings.vue` |
| 4.3 | i18n 骨架 | `i18n/locales/en|zhs/` 消息文件，含 `model.*` 命名空间 |

### P5 参考页自建渲染

| 序号 | 任务 | 说明 |
|------|------|------|
| 5.1 | zod 内省工具 | 支持集：基础标量/enum/object/strictObject/array/record/union/discriminatedUnion/nullable/nullish/optional/default/describe/meta；`any`/`unknown`/`transform` 降级为占位 + 告警 |
| 5.2 | 参考页组件 | 用 `packages/ui` 组件渲染端点参数、返回值、错误码 |
| 5.3 | 从 registry 驱动 | 内省 `packages/api` registry 的 procedure 元数据渲染各端点页 |

### P6 模型文档与本地化说明

| 序号 | 任务 | 说明 |
|------|------|------|
| 6.1 | key 注册表 | 从 registry 内省推导命名枚举/字段的期望 key 集（`{game}.model.{enum}.{value}`、`{game}.model.{schema}.{field}`、`$self`） |
| 6.2 | i18n 内容 | 编写 `en`/`zhs` 的 `model.*` 说明（枚举类型/枚举值/字段） |
| 6.3 | 结构检查脚本 | 构建期 diff 期望 key 与消息文件；缺失或孤儿 key 均阻断构建（无豁免） |
| 6.4 | 模型页渲染 | 渲染命名枚举/字段说明页（`/model/...`） |

### P7 guide/changelog 与版本化

| 序号 | 任务 | 说明 |
|------|------|------|
| 7.1 | 内容 | `@nuxt/content` 编写使用指南与 changelog 基础内容 |
| 7.2 | 版本化路由 | `/v1/...` 版本段；`/latest` 与根路径 302 重定向到 `/v1/` |
| 7.3 | 版本切换器 | 页头版本切换器（v1 当前单版本，预留多版本） |

### P8 key 管理 + 测试功能

| 序号 | 任务 | 说明 |
|------|------|------|
| 8.1 | better-auth 登录 | 复用 `@better-auth/api-key` 插件与 `apikeys` 表，site-docs 服务端配置 |
| 8.2 | `/settings` | key 列表（名称/前缀/状态/允许游戏/创建时间/最后使用）+ 创建（展示一次完整 key）+ 删除；site-console 管理员能力后置 |
| 8.3 | 测试 key | 登录用户点击测试时懒生成 `docs-test` key（展示式、覆盖全部游戏、可删除）；删除后下次重建 |
| 8.4 | 测试面板 | 自建测试面板，自动注入测试 key 调 service-api |

### P9 部署

| 序号 | 任务 | 说明 |
|------|------|------|
| 9.1 | service-api 部署 | wrangler 部署 `api.tcg.cards`；Hyperdrive 绑定；secrets（`DATABASE_URL`、`BETTER_AUTH_SECRET`） |
| 9.2 | site-docs 部署 | wrangler 部署 `docs.tcg.cards`（hybrid）；Hyperdrive 绑定；secrets |
| 9.3 | CI | 构建检查：service-api/site-docs 构建 + `packages/api` typecheck；i18n 结构检查纳入 site-docs 构建 |
