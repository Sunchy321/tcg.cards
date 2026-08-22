# `design.md` 评审意见

> 稳定的运行时边界、能力分层、命名规则和数据归属规则以 [../../docs/project-architecture.zh-CN.md](../../docs/project-architecture.zh-CN.md) 为准。本文只记录本需求的评审结论；若有冲突，以主架构文档为准。

## 评审方式

本设计通过 `/grill-with-docs` 拷问会话逐条收敛产生。从需求原点（API 定位、形态、数据范围）开始，沿决策树逐个敲定：鉴权模型、文档站内容与渲染、模型说明的本地化机制、版本化策略、扩展性机制。所有关键分支均给出了推荐答案并经用户确认。

## 结论清单

### 必须修改

无。设计文档覆盖了定位、架构、鉴权、限流、错误体、版本化、文档站渲染与内容、模型说明机制、扩展性清单与部署拓扑，核心要素齐全，设计方向可接受。

### 建议修改（均已定案）

- **注册表共享包落点** ✅ 已定：单一 `packages/api` 共享包 + 按游戏分目录，`service-api` 与 `site-docs` 共用；查询 API 侧自持，游戏站点不动。
- **文档渲染器 zod 类型集** ✅ 已定：明确支持集（基础标量/enum/object/array/record/union/nullable/optional/describe 等），`any`/`unknown`/`transform` 降级为"未描述类型"占位并告警（不阻断）；目标最终文档不出现 `any`。
- **根路径行为** ✅ 已定：根路径与 `/latest` 均 302 重定向到 `/vN/`，单一规范 URL。
- **i18n 完整性检查失败策略** ✅ 已定：缺失与孤儿 key 均阻断构建，无豁免。
- **旧 `specs/api` 处置** ✅ 已定：直接移除，新设计占据原 `specs/api` 位置（未归档）。
- **CORS 策略**（评审后新增）✅ 已定：`Allow-Origin: *`、支持 `Authorization` header、无 `credentials`。
- **guide/changelog 内容承载**（评审后新增）✅ 已定：`@nuxt/content`（Markdown）；模型/枚举说明走 vue-i18n。
- **鉴权实现方式**（实施期新增）✅ 已定：`service-api` 与 `site-docs` 复用 better-auth `api-key` 插件的鉴权——`service-api` 也运行 better-auth 并挂 `api-key` 插件，每个请求用插件 `verifyApiKey` 校验，不自建哈希比对。理由见文末"实施期定案：统一 better-auth api-key 鉴权"。
- **常量端点开放**（实施期新增）✅ 已定：catalog（constants）端点为纯静态数据（不查库、构建期固定），无 key 开放并加 `Cache-Control: public, max-age=3600` 供 CDN 缓存；其余端点（search/fact tables/views/utils）需 API key（无 key → 401）。文档站"试一下"对常量端点直连，非常量端点提示需 key（登录懒生成 key 属 P8）。
- **按端点限流**（实施期新增）🔜 延后：better-auth `api-key` 插件原生限流为按 key 全局（`isRateLimited` 基于 `apikeys` 表字段，同 key 所有端点共享额度），不支持 per-endpoint。是否需要按端点区分额度，v1 延后，先用插件原生 per-key 限流。

### 可后置

- 测试 key 的过期策略（可避免 `apikeys` 表长期积累垃圾 key，v1 靠"懒生成 + 可删除"兜底）
- 版本切换器的交互细节（v1 只有一个版本）
- 资源级权限、SDK 生成（已在非目标）
- API 使用量统计与监控面板

## 总体评价

这是一份结构清晰、从需求出发逐层收敛的设计。最大的价值在于两点：

1. **单一真源**：一份基于 oRPC 的游戏模块（procedures + per-game router）同时驱动 `service-api`（挂载服务）和 `site-docs`（内省成文），新增游戏 = 新增一个模块，API 与文档同时出现，基础设施零改动。这直接兑现了"快速扩展任意新游戏 + 避免重复代码"的第一优先级，并纠正了旧 specs/api"复制站点 handler"的重复代码问题。
2. **强制 API Key + 无 session**：鉴权面收窄为单一通道，限流、按游戏授权、错误处理全部统一；文档站的测试功能通过"懒生成的展示式测试 key"拿到 session 的便利，却不把 session 通道带回 service-api，模型未被穿透。

相对 specs/api，本设计在鉴权（强制 key）、文档渲染（自建替代 Scalar）、版本化（从第一天 `/v1`）、模型说明（命名枚举 + vue-i18n 本地化）四处做了实质改进，且明确宣告替代旧设计。

**结论：** 设计方向可接受。建议修改项均已定案并吸收进 design.md，可进入实施计划阶段（`plan.md`）。

