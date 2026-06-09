# 通用字段 commit 合并同步设计评审

> 稳定的运行时边界、数据归属和同步规则以 [../../docs/project-architecture.zh-CN.md](../../docs/project-architecture.zh-CN.md) 为准。本文只记录本需求的评审结论；若有冲突，以主架构文档为准。

## 评审结论

建议按当前方向通过，但应明确这是一次模型收敛，而不是在旧版 `override` 方案上继续打补丁。

当前版本已经把核心问题统一到一条更自洽的主线：

- 所有会影响最终字段值的变化统一表达为 `commit`
- 自动来源先按字段规则收敛为 `resolved base`
- 各来源再按统一 `merge` 规则竞争当前 `winner`
- `field_winners` 只保存当前 winner projection，不再被当成独立真源
- 本地和远端各自保有 `field_commits`
- 双端都只基于“已通过审核的 `commit` 子集”做 projection

相比前几个版本，这版文档有两个关键改进：

- 不再把“人工编辑”建模成独立机制，而是收敛成普通来源的一种
- 不再把“最终表值”当真源，而是明确真源是 `field_commits`

另外还应继续固定一个实现边界：

- 远端接收 `commit` 的第一版权威点应是共享 TS `apply commit / merge / project` 逻辑
- 不要求第一版额外引入独立 remote service 作为唯一接收入口

这两个改动使得整套方案更接近一致的 Git 心智模型，也更适合后续扩展到：

- `magic.cards`
- 其他游戏的卡片主表
- 更多自动来源和人工来源并存的字段

在这个前提下，真正需要唯一化的是：

- 单一权威实现

而不是：

- 单一权威服务入口

## 阻塞问题

无。

## 主要判断

### 1. 统一 `source / commit / winner / merge` 是正确收口

这是当前设计最重要的改进。

如果继续把：

- 自动来源更新
- 人工编辑
- 人工解决动作

拆成多套机制，后续一定会在：

- 同步语义
- 冲突语义
- UI 展示语义

上重新分裂。

当前统一为：

- `field_commits`
- `source priority`
- `winner`
- `merge`

之后，系统终于可以用同一套规则回答：

- 这个字段为什么变了
- 现在谁赢了
- 为什么低优先级来源没覆盖高优先级来源
- 什么时候一个 winner 会被新的 commit 顶掉

这比“自动一套、人工一套、override 再一套”的模型更稳。

### 2. `field_winners` 作为当前态 projection 是合理的

保留：

- `hearthstone_data.field_winners`

是合理的。

它当前的角色已经从：

- 人工 override 真源

收敛为：

- 当前字段 winner 的投影视图

这就让它的存在理由变得清楚了：

- 快速读取当前 winner
- 快速判断当前 winner source
- 快速支持导入链路、UI、冲突展示

如果完全删除这张表，理论上可以通过重放：

- `field_commits`

得到当前 winner，但读路径、批量检查和冲突展示都会显著变重。

当前把它保留为 projection，而不是把 winner 元信息塞回主表，是更平衡的取舍。

### 3. 多来源基础值决策层必须继续独立于通用 merge 层

当前文档仍然保留了一个正确边界：

- 自动来源之间先收敛 `resolved base`
- 再让各来源参与统一 merge

这个边界仍然必须保留。

原因不是人工来源特殊，而是：

- `resolved base`
  本身就是自动来源集合内部已经完成一次规则决策后的结果

如果跳过这层，直接把所有原始抓取候选都推进通用 history：

- 历史噪声会过大
- 双端重放成本会显著上升
- merge 规则会被迫处理过多中间态

因此当前更准确的口径应是：“原始抓取不进 history，只有收敛后、会参与 merge 的变化才进入 history”，而这类变化不需要再单独区分成 `base_update`，直接统一写成 `source_edit` 即可。

这次新增的：

- `row_create`

也应按同样原则理解：

- 它只用于自动化导入在对象首次进入仓库时建立初始整行基线
- 不是给后续普通更新开放整行覆盖通道

### 4. 双端各自 `commit history` + 远端共享上游，是更贴近 Git 的边界

当前设计已经明确：

- 本地和远端都各自持有 `field_commits`
- 远端是共享上游仓库，而不是唯一 history
- 远端主表不是权威真源
- 本地主表也不是权威真源
- 双端都基于各自仓库里“已通过审核的 commit”重放

