# 统一 API 服务设计文档

---

## 1. 概述

新建一个独立部署的 API 服务（`apps/site-api`），聚合 magic 与 hearthstone 两个游戏的只读数据接口，对外通过 OpenAPI（REST）协议提供服务，内部使用 ORPC 作为实现层。支持 API Key 鉴权，权限按游戏维度划分，部署目标为 Cloudflare Workers。

### 1.1 设计目标

- 提供一个独立于前端站点的统一数据 API 入口
- 对外暴露 OpenAPI 兼容的 REST 接口，便于第三方对接和文档生成
- 支持 API Key 鉴权与按游戏维度授权
- 支持请求限流
- 部署为独立 Cloudflare Worker，与现有站点零耦合

### 1.2 非目标

- v1 不做资源级细粒度权限（如 `cards.read` / `decks.read`）
- v1 不提供写入类接口，仅暴露只读数据
- v1 不自动生成第三方 SDK
- v1 不做现有游戏站点的前端页面改造

---

## 2. 技术选型

### 2.1 服务框架

沿用现有技术栈：Nuxt + Nitro + Cloudflare Workers。选择 Nuxt 而非纯 Nitro 是为了与 monorepo 内其他应用保持一致的构建、部署和别名配置方式。

### 2.2 接口实现层

使用 `@orpc/server` 作为内部实现层。现有 handler 已包含 `.route({ method, description, tags })` 元数据，天然兼容 OpenAPI 输出。

### 2.3 OpenAPI 输出

使用 `@orpc/openapi` 将 ORPC router 转换为 OpenAPI 兼容的 REST 端点，并自动生成 OpenAPI spec。

### 2.4 鉴权

使用 `better-auth` + `@better-auth/api-key` 插件，复用现有 `apikeys` 表和鉴权配置。

### 2.5 数据库

复用 `@tcg-cards/db`（Drizzle ORM + PostgreSQL），通过 Cloudflare Hyperdrive 连接。

---

## 3. 应用结构

```
apps/site-api/
├── nuxt.config.ts              # Nuxt 配置，仅启用 server 相关模块
├── wrangler.toml               # Cloudflare Workers 部署配置
├── package.json
├── tsconfig.json
├── server/
│   ├── routes/
│   │   ├── api/[...].ts        # OpenAPI REST 入口
│   │   └── openapi.json.ts     # OpenAPI spec 端点
│   ├── orpc/
│   │   ├── service.ts          # 路由聚合（magic + hearthstone）
│   │   └── index.ts            # ORPC 基础实例（含 context 定义）
│   ├── middleware/
│   │   └── api-key.ts          # API Key 验证中间件
│   └── lib/
│       └── auth/
│           ├── index.ts        # better-auth 配置
│           └── perms.ts        # 权限定义
└── app/
    └── app.vue                 # 最小前端壳（Nuxt 要求）
```

### 3.1 路由结构

对外暴露的 REST 路径遵循 OpenAPI 风格：

```
GET  /api/magic/card/summary?cardId=xxx&locale=en
GET  /api/magic/set/list
GET  /api/magic/format/list
GET  /api/hearthstone/card/summary?cardId=xxx&lang=en
GET  /api/hearthstone/patch/list
GET  /openapi.json
```

### 3.2 路由聚合

```typescript
// server/orpc/service.ts
import { magicTrpc } from './magic';
import { hearthstoneTrpc } from './hearthstone';

export const router = {
  magic:       magicTrpc,
  hearthstone: hearthstoneTrpc,
};
```

magic 和 hearthstone 的 ORPC handler 直接复用现有站点中的实现，通过 monorepo workspace 依赖引入。

---

## 4. 鉴权与权限模型

### 4.1 权限粒度

v1 提供两种鉴权方式：

- **API Key**：面向外部开发者、第三方脚本、服务端对接。权限按游戏维度划分。
- **用户 Session Cookie**：面向主站、文档站等第一方网页中的已登录用户访问。仅用于浏览器内的只读访问，不作为第三方集成方式。

匿名请求默认不允许访问业务数据接口；公开文档与 OpenAPI spec 端点除外。

### 4.2 存储方式

利用 `apikeys` 表已有的 `permissions` 字段（JSON 文本），存储格式：

```json
{
  "allowedGames": ["magic", "hearthstone"]
}
```

API Key 模式下，权限按 `allowedGames` 控制。

Session Cookie 模式下，不复用 `allowedGames`；v1 仅允许访问公开只读数据接口，鉴权主体为登录用户本身。

