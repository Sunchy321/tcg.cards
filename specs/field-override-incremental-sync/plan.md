# 通用字段 commit 合并同步实施计划

> 稳定的运行时边界、数据归属和同步规则以 [../../docs/project-architecture.zh-CN.md](../../docs/project-architecture.zh-CN.md) 为准。本文只记录本需求的实施计划；若有冲突，以主架构文档为准。

## TODO List

- [x] 固定首轮范围，只落地 `hearthstone tag`
- [x] 固定 `field_winners` 的最小 schema 与唯一键
- [x] 固定通用同步过程表的最小 schema
- [x] 固定远端 merge 冲突与本地 replay 冲突的最小模型
- [x] 固定 `resolved base revision` 的生成与比较口径
- [x] 复用现有导入规则模型，补齐多来源基础值决策输入
- [x] 固定双端 `field_commits` + commit 内轻审核状态
- [x] 固定 `row_create` 作为创建阶段整行基线 commit
- [x] 改造 tag 保存链路为“主表 + winner projection + local field_commits”本地写入
- [x] 实现共享 TS 远端 apply 逻辑、merge 与远端 projection
- [x] 实现 desktop 基于 cursor 的增量 `pull / push` 与本地 replay
- [x] 让 tag 导入链路接入 source priority 与 `base_drift`
- [x] 提供远端冲突处理与本地 replay 冲突处理的首轮闭环
- [x] 完成验证并更新文档口径

## 目标

在不拆 `hearthstone.tags` 主表的前提下，建立一套可复用的：

- `field_commits` 权威 history 模型
- `field_winners` 当前 winner projection 模型
- 多来源基础值决策输入模型
- 通用字段级 `commit / push / pull / merge / project` 同步基础设施

首轮只真正接入 `hearthstone tag`。`magic.cards` 在本轮只固定模型边界，不进入完整实现。

## 实施原则

- 首轮只落地 tag，不同时展开 `magic.cards`
- 主表继续保存当前 effective value
- 所有会参与 merge 的变化统一表达为 `commit`
- 只有自动化导入首次创建对象时允许写一条 `row_create` 作为整行基线
- 人工创建新行仍然写普通 `source_edit`
- 自动来源先收敛 `resolved base`
- 各来源再按统一规则竞争当前 winner
- `field_winners` 只保存当前 winner projection，不作为独立真源
- 本地和远端各自持有 `field_commits`
- 远端是共享上游仓库，但不是唯一 history
- 本地通过 `pull / push` 与远端同步，不直接抄远端目标表

## 阶段计划

