# hsdata sourceTag 导入与投影状态展示设计

> 稳定的运行时边界、数据归属和同步规则以 [../../docs/project-architecture.zh-CN.md](../../docs/project-architecture.zh-CN.md) 为准。本文只描述 hsdata 状态展示需求的增量设计；若有冲突，以主架构文档为准。

## 背景

当前 hsdata 页面能执行：

- 按来源导入 raw archive
- 按 `sourceTag` 执行领域投影

但页面上缺少一个直接回答用户问题的视图：

- 哪些 `sourceTag` 已导入
- 哪些 `sourceTag` 已投影

这轮需求只关心 `sourceTag` 级别的状态展示，不关心 tag 明细，不需要扩展到 `enumId` 维度。

## 目标

- 在前端明确显示每个 `sourceTag` 是否已经完成导入
- 在前端明确显示每个 `sourceTag` 是否已经完成投影
- 让用户在选择版本前就能看到状态，不必先手动尝试导入或投影

## 非目标

- 不展示 tag 级别的导入或投影明细
- 不改造 hsdata 导入与投影主流程
- 不新增 tag 管理页面
- 不引入新的 sourceTag 业务概念

## 现状约束

### 1. 已导入状态已有稳定来源

`source_versions` 已经持久化了 raw import 状态：

- `pending`
- `processing`
- `completed`
- `failed`

因此“某个 `sourceTag` 是否已导入”可以直接按：

- `source_versions.status = completed`

来判断。

### 2. 已投影状态当前没有单独持久化字段

当前 `projectHsdata` 会把 `build` 写入：

- `entities.version`
- `entity_localizations.version`
- `entity_relations.version`

但不会把“这个 `sourceTag` 已投影”单独回写到 `source_versions`。

这会带来三个问题：

- 前端只能推导，不能直接读取 sourceTag 的投影状态
- 多个 `sourceTag` 共享同一个 `build` 时，推导结果会串扰
- 未来如果要显示 `processing`、`failed`、错误信息或完成时间，没有稳定落点

因此本轮改为在 `source_versions` 中直接持久化投影状态。

## 口径定义

### 1. 已导入 sourceTag

“已导入”定义为：

- `source_versions` 中存在该 `sourceTag`
- 并且 `status = completed`

dry run 不会写入 completed，因此不会被误判为已导入。

### 2. 已投影 sourceTag

“已投影”定义为：

- `source_versions.projectionStatus = completed`

与之配套的持久化字段包括：

- `projectionStatus`
- `projectedAt`
- `projectionError`

## 设计决策

### 1. 新增 sourceTag 状态查询接口

新增一个只读接口，专门返回 desktop 导入页需要的 sourceTag 状态摘要：

- `sourceTag`
- `build`
- `sourceCommit`
- `sourceUri`
- `importStatus`
- `importedAt`
- `projectionStatus`
- `projectedAt`
- `projectionError`

其中：

- `importStatus` 直接取自 `source_versions.status`
- `projectionStatus`、`projectedAt`、`projectionError` 直接取自 `source_versions`
- 不复用 `getOverview()`，避免把概览接口扩展成列表接口
- 接口保持只读，不在页面层做“按 build 反推是否已投影”的临时逻辑

### 2. 在 source_versions 中持久化 projection 字段

本轮新增字段：

- `projectionStatus`
  - `not_started`
  - `processing`
  - `completed`
  - `failed`
- `projectedAt`
- `projectionError`

状态流转约定如下：

- 非 dry-run 投影开始前写入 `processing`
- 非 dry-run 投影成功后写入 `completed`
- 非 dry-run 投影失败后写入 `failed` 和错误信息
- 非 dry-run 导入成功后重置为 `not_started`
- migration 对历史数据执行最小 backfill：若当前领域表已能证明某个 `build` 被投影，则对应 sourceTag 标记为 `completed`

这样可以直接回答：

- 是否已经投影
- 是否正在投影
- 是否投影失败
- 最近一次成功投影完成时间

### 3. desktop 导入页按 sourceTag 合并本地来源与数据库状态

现有 desktop 导入页已经有一份“可用版本”列表，它来自本地 hsdata git 仓库：

- 本地来源列表继续通过 `listHsdataSources()` 获取
- sourceTag 状态列表通过新的 ORPC 只读接口获取
- 前端按 `sourceTag` 将两份数据合并

合并规则如下：