### 4.3 验证流程

1. 若请求命中 `/openapi.json` 等公开文档端点，直接放行
2. 从请求头 `Authorization: Bearer <api-key>` 中提取 key
3. 若提供了 key，则进入 API Key 验证流程：
   - 查询 key，校验存在性、`enabled` 状态、过期时间
   - 解析 `permissions` 字段，提取 `allowedGames`
   - 根据请求路径判断目标游戏，校验是否在 `allowedGames` 中
   - 校验通过后，将 `authMode = apiKey` 与 key 信息注入 ORPC context
4. 若未提供 key，则检查 better-auth 的用户 session cookie
5. 若 session 有效，则进入用户模式：
   - 校验该路由是否属于允许登录用户直接访问的只读接口
   - 校验通过后，将 `authMode = user` 与用户信息注入 ORPC context
6. 若 key 与 session 均不存在或校验失败，则返回未授权错误

鉴权优先级为 **API Key 优先，Session Cookie 回退**。这样可以保证外部集成和第一方网页访问共用同一套 API 服务，同时避免浏览器用户必须手动创建 key 才能打开链接。

### 4.4 第一方网页访问约束

Session Cookie 模式仅用于第一方网页中的已登录用户，主要覆盖以下场景：

- 主站中打开 API/JSON 预览链接
- 文档站中的在线调试与 “Try it”
- 其他同属 `*.tcg.cards` 的官方网页内只读调用

该模式不作为第三方程序的正式接入方式。第三方脚本、服务端、CLI、自动化任务仍应使用 API Key。

为支持跨子域访问：

- Session Cookie 需配置为适用于 `*.tcg.cards`
- 跨域请求需显式携带 credentials
- CORS 仅允许受信任的第一方来源，并开启 credentials 支持

### 4.5 错误响应

| 场景 | HTTP 状态码 | 错误码 |
|------|-------------|--------|
| 未提供 API Key 且无有效 Session | 401 | `UNAUTHORIZED` |
| Key 不存在 | 401 | `UNAUTHORIZED` |
| Key 已禁用 | 403 | `FORBIDDEN` |
| Key 已过期 | 403 | `FORBIDDEN` |
| Key 无游戏权限 | 403 | `FORBIDDEN` |
| Session 无效或已过期 | 401 | `UNAUTHORIZED` |
| Session 模式访问了不允许的接口 | 403 | `FORBIDDEN` |
| 触发限流 | 429 | `RATE_LIMITED` |
| 服务器内部错误 | 500 | `INTERNAL_ERROR` |

---

## 5. 限流策略

### 5.1 机制

限流按鉴权主体区分：

- **API Key 模式**：按 `apikey:{id}` 限流，复用 `@better-auth/api-key` 内置的限流能力，基于 `apikeys` 表中的字段：

  - `rateLimitEnabled`：是否启用限流
  - `rateLimitTimeWindow`：时间窗口（毫秒）
  - `rateLimitMax`：窗口内最大请求数
  - `requestCount`：当前窗口已请求数
  - `remaining`：剩余请求数
  - `lastRequest`：最后请求时间

- **Session Cookie 模式**：按 `user:{id}` 限流。v1 可先采用数据库或兼容存储中的简易计数实现，保持与 API Key 模式相同的响应头格式。

同一个请求只命中一种限流主体，不叠加计算。

### 5.2 默认值

- API Key：时间窗口 1000ms，最大请求数 100
- Session 用户：时间窗口 1000ms，最大请求数 100

如后续观察到网页用户流量模型与第三方程序差异较大，可再拆分不同默认值。

### 5.3 限流响应头

```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 42
X-RateLimit-Reset: 1713254400
```

响应头始终表示当前实际生效的限流主体结果，无论该请求使用的是 API Key 还是 Session Cookie。

---

## 6. 错误体格式

所有错误响应使用统一的 JSON 结构：

```json
{
  "code": "FORBIDDEN",
  "message": "API key does not have access to game: hearthstone",
  "requestId": "req_abc123"
}
```

- `code`：机器可读的错误码（与 HTTP 状态码解耦）
- `message`：人可读的错误描述
- `requestId`：请求追踪 ID，用于排查问题

---

## 7. 部署拓扑

