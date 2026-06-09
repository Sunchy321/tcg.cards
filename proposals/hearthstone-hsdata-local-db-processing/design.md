# hsdata 本地数据库处理迁移设计

> 稳定的运行时边界、数据归属和同步规则以 [../../docs/project-architecture.zh-CN.md](../../docs/project-architecture.zh-CN.md) 为准。本文只描述 hsdata 本地数据库处理迁移的需求级设计；若有冲突，以主架构文档为准。

## 背景

当前 `hsdata` 链路虽然已经把 XML 读取、规范化、分块准备收敛到 desktop Rust，但真正的数据处理仍然依赖远端数据库与远端 ORPC：

- desktop 端在本地读取 hsdata git repo，并准备 canonical chunk payload
- desktop 端通过登录后的远端会话创建 `hsdata_import_job`
- chunk 上传和 `finalizeImportJob` 在远端执行
- `source_versions`、`raw_entity_snapshots`、`raw_entity_snapshot_tags` 仍写入远端数据库
- `projectSourceVersion` 仍在远端执行，并更新远端投影状态
- desktop 导入页和数据源页读取的状态与概览也来自远端 ORPC

这与当前已经批准的“本地 PostgreSQL 作为权威构建层”方向不一致。`hsdata` 作为桌面端已完全掌握输入源、且原始快照与导入状态都明确属于 `hearthstone_data` 构建型数据的链路，应该优先迁入本地数据库。

当前仓库也已经具备本地 schema 和 local migration，说明数据库模型前提已经到位。剩下的核心问题不再是 schema，而是运行时边界：

- 谁负责连接本地 PostgreSQL
- 谁负责执行 import / finalize / project
- desktop 页面如何改为读取本地状态
- 远端接口在迁移过程中如何降级为非权威或被移除

## 目标

- 让 `hsdata_import_*`、`source_versions`、`raw_entity_snapshots`、`raw_entity_snapshot_tags` 的权威写入迁入 desktop 本地 PostgreSQL
- 让 desktop 导入页、数据源页读取本地数据库状态，而不是远端 ORPC
- 让 `hsdata` 投影执行迁入本地运行时，不再依赖远端 `projectSourceVersion`
- 保持现有 hsdata 本地 repo 读取和 Rust payload 准备链路继续成立
- 为后续“本地构建 -> 远端发布”保留清晰边界

## 非目标

- 本轮不实现 PostgreSQL 进程托管、`initdb`、启动或停止
- 本轮不设计远端正式表发布链路
- 本轮不迁移 `magic_data.import_*` 或其他游戏的数据处理
- 本轮不把公开站点改为直接读取本地数据库
- 本轮不引入 Bun/Node 本地 sidecar 作为生产运行时前提

## 现状问题

### 1. 输入在本地，处理中间态却仍写远端

当前 desktop 已经拥有：

- 本地 hsdata repo 路径
- 本地 XML 内容
- 本地 Rust 规范化与分块准备能力

但导入状态和原始快照仍写远端，这使系统出现明显割裂：

- source of truth 不在 desktop 所在机器
- 本地重跑、失败恢复和离线检查都受远端可达性影响
- “本地 PG 是构建层”无法先在 hsdata 上闭环验证

### 2. desktop 页面读到的是远端状态，不是本地构建状态

当前 desktop `hsdata` 页面展示的：

- sourceTag 状态
- 数据表概览
- 导入/投影进度

本质上都是远端数据库状态。即使本地已经准备了 payload，也无法从页面上直接确认本地构建层的真实状态。

### 3. 远端 ORPC 仍承担了构建型处理职责

当前远端仍然负责：

- staged import job 创建与 chunk 接收
- raw snapshot 写入
- projection 状态流转
- raw overview 查询

这些都属于明确的构建型职责，不应继续停留在远端权威层。

### 4. 没有现成的本地 TS 服务面可复用

`app-console-desktop` 当前是 `ssr: false` 的 Nuxt 前端壳层，没有本地 Nitro server，也没有已存在的 Node/Bun sidecar。

因此不能把这次迁移误判为“改一下连接串就能复用现有 `packages/console-api`”。如果要在本地执行处理逻辑，当前可行运行时只有：

- Tauri Rust command
- 新增独立本地服务进程

