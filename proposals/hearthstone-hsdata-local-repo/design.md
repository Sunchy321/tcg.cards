# hsdata 本地 git repo 导入重构设计

> 稳定的运行时边界、数据归属和同步规则以 [../../docs/project-architecture.zh-CN.md](../../docs/project-architecture.zh-CN.md) 为准。本文只描述 hsdata 本地 repo 导入链路的需求级设计；若有冲突，以主架构文档为准。

## 背景

当前 hsdata 原始导入已经不再需要依赖 R2 作为 XML 中转存储，但运行时边界需要重新明确：

- site-console 运行在 Cloudflare Workers 上
- service-internal 同样运行在 Workers 上
- 只有 desktop 端具备接触本地文件系统与本地 git 的条件

因此，“改为本地 git repo”这件事不能落在 site-console 或任何 worker 路由中，只能拆成两层：

1. worker-safe 共享导入层：接受 XML 文本、写入数据库、查询概览、执行投影
2. desktop 本地重能力层：读取本地 hsdata git repo，枚举来源并把 XML 交给共享导入层

## 目标

- 移除 hsdata 依赖 R2 存储与读取的能力
- 保留 worker-safe 的 `importHsdata`、`projectHsdata` 与概览查询能力
- 明确 site-console 不提供本地 git 读取，也不提供 web 导入/投影入口，只保留概览
- 将本地 hsdata git repo 读取收敛到 desktop 端
- 为后续 desktop 本地导入工作流保留清晰边界

## 非目标

- 不重写 hsdata XML 解析与数据库导入核心
- 不改变 `hearthstone_data` 表结构
- 不在 Workers 运行时中引入本地 git、文件系统或 Bun 子进程依赖
- 不在本轮把 desktop 端本地 repo 工作流全部实现完毕

## 现状约束

- `packages/console-api/src/lib/hearthstone/hsdata-import.ts` 只依赖 XML 文本与来源元数据
- `packages/console-api/src/lib/hearthstone/hsdata-project.ts` 是纯数据库投影逻辑
- site-console 和 service-internal 都不能安全承载本地 git 读取能力
- desktop 已接入一版本地 repo 路径配置、来源枚举与导入页面，但仍缺少真实环境联调验证

这意味着本次重构首先要修正运行时边界，而不是继续把“本地 repo 读取”塞进 site-console。

## 设计决策

### 1. 共享层保留 worker-safe hsdata 路由

`packages/console-api` 中保留以下能力：

- `getOverview`
- `importArchive`，但输入改为直接接收 XML 文本与来源元数据
- `projectSourceVersion`
- `importHsdata`
- `projectHsdata`
- `getHsdataOverview`

这组能力不读取本地文件、不访问 git、不依赖 R2，只处理数据库与 XML 文本。

### 2. site-console 只保留概览页面

site-console 页面职责收缩为：

- 展示 hsdata 相关数据表概览
- 明确提示“本地 git repo 读取仅 desktop 可用”

site-console 不再有：

- 本地 repo 配置
- worktree / tag 列表
- 直接读取 `CardDefs.xml`
- 任何 Bun / git 子进程逻辑

### 3. desktop 承担本地 hsdata repo 读取

desktop 后续需要补齐本地能力层，负责：

- 读取本地 hsdata repo 配置
- 枚举 `worktree` 与可导入 tag
- 读取对应 `CardDefs.xml`
- 通过 worker-safe 接口把 XML 送入共享导入链路

这一层应落在 desktop 自己的本地命令边界中，而不是 service-internal。

### 4. 文档与页面语义同步收口

所有与 hsdata 相关的文档、README、页面提示和实现计划都必须统一为以下语义：

- R2 已移除
- site-console 不读本地 git
- desktop 才是本地 repo 入口
- desktop 已具备本地 repo 初版导入流程，但仍需真实环境验证与体验打磨

## 分阶段交付

### 阶段一：运行时边界纠偏

- 恢复 worker-safe 共享 hsdata 路由
- 移除 site-console 中错误放置的本地 git 能力
- 将 site-console 页面收缩为概览，并移除 web 导入界面
- 为 desktop 增加占位页面，避免继续使用错误语义

### 阶段二：desktop 本地 repo 导入

- 设计 desktop 侧 repo 配置来源
- 实现本地 git 枚举与 XML 读取命令
- 接入 desktop 页面工作流
- 在真实本地 repo 与远端服务环境中完成端到端验证

## 风险与取舍

### 真实环境联调尚未完成

desktop 已具备本地 repo 初版导入流程，但仍需要真实 hsdata repo 与远端服务环境联调。这比继续在错误运行时上暴露 web 写入口更可控，也更容易局部修正。

### 共享页面不再适合作为默认实现

由于不同运行时能力已经分叉，hsdata 页面不能再继续假设所有宿主都支持本地 git。需要由具体应用提供自己的页面实现或覆盖。

## 验收标准

- 仓库中不再存在 hsdata 上传到 R2 的有效工作流
- site-console server 侧不再存在本地 git 读取能力
- site-console 页面只保留概览，并明确提示 desktop 才能做本地导入
- 共享 hsdata 路由保持 worker-safe
- desktop 已具备本地 repo 配置、来源枚举与导入/投影入口
- 真实本地环境联调仍需单独完成
