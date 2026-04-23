# 统一 API 服务实施计划表

## TODO List

- [ ] 创建 `apps/site-api` 应用骨架（Nuxt + Nitro + Cloudflare Workers 配置）
- [ ] 配置 monorepo 集成（package.json、workspace 依赖、turbo 构建）
- [ ] 创建 ORPC 基础实例与 context 类型定义
- [ ] 聚合 magic 与 hearthstone 路由到统一 router
- [ ] 实现 OpenAPI handler 与 spec 端点
- [ ] 实现 API Key 与 Session 双通道鉴权中间件
- [ ] 实现统一错误体格式与 requestId 注入
- [ ] 实现按 API Key / 用户主体的限流输出
- [ ] 配置第一方跨子域 Session Cookie 与 CORS
- [ ] 配置 wrangler.toml（域名、Hyperdrive、环境变量）
- [ ] 端到端验证：有效 key、有效 session、无效凭证、越权、限流
- [ ] 创建 `apps/site-docs` 应用骨架（Nuxt + packages/ui + hybrid 配置）
- [ ] 实现构建时 OpenAPI spec 生成（从 monorepo router 直接生成）
- [ ] 实现 API 文档渲染页面（Scalar API Reference 组件）
- [ ] 实现 site-docs 登录与 API Key 管理页面（/settings）
- [ ] 部署 site-docs 到 `docs.tcg.cards`

## 目标

基于 `docs/api-design.md` 的设计，交付两个独立服务：

1. **site-api**：可独立部署到 Cloudflare Workers 的统一 API 服务，对外提供 OpenAPI 兼容的 REST 接口，支持 API Key 鉴权，以及第一方网页登录用户基于 Session Cookie 的只读访问。
2. **site-docs**：与现有站点风格一致的 API 文档站，部署到 `docs.tcg.cards`。

## 实施原则

- 先搭骨架，再接业务路由，最后补鉴权和错误处理
- 优先复用现有 handler 代码，避免重复实现业务逻辑
- 保持与现有站点的接口输入输出结构一致
- 每个阶段完成后可独立验证

## 阶段计划

| 阶段 | 目标 | 核心任务 | 输出物 | 依赖 | 验收标准 |
|------|------|----------|--------|------|----------|
| P0 应用骨架 | 建立可运行的空 Nuxt 应用 | 创建 `apps/site-api` 目录；编写 `nuxt.config.ts`（仅 server 模块）；编写 `wrangler.toml`（域名 `api.tcg.cards`、Hyperdrive 绑定）；编写 `package.json`（workspace 依赖）；编写 `tsconfig.json`；添加最小 `app/app.vue` | 可 `bun run dev` 启动的空应用 | 无 | `bun run dev` 启动无报错；`bun run build` 产出 `.output/` |
| P1 路由聚合 | 聚合 magic + hearthstone handler | 创建 `server/orpc/index.ts`（ORPC 基础实例）；创建 `server/orpc/service.ts`（聚合 router）；将现有站点的 magic handler 和 hearthstone handler 通过 re-export 引入 | 统一 router 对象，可在代码中引用 | P0 | TypeScript 编译通过；router 包含 `magic.*` 和 `hearthstone.*` 路由 |
| P2 OpenAPI 入口 | 对外暴露 REST 端点 | 创建 `server/routes/api/[...].ts`（OpenAPI handler）；创建 `server/routes/openapi.json.ts`（spec 端点）；安装并配置 `@orpc/openapi` | 可访问的 REST 端点和 OpenAPI spec | P1 | `GET /openapi.json` 返回有效 spec；`GET /api/magic/card/random` 返回数据 |
| P3 鉴权链路 | 实现 API Key + Session 的完整鉴权链路 | 创建 `server/lib/auth/index.ts`（better-auth 配置）；创建 `server/lib/auth/perms.ts`（权限定义）；创建 `server/middleware/auth.ts`（统一鉴权中间件）；实现 `allowedGames` 解析、游戏路由校验、Session 用户只读放行规则 | 鉴权中间件，注入 ORPC context | P2 | 无凭证返回 401；无效 key 返回 401；禁用 key 返回 403；越权游戏返回 403；有效 session 可访问允许的只读接口 |
| P4 错误与限流 | 统一错误格式和按主体限流输出 | 实现统一错误拦截器（code、message、requestId）；实现 `requestId` 生成（`crypto.randomUUID()`）；实现按 `apikey:{id}` / `user:{id}` 的限流与 `X-RateLimit-*` 响应头；配置第一方 CORS 与 credentials | 一致的错误响应和限流头 | P3 | 所有错误响应包含 `code`、`message`、`requestId`；触发限流返回 429 并带限流头；第一方网页登录请求可携带 cookie 成功访问 |
| P5 部署与验证 | 部署到 Cloudflare Workers 并端到端验证 | 配置 Cloudflare secrets（`DATABASE_URL`、`BETTER_AUTH_SECRET`）；执行 `wrangler deploy`；使用内部 API Key 进行端到端测试 | 线上可用的 API 服务 | P4 | `api.tcg.cards/openapi.json` 可访问；有效 key 可查询数据；鉴权和限流行为符合设计 |
| P6 文档站骨架 | 建立可运行的文档站应用 | 创建 `apps/site-docs` 目录；编写 `nuxt.config.ts`（extend `packages/ui`、hybrid routeRules、better-auth）；编写 `wrangler.toml`（域名 `docs.tcg.cards`、Hyperdrive 绑定）；编写 `package.json`；创建基础页面结构 | 可 `bun run dev` 启动的文档站应用 | P0 | `bun run dev` 启动无报错；页面与现有站点风格一致 |
| P7 文档内容 | 渲染 OpenAPI spec 并展示文档 | 实现 `lib/spec.ts`（构建时从 router 生成 spec）；实现 `ApiReference.vue`（Scalar 组件包装）；编写首页与基础使用指南内容 | 可浏览的 API 文档页面 | P2, P6 | 文档页面正确展示所有接口；接口参数、返回值、错误码清晰可读 |
| P8 API Key 管理 | 实现用户自助 key 管理 | 配置 site-docs 的 better-auth 服务端与客户端；实现 `/settings` SSR 页面（登录 + key 列表 + 创建/删除）；实现 Scalar auth header 自动填充 | 可用的 API Key 自助管理 | P3, P7 | 登录后可创建/查看/删除 key；创建时展示完整 key；Scalar "Try it" 自动带上 key |
| P9 文档站部署 | 部署文档站到 Cloudflare | 配置 DNS `docs.tcg.cards`；配置 Cloudflare secrets；执行 `wrangler deploy`；验证线上文档站 | 线上可访问的文档站 | P5, P8 | `docs.tcg.cards` 可访问；spec 渲染正确；API Key 管理可用；页面风格与其他站点一致 |