### 与旧版 specs/api 的主要差异

旧版 `specs/api` 设计（已移除）与本设计的核心差异：

| 维度 | 旧版 | 本设计 |
|------|------|--------|
| 代码组织 | 复制站点 handler | `packages/api` 共享包 + oRPC routers（查询 API 侧自持，游戏站点不动） |
| 鉴权 | API Key 优先 + Session 回退 | 强制 API Key，无 session |
| 文档渲染 | Scalar | 自建参考页 + 自建测试面板 |
| 版本化 | 无 | API 与文档从第一天 `/v1` |
| 模型说明 | 无 | 命名枚举 + vue-i18n 本地化 |
| 内容承载 | @nuxt/content 统一 | guide/changelog 用 @nuxt/content，模型说明用 vue-i18n |
| CORS | 仅第一方源 + credentials（session） | `Allow-Origin: *`、无 credentials |

---

## 风险评估

### 低风险

- **只读 + 公开静态数据**：v1 纯只读，无写入一致性、无敏感数据泄露面，key 的核心用途是身份识别 + 限流。
- **游戏站点零改动**：查询为 API 侧自持，游戏站点不共用、不重构，站点行为天然不变（无回归面）。
- **独立部署互不影响**：service-api 与 site-docs 独立 Worker，发布节奏解耦。

### 中风险

- **zod schema 内省的表达力**：参考页、模型文档、i18n 完整性检查都依赖对注册表 zod schema 的内省。对复杂类型（`z.record`、`z.union`、`z.any`、`z.transform`）的渲染可能失真，需要渲染器特判或降级，且要在实施期定义支持集。
- **packages/model 命名枚举重构**：内联枚举抬升为命名枚举是精心维护文件的整理，需保持校验行为不变；仅影响 `packages/model`，不涉及游戏站点查询，依赖现有检查回归。
- **i18n 完整性检查的迭代摩擦**：每个新字段/枚举值都要求 `en`/`zhs` 双语言说明，否则构建挂。对新游戏快速接入是约束，需要接受或提供豁免机制。
- **版本化文档的内容组织**：每版本 = 注册表快照 + 对应 i18n，需要按版本维度组织构建输入。v1 只有一版，风险显现于 v2 引入时。

### 排除的风险

- 批量数据导出（明确不在 API 职责内，另行设计）
- 图片服务（纯 R2 静态资产，无服务设计）
- 写入接口一致性（v1 只读）
- 第一方网页浏览器直读 API（已确认 v1 无此场景，且不走 session）

---

## 实施期定案：统一 better-auth api-key 鉴权

**决策：`service-api` 与 `site-docs` 复用 better-auth `api-key` 插件的鉴权。`service-api` 也运行 better-auth 并挂 `api-key` 插件，每个请求用插件 `verifyApiKey` 校验，不自建哈希比对。**

`apikeys` 表由 better-auth `api-key` 插件维护（表结构复用该插件 schema，`key` 列为 SHA-256 哈希）。`service-api` 不再自建轻量鉴权中间件直查表，而是与站点一致，统一走 better-auth 的 api-key 校验能力。

### 理由

- **鉴权逻辑统一**：site-docs（key 管理）、service-api（key 校验）复用同一套 better-auth api-key 实现，规则、哈希、错误码全部一致，不维护两套校验逻辑。
- **key 格式与校验能力复用**：插件已提供 `verifyApiKey` 与 `defaultKeyHasher`，`service-api` 直接调用即可，无需自行实现 SHA-256 比对。
- **与 key 生命周期管理同源**：key 由 better-auth 插件创建/删除/列表（site-docs `/settings`、P8），service-api 的校验与之一致，不存在两套实现漂移。

### 实现要点

- `service-api` 引入 better-auth 与 `api-key` 插件，构造与站点一致的 auth 实例（复用 `packages/auth` 的 `createServerAuth`，schema 增加 `apikeys`）。
- 每个 `/v1/*` 业务请求：提取 `Authorization: Bearer <key>` → 调插件 `verifyApiKey`。插件的 `validateApiKey` 已基于 `apikeys` 表字段完成 key 存在性/`enabled`/过期/游戏权限（`permissions`）校验，并内置基于表字段（`rateLimitEnabled`/`rateLimitTimeWindow`/`rateLimitMax`/`requestCount`/`lastRequest`）的按 key 限流。
- `service-api` 不做自定义限流/错误体实现，鉴权与限流逻辑完全复用 better-auth `api-key` 插件；`service-api` 只负责 HTTP 边界（提取 key、按插件返回映射状态码、CORS）。
- `packages/api` 保持纯契约，不引入 better-auth；鉴权作为 `service-api` 消费侧的 HTTP 边界基础设施。