- 本地来源存在且 `sourceTag` 可解析时，优先显示该来源，并挂上数据库状态
- 本地来源存在但 `sourceTag` 不可解析时，只展示来源信息，不显示导入/投影状态
- 数据库中存在状态但本地列表里没有对应来源时，首轮不单独生成额外列表项，避免把当前页面改造成第二套浏览器

这样可以保持：

- 当前操作入口不变
- sourceTag 状态展示直接落在用户正在使用的选择列表里
- 页面不会同时出现“两份 sourceTag 列表”导致认知负担

### 4. 页面展示落在 desktop 导入页

首轮接入：

- `apps/app-console-desktop/src/pages/hearthstone/data-import/index.vue`

展示方式：

- 在右侧“可用版本”列表中给每个 sourceTag 增加导入状态 badge 与投影状态 badge
- 在当前选中来源的详情区显示导入状态、投影状态、`importedAt`、`projectedAt`
- 当投影失败时，在当前选中来源详情区展示 `projectionError`
- 在投影面板的“可执行条件”区显示当前 sourceTag 的实时状态，而不是只写死 `source_versions.status = completed`

这样用户在当前工作流内就能直接判断下一步该点“导入”还是“投影”。

首轮明确不做：

- 不新增页面顶部状态总览卡片
- 不新增复杂筛选和批量操作
- 不把页面改成独立的 sourceTag 管理表

这样可以把范围收敛在“把状态准确挂到现有列表和详情里”。

### 5. sourceTag 状态页不扩展到 site-console 首轮

site-console 当前职责偏概览，只保留数据库总览即可。

本轮 sourceTag 状态展示优先服务 desktop 本地导入工作流，因此先做 desktop，避免把范围重新扩散。

## 分阶段交付

### 阶段一：后端状态字段与写回

- 在 `source_versions` schema 中新增 projection 字段
- 导入成功后重置 projection 状态
- 投影开始、成功、失败时写回 projection 状态

### 阶段二：状态查询接口

- 抽出 `source_versions` 列表查询
- 直接返回页面需要的 import/projection 字段
- 暴露 ORPC 只读接口

### 阶段三：desktop 页面接入

- 在导入页同时加载本地来源列表与 sourceTag 状态列表
- 按 `sourceTag` 合并两份数据
- 在可用版本列表、选中详情区、投影面板中显示状态
- 在导入、投影、同步后刷新状态数据

### 阶段四：验证

- 用已经导入过的 sourceTag 校验 `completed` 展示
- 用已经执行过投影的 sourceTag 校验 `projectionStatus = completed`
- 用投影失败的 sourceTag 校验 `projectionError` 展示
- 用没有数据库记录的本地来源校验“未导入 / 未投影”展示
- 核对页面状态与实际可执行行为是否一致

## 风险与取舍

### 1. Worker 超时可能导致 processing 停留

当前投影仍然是单次 Worker 请求内完成的同步流程。如果平台超时直接终止执行，失败回写可能来不及发生，`projectionStatus` 可能停留在 `processing`。

这不影响本轮先引入字段，但意味着后续若要彻底提高可靠性，仍需要把投影任务化。

### 2. projectedAt 表示最近一次成功完成时间

`projectedAt` 表示最近一次非 dry-run 成功完成投影的时间。

它不承诺：

- 一定发生了实际写库
- 一定比 `importedAt` 更新

如果后续导入成功并重置了 projection 状态，前端应以 `projectionStatus` 为准，而不是单看 `projectedAt` 是否存在。

### 3. 历史回填不能恢复精确完成时间

对于 migration 回填出来的历史 `completed` 行，`projectedAt` 可能仍为空，因为旧系统没有保存这个时间点。

这是可接受的，因为本轮优先保证状态可见，其次才是历史时间精度。

### 4. 本地来源与数据库状态可能暂时不同步

desktop 页面同时依赖：

- 本地 git 来源列表
- 数据库里的 `source_versions`

因此同步远端版本、执行导入、执行投影后，如果页面不主动刷新状态，就会出现“右侧已选来源已变化，但状态 badge 还是旧值”的短暂不一致。

本轮要求在以下时机统一刷新状态：

- 页面首次进入后
- 同步远端版本后
- 导入完成后
- 投影完成后

## 验收标准

- 用户可以直接看到每个 `sourceTag` 是否已导入
- 用户可以直接看到每个 `sourceTag` 是否已投影
- 用户可以看到投影中的 sourceTag 和投影失败的 sourceTag
- 页面不需要进入 tag 明细层级
- 本轮包含数据库迁移