这是正确的。

这样系统可以稳定支持：

- site 远端直接编辑
- desktop 本地先写本地 history，再 `push / pull`
- 双端基于同构规则独立重放
- 本地下游发布不依赖“抄远端目标表”

这比“远端直接给最终表、本地原样同步”更稳，因为它不会丢掉：

- 来源信息
- 决议信息
- 冲突解决上下文
- `baseRevision`

### 5. 统一 `field_conflicts` 比拆成两张冲突表更合适

当前版本已经收敛为一张统一冲突表：

- `field_conflicts`

这是更合适的方向。

保留单表的前提是：

- 用 `processingSide` 区分 `local / remote`
- 用 `processingStage` 区分 `apply / replay`

这样仍然能表达：

- 双端导入外来 `commit` 时的冲突
- 本地在当前 base 上 replay history 时的冲突

同时避免：

- 远端 merge 冲突和本地 replay 冲突长期维持两套几乎重复的结构
- 后续 UI 和处理动作还要为两张表分别维护入口

### 6. `tags` 继续不拆主表，是当前更合适的落地范围

这个判断没有变化，仍然成立。

当前复杂点已经不在于：

- `hearthstone.tags` 是否理论上足够纯

而在于：

- commit history 怎么建
- winner projection 怎么算
- 双端怎么 pull / push / merge / project

在这些问题没落地前，先拆：

- base 表
- current 表
- effective 表

收益不足以覆盖结构成本。

首轮继续维持：

- `hearthstone.tags`

作为当前 effective value 主表，是合理收口。

## 非阻塞建议

### 1. `field_winners` 的最小字段应进一步固定

当前文档已经把它改名成：

- `field_winners`

但实施前最好再明确哪些列是绝对最小集合。

建议至少固定：

- `entityType`
- `entityKey`
- `fieldPath`
- `winnerSource`
- `winnerValue`
- `baseRevision`
- `status`
- `updatedAt`

其余如：

- `updatedBy`
- `sourceRuntime`
- `clearedAt`

可以按实现需要再保留。

### 2. `commitKind` 和 `conflictKind` 需要持续去人工专属化

当前文档已经把 `commitKind` 改成：

- `row_create`
- `source_edit`
- `conflict_resolution`
- `winner_clear`

这是对的。

其中要继续强调：

- `row_create`
  - 只承担自动化导入场景下的初始化基线职责
  - 人工创建新行仍然应落成普通 `source_edit`
- 真正的 merge、winner 竞争、冲突解决
  - 仍然应围绕字段级 `commit` 展开

同样地，后续如果继续演化：

- `conflictKind`
- `resolution`

也应尽量避免重新回到人工专属语义命名。

否则模型虽然表面统一了，落地时又会被拖回“人工是特殊机制”的旧路径。

### 3. `field_conflicts` 更像工作队列，应避免把它当唯一真源

当前评审建议继续明确：

- 真源是 `field_commits`
- `field_conflicts` 是冲突处理工作表

也就是说，冲突表里的解决结果最终仍应通过：

- `conflict_resolution commit`

进入权威 history。

否则会出现：

- history 说不清最终是怎么解决的
- winner projection 只能依赖冲突表而不是依赖 commit history

这会破坏当前设计最重要的统一性。

### 4. 首轮范围仍应继续严格收敛到 `hearthstone tag`

虽然当前模型已经足够泛化，但首轮实施仍应继续收敛到：

- `hearthstone tag`

原因很简单：

- 当前文档的模型复杂度已经显著提高
- 如果首轮同时落地 `magic.cards`，验证面会过大

因此：

- 先用 tag 验证统一 commit / winner / merge 模型
- 再决定哪些规则需要继续推广到 `magic.cards`

这个顺序仍然是合理的。

## 总结

当前版本已经不应该再被理解成“字段 override 增量同步”的局部补丁，而应被理解成：

- 多来源字段级 `commit history`
- 自动化创建阶段允许 `row_create` 作为整行基线
- 当前 winner projection
- 本地 / 远端双仓库 history
- 双端同构 merge / projection

这版设计比旧版更统一，也更接近长期可扩展的模型。

后续实施时最重要的约束只有两条：

- 不要让 `field_winners` 重新膨胀成独立真源
- 不要让冲突解决绕过 `field_commits`，变成 history 之外的隐式状态
