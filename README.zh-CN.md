# TCG Cards

[![Bun](https://img.shields.io/badge/Bun-1.3.10-000000?logo=bun&logoColor=white)](https://bun.sh/)
[![Nuxt](https://img.shields.io/badge/Nuxt-4-00DC82?logo=nuxtdotjs&logoColor=white)](https://nuxt.com/)
[![Turborepo](https://img.shields.io/badge/Turborepo-2-EF4444?logo=turborepo&logoColor=white)](https://turbo.build/repo)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Drizzle ORM](https://img.shields.io/badge/Drizzle_ORM-PostgreSQL-C5F74F?logo=drizzle&logoColor=black)](https://orm.drizzle.team/)
[![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-F38020?logo=cloudflareworkers&logoColor=white)](https://workers.cloudflare.com/)

TCG Cards 是一个基于 Bun 和 Turborepo 的 monorepo，用于构建覆盖多种集换式卡牌游戏的通用数据平台。

项目的长期目标是提供可复用的 TCG 卡牌数据库基础能力，包括网页查询、面向 App 的查询能力、公开 API、全量数据库导出，以及将这些能力简单扩展到更多 TCG 的机制。

当前仓库包含万智牌、炉石传说、主站、内部控制台、Cloudflare Worker 自动化任务，以及数据库 schema、领域模型、搜索、UI 和共享配置等 workspace package。

英文版：[README.md](./README.md)

## 技术栈

- [Bun](https://bun.sh/)：workspace 包管理和脚本运行
- [Turborepo](https://turbo.build/repo)：monorepo 任务编排
- [Nuxt](https://nuxt.com/) 和 Vue：Web 应用
- [Nuxt UI](https://ui.nuxt.com/) 和 Tailwind CSS：界面和样式
- [Drizzle ORM](https://orm.drizzle.team/)：PostgreSQL schema 和迁移
- [oRPC](https://orpc.unnoq.com/)：类型化 API handler
- [Cloudflare Workers](https://workers.cloudflare.com/)、Hyperdrive、R2、KV：部署和平台能力

## 仓库结构

```text
apps/
  site-main/        tcg.cards 主站
  site-magic/       万智牌数据站
  site-hearthstone/ 炉石传说数据站
  site-console/     内部控制台和数据工具
  watcher/          定时自动化 Cloudflare Worker

packages/
  db/               Drizzle schema、migration 和数据库工具
  model/            共享 Zod 领域模型
  search/           搜索模型和辅助工具
  shared/           共享常量和工具代码
  ui/               共享 Nuxt UI layer 和组件
  tsconfig/         共享 TypeScript 配置
  eslint-config-custom/
                   共享 ESLint 配置

specs/              已通过评审的设计、评审和实施计划
references/         建模使用的本地参考资料和上游材料
scripts/            工具脚本
turbo/              Turborepo generator 和模板
```

## 应用

| Workspace | 用途 | 默认开发端口 |
|-----------|------|--------------|
| `site-main` | 主入口站点 | `3000` |
| `site-magic` | 万智牌数据站 | `3001` |
| `site-hearthstone` | 炉石传说数据站 | `3002` |
| `site-console` | 内部数据和管理控制台 | `2999` |
| `@tcg-cards/watcher` | 定时 Cloudflare Worker | Wrangler 默认端口 |

## 快速开始

### 前置要求

- Bun `1.3.10` 或兼容版本
- Nuxt 和 Wrangler 所需的 Node 兼容工具链
- 使用数据库相关功能时需要 PostgreSQL 连接
- 部署相关流程需要 Cloudflare 账号和 Wrangler 配置

### 安装依赖

```sh
bun install
```

### 配置环境变量

按需复制要启动的 workspace 示例文件：

```sh
cp apps/site-magic/.env.example apps/site-magic/.env
cp apps/site-hearthstone/.env.example apps/site-hearthstone/.env
cp apps/site-console/.env.example apps/site-console/.env
cp apps/watcher/.dev.vars.example apps/watcher/.dev.vars
cp packages/db/.env.example packages/db/.env
```

根据本地数据库、Cloudflare、认证和 API 凭据更新复制后的文件。

### 启动全部开发任务

```sh
bun run dev
```

该命令会通过 Turborepo 执行 monorepo 的 `dev` pipeline。长期运行的开发任务不会被缓存。

### 启动单个应用

```sh
cd apps/site-magic
bun run dev
```

`site-main`、`site-hearthstone`、`site-console` 也可以使用同样方式启动。

## 常用命令

除非特别说明，以下命令都在仓库根目录执行。

| 命令 | 说明 |
|------|------|
| `bun install` | 安装 workspace 依赖 |
| `bun run dev` | 通过 Turbo 启动全部开发任务 |
| `bun run check` | 在整个 monorepo 执行 lint、typecheck 和 build |
| `bun run build` | 构建所有可构建 workspace |
| `bun run lint` | 执行 monorepo lint 任务 |
| `bun run typecheck` | 对支持的 workspace 执行 TypeScript 检查 |
| `bun run postinstall` | 执行安装后的准备任务 |
| `bun run gen <name>` | 使用仓库 generator 创建新站点 |

每个应用目录内也有独立命令：

```sh
cd apps/site-hearthstone
bun run build
bun run lint
bun run typecheck
```

## 数据库流程

数据库 schema 代码位于 `packages/db`。

```sh
cd packages/db
bun run db:generate
bun run db:migrate
bun run db:studio
```

连接 PostgreSQL 的 Drizzle 命令需要配置 `DATABASE_URL`。

## 部署

Nuxt 应用通过 Nitro 的 Cloudflare preset 和各应用内的 `wrangler.toml` 配置部署到 Cloudflare Workers。

典型部署流程：

```sh
cd apps/site-magic
bun run build
bun run deploy
```

不是所有应用都提供 `deploy` 脚本。请检查对应 workspace 的 `package.json` 和 `wrangler.toml`。

仓库中使用的 Cloudflare 绑定包括：

- Hyperdrive：PostgreSQL 访问
- R2 bucket：数据和资源存储
- KV：watcher 状态存储
- Wrangler secrets：生产环境敏感配置

## 设计规格

已通过评审的设计资料放在 `specs/<topic>/` 下，并使用固定文件名：

- `design.md`
- `review.md`
- `plan.md`

## 参考资料

`references/` 目录用于保存建模参考资料和上游源材料。大型原始文件应在 `.gitignore` 覆盖时保持不入 Git；小型精选样例和说明文档如果对设计和实现有帮助，可以提交。

## 许可证

本仓库的原创代码和文档使用 [MIT License](./LICENSE) 授权。

第三方游戏名称、卡牌文本、卡图、商标和源数据归各自权利方所有。本项目不是任何 TCG 发行方的官方项目，也不代表获得其认可或正式授权。

第三方内容、商标、API、导出数据和下架请求相关说明见 [LEGAL.zh-CN.md](./LEGAL.zh-CN.md)。

隐私政策和服务条款的基础版本见 [PRIVACY.zh-CN.md](./PRIVACY.zh-CN.md) 与 [TERMS.zh-CN.md](./TERMS.zh-CN.md)。