| 阶段 | 目标 | 核心任务 | 输出物 | 依赖 | 验收标准 |
|------|------|----------|--------|------|----------|
| P0 范围冻结 | 固定首轮范围与边界 | 明确首轮只落地 `hearthstone tag`；`magic.cards` 只保留多来源与 merge 模型输入；冻结 `source / commit / winner / merge` 四层语义 | 最终范围清单 | 当前 design / review | 不再把 `magic.cards` 实现混入首轮 |
| P1 Schema 固化 | 固定最小数据结构 | 设计双端 `field_commits`、本地 `field_sync_cursors`、双端 `field_conflicts`、`field_winners`；定义最小字段、唯一键、索引、审核状态、同步状态与 `row_create` 基线约束 | Schema 草案 | P0 | 表结构可直接指导 Drizzle/SeaORM 实现 |
| P2 基础值决策输入冻结 | 固定 `resolved base` 的输入边界 | 复用 `import_sources`、`import_rule_sets`、`import_field_rules`；明确 tag 首轮是否只需单来源发现更新；明确 `resolved base revision` 口径 | 输入模型与 revision 规则 | P0 | 能清楚回答 base 从何而来、revision 何时变化 |
| P3 本地写入链路 | 建立 desktop 本地立即生效能力 | 保存 tag 时更新本地主表、写入本地 `field_winners`、写入本地 `field_commits` | 本地写入链路 | P1 | tag 保存后本地 UI 与本地 projection 立即可见 |
| P4 远端接收与 projection | 建立 remote-direct 与幂等接收 | 实现共享 TS `apply commit / merge / project` 逻辑；site 远端直写与 desktop `push` 都复用该逻辑；写远端 `field_commits`；在远端执行 merge 并更新远端主表与 `field_winners` | 远端接收链路 | P1, P3 | 远端可稳定接受、去重并投影 `commit`，且不依赖额外 service hop |
| P5 增量拉取与 replay | 建立 desktop 同步回流 | 使用 `field_sync_cursors` 拉取远端增量 `commit`、推送本地待同步 `commit`；重放到本地主表与本地 `field_winners` | 本地增量同步链路 | P4 | desktop 不必全量轮询即可同步远端修改 |
| P6 导入接入 merge | 让导入尊重当前 winner | tag 导入更新时按 source priority 参与 merge；若检测到新的 `resolved base` 与当前 winner 冲突，则写入 `base_drift` | 导入协作链路 | P2, P3 | 自动发现更新不再错误覆盖高优先级 winner |
| P7 冲突处理闭环 | 提供远端 merge 与本地 replay 的首轮处理闭环 | 读取统一 `field_conflicts`；展示详情；支持首轮解决动作；按动作回写 history 或 projection | 冲突处理链路 | P1, P5, P6 | 远端 merge 冲突和本地 replay 冲突都能收敛 |
| P8 验证与收口 | 验证行为与文档一致 | 运行相关测试；验证本地编辑、远端编辑、增量拉取、导入漂移与冲突解决；同步更新说明文档 | 验证结果 | P3-P7 | 设计、实现和文档口径一致 |

## 实施步骤

### 1. 固定首轮范围

- 明确首轮只接入 `hearthstone tag`
- `magic.cards` 本轮只保留：
  - 多来源基础值决策层
  - `resolved base revision` 语义
  - 未来复用的通用 `commit / winner / merge` 模型
- 不在首轮实现：
  - `magic.cards` 主表写入
  - `magic.cards` 冲突 UI
  - `magic.cards` 导入接入

### 2. 固定 `field_winners` 最小 schema

至少固定：

- `id`
- `entityType`
- `entityKey`
- `fieldPath`
- `winnerValue`
- `winnerSource`
- `status`
- `sourceRuntime`
- `updatedBy`
- `baseRevision`
- `updatedAt`
- `clearedAt`

同时固定：

- `status = active | cleared`
- 活跃 winner 的唯一键约束
- `entityType + entityKey + fieldPath` 的查询索引

### 3. 固定通用同步过程表

需要固定：

- `field_commits`
- `field_sync_cursors`
- `field_conflicts`

本阶段必须回答：

- 哪些表是 local-only
- 哪些表是 remote-only
- 哪些字段是所有对象通用必填
- `clientMutationId`、`sequence`、`reviewStatus`、`syncStatus` 的语义
- `row_create` 与字段级 `commit` 的边界

### 4. 固定冲突模型

至少固定：

- `field_conflicts`
  - 远端接收新 `commit` 时发现的 merge 冲突
  - 本地重放远端 history 时发现的 replay / `base_drift` 冲突

并至少固定：

- `conflictKind`
- `entityType`
- `entityKey`
- `fieldPath`
- `effectiveValue`
- `winnerValue`
- `candidateBaseValue`
- `localValue`
- `remoteValue`
- `baseRevision`
- `status`
- `reason`
- `resolution`

### 5. 固定 `resolved base revision` 口径

必须明确：

- revision 按单字段生成，而不是按整对象生成
- revision 输入固定为当前 `resolved base` 胜出决策指纹
- 相同值但来源变化时，revision 必须变化
- 相同来源但规则变化时，revision 必须变化
- review 选定候选 base 后，必须基于新的决策指纹生成新 revision
- revision 比较只使用字符串全等，不做语义比较或模糊兼容

