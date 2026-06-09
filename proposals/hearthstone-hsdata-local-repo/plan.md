# hsdata 本地 git repo 导入重构实施计划

> 稳定的运行时边界、数据归属和同步规则以 [../../docs/project-architecture.zh-CN.md](../../docs/project-architecture.zh-CN.md) 为准。本文只记录本需求的实施计划；若有冲突，以主架构文档为准。

## TODO List

- [x] 恢复 worker-safe 的 hsdata 共享导入与投影路由
- [x] 移除 site-console 中错误放置的本地 git 读取实现
- [x] 将 site-console 与 desktop 页面切回各自运行时语义
- [x] 更新 README、设计文档和仓库记忆，避免继续误用 site-console
- [x] 设计 desktop 侧 hsdata repo 路径配置方式
- [x] 实现 desktop 本地 git 枚举与 XML 读取命令
- [x] 接入 desktop 端本地 hsdata 导入页面
- [ ] 在真实本地 repo 与远端服务环境中完成端到端验证

## 实施步骤

### 1. 恢复 worker-safe 的 hsdata 共享导入与投影路由

- 保留 `importHsdata`、`projectHsdata` 和概览查询辅助
- 恢复共享 `getOverview`、`importArchive(xml)`、`projectSourceVersion` 路由
- 确保共享层不包含本地 git 或 R2 读取逻辑

### 2. 移除 site-console 中错误放置的本地 git 读取实现

- 删除 site-console server 内的本地 hsdata repo helper 与测试
- 删除 site-console 本地 hsdata ORPC 路由
- 确认 site-console server 不再残留 git 读取引用

### 3. 将 site-console 与 desktop 页面切回各自运行时语义

- site-console 数据源页改为数据库概览页
- site-console 完全移除数据导入页，并且 web 侧不再暴露 hsdata 写接口
- desktop 新增独立的数据源占位页，并明确本地导入将落在 desktop

### 4. 更新 README、设计文档和仓库记忆

- 改写 `apps/site-console/README.md`
- 更新 proposal 下的 design / review / plan
- 同步 repo memory 中关于 hsdata 本地 repo 的结论

### 5. 设计 desktop 侧 hsdata repo 路径配置方式

- 明确 repo 路径从何处配置与持久化
- 明确本地命令与远端 worker-safe 路由之间的调用边界
- 避免沿用只适用于本地开发 monorepo 的隐式假设

### 6. 实现 desktop 本地 git 枚举与 XML 读取命令

- 在 desktop 本地命令层实现 repo 状态读取
- 实现 worktree 与 tag 枚举
- 实现按来源读取 `CardDefs.xml`

### 7. 接入 desktop 端本地 hsdata 导入页面

- 用本地命令驱动 desktop 页面
- 通过 worker-safe 导入接口提交 XML

### 8. 在真实本地 repo 与远端服务环境中完成端到端验证

- 使用真实 hsdata repo 校验路径保存、worktree/tag 枚举与 XML 读取
- 联通远端导入接口验证 dry run / 写库 / 投影链路
- 若真实环境出现兼容问题，再在 desktop 命令或页面层局部修正
