# hsdata Rust 投影与远端发布归档摘要

> 查询这项提案时，应优先阅读本文。只有当需要查看设计推导、评审意见或逐步实施历史时，才继续翻阅 `design.md`、`review.md` 和 `plan.md`。

## 结论

这项工作已经完成。

`hsdata` 的本地主流程已经从旧的 TypeScript 投影路径收口到 desktop Rust，本地 PostgreSQL 成为构建权威层，remote 只承担 serving 与最小发布控制面。

## 最终边界

- desktop Rust 负责本地导入、本地投影、发布准备和远端发布
- 本地 PostgreSQL 负责导入中间态、投影结果、发布批次和发布基线
- remote PostgreSQL 负责正式领域表与最小发布 ledger
- `hearthstone` 正式结果表按 `publish-owned` 处理

## 已完成范围

- 用 Rust 实现 `hsdata` 本地投影命令，并接管 `source_versions.projection_*` 状态流转
- desktop 页面切换到本地 Tauri 投影入口，不再依赖旧 TS 投影主路径
- 增加本地发布系统表：
  - `publish_batches`
  - `publish_batch_rows`（初始设计为 `publish_batch_cards`，后重构为表+行级别）
  - `publish_baselines`
- 增加远端最小发布 ledger：
  - `publish_ledgers`
- 实现 publish target profile、批次绑定校验、manifest diff、整卡重发和远端 apply
- 发布时补齐缺失的 `hearthstone.cards` 行，保证每个 entity 都有对应 card 行
- 修复远端 enum schema 绑定问题与投影 prune 约束问题
- 清理旧的 TS 投影运行时代码，只保留 Rust 测试仍需使用的 fixture 基线

## 当前验收状态

- desktop 本地 Rust 投影测试已通过
- Rust 侧共享 baseline fixture 对照测试已通过
- 远端发布已完成实际验证并成功执行
- 旧 TS 投影 ORPC 路径和实现代码已移除

## 已知遗留

- `hearthstone_publish_row_family.rs` 中存在一个带 `HACK:` 标记的 SeaORM enum schema workaround，依赖上游 issue `SeaQL/sea-orm#2581` 的后续修复
- 当前没有补一条可在 CI 中自动执行的真实 remote publish 集成测试
- Rust 内部仍保留少量历史 `hsdata-project` 命名作为日志前缀，不影响功能

## 查阅指引

- 先读本文，快速了解最终边界、完成范围和已知遗留
- 需要看设计结论和约束时，再读 `design.md`
- 需要看当时为什么通过、风险如何判断时，再读 `review.md`
- 需要看实施顺序和完成状态时，再读 `plan.md`