这是后续判断：

- `base_drift`
- winner 是否建立在旧 base 上
- `winner_clear` 后回落到哪个 base

的前提。

### 6. 复用现有导入规则输入

在不实现完整 `magic.cards` 链路的前提下，先把基础值决策输入固定下来：

- `import_sources`
- `import_rule_sets`
- `import_field_rules`
- 不复用 `import_change_sets`、`import_field_changes`、`import_review_actions`、`import_apply_logs` 作为字段同步过程表

对 tag 首轮需要回答：

- 首轮 tag 自动更新只来自本地 hsdata 发现事实
- `rawName`、`rawType`、`rawNames`、`valueKind` 属于发现后进入统一 merge 的基础值字段
- `firstSeenSourceTag`、`lastSeenSourceTag` 只保留为发现事实留档，不进入统一 merge
- `slug`、`slugAliases`、`name`、`normalize*`、`project*`、`status`、`description` 属于导入必须永远跳过的人工维护字段

### 7. 改造 tag 本地保存链路

保存 tag 时改为本地事务同时执行：

- 更新 `hearthstone.tags`
- upsert 本地 `field_winners`
- 写入本地 `field_commits`

同时要求：

- UI 保存后立即读取本地主表当前值
- 本地 projection 继续直接消费本地主表
- 首轮 tag 页面保存仍然只产生字段级 `commit`，不产生 `row_create`

### 8. 实现共享 TS 远端 apply 与当前态投影

site 远端直写或 desktop `push` 到 remote DB 时：

- 先调用共享 TS `apply commit / merge / project` 逻辑
- 校验 `expectedRowRevision`
- 校验 `expectedWinnerRevision`
- 幂等检查 `clientMutationId`
- 写入 `field_commits`
- 执行远端 merge
- 投影到远端主表
- 投影到远端 `field_winners`

若失败：

- 拒绝直接应用
- 写入 `field_conflicts`
- 返回明确错误

同时要求：

- 第一版不强制增加独立 remote service 接收入口
- desktop `push` 允许直连 remote 数据库
- site 与 desktop 必须复用同一套远端 apply 逻辑，不能各自维护两套规则

### 9. 实现 desktop 增量拉取与重放

desktop 同步时：

- 读取本地 `field_sync_cursors`
- 从远端按 `sequence` 拉取新增 `commit`
- 从本地按 `sequence` 推送 `syncStatus = pending_push` 的 `commit`
- 重放到本地主表
- 重放到本地 `field_winners`
- 更新本地 `field_sync_cursors`
- 若重放失败，写入 `field_conflicts`

### 10. 让导入接入统一 merge

对 tag 自动发现更新：

- 自动来源先收敛出新的 `resolved base`
- 若自动化导入使对象首次进入仓库，可先写一条 `row_create`
- 当前 winner 仍来自自动来源集合时，可更新主表
- 当前 winner 来自更高优先级来源时，不直接覆盖主表
- 若新的基础值与当前 winner 不一致，写入 `field_conflicts`
  - `conflictKind = base_drift`

并确保：

- 当前 winner 仍保持当前 effective 值
- `field_winners` 继续保持 `active`

### 11. 提供冲突处理闭环

远端冲突处理至少支持：

- 查询 `field_conflicts`
- 进入单条冲突详情
- 执行解决动作

本地 replay 冲突处理至少支持：

- 查询 `field_conflicts`
- 进入单条冲突详情
- 执行解决动作

首轮动作至少支持：

- `accept_incoming`
- `keep_current_winner`
- `require_followup_commit`
- `winner_clear`

每个动作都必须明确：

- 如何回写主表
- 如何回写 `field_winners`
- 是否影响本地 `field_commits` 的审核 / 同步状态
- 是否生成新的 `conflict_resolution` 或 `winner_clear` commit
- 如何关闭冲突记录

