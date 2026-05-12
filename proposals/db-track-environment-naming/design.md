# 数据库轨道与环境命名收口提案

## 背景

当前 `packages/db` 已经开始拆分为两条 schema 轨道：

- `local`
- `remote`

但脚本与环境文件命名仍然混用了另一套维度：

- `.env.development`
- `.env.production`
- `db:migrate`
- `db:push`

这会导致两个问题：

1. `local / remote` 与 `development / production` 混在一起，无法明确表达“这是哪条 schema 轨道”以及“这是哪个实例环境”。
2. 开发期同样会存在：
   - 本地构建数据库开发实例
   - 远端 serving 数据库开发实例

因此，“本地数据库 / 远程数据库”这种说法已经不够准确，必须拆成两个正交维度。

## 目标

- 明确区分 schema 轨道与实例环境
- 让 `packages/db` 的脚本名直接表达：
  - 操作哪条 schema 轨道
  - 作用于哪个实例环境
- 让环境文件名与脚本语义一致
- 保持第一阶段改动尽量局部，不立刻重写所有消费端

## 非目标

- 不在本轮重命名现有 schema 文件
- 不在本轮改写桌面端 keyring 里的本地数据库连接保存逻辑
- 不在本轮引入新的 db 包拆分

## 核心结论

### 1. 术语必须拆成两个维度

后续统一使用以下两类术语：

#### 1.1 schema 轨道

- `local schema`
  - 桌面端本地构建库使用的结构
- `remote schema`
  - 远端 serving / control-plane 使用的结构

#### 1.2 实例环境

- `dev instance`
  - 开发或测试环境实例
- `prod instance`
  - 生产环境实例

这两个维度必须视为正交：

- `local-dev`
- `local-prod`
- `remote-dev`
- `remote-prod`

## 命名原则

### 1. 脚本名同时编码轨道与环境

脚本不应再使用模糊的默认名来掩盖目标。

建议统一为：

- `db:generate:local`
- `db:generate:remote`
- `db:check:local`
- `db:check:remote`
- `db:studio:local:dev`
- `db:push:local:dev`
- `db:push:remote:dev`
- `db:migrate:local:dev`
- `db:migrate:remote:dev`
- `db:migrate:remote:prod`
- `db:up:remote:prod`

其中：

- `generate` 与 `check` 只依赖 schema 轨道，不依赖实例环境
- `push / migrate / studio / up` 必须显式带实例环境

### 2. 环境文件名必须对应目标实例

建议把现有：

- `.env.development`
- `.env.production`

收口为：

- `.env.local-dev`
- `.env.remote-dev`
- `.env.remote-prod`

说明：

- `local-prod` 不需要常驻仓库 env 文件
- 正式本地构建库连接仍由桌面端 keyring 或用户本地配置提供
- 仓库内主要需要覆盖：
  - 开发期本地构建库
  - 开发期远端库
  - 生产远端库

### 3. 默认脚本应尽量减少

建议不再保留这些模糊默认脚本：

- `db:migrate`
- `db:push`
- `db:check`
- `db:studio`

因为这些名字无法说明：

- 目标是 `local` 还是 `remote`
- 环境是 `dev` 还是 `prod`

如需保留兼容别名，也应只作为短期过渡，并在 README 中标注为 deprecated。

## 实施方案

### 1. package.json 脚本重命名

在 `packages/db/package.json` 中完成以下调整：

- 删除或弃用模糊默认脚本
- 增加显式脚本：
  - `db:generate:local`
  - `db:generate:remote`
  - `db:check:local`
  - `db:check:remote`
  - `db:studio:local:dev`
  - `db:push:local:dev`
  - `db:push:remote:dev`
  - `db:migrate:local:dev`
  - `db:migrate:remote:dev`
  - `db:migrate:remote:prod`
  - `db:up:remote:prod`

### 2. 环境文件重命名

在 `packages/db` 内完成：

- `.env.development` -> `.env.local-dev`
- `.env.development.example` -> `.env.local-dev.example`
- `.env.production` -> `.env.remote-prod`
- `.env.production.example` -> `.env.remote-prod.example`

并新增：

- `.env.remote-dev`
- `.env.remote-dev.example`

### 3. README 重写

README 里需要把以下内容同步改掉：

- 旧的 development / production 二元描述
- 旧的默认脚本示例
- 旧的“development database / production database”说法

统一改成：

- `local schema / remote schema`
- `dev instance / prod instance`
- 按显式脚本名给出示例

## 兼容策略

第一阶段允许：

- 保留 `drizzle.config.ts` 继续作为 remote config 别名

第一阶段不建议：

- 继续保留 `db:migrate` 这类默认脚本

如果短期必须保留，也应：

- 在 README 标记 deprecated
- 明确其实际映射目标

## 风险

### 1. 旧习惯命令失效

开发者可能仍然习惯执行：

- `bun run db:migrate`
- `bun run db:push`

缓解方式：

- README 明确迁移表
- 如有必要，短期保留 deprecated 别名并输出提示

### 2. 远端开发实例与本地开发实例继续混淆

如果 env 文件命名不彻底，后续仍会发生误用。

缓解方式：

- 一次性把 env 文件名收口到 `local-dev / remote-dev / remote-prod`

## 验收标准

- 所有 db 脚本名都能明确表达轨道与环境
- `packages/db` 不再使用 `.env.development` / `.env.production`
- README 中不再使用模糊的“本地数据库 / 远程数据库”说法
- 开发者可直接从脚本名判断目标库
