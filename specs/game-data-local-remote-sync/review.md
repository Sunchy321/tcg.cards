# 游戏领域数据本地/远端同步系统设计评审

> 稳定的运行时边界、数据归属和同步规则以 [../../docs/project-architecture.zh-CN.md](../../docs/project-architecture.zh-CN.md) 为准。本文只记录本需求的评审结论；若有冲突，以主架构文档为准。

## 评审结论

建议按当前方向通过。

这版设计已经把“游戏领域数据同步”从一个过于宽泛的问题，收敛成两条边界清晰的路线：

- `publish-owned`
  - 面向只允许自动化提交的数据
  - 首轮采用行级增量发布
- `collaborative`
  - 面向允许人工编辑、审核、冲突处理和撤销的字段
  - 首轮采用 `commit + field entry + projection + winner`

相比把所有领域数据强行塞进单一模型，这种双轨模型更符合当前架构事实：

- desktop 是重型工作流执行权威端
- remote 不是通用重型导入与全量集成中心
- 一部分数据天然更接近 publish
- 另一部分数据天然更接近协作 history

这版设计的主要价值不在于“统一一切”，而在于：

- 把必须统一的概念统一了
- 把不应混同的工作流明确拆开了

## 阻塞问题

无。

## 主要判断

### 1. 双轨模型是正确的主收口

当前设计最重要的判断是：不同类型的游戏领域数据不应继续强行共用同一同步模型。

`publish-owned` 与 `collaborative` 的职责已经足够清楚：

- `publish-owned`
  - 不保留协作 commit 历史
  - 重点是增量发布、baseline、gate 和远端收敛
- `collaborative`
  - 重点是提交历史、字段级审核、冲突处理、撤销与重建当前值

如果继续把两者混在一起，后续一定会反复出现这些问题：

- 自动化高频数据导致历史膨胀
- 协作字段又缺少审计、审核和部分接受能力
- publish gate 与 merge/review 语义互相污染

当前版本已经避免了这类方向性错误。

### 2. `publish-owned` 改为行级增量骨架是合理的

这是这轮设计里最关键的收敛之一。

当前版本已经不再把通用 `publish-owned` 写成对象级 manifest 骨架，而是明确为：

- 行级增量发布
- 本地行级 baseline
- `updatedAt` 只做候选筛选
- 删除检测由本地 service API 或数据库钩子负责
- 远端不保留逐行状态

这个调整是合理的，因为用户已经明确：

- 目标不是对象级整块发布
- 目标是“只发变更行”
- 关联表最终仍需收敛到整体一致状态

在这个前提下，通用设计继续坚持对象级 manifest，只会把领域特定问题错误抬升为通用约束。

### 3. `publish-owned` 的远端 gate 现在处在正确层级

当前总文档没有把远端设计成逐行状态仓库，而是保持：

- publish stream 级 baseline / ledger
- compare-and-swap
- target fingerprint
- generation gate
- source/build 不倒退
- same-lineage 分叉拒绝

这个方向是正确的。

原因很明确：

- 远端逐行状态会显著膨胀空间与复杂度
- 行级增量正确性本就更适合由本地 baseline 与本地 publish plan 保证
- 远端更适合做 stream 级 acceptance 和最小审计

这与当前架构文档中“desktop 主导、remote 受限”的方向保持一致。

### 4. `collaborative` 的 `commit + field entry` 模型已经形成闭环

`collaborative` 这一侧的核心语义已经足够完整：

- 所有修改先形成 `commit`
- 每条字段变更单独成为 `field entry`
- 审核、冲突处理、接受和拒绝都在字段级完成
- accepted 直接更新结果表
- `winner` 只保留当前自动接受决策状态

这使得：

- 审计链清楚
- 部分接受清楚
- 人工修复不会重写旧历史
- 撤销可以通过 `revert` 明确建模

这套模型已经可以稳定支撑后续：

- site 远端编辑
- desktop 本地整理
- 双端历史同步
- 字段级审核与冲突处理

### 5. `hearthstone-card` 的领域说明已经被正确降级

最初的专项文档中，`card_head` / `card_versions` 带有很强的对象级执行语义。

当前版本已经把它们降级为：

- `hearthstone-card` 领域分组术语
- 用于解释多表结果如何组织
- 不再作为总文档中的通用 publish 单元

这是正确的调整。

这样既保留了领域解释力，又不会把实现重新拉回对象级发布骨架。

### 6. 旧专项路径收口方式是可接受的

当前旧路径已经不再承担独立设计职责，而是：

- 总文档成为主入口
- `hearthstone-card.md` 保存领域特定说明

这比继续保留一份大而全、且方向已变化的专项文档更稳。

唯一需要继续保持的约束是：

- 后续任何新的领域特定细节，都应先判断是“通用规则”还是“领域说明”
- 不要再让 `hearthstone-card.md` 重新长成一份和总文档竞争的第二主设计

## 非阻塞建议

### 1. 尽早固定 `publish-owned` 行级 baseline 的最小 schema

总文档已经明确了语义，但后续很容易在实现时把 baseline 再做胖。

建议后续计划里尽快固定：

- `rowKey`
- `rowHash`
- `exists`
- publish stream 三元组
- 最小审计字段

不要在没有明确收益前把整行快照重新塞回 baseline。

### 2. 尽早固定高风险 publish 的操作枚举

总文档已经写了：

- 普通 publish
- repair
- rollback
- baseline repair

建议后续实现时保持这组操作枚举尽量小而稳定，避免再扩张出很多近义操作。

### 3. 保持 `hearthstone-card.md` 只做解释，不做第二套算法

如果后续又把对象级 diff、dirty queue、cursor、manifest 算法重新写回 `hearthstone-card.md`，就会再次与总文档竞争。

建议保持当前边界：

- 总文档负责通用同步与发布控制
- `hearthstone-card.md` 只负责领域分组解释、表范围和重建注意事项