```
    ┌──────────────────┐        ┌──────────────────┐
    │  Cloudflare DNS  │        │  Cloudflare DNS  │
    │  api.tcg.cards   │        │  docs.tcg.cards  │
    └────────┬─────────┘        └────────┬─────────┘
             │                           │
    ┌────────▼─────────┐        ┌────────▼─────────┐
    │  Cloudflare      │        │  Cloudflare      │
    │  Worker          │        │  Worker           │
    │  (site-api)      │        │  (site-docs,      │
    │                  │        │   hybrid SSG+SSR) │
    └────────┬─────────┘        └────────┬─────────┘
             │                           │
    ┌────────▼───────────────────────────▼──┐
    │  Hyperdrive                           │
    │  (connection pooling)                 │
    └────────┬──────────────────────────────┘
             │
    ┌────────▼─────────┐
    │  PostgreSQL      │
    │  (shared DB)     │
    └──────────────────┘
```

- site-api：独立 Worker，域名 `api.tcg.cards`，纯后端 API 服务
- site-docs：Hybrid Worker，域名 `docs.tcg.cards`，文档页面预渲染为静态 HTML，`/settings` 走 SSR
- site-docs 在构建时从 monorepo 内的 router 对象直接生成 OpenAPI spec，无运行时网络依赖
- site-api 与 site-docs 共享同一数据库，通过 Hyperdrive 提供连接池（site-docs 的 `/settings` 页面需要 auth 查询）

### 7.1 环境变量

site-api 与 site-docs 共享以下环境变量：

| 变量名 | 说明 |
|--------|------|
| `DATABASE_URL` | PostgreSQL 连接字符串（通过 Hyperdrive） |
| `BETTER_AUTH_SECRET` | better-auth 签名密钥 |

### 7.2 回滚策略

- Cloudflare Workers 支持版本回滚，可通过 `wrangler rollback` 快速恢复
- 新版本部署后通过内部 API Key 先行验证，再切换 DNS 权重

---

## 8. 首批迁移范围

v1 仅迁移只读静态数据接口：

### Magic

- `card.summary` / `card.full` / `card.random`
- `print`（印刷版本查询）
- `set.list` / `set.detail`
- `format.list`
- `search`
- `announcement`
- `document`（规则文档查询）
- `rule`
- `deck`

### Hearthstone

- `card.summary` / `card.full` / `card.random`
- `patch.list` / `patch.detail`

---

## 9. API 文档站

### 9.1 方案选择

新建独立 Nuxt 应用 `apps/site-docs`，部署到 `docs.tcg.cards`，作为与现有站点风格一致的 API 文档站。

曾评估过以下替代方案，最终选择方案 C：

| 方案 | 描述 | 不采用的原因 |
|------|------|-------------|
| A：放 site-api `/docs` | 在 API 服务中加前端页面 | 需将纯后端服务改为完整 SSR 应用，架构污染，构建体积膨胀，Worker 冷启动变慢 |
| B：放 site-main `tcg.cards/api` | 在门户首页加文档页面 | site-main 风格偏展示入口，跨域拉取 spec，扩展空间有限 |
| D：分散到各 `${game}.tcg.cards/docs` | 各游戏站点各自承载文档 | 接口统一但文档分散，域名与端点不一致，鉴权文档需重复，每新增游戏多一份维护 |

### 9.2 技术选型

- **框架**：Nuxt（`extends: ['../../packages/ui']`），与所有现有站点共享 AppHeader、AppFooter、布局、主题
- **内容管理**：`@nuxt/content`，用于管理使用指南、数据模型说明、Changelog 等 Markdown 内容
- **OpenAPI 渲染**：`@scalar/api-reference`（Vue 组件）。oRPC 官方推荐，内置 "Try it" 交互测试、代码示例生成、暗色模式，支持 CSS 变量主题定制。Scalar 组件嵌入 Nuxt 页面，外层包裹共享的 AppHeader/AppFooter 实现风格融合
- **spec 来源**：构建时从 monorepo 内的 ORPC router 对象直接生成（`OpenAPIGenerator`），无运行时网络依赖，无 CORS 问题
- **渲染模式**：Hybrid（SSG 为主 + 少量 SSR 页面）。文档页面通过 `nuxt generate` 预渲染为静态 HTML；`/settings` 页面走 SSR（需要登录态）。通过 `routeRules` 按路由配置渲染模式
- **用户认证**：复用 better-auth，与 site-magic 共享用户体系。已登录用户的 API Key 可自动注入 Scalar "Try it" 的 Authorization header
- **部署**：Cloudflare Workers（非纯静态，因 `/settings` 需 SSR），域名 `docs.tcg.cards`