相比之下，额外引入 Bun/Node sidecar 会显著增加：

- 打包和分发复杂度
- 本地运行时依赖
- 进程编排与恢复语义

因此本轮优先采用 Rust 本地运行时。

## 设计结论

### 1. hsdata 本地处理统一收口到 desktop Rust

desktop Rust 成为本地 hsdata 数据处理的唯一执行面，负责：

- 读取并校验本地数据库连接配置
- 建立本地 PostgreSQL 连接
- 执行 import job 创建、chunk 应用、finalize
- 执行 raw snapshot 到领域投影的本地处理
- 返回 desktop 页面所需的状态、概览和进度事件

desktop 前端不再直接调用远端 ORPC 进行 hsdata 导入与投影。

### 2. 本轮不引入本地 JS sidecar

不新增本地 Bun/Node sidecar，理由如下：

- 当前 desktop 打包产物没有 Node/Bun 作为稳定运行时前提
- 新增 sidecar 会引入本地进程管理、日志、升级、崩溃恢复和权限边界问题
- 这会把“迁移 hsdata 构建层”扩展成“引入一套新的本地服务架构”，偏离当前主目标

本轮以 Rust 直接执行本地数据库处理为正式方案。

### 3. 迁移范围按两层处理

#### 3.1 第一层：本地 staged import 与 raw snapshot 层

优先迁入本地 PostgreSQL 的对象：

- `hearthstone_data.hsdata_import_jobs`
- `hearthstone_data.hsdata_import_job_chunks`
- `hearthstone_data.hsdata_import_job_snapshots`
- `hearthstone_data.source_versions`
- `hearthstone_data.raw_entity_snapshots`
- `hearthstone_data.raw_entity_snapshot_tags`
- `hearthstone_data.tag_value_view`

这一层迁移完成后，本地应能独立完成：

- 创建 import job
- 记录 chunk 状态
- 完成 finalize
- 写入 source version 与 raw snapshot
- 展示本地 sourceTag 状态与数据源概览

#### 3.2 第二层：本地 projection 层

第二阶段迁移：

- `projectSourceVersion` 执行面
- `source_versions.projection_status / projection_error / projected_at`
- 对 `hearthstone` 正式表的本地写入

这里的“正式表”仍指本地构建数据库内的 `hearthstone.*` 结果，而不是远端 serving 表。

迁移完成后，本地数据库即可形成完整的：

`hsdata repo -> raw import -> local projection`

闭环。

### 4. 现有 TypeScript hsdata 逻辑改为语义基线，不再继续扩展为远端权威实现

当前 `packages/console-api/src/lib/hearthstone/hsdata-import.ts` 和 `hsdata-project.ts` 已经承载了完整语义，可作为本轮 Rust 迁移的行为基线。

本轮原则为：

- 现有 TS 逻辑作为迁移参考与回归对照
- 在 Rust 本地实现等价行为
- 迁移完成前，不再继续向远端版 hsdata 处理逻辑新增功能

这样可以避免双实现继续分叉。

### 5. desktop UI 改为显式区分“本地构建状态”和“远端发布状态”

本轮完成后，desktop `hsdata` 页面上所有与导入、原始快照、投影相关的信息，都应明确标记为本地数据库状态。

至少包括：

- sourceTag import status
- projection status
- raw snapshot 概览
- 当前数据库连接状态

页面不应继续把这些本地构建状态描述成远端服务状态。

## 运行时方案

### 1. 新增本地 hsdata 数据库模块

建议在 `apps/app-console-desktop/src-tauri/src/` 下拆出独立模块：

- `desktop_database.rs`
  - 保留数据库连接字符串的读取、保存和测试
- `desktop_hsdata_db.rs`
  - 负责创建本地 PostgreSQL client、transaction 与公共错误处理
- `desktop_hsdata_import.rs`
  - 负责 staged import、finalize、overview、source version 状态
- `desktop_hsdata_project.rs`
  - 负责本地 projection

不要继续把所有 `hsdata` 处理都堆在 `lib.rs`。

### 2. 命令面调整

当前 desktop 仍主要使用远端 ORPC 完成 hsdata 导入和投影。本轮改为新增本地 command：