## 任务拆解

### P0 应用骨架

| 序号 | 任务 | 说明 |
|------|------|------|
| 0.1 | 创建 `apps/site-api/package.json` | 依赖 `@orpc/server`、`@orpc/openapi`、`@tcg-cards/db`、`@tcg-cards/model`、`@tcg-cards/shared`、`better-auth`、`@better-auth/api-key`、`drizzle-orm`、`zod` |
| 0.2 | 创建 `apps/site-api/nuxt.config.ts` | 不 extend `packages/ui`（无前端需求）；配置 Nitro preset `cloudflare_module`；配置 alias（`#db`、`#schema`、`#model`、`#shared`） |
| 0.3 | 创建 `apps/site-api/wrangler.toml` | `name = "api-tcg-cards"`；域名 `api.tcg.cards`；Hyperdrive 绑定 |
| 0.4 | 创建 `apps/site-api/tsconfig.json` | 继承 `@tcg-cards/tsconfig/nuxt.json` |
| 0.5 | 创建 `apps/site-api/app/app.vue` | 最小壳：空 `<template>` |
| 0.6 | 创建 `apps/site-api/eslint.config.mjs` | 沿用现有站点的 eslint 配置 |

### P1 路由聚合

| 序号 | 任务 | 说明 |
|------|------|------|
| 1.1 | 创建 `server/orpc/index.ts` | 定义 ORPC 基础实例，暂不注入 context |
| 1.2 | 复制并适配 magic handler | 从 `site-magic` 复制 `server/orpc/magic/` 目录，调整 import 路径 |
| 1.3 | 复制并适配 hearthstone handler | 从 `site-hearthstone` 复制 `server/orpc/hearthstone/` 目录，调整 import 路径 |
| 1.4 | 创建 `server/orpc/service.ts` | 聚合 `magicTrpc` 和 `hearthstoneTrpc` |

### P2 OpenAPI 入口

| 序号 | 任务 | 说明 |
|------|------|------|
| 2.1 | 安装 `@orpc/openapi` | 添加到 `package.json` 依赖 |
| 2.2 | 创建 `server/routes/api/[...].ts` | 使用 `OpenAPIHandler` 处理 REST 请求 |
| 2.3 | 创建 `server/routes/openapi.json.ts` | 从 router 生成 OpenAPI spec 并返回 |

### P3 鉴权链路

| 序号 | 任务 | 说明 |
|------|------|------|
| 3.1 | 创建 `server/lib/auth/index.ts` | 配置 better-auth + apiKey 插件 |
| 3.2 | 创建 `server/lib/auth/perms.ts` | 复用现有权限定义 |
| 3.3 | 创建 `server/middleware/auth.ts` | 实现统一鉴权入口，优先校验 `Authorization` 中的 API Key，缺失时回退到 better-auth Session Cookie |
| 3.4 | 实现 API Key 路由授权 | 解析 `permissions.allowedGames`；根据请求路径判断目标游戏；校验不通过时返回对应错误 |
| 3.5 | 实现 Session 用户只读访问规则 | 明确允许 Session 访问的公开只读接口集合；将 `authMode`、user 信息写入 context |

