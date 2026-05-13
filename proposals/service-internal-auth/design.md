# service-internal 登录服务设计

> 稳定的运行时边界、能力分层和数据归属规则以 [../../docs/project-architecture.zh-CN.md](../../docs/project-architecture.zh-CN.md) 为准。本文只描述 `service-internal` 登录服务的需求级设计；若有冲突，以主架构文档为准。

## 背景

当前仓库中的登录能力分散在多个运行时入口中：

- `site-console` 自己承载 `better-auth` 服务端配置与 `/auth/[...]`
- `site-magic` 也维护一套独立的 `better-auth` 服务端配置

同时，仓库里一度引入了“`site-console` 同源 `/auth/*` 再转发到 `service-internal`”的方案。该方案会把站点首屏和浏览器 session 链路依赖到外部 service，不符合当前确认的运行时边界：

- `site-*` 的后端请求应在各自 Worker 内本地处理
- `app-*` 才统一走 `service-*`
- 共享应发生在代码层，而不是 HTTP 转发层

因此，本设计修正为：

- 新建 `apps/service-internal`
- 由 `service-internal` 以 `Hono + Cloudflare Worker` 形式承载 `app-*` 使用的登录服务
- `site-console`、`site-magic` 继续保留各自本地 `/auth/[...]`
- `site-*` 与 `service-internal` 通过共享 auth 工厂复用配置，而不是通过站点代理复用运行时

## 目标

1. 提供可独立运行和部署的 `service-internal` 登录服务，供 `app-*` 使用
2. 抽离 `site-*` 与 `service-internal` 共用的服务端 auth 配置
3. 保持 `site-*` 浏览器侧仍然访问各自同源 `/auth/[...]`
4. 避免 `site-*` 通过 HTTP 依赖 `service-internal` 完成登录

## 非目标

1. 本次不要求 `site-magic` 或其他 `site-*` 改为调用 `service-internal`
2. 本次不实现 `Internal Query API`、`Admin API`、`Desktop Gateway`
3. 本次不实现 `site-*` 与 `app-*` 的跨运行时共享 session
4. 本次不引入新的数据库表或迁移

## 方案

### 1. 新建 `service-internal`

新增 `apps/service-internal` workspace，提供：

- `src/index.ts`：Hono Worker 入口
- `src/auth.ts`：基于共享 auth 工厂的登录服务配置
- 健康检查与基础状态输出

服务仅承载 `app-*` 使用的 Auth API，不承载页面层，也不作为 `site-*` 的认证代理目标。

### 2. 抽离共享 auth 服务端工厂

在 `packages/auth` 中新增服务端工厂与权限导出：

- 统一导出 `ac`、`roles`
- 提供面向 `site-console` / `service-internal` 的 auth 工厂

这样 `site-*` 与 `service-internal` 复用相同的：

- 用户名登录启用方式
- `admin` / `owner` 权限模型
- `trustedOrigins` 默认配置

### 3. `site-*` 保留本地认证入口

保留 `site-*` 现有的浏览器访问方式：

- 前端仍然请求站点自己域名下的 `/auth/[...]`

但该路由应继续在站点自己的 Worker 中本地处理登录逻辑，而不是把请求转发到 `service-internal`。

这样有几个直接收益：

- 浏览器仍然是同源请求
- 站点自己持有 cookie，不引入额外网络跳转
- SSR 中间件仍可读取站点域下的 cookie
- 不会把站点首屏稳定性绑定到外部 service 的可达性、压缩或路由配置

### 4. 配置方式

- `service-internal` 自己使用 `BETTER_AUTH_SECRET`
- `site-*` 各自使用自己的 `BETTER_AUTH_SECRET`
- `site-*` 不需要 `INTERNAL_AUTH_URL` 这类认证代理地址
- `service-internal` 通过 Worker `env` 接收 `BETTER_AUTH_SECRET` 与 `HYPERDRIVE`

## 风险与约束

### 1. 当前 session 不跨站共享

由于 `site-*` 采用本地同源认证，cookie 仍然属于各自站点域；而 `app-*` 的 session 属于 `service-*`，这符合“本次不强制 session 自动互通”的约束。

### 2. `service-internal` 只服务于 `app-*`

`service-internal` 不应被回收为 `site-*` 的认证下游；后续若新增站点，也应优先保留本地认证入口。

### 3. 需要明确共享边界

共享应通过 `packages/auth` 等共享模块完成，不应再通过站点代理到 `service-internal` 的方式复用运行时。

## 验收标准

1. `apps/service-internal` 可以独立启动
2. 访问 `service-internal` 的 `/auth/*` 可处理 `app-*` 的登录相关请求
3. `site-console` 前端无需修改登录调用路径，仍然使用自己的同源 `/auth/*`
4. `site-console` 的服务端 auth 路由在本地 Worker 中处理，而不是转发到 `service-internal`
5. 共享 auth 配置不再在 `site-*` 与 `service-internal` 间重复定义
