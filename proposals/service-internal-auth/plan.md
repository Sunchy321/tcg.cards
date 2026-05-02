# service-internal 登录服务实施计划

## TODO List

- [x] 调整共享 auth 工厂以支持 Worker 环境注入 secret
- [x] 将 `service-internal` 从 Nuxt 服务替换为 Hono Worker
- [ ] 恢复 `site-console` 的本地 `/auth/[...]` 处理
- [ ] 移除 `site-*` 对认证代理地址的运行时依赖
- [x] 清理 Nuxt 专属文件与依赖
- [ ] 验证 `service-internal` 与 `site-*` 的边界修正

## 实施步骤

### 1. 抽离共享 auth 配置

在 `packages/auth` 中新增共享权限定义与服务端工厂，供 `site-console` 与 `service-internal` 复用。

### 2. 创建内部登录服务

新增 `apps/service-internal` workspace，提供最小 Hono Worker 入口、认证 handler 和基础状态输出。

### 3. 修正 `site-*` 的认证入口

保留前端同源访问方式，并将站点服务端 `/auth/[...]` 恢复为本地处理，而不是转发到 `service-internal`。

### 4. 配置与校验

补充 `.env.example` 与必要文档，移除不再需要的认证代理配置，并执行最小范围验证。