### P4 错误与限流

| 序号 | 任务 | 说明 |
|------|------|------|
| 4.1 | 实现错误拦截器 | 在 OpenAPI handler 的 `interceptors` 中捕获错误，统一输出 `{ code, message, requestId }` |
| 4.2 | 实现 requestId 注入 | 在中间件入口生成 `crypto.randomUUID()`，写入 event context |
| 4.3 | 实现按主体限流 | API Key 请求按 `apikey:{id}` 限流；Session 请求按 `user:{id}` 限流 |
| 4.4 | 实现限流响应头 | 将当前实际命中的限流状态写入 `X-RateLimit-*` 头 |
| 4.5 | 配置第一方 CORS 与 cookie | 允许受信任的第一方 origin 携带 credentials 访问；校验跨子域 Session Cookie 配置 |

### P5 部署与验证

| 序号 | 任务 | 说明 |
|------|------|------|
| 5.1 | 配置 Cloudflare secrets | `wrangler secret put DATABASE_URL`、`wrangler secret put BETTER_AUTH_SECRET` |
| 5.2 | 执行部署 | `wrangler deploy --env production` |
| 5.3 | 端到端测试 | 用 curl、浏览器或 Postman 验证：OpenAPI spec、有效 key、有效 Session、无效凭证、越权、限流 |

### P6 文档站骨架

| 序号 | 任务 | 说明 |
|------|------|------|
| 6.1 | 创建 `apps/site-docs/package.json` | 依赖 `@nuxt/content`、`@nuxt/ui`、`@nuxt/icon`、`@scalar/api-reference`、`better-auth`、`@better-auth/api-key`、`@tcg-cards/db`、`@tcg-cards/shared` |
| 6.2 | 创建 `apps/site-docs/nuxt.config.ts` | `extends: ['../../packages/ui']`；配置 `@nuxt/content`；配置 `routeRules`（默认 prerender，`/settings` 走 SSR）；Nitro preset `cloudflare_module` |
| 6.3 | 创建 `apps/site-docs/wrangler.toml` | `name = "docs-tcg-cards"`；域名 `docs.tcg.cards`；Hyperdrive 绑定 |
| 6.4 | 创建 `apps/site-docs/tsconfig.json` | 继承 `@tcg-cards/tsconfig/nuxt.json` |
| 6.5 | 创建 `apps/site-docs/app/app.vue` | 使用 `UApp` + `NuxtLayout` + `NuxtPage` |
| 6.6 | 创建 `apps/site-docs/eslint.config.mjs` | 沿用现有站点的 eslint 配置 |

### P7 文档内容

| 序号 | 任务 | 说明 |
|------|------|------|
| 7.1 | 创建 `lib/spec.ts` | 构建时从 `site-api/server/orpc/service.ts` 的 router 对象生成 OpenAPI spec（`OpenAPIGenerator` + `ZodToJsonSchemaConverter`），输出 JSON 供页面组件引用 |
| 7.2 | 创建 `app/components/ApiReference.vue` | 包装 `@scalar/api-reference` Vue 组件，传入构建时生成的 spec 对象 |
| 7.3 | 创建 `app/pages/index.vue` | 文档首页，展示 API 概览、鉴权说明、快速开始 |
| 7.4 | 创建 `app/pages/reference.vue` | Scalar API Reference 渲染页面 |
| 7.5 | 创建 `content/` 目录 | 编写基础 Markdown 内容：使用指南、数据模型说明 |

### P8 API Key 管理

| 序号 | 任务 | 说明 |
|------|------|------|
| 8.1 | 创建 `server/lib/auth/index.ts` | 配置 better-auth 服务端（apiKey 插件），复用 `@tcg-cards/db` 中的 schema |
| 8.2 | 创建 `app/composables/auth.ts` | better-auth 客户端，复用 site-magic 的模式（email 登录） |
| 8.3 | 创建 `app/pages/settings.vue` | SSR 页面：左侧登录卡片，右侧 key 列表（名称、前缀、状态、允许游戏、创建时间）+ 创建/删除操作 |
| 8.4 | 实现 Scalar auth 自动填充 | 已登录用户的 key 自动注入 Scalar "Try it" 的 Authorization header |

### P9 文档站部署

| 序号 | 任务 | 说明 |
|------|------|------|
| 9.1 | 配置 DNS | 添加 `docs.tcg.cards` CNAME 到 Cloudflare |
| 9.2 | 配置 Cloudflare secrets | `DATABASE_URL`、`BETTER_AUTH_SECRET` |
| 9.3 | 执行部署 | `wrangler deploy`（hybrid Worker，非纯静态） |
| 9.4 | 验证 | 访问 `docs.tcg.cards`，确认页面风格一致、spec 渲染正确、登录与 key 管理可用 |
