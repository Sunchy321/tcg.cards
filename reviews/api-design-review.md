# `api-design.md` 评审意见

## 结论清单

### 必须修改

无。设计文档覆盖了目标、边界、路由结构、权限模型、限流策略、错误码、部署拓扑、文档站方案与 API Key 管理界面方案，核心要素齐全，可进入实施阶段。

### 建议修改

- 明确 ORPC handler 代码的复用方式：是通过 workspace 包直接导入，还是将业务 handler 抽取到独立 shared package。目前设计文档说"直接复用现有站点中的实现"，但未说明具体引用路径。建议初期直接在 `site-api` 中 re-export 现有站点的 handler，后续再按需抽包。
- `requestId` 生成策略需要明确：建议使用 `crypto.randomUUID()` 在中间件入口生成，写入 ORPC context 并在所有错误响应中返回。
- OpenAPI spec 端点 `/openapi.json` 是否需要鉴权保护：建议不保护，作为公开文档端点。
- 限流响应头中的 `X-RateLimit-Reset` 格式需明确：建议使用 Unix timestamp（秒），与主流 API 保持一致。
- site-docs 的 Scalar 主题定制范围需明确：建议 v1 仅调整配色方案接近 Nuxt UI，不过度定制 Scalar 内部结构。

### 可后置

- 管理员在 site-console 查看/禁用用户 key 的能力
- 更精细的限流策略（如按游戏独立配额）
- OpenAPI spec 的版本化管理
- API 使用量统计与监控面板
- site-docs 的 Markdown 内容（使用指南、Changelog 等）

## 总体评价

这是一份结构清晰、范围收敛的设计文档。目标和非目标边界明确，技术选型贴合现有代码库，路由结构和权限模型实用且简洁。

设计的最大优点是充分利用了现有基础设施（ORPC handler 元数据、better-auth API Key 插件、apikeys 表结构），无需引入新的外部依赖或重建鉴权体系。

文档站选择独立 Nuxt 应用（`docs.tcg.cards`）的决策合理：保持了 site-api 作为纯后端服务的定位，同时通过 extend `packages/ui` 实现与现有站点风格一致。SSG + 构建时从 monorepo 内 router 生成 spec 的方案，避免了运行时网络依赖和跨域问题。使用 Scalar 作为 OpenAPI 渲染器是合理选择，它是 oRPC 官方推荐的 Vue 原生组件，功能完备且支持主题定制。

API Key 管理界面放在 site-docs 的 `/settings` 页面是合理的选择：用户在文档站阅读文档后直接创建 key 并在 Scalar "Try it" 中测试，形成闭环体验。site-docs 因此从纯 SSG 调整为 hybrid 模式（SSG + 少量 SSR），仅 `/settings` 走 SSR，对性能影响极小。数据均为公开静态内容，保密性需求低，key 主要用于身份识别和限流，用户自助管理即可。

从实施可行性来看，所有核心组件在 monorepo 中已有参考实现，首批迁移范围也做了合理的只读接口限定，风险较低。

**结论：** 设计可行，可直接进入实施计划阶段。建议修改项可在实施过程中逐步明确，不阻塞计划编写。

---

## 风险评估

### 低风险

- **handler 复用的类型兼容性**：magic 和 hearthstone 的 handler 在各自站点中有独立的 ORPC 基础实例（`os`），合并到 site-api 时需确保 context 类型兼容。由于 v1 接口均为只读且不依赖用户 session context，此风险可控。
- **数据库连接共享**：site-api 和 site-docs 与现有站点共享同一数据库，需确保 Hyperdrive 配置正确且连接池不会被新服务耗尽。Cloudflare Hyperdrive 自带连接池管理，风险有限。site-docs 仅 `/settings` 页面查询数据库，负载极低。
- **文档站 spec 同步延迟**：site-docs 采用 SSG，spec 在构建时生成。API 变更后需触发 site-docs 重建才能更新文档。可通过 CI 自动触发规避，风险有限。

### 中风险

- **限流状态一致性**：`@better-auth/api-key` 的限流依赖数据库字段（`requestCount`、`remaining`、`lastRequest`），在高并发场景下可能存在竞态。v1 流量较低时可接受，后续如流量增长需考虑 Redis 等方案。

### 排除的风险

- 游戏站点前端改造风险（v1 不涉及）
- SDK 生成兼容性风险（v1 不涉及）
- 写入接口的事务一致性风险（v1 仅只读）
