# `hearthstone-card-model-design.md` 评审意见

## 结论清单

### 评审结论

- 评审通过，可以进入实施计划阶段
- 当前计划以 `enumID` 稳定、每个 Tag 只有唯一解析方式和唯一字段映射为前提
- 当前计划接受取消 `raw_entity_spans`、`card_timelines`、`render_models` 等中间表
- 当前计划接受 `raw_entity_snapshots.sourceTags` 使用规范化 `sourceTag[]`，以及默认层 `version int[]` 直接放入 `entities`、`entity_localizations`
- 当前计划接受 `renderHash` 由 canonical `renderModel` 生成，而不是使用随机值

### 必须确认

- 实施前确认 `version` 数组的规范化规则、交集查询写法和导入校验方式
- 实施前冻结首批渲染字段白名单
- 实施前补齐首批 `Tag -> 字段` 映射清单
- 实施前抽样确认 `Power`、`EntourageCard` 放入 `extraPayload` 不阻塞首版字段投影，并确认 `ReferencedTag` 投影到 `referencedTags`

### 建议修改

- 在正式实施前补一份明确的 `Tag -> 目标字段` 首批映射清单
- 补充自动生成未知 Tag slug 的规范化规则，避免同义名字产生抖动
- 补充重复 Tag 的处理规则，明确何时用 `replace`、何时保留多值
- 补充兼容视图的输出契约，明确与现有 `entity_view`、`card_entity_view` 的字段对应关系

### 当前结论

- 设计方向正确
- 结构分层合理
- 已经完成关键边界收口
- 可以开始编写实施计划

### 已并入的配套结论

- `hsdata:upload` 已接管 `hearthstone/hsdata/state.json` 的写回
- 旧脚本 `scripts/sync-all-tags.sh` 已不再保留为独立工作流
- `file_count` 在当前实现中按上传动作增量维护，不负责回填历史总量
- `hearthstone/data-source` 页面已增加 `hearthstone_data` 原始归档表概览，作为 P2 配套观测入口

---

## 总体评价

这份设计稿最大的优点，是把以前耦合在一起的四类问题拆开了：

- 原始 XML 归档
- Tag 语义管理
- 领域修订查询
- 渲染去重复用

这种拆法是对的，而且和当前仓库中 `hearthstone` / `hearthstone_data` 的分层约定一致。尤其是确认 `enumID` 作为 Tag 稳定主键后，把 Tag 配置收敛到 `hearthstone.tags`，再把领域层压缩到 `entities` 和 `entity_localizations` 两张主表，能明显减少中间表数量，同时保留历史表达能力。

如果继续沿用“直接把 XML 解析结果铺到 `entities` 表里”的方式，后续一定会遇到以下问题：

- 未知 Tag 难接入
- Tag 改名会引发历史数据重写
- 渲染缓存键没有清晰边界
- 调整解析规则时必须重跑全量 XML

本设计基本绕开了这些问题，因此总体上值得继续推进。

---

## 主要优点

### 1. Tag 单表配置更适合当前约束

在 `enumID` 稳定、每个 Tag 只有唯一解析方式、唯一字段映射的前提下，把 Tag 配置集中到 `hearthstone.tags` 是更合适的选择。

这意味着：

- 内部稳定主键直接使用 `enumID`
- Tag 重命名只更新 `slug` 和 `slugAliases`
- 未知 Tag 可以先接住，再慢慢配置语义
- 规范化方式与字段投影不需要额外规则表

这正好覆盖了当前需求里最重要的几条，同时避免过早设计过多表。

### 2. 取消中间表后的主干结构更清晰

当前更合适的主干结构是：

- `raw_entity_snapshots` / `raw_entity_snapshot_tags`：保真
- `entities`：结构修订 + 版本集合
- `entity_localizations`：语言文本 + 渲染模型 + 版本集合

相比额外再拆：

- `card_timelines`
- `render_models`
- `raw_entity_spans`

当前方案更直接，也更符合现有仓库中已经存在的 `entities` / `entity_localizations` 命名。

### 3. 压缩策略清晰

设计中同时使用了三种压缩和查询优化思路：

- Tag 类型化值直接索引
- 原始快照去重
- 版本集合规范化压缩

再叠加 `revisionHash`、`localizationHash`、`renderHash`，整体压缩思路是自洽的，不是只靠某一个表硬扛全部历史规模。

另外，类型化值直接内联到 `raw_entity_snapshot_tags`，让常见 `bool` / `int` / `enum` 查询不需要解析 JSON，也不需要额外跳转值池表。

---

## 主要风险

### 1. `Power` 等子结构后续可能逼近 v1 边界

虽然当前把重点放在 `Tag` 是合理的，但炉石 XML 中并不只有 `Tag`。如果后续发现：

- 某些关键字段来自 `Power`
- 某些 UI 依赖 `ReferencedTag`
- 某些关系依赖 `EntourageCard`

那就必须尽快把“可配置 selector”从只支持 `Tag` 扩展到支持更多节点类型。

因此建议在正式实施前，先抽样检查一批实际卡牌，确认首版字段映射是否真的以 `Tag` 为主。

### 2. 渲染字段白名单必须更具体

“渲染模型”这个方向是对的，但当前设计稿里还没有把字段清单写死。没有这份清单，就无法判断：

- 哪些变化应该触发重新渲染
- 哪些变化只影响历史查询
- 哪些字段只用于内部比对

因此渲染白名单必须在计划阶段之前补成明确列表。

### 3. 版本集合表达需要尽早定稿

当前更适合直接使用规范化 `int[]`，因为源版本号是高度离散的 build 集合。如果这一点拖到开发中途再改，会影响：

- `raw_entity_snapshots`
- `entities`
- `entity_localizations`
- 查询 SQL
- 兼容视图
- diff 逻辑

所以它应该作为 P0 技术验证项，而不是拖到核心开发中途再决定。

### 4. `enumID` 稳定性是新方案的关键假设

当前简化方案不再引入 matcher 表，也不做版本化规则表。这是建立在 `enumID` 稳定且一义的前提上。

如果后续发现同一个 `enumID` 在不同历史阶段承载了不同语义，或者同一个语义被多个 `enumID` 表达，就需要重新引入覆盖规则或版本化配置。

---

## 建议的收口顺序

1. 先确认 `enumID` 作为 Tag 主键
2. 再确认 `hearthstone.tags` 单表配置字段
3. 再确认是否取消 `raw_entity_spans`、`card_timelines`、`render_models`
4. 再确认版本集合存储规则
5. 接着补首批 `Tag -> 字段` 映射清单
6. 然后单独冻结渲染字段白名单
7. 最后再写实施计划

---

## 最终意见

这份设计稿已经具备继续推进的基础，方向没有明显问题。当前最合适的下一步是进入实施计划，并在计划前段完成几个技术收口项：

- Tag 身份模型
- Tag 单表配置模型
- 版本集合模型
- 领域表压缩边界
- 渲染字段白名单
- 非 Tag 子结构的 v1 边界

这些点纳入实施计划后，设计可以作为当前实现基线。