### 9.3 spec 同步策略

spec 在构建时由 `@orpc/openapi` 的 `OpenAPIGenerator` 从 `site-api/server/orpc/service.ts` 的 router 对象生成。API 变更后需重新构建文档站。可在 CI 中设置：site-api 相关代码变更时自动触发 site-docs 重建。

### 9.4 未来演进

v1 采用整站 SSG + Scalar 单页渲染。如未来需要更好的 SEO 或更精细的风格控制，可切换到按接口拆分独立页面的方案：从 spec 中提取每个 path，生成独立路由页面（如 `/docs/magic/card/summary`），用 Nuxt UI 组件自定义渲染每个接口的参数、返回值和错误码。该方案保留为后续选项。

### 9.5 应用结构

```
apps/site-docs/
├── nuxt.config.ts              # extend packages/ui，配置 @nuxt/content，hybrid routeRules
├── wrangler.toml               # 域名 docs.tcg.cards，Hyperdrive 绑定
├── package.json
├── tsconfig.json
├── app/
│   ├── app.vue
│   ├── pages/
│   │   ├── index.vue           # 文档首页（API 概览、鉴权说明、快速开始）
│   │   ├── reference.vue       # Scalar API Reference 渲染页
│   │   ├── settings.vue        # API Key 管理页面（SSR，需登录）
│   │   └── [...slug].vue       # Markdown 内容页
│   ├── components/
│   │   └── ApiReference.vue    # Scalar 组件包装
│   └── composables/
│       └── auth.ts             # better-auth 客户端
├── content/                    # Markdown 文档内容
│   ├── index.md                # 首页内容
│   └── guide/                  # 使用指南
├── server/
│   └── lib/
│       └── auth/
│           └── index.ts        # better-auth 服务端配置
└── lib/
    └── spec.ts                 # 构建时从 router 生成 OpenAPI spec
```

### 9.6 部署

- Cloudflare Worker，域名 `docs.tcg.cards`
- 文档页面预渲染为静态 HTML（SSG），`/settings` 走 SSR
- 需要 Hyperdrive 绑定（`/settings` 页面的 auth 需要查询数据库）
- 与 site-api 独立部署，互不影响发布节奏
- CI 中设置 site-api 路由变更时自动触发 site-docs 重建

---

## 10. API Key 管理界面

### 10.1 方案

在 `docs.tcg.cards/settings` 提供用户自助管理界面。选择 site-docs 的理由：

- API 消费者的自然操作路径：阅读文档 → 创建 key → 在 "Try it" 中测试 → 复制 key 到应用
- 已登录用户的 key 可自动注入 Scalar "Try it" 的 Authorization header，形成闭环体验
- API Key 是跨游戏的全局资源，放在门户性质的文档站比放在单游戏站点更合理
- 只需在 site-docs 的 hybrid 模式中增加一个 SSR 页面，无需在多个站点重复建设

### 10.2 保密性分析

API 提供的所有数据（卡牌、系列、赛制、公告、规则文档）均为公开静态数据，不涉及用户隐私。因此：

- key 的核心用途是**身份识别 + 限流**，而非保护敏感数据
- key 泄露的最坏后果是配额被他人消耗，不涉及数据泄露
- 创建时展示一次完整 key（业界标准做法），之后仅展示前缀（`start` 字段）
- v1 不需要密钥轮换机制

### 10.3 用户功能

用户登录后可在 `/settings` 页面：

- **查看** key 列表（名称、前缀、状态、允许游戏、创建时间、最后使用时间）
- **创建** key（指定名称、allowedGames）。创建成功后展示完整 key，提示仅展示一次
- **删除** key

### 10.4 管理员功能

site-console 保留管理员**查看所有用户的 key + 禁用 key** 的能力，作为应对滥用的安全手段。v1 不优先实现，后置到需要时补充。

### 10.5 后端实现

使用 `@better-auth/api-key` 插件的客户端 API（`apiKey.create`、`apiKey.list`、`apiKey.delete`）。`allowedGames` 存储在 `permissions` JSON 字段中。

---

## 11. 扩展点

- 新增游戏时，只需在 `server/orpc/service.ts` 中挂载新路由树，并在 `allowedGames` 类型中添加新值
- 如未来需要资源级权限，可在 `permissions` 中扩展 `allowedResources` 字段
- 文档站已具备登录能力，可继续演化为完整的开发者中心（key 管理 + SDK 示例 + Changelog + 使用统计）
