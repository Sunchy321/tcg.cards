# 统一 API 服务与 API 文档站设计文档

> 稳定的运行时边界、能力分层、命名规则和数据归属规则以 [../../docs/project-architecture.zh-CN.md](../../docs/project-architecture.zh-CN.md) 为准。本文只描述统一 API 服务与文档站的需求级设计；若有冲突，以主架构文档为准。

## 1. 概述

新建两个独立部署的应用：

- `apps/service-api` —— 统一 API 服务，部署到 `api.tcg.cards`，纯机器后端。
- `apps/site-docs` —— API 文档站，部署到 `docs.tcg.cards`，与 API 同步版本化。

### 1.1 定位

API 服务是面向外部第三方开发者的公共只读数据 API，第一方站点为次要消费者。平台作为"上游数据提供者"，外部卡牌查询站与 App 直接消费统一数据集。API 仅返回 JSON；图片为纯 R2 静态资产（`asset.tcg.cards`），不在 API 职责内。

### 1.2 设计目标

- 提供独立于前端站点的统一数据 API 入口
- 对外暴露 OpenAPI 兼容的只读 REST 接口
- 强制 API Key 鉴权，按游戏维度授权，支持按 key 限流
- 快速扩展到任意新游戏，避免重复代码
- 文档站支持高度定制与详细模型/枚举说明，与 API 版本化同步
- 文档站内置登录门控的 API 测试功能与 API Key 自助管理

### 1.3 非目标（v1）

- 不提供写入接口，纯只读
- 不提供批量数据导出（另行设计，不在 API 职责内）
- 不提供图片服务（图片为纯 R2 静态资产，暂无图片服务设计计划）
- 不做资源级细粒度权限（如 `cards.read`）
- 不自动生成第三方 SDK
- 不做现有游戏站点前端页面改造

## 2. 总体架构：单一真源（基于 oRPC）

沿用仓库既有的 oRPC handler 层（`@orpc/server` + `@orpc/openapi`）：每个端点是一个带 `.route({ method, description, tags })` 元数据、`.input(zod)` / `.output(zod)` 契约的 procedure。一份"游戏模块"（per-game oRPC router）放在共享包，`service-api` 与 `site-docs` 共用同一份定义：

- `service-api` 聚合各 per-game router → `OpenAPIHandler` 挂载 REST 端点；OpenAPI 生成、鉴权、限流、错误体、CORS 作为通用基础设施实现于 `service-api` 消费侧（`packages/api` 保持纯路由/查询定义，不含 HTTP 边界逻辑）
- `site-docs` 内省同一份 router（procedure 的 route/input/output 元数据）→ 参考页、模型文档、模型说明 key 注册表全部从它推导

新增游戏 = 新增一个游戏模块（一组 procedure + 一个 router），API 与文档同时出现，基础设施零改动。

## 3. 游戏模块

每个游戏模块放在共享包内按游戏分目录，`service-api` 与 `site-docs` 共同消费：

```ts
// packages/api/src/magic/card.ts —— 复用现有 oRPC 形态
const summary = os
  .route({ method: 'GET', description: 'Get card by ID', tags: ['Magic', 'Card'] })
  .input(z.object({ cardId: z.string(), locale: locale.default('en'), ... }))
  .output(cardView)                       // 直接引用 packages/model 的 zod schema
  .handler(async ({ input }) => { /* API 侧查询 */ });

// packages/api/src/magic/index.ts
export const magicRouter = router({ card: { summary, full, random }, set, format, search, ... });
```

要点：

- **数据模型形态**：每游戏独立模型；模型层已对齐的命名惯例（`cardId`、`localization`、`cardProfile`）继续作为跨游戏约定。
- **契约元数据由 oRPC 提供**：路由结构（`magic.card.summary`）、方法、描述、tags、input/output 全部来自 procedure 定义，不自定义路由格式。
- **查询为 API 侧自持**：每个游戏的 procedure handler 写在模块内，游戏站点保留各自的查询，不共享查询代码（公共契约与站点内部展示需求不同，避免提前耦合）；共享的是机制与基础设施，不是查询实现。
- **版本前缀不写死在 procedure 里**：`OpenAPIHandler` 挂载时统一加 `/v1`。
- **五类端点模板**：每游戏统一套用 constants / search / fact tables / views / utils 五类端点，模板一致、内容按游戏填充。
- **机械端点声明式生成**：constants / fact tables / views 由通用工厂按声明产出（枚举/表/视图 + 主键/输出 schema）；search / utils 每游戏自写。

## 4. service-api 设计

### 4.1 形态与路由