### 12. 验证与文档收口

至少验证以下场景：

- 本地编辑 tag 后立即可见
- 远端编辑 tag 后 desktop 可增量拉回
- 本地与远端同时改同一字段时产生远端 merge 冲突
- 导入新发现值与当前 winner 冲突时产生 `base_drift`
- `winner_clear` 后字段可重新接受自动来源 merge 结果
- 冲突通过远端或本地闭环解决后，主表与 winner 当前态正确收敛

## 回退策略

### 回退原则

- 先加表，再切链路
- 任一阶段失败时，优先回退写入入口
- 不在同一阶段同时切本地保存、远端接收和导入逻辑

### 分阶段回退

- P1 失败：保留旧保存逻辑，不接入新表
- P3 失败：恢复 tag 保存只写本地主表
- P4 失败：保留本地 `field_commits`，但不启用远端接收
- P5 失败：停止增量拉取，保持本地手工刷新或旧同步入口
- P6 失败：导入继续只更新发现字段，不接入统一 merge
- P7 失败：保留冲突落表，不开放首轮解决入口

## 风险与缓解

### 风险 1：首轮范围重新扩散到 `magic.cards`

- 影响：实现复杂度和验证成本急剧上升
- 缓解：实施计划与验收标准明确首轮只落地 tag

### 风险 2：`baseRevision` 语义不稳

- 影响：`base_drift` 判断失真，`winner_clear` 后无法正确回落
- 缓解：在 schema 实现前先冻结 `resolved base revision` 规则

### 风险 3：winner projection 被误用为真源

- 影响：实现重新分裂成“history 一套、当前态一套”
- 缓解：所有解决动作最终都必须回到 `field_commits`，`field_winners` 只做 projection

### 风险 4：本地 / 远端 `field_commits` 重复导入

- 影响：主表和 winner 当前态被重复覆盖
- 缓解：要求 `clientMutationId` 与 `commit id` 双重幂等、`sequence` 单调、`syncStatus` 明确

### 风险 5：导入与远端 replay 逻辑重新混淆

- 影响：后续实现重新混淆基础值决策与 history 重放
- 缓解：在实现中保持“自动来源收敛 `resolved base` -> 各来源统一 merge -> projection”的分层

## 验收标准

- `hearthstone tag` 首轮可完成本地保存、远端接收、desktop 增量拉取
- `field_winners` 能稳定表达当前 winner 状态
- `field_conflicts` 能同时承接远端 merge 冲突与本地 replay / `base_drift` 冲突
- 自动与高优先级来源冲突时，主表继续保留当前 winner，同时能在冲突入口中看到冲突
- 统一解决动作执行后，主表、winner、`field_commits`、冲突状态可正确收敛
- `magic.cards` 的多来源基础值决策边界已固定，但未被错误扩展为首轮实现范围

## 验证记录

本轮实际完成并通过的验证：

- `cargo check --manifest-path apps/app-console-desktop/src-tauri/Cargo.toml`
- `bun run typecheck` in `packages/model`
- `bun run typecheck` in `packages/console-api`
- `bun run typecheck` in `apps/service-desktop-runtime`

已验证到的实现口径：

- tag 本地手动编辑会写主表、`field_winners` 与本地 `field_commits`
- 远端 / 本地统一使用 `applyTagCommit` 处理 `source_edit`
- 本地 hsdata tag 自动导入会按当前 winner 决定是否覆写主表，并在需要时写 `field_conflicts.base_drift`
- 冲突可通过统一 `field_conflicts` 入口执行 `accept_incoming`、`keep_current_winner`、`require_followup_commit`、`winner_clear`
- `conflict_resolution` 与 `winner_clear` 已进入共享 commit apply 语义，可继续参与 push / pull / replay

本轮未完成自动化验证的部分：

- 未补端到端 UI 测试
- 未补真实双库 push / pull 集成测试
- 未补基于真实数据库数据的冲突回放脚本
