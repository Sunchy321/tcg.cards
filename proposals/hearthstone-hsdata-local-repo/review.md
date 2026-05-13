# hsdata 本地 git repo 导入重构设计评审

> 稳定的运行时边界、数据归属和同步规则以 [../../docs/project-architecture.zh-CN.md](../../docs/project-architecture.zh-CN.md) 为准。本文只记录本需求的评审结论；若有冲突，以主架构文档为准。

## 评审结论

接受修正后的设计方向，按“worker-safe 共享导入层 + desktop 本地重能力层”推进。

## 评审要点

### 1. 为什么 site-console 不能继续读取本地 git

因为 site-console 运行在 Cloudflare Workers 上，不具备本地文件系统和本地 git 运行时条件。此前把本地 git 读取放进 site-console 属于错误运行时放置，必须移除。

### 2. 为什么 service-internal 也不能承接这部分能力

因为 service-internal 同样部署在 Workers 上。即使 desktop 通过远端 RPC 访问 service-internal，也不能借此获得本地 git 能力。

### 3. 为什么共享层仍然要保留 hsdata 路由

因为 XML 导入、数据库概览和领域投影本身是 worker-safe 的共享逻辑。真正需要收缩的是“来源读取能力”，不是整个 hsdata 路由面。

### 4. 为什么 desktop 需要本地命令层而不是继续走远端 RPC

因为 repo 路径配置、本地 git 枚举和 `CardDefs.xml` 读取都必须在桌面端本地执行；远端 worker-safe RPC 只负责接收 XML、写库与投影。

## 需要注意的问题

- 所有 README、提案、计划和页面文案都要去掉“site-console 直接读本地 repo”的表述
- desktop 后续实现时，repo 路径配置不能再依赖 site-console 的本地开发假设
- 不要再让共享 console-shell 页面默认携带“所有运行时都能读本地 git”的语义
- desktop 当前只完成了静态验证，仍需真实本地 repo 与远端服务联调