- 纯机器后端，无任何前端页面；技术栈为 **Hono + Wrangler（Cloudflare Worker）**，对齐仓库 `service-*` 惯例（与 `service-internal` 同构），不使用 Nuxt
- 版本化：从第一天起挂 `/v1` 前缀；不带版本号时（如 `/magic/card/summary`）**直接复用最新版本端点**，不重定向、不 alias——与文档站的 302 重定向不同，API 站未版本访问直接命中最新版
- 路由路径由 router 结构派生（`magic.card.summary` → `/v1/magic/card/summary`，域名 `api.tcg.cards` 已隐含 api），示例：`GET /v1/magic/card/summary?cardId=xxx`、`GET /v1/magic/set/list`、`GET /v1/hearthstone/patch/list`
- 挂载：Hono 应用接收 `/v1/*`，经 `OpenAPIHandler`（`@orpc/openapi/fetch`）处理；每个请求注入请求级 db（`createDb` + `runWithDb`，复用 service-internal 模式）
- 公开端点：`GET /openapi.json`（用 `@orpc/openapi` 的 `OpenAPIGenerator` 从聚合 router 生成，供 Postman/代码生成等第三方工具消费）；`GET /health` 健康检查

### 4.2 端点契约（五类模板，只读）

每游戏统一套用五类端点：

1. **constants**：静态模型枚举，按枚举名拆分（`GET /{game}/catalog/{enumName}`）；v1 仅静态枚举（即 P0.5 命名枚举），数据派生 catalog 后置。
2. **search**：`GET /{game}/search?q=...`，与站点共用同一搜索定义（位于 `packages/api/{game}/search/`，由站点抬升）；`packages/search` 为纯引擎、`packages/model` 为可发布瘦包。
3. **fact tables**：每个 `{game}` 共享域表按主键单独暴露（`GET /{game}/{table}/{pk}`），不含 `{game}_data`/`{game}_app`；magic 覆盖 Card/Print/Set/Format/Cycle/Ruling/StaticDeck/Announcement 等，hearthstone 覆盖 Card/Set/Patch/Format/Announcement/Tag 等。
4. **views**：组织关联事实表的聚合视图（magic: CardView/PrintView/CardPrintView；hs: CardEntityView/LatestCardEntityView）；具体视图集实现时定（灵活）。
5. **utils**：`GET /{game}/card/random`、`GET /{game}/card/named?name=`；autocomplete 后置。

**生成方式**：constants / fact tables / views 三类机械端点由通用工厂声明式生成（枚举/表/视图 + 主键/输出 schema）；search / utils 每游戏自写。不含管理/导入类数据（magic 的 `data/*`），不含图片。

### 4.3 鉴权：强制 API Key

- 所有业务请求必须携带 API Key（`Authorization: Bearer <key>`）；无 key 返回 401
- 无匿名访问，无 session 通道（`service-api` 不做登录 Session 处理）
- 按游戏授权：复用 `apikeys.permissions` JSON，存储 `{ allowedGames: [...] }`
- 第一方站点不在浏览器直接调 `service-api`（各自服务端直连数据库）
- CORS：`Allow-Origin: *`，支持 `Authorization` header，无 `credentials`（无 cookie，跨域不传凭证）；覆盖第三方浏览器 App 直调与 docs 测试面板的跨域

### 4.4 限流

- 按 key 限流，复用 `apikeys` 表字段
- 默认：时间窗口 1000ms，最大请求数 100
- 响应带 `X-RateLimit-*` 头：`X-RateLimit-Limit` / `X-RateLimit-Remaining` / `X-RateLimit-Reset`（Reset 为 Unix 秒）

### 4.5 错误体

所有错误响应使用统一 JSON 结构：

```json
{
  "code": "FORBIDDEN",
  "message": "API key does not have access to game: hearthstone",
  "requestId": "req_abc123"
}
```

- `code`：机器可读错误码（与 HTTP 状态码解耦）
- `message`：人可读描述
- `requestId`：请求追踪 ID

| 场景 | HTTP 状态码 | 错误码 |
|------|-------------|--------|
| 无 API Key | 401 | `UNAUTHORIZED` |
| Key 不存在 | 401 | `UNAUTHORIZED` |
| Key 已禁用 | 403 | `FORBIDDEN` |
| Key 已过期 | 403 | `FORBIDDEN` |
| Key 无游戏权限 | 403 | `FORBIDDEN` |
| 触发限流 | 429 | `RATE_LIMITED` |
| 服务器内部错误 | 500 | `INTERNAL_ERROR` |

### 4.6 部署

- Cloudflare Worker，域名 `api.tcg.cards`
- Hyperdrive 连接 PostgreSQL
- 与 site-docs 独立部署，互不影响发布节奏

## 5. site-docs 设计

### 5.1 内容范围

- 只做 API 文档；游戏规则文档留在各游戏站点
- 按游戏分区组织参考页（magic 一节、hearthstone 一节）
- 内容承载：guide（使用指南）与 changelog（版本变更记录）用 `@nuxt/content`（Markdown）；模型/枚举说明用 vue-i18n（见 §6）