- `hsdata_get_local_overview`
- `hsdata_list_local_source_versions`
- `hsdata_import_source_local`
- `hsdata_project_source_version_local`
- `hsdata_get_local_import_job`

前端通过 `invoke(...)` 读取本地数据库状态。

### 3. 进度事件保持 desktop 内部事件模型

当前 desktop 已有导入进度事件机制。迁移后保持：

- import 进度由本地命令发事件
- project 进度也复用同一类本地事件通道

不再把远端 job 状态轮询作为进度真相来源。

### 4. 本地数据库连接前提

所有本地 hsdata 处理命令都依赖：

- 已配置外部本地 PostgreSQL 连接串
- 连接测试成功
- 本地 migration 已完成

若任一前提不满足，应在命令入口直接阻断，并返回可展示错误：

- 未配置连接
- 连接失败
- schema 未初始化
- 能力检查失败

## 页面与接口影响

### 1. desktop 导入页

`apps/app-console-desktop/src/pages/hearthstone/data-import/index.vue`

需要改为：

- sourceTag 列表仍可从本地 repo 和本地数据库组合得到
- 导入操作调用本地 Tauri command
- 投影操作调用本地 Tauri command
- 当前状态与概览读取本地数据库

### 2. desktop 数据源页

当前数据源概览来自远端 ORPC。本轮改为本地数据库概览。

### 3. site-console

`site-console` 不再承担 hsdata 构建权威状态查看入口。

短期可以保留只读远端页面，但必须明确：

- 其展示的不是本地构建权威状态
- 不能继续作为 desktop 导入/投影的主监控面

若页面语义容易误导，应在后续收口阶段下线或改名。

## 分阶段实施

### 阶段一：建立本地 hsdata 数据库执行面

- 新增本地 PostgreSQL 连接与 transaction helper
- 定义本地 hsdata command 和错误边界
- 让 desktop 能读取本地 `source_versions` 与 overview

### 阶段二：迁移 staged import 和 raw snapshot 写入

- 将 `createImportJob / upload / finalize` 的远端数据库写入迁到本地
- 保持现有 Rust payload 准备逻辑
- 让 desktop import 完成后直接写本地 `source_versions` 与 `raw_entity_*`

### 阶段三：迁移本地 projection

- 将 `projectSourceVersion` 的行为迁入 desktop Rust
- 本地更新 `projection_status`
- 本地写入 `hearthstone` 构建结果表

### 阶段四：切换页面并收缩远端职责

- desktop 页面默认只读本地构建状态
- 远端 hsdata ORPC 写接口停止作为主路径
- 将 TS 版 hsdata 处理逻辑降为对照实现或后续移除对象

## 风险与取舍

### 1. 本地 projection 迁移成本高于 raw import

`hsdata-project.ts` 体量较大，且包含大量标签归一化、关系生成和 localization 处理逻辑。

这意味着：

- staged import 本地化可以较快落地
- projection 本地化需要更谨慎的语义回归

因此实施顺序必须先 raw import，后 projection。

### 2. 短期内会存在 TS 与 Rust 双份实现

在迁移完成前，仓库中会同时存在：

- 现有 TS hsdata import/project 逻辑
- 新的 Rust 本地实现

这是可接受的过渡状态，但必须控制原则：

- TS 逻辑只作为基线与回归参考
- 不再继续对远端版新增功能

### 3. site-console 的 hsdata 页面会暂时语义失真

当本地构建层成为权威后，site-console 上的 hsdata 概览不再等于真实构建状态。

若不主动处理，会让运维和开发继续误解状态来源。

### 4. 本轮不处理远端发布，意味着“本地完成处理”不等于“远端可用”

这是刻意接受的边界。

本轮目标是先让 hsdata 在本地数据库中完成 import 和 project 闭环。远端 serving 和 publish 仍是后续任务。

## 验收标准

- desktop 能在已配置的本地 PostgreSQL 上独立完成 hsdata staged import 和 finalize
- desktop 能从本地数据库读取 `source_versions` 和 raw overview
- desktop 能在本地数据库上执行 hsdata projection
- desktop 导入页和数据源页不再依赖远端 ORPC 作为 hsdata 构建状态真相来源
- 远端 hsdata 写路径不再是 desktop 默认依赖
