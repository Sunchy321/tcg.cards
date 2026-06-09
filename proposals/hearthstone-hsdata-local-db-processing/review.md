# hsdata 本地数据库处理迁移设计评审

> 稳定的运行时边界、数据归属和同步规则以 [../../docs/project-architecture.zh-CN.md](../../docs/project-architecture.zh-CN.md) 为准。本文只记录本需求的评审结论；若有冲突，以主架构文档为准。

## 评审结论

建议通过。

这份设计抓住了真正的分界线：问题不在表已经在哪个 schema，而在 desktop 现在仍然把构建型处理交给远端 runtime。只要这个运行时边界不变，就算 local migration 已经存在，`hsdata` 也仍然不算真正迁到了本地数据库。

## 阻塞问题

无。

## 主要判断

### 1. 先明确“运行时迁移”，而不是继续围绕 schema 打转

当前 local schema 和 migration 已经具备，下一步最关键的是把：

- import job
- raw snapshot
- projection

的执行面从远端 ORPC 挪到 desktop 本地 runtime。

设计把这个问题单独拉出来，是正确的。

### 2. 拒绝引入本地 Bun/Node sidecar 是合理取舍

如果为了复用现有 `packages/console-api` 逻辑而引入本地 sidecar，会把任务复杂度从“迁移 hsdata 数据处理”扩大成“引入一套新的本地服务架构”。

当前 desktop 已有 Rust 命令面和本地 repo 读取能力，优先用 Rust 收口本地数据库处理更符合现有产品形态。

### 3. 将 raw import 与 projection 分阶段落地是必要的

这不是保守，而是对复杂度的真实承认。

`hsdata-project.ts` 的语义明显重于 staged import，如果不拆阶段，很容易出现：

- import 还没稳定
- projection 又开始并行迁移
- 最终两边都难以验证

因此“先本地化 raw import，再本地化 projection”的顺序是正确的。

### 4. 必须显式处理 desktop 与 site-console 的状态语义分裂

一旦本地数据库成为构建权威层，`site-console` 上仍从远端读取的 hsdata 状态就不再等于真实构建状态。

设计已经识别到这个问题。后续实现时不能只改后台逻辑，不改页面语义，否则会持续误导使用者。

## 非阻塞建议

### 1. 优先抽出 Rust 模块，再迁移具体流程

不要直接把更多数据库和 hsdata 逻辑继续塞进 `src-tauri/src/lib.rs`。

建议先拆出：

- 连接与 transaction helper
- import 模块
- project 模块

再逐步迁移具体处理逻辑。

### 2. 为 projection 迁移准备对照测试

因为现有 TS projection 已经形成行为基线，Rust 迁移时应尽量保留可对照的数据集和目标输出，避免只靠人工点页面验证。

### 3. 尽早冻结远端 hsdata 写接口的新需求

迁移期间若继续给远端 hsdata 写路径加新需求，会让双实现分叉迅速失控。

本轮应明确：

- 远端版进入冻结维护状态
- 新能力只加到本地权威实现

## 通过条件

- desktop 本地 runtime 成为 hsdata 构建型处理的主执行面
- staged import、raw snapshot 与 projection 的本地迁移顺序明确
- 页面语义能区分本地构建状态与远端状态
- 不引入额外 Bun/Node sidecar 作为生产运行时前提