### 5.2 渲染：自建

- 不用 Scalar/Redoc 等货架渲染器；自建参考页，用 Nuxt UI 组件（`packages/ui`）从注册表渲染每个端点的参数、返回值、错误码
- 原因：需要高度定制 + 详细模型/枚举说明；货架渲染器无法承载"每个枚举值配大段解释"
- 测试面板也自建，天然接登录门控 + 自动注入测试 key
- zod 渲染支持集：基础标量（string/number/boolean/literal）、enum、object/strictObject、array、record、union/discriminatedUnion、nullable/nullish/optional/default、describe/meta；`any`/`unknown`/`transform` 等降级为"未描述类型"占位并构建告警（不阻断），并应随模型细化逐步消除——最终文档不应出现 `any`

### 5.3 版本化

- 版本化路径：`docs.tcg.cards/v1/...`（将来 v2 落 `/v2/...`，v1 原样保留）
- 根路径 = 最新版本；`/latest/...` 显式 alias，302 重定向到当前版本
- 页头提供版本切换器
- 内容按版本组织：每版本 = 该版本的注册表快照 + 对应 i18n 模型说明

### 5.4 页面结构（`/v1/` 下）

- index：API 概览、鉴权说明、快速开始
- reference：按游戏分区的接口参考
- model：模型/枚举说明（本地化）
- guide：使用指南
- changelog：版本变更记录
- settings：API Key 自助管理（登录后）：查看（名称、前缀、状态、允许游戏、创建时间、最后使用时间）、创建、删除；创建时展示一次完整 key，之后仅展示前缀（`start` 字段）；v1 不需密钥轮换

管理员能力（防滥用）：site-console 保留管理员查看所有用户的 key + 禁用 key 的能力，v1 后置到需要时补充。

### 5.5 测试功能与测试 key

- 未登录可查看文档，但无"试一下"功能；测试需登录（业界惯例）
- 登录用户点击测试时，懒生成一个约定名（`docs-test`）的测试 key：
  - 展示式（"我们为你的测试建了 key，可在 /settings 管理/删除"）
  - 覆盖全部当前游戏
  - 用户在 /settings 删除后，下次点击再重新生成
- 每次测试请求仍携带真实 API Key，强制 key 模型不被穿透

### 5.6 渲染模式

- Hybrid：文档页（index/reference/model/guide/changelog）预渲染为静态 HTML（SSG）；`/settings` 走 SSR（需登录态查询）
- 通过 `routeRules` 按路由配置渲染模式
- 部署为 Cloudflare Worker（非纯静态，因 `/settings` 需 SSR）

## 6. 模型文档与本地化说明

- 说明文字不写进 zod；用固定 key + vue-i18n 本地化文本
- 枚举抬升为**命名枚举**（有稳定身份），供文档/OpenAPI 引用
- key 约定：
  - 字段说明：`{game}.model.{schema}.{field}` → 如 `magic.model.card.manaValue`
  - 枚举类型说明：`{game}.model.{enum}.$self` → 如 `magic.model.rarity.$self`
  - 枚举值说明：`{game}.model.{enum}.{value}` → 如 `magic.model.rarity.legendary`
- 本地化结构：沿用仓库既有 i18n 形态（TS 嵌套对象、`en`/`zhs` 语言码），挂到各游戏的 `model.*` 命名空间
- 结构检查：`site-docs` 构建期内省注册表 → 枚举出期望 key 集 → 与 `en`/`zhs` 消息文件 diff → **缺失或孤儿 key 均阻断构建（无豁免）**，保证"每个字段/枚举值都有说明"且无陈旧文本

## 7. 扩展性：新增游戏五步

1. 在 `packages/api` 下新增该游戏目录：编写共享查询、oRPC procedures、per-game router
2. 在 `packages/api/index.ts` 将该游戏聚合进 registry
3. 编写 `en`/`zhs` 的 `model.*` 说明 i18n
4. `service-api` 挂载聚合 registry（新游戏自动上线）
5. `site-docs` 从同一 registry 自动出现该游戏的参考页 + 模型文档

全程零基础设施改动。

## 8. 部署拓扑

```
api.tcg.cards  ──►  Cloudflare Worker (service-api)  ──►  Hyperdrive  ──►  PostgreSQL
docs.tcg.cards ──►  Cloudflare Worker (site-docs)    ──►  Hyperdrive  ──►  PostgreSQL
```

- service-api 与 site-docs 独立部署，互不影响发布节奏
- 共享环境变量：`DATABASE_URL`、`BETTER_AUTH_SECRET`
- 图片资产走 `asset.tcg.cards`（R2），不在本轮设计内

## 9. 后续演进

- 批量数据导出（独立机制，另行设计）
- 图片服务（如将来需要）
- 资源级权限、SDK 生成
- 文档站演进为完整开发者中心（SDK 示例、使用统计）
