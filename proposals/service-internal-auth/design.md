# service-internal 登录服务设计

## 背景

当前仓库中的登录能力分散在各个站点内部：

- `site-console` 自己承载 `better-auth` 服务端配置与 `/api/auth/[...]`
- `site-magic` 也维护一套独立的 `better-auth` 服务端配置

这与既有规格中“`service-internal` 统一承载 Auth API”的方向不一致，也会导致后续第一方客户端继续复制认证服务端实现。

本次实现先收敛最小可用版本：

- 新建 `apps/service-internal`
- 由 `service-internal` 以 `Hono + Cloudflare Worker` 形式承载用户名密码登录服务
- `site-console` 不再直接执行本地 auth handler，而是通过同源 `/api/auth/[...]` 路由转发到 `service-internal`

## 目标

1. 提供可独立运行和部署的 `service-internal` 登录服务
2. 抽离 `site-console` 与 `service-internal` 共用的服务端 auth 配置
3. 保持 `site-console` 浏览器侧仍然访问同源 `/api/auth/[...]`
4. 不要求浏览器直接跨域访问 `internal` 域名

## 非目标

1. 本次不迁移 `site-magic` 到 `service-internal`
2. 本次不实现 `Internal Query API`、`Admin API`、`Desktop Gateway`
3. 本次不实现跨站点共享 session
4. 本次不引入新的数据库表或迁移

## 方案

### 1. 新建 `service-internal`

新增 `apps/service-internal` workspace，提供：

- `src/index.ts`：Hono Worker 入口
- `src/auth.ts`：基于共享 auth 工厂的登录服务配置
- 健康检查与基础状态输出

服务仅承载 Auth API，不承载其他内部接口，不引入页面层。

### 2. 抽离共享 auth 服务端工厂

在 `packages/auth` 中新增服务端工厂与权限导出：

- 统一导出 `ac`、`roles`
- 提供面向 `site-console` / `service-internal` 的 auth 工厂

这样 `site-console` 与 `service-internal` 复用相同的：

- 用户名登录启用方式
- `admin` / `owner` 权限模型
- `trustedOrigins` 默认配置

### 3. `site-console` 改为同源转发

保留 `site-console` 现有的浏览器访问方式：

- 前端仍然请求 `site-console` 自己的 `/api/auth/[...]`

但该路由不再本地处理登录逻辑，而是把请求转发到 `service-internal`。

这样有几个直接收益：

- 浏览器仍然是同源请求
- `site-console` 自己持有 cookie，不要求浏览器直接跨服务访问 auth
- SSR 中间件仍可读取 `site-console` 域下的 cookie
- 本次不必同时解决跨域 cookie、CORS 与浏览器跨服务登录问题

### 4. 配置方式

- `service-internal` 自己使用 `BETTER_AUTH_SECRET`
- `site-console` 新增内部服务地址配置，例如 `INTERNAL_AUTH_URL`
- 本地开发默认指向 `http://localhost:2998`
- `service-internal` 通过 Worker `env` 接收 `BETTER_AUTH_SECRET` 与 `HYPERDRIVE`

## 风险与约束

### 1. 当前 session 不跨站共享

由于 `site-console` 采用同源转发，cookie 仍然属于 `site-console` 域，这符合“本次不强制 session 自动互通”的约束。

### 2. `service-internal` 暂时只收口一部分客户端

本次只迁移 `site-console`，后续 `site-magic` 是否接入需要单独设计。

### 3. 转发链路需要保留关键请求头

代理实现必须保留认证相关 header 与 body，并避免错误转发 `host`、`content-length` 等由运行时重新计算的头。

## 验收标准

1. `apps/service-internal` 可以独立启动
2. 访问 `service-internal` 的 `/api/auth/*` 可处理登录相关请求
3. `site-console` 前端无需修改登录调用路径，仍然使用同源 `/api/auth/*`
4. `site-console` 的服务端 auth 路由实际转发到 `service-internal`
5. 共享 auth 配置不再在 `site-console` 与 `service-internal` 间重复定义
