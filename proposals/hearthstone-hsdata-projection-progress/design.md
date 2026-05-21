# hsdata 本地投影进度事件设计

> 稳定的运行时边界、数据归属和同步规则以 [../../docs/project-architecture.zh-CN.md](../../docs/project-architecture.zh-CN.md) 为准。本文只描述 hsdata 本地投影进度展示的需求级设计；若有冲突，以主架构文档为准。

## 背景

当前桌面端 hsdata 导入已经有完整进度条：

- Rust 侧持续发出 `hsdata-import-progress` 事件
- 前端监听阶段、实体数和批次数
- 页面可以展示阶段文案、百分比和计数

但本地投影仍然只有离散状态：

- `source_versions.projection_status = not_started / processing / completed / failed`
- 前端只能显示“投影中”状态徽标
- 长时间投影时用户无法判断当前停在哪一段，也看不到总量和已完成数量

这会直接影响排障效率，尤其是：

- 某个 sourceTag 投影耗时较长时，用户无法区分“正常运行”还是“已经卡住”
- 批量投影时，页面只能看到任务外层串行推进，看不到当前 sourceTag 内部进度

## 目标

- 为桌面端本地投影补充独立进度事件
- 前端在投影卡片下方展示与导入一致风格的进度信息
- 让用户能看到投影阶段、snapshot 总量和已完成数量

## 非目标

- 不把本地投影迁移到 server 端
- 不重构投影算法本身
- 不重做批量任务状态机
- 不引入跨进程持久化的投影进度恢复

## 现状

本地投影入口已经在 Rust：

- Tauri command `hsdata_project_source_version_local`
- 内部调用 `project_hsdata_to_local_database`
- 读取本地 PostgreSQL raw snapshot 和 tag
- 在 Rust 中完成实体、本地化、关系投影和写库

当前缺口只有一处：

- 这条 Rust 链路没有像导入那样发出阶段性事件

## 设计决策

### 1. 新增独立的投影进度事件

新增桌面事件：

- 事件名：`hsdata-project-progress`
- 载荷字段最小化，只包含前端进度条真正需要的数据

建议字段：

- `sourceTag`
- `phase`
- `message`
- `totalSnapshotCount`
- `completedSnapshotCount`

不复用导入事件，原因是：

- 导入和投影的阶段语义不同
- 导入按 source 文件和 chunk 推进，投影按 sourceTag 和 snapshot 推进
- 强行复用会让类型变得更含混

### 2. 阶段划分保持粗粒度但可观察

投影事件按下面阶段发出：

- `loading_snapshots`
- `loading_tags`
- `projecting_snapshots`
- `summarizing_changes`
- `writing_rows`
- `completed`
- `failed`

其中只有 `projecting_snapshots` 需要展示逐步累计的数量进度。

### 3. 百分比基于 snapshot 数量

投影当前最稳定、最自然的总量是 `snapshot_count`。

因此：

- `totalSnapshotCount` 使用本次 sourceTag 命中的 raw snapshot 数量
- `completedSnapshotCount` 使用已完成投影的 snapshot 数量

这样不需要把 entity/localization/relation 写库数量提前暴露成进度总量，也不需要改动现有投影结果结构。

### 4. 前端复用导入进度卡片样式

页面不单独设计新视觉结构，而是复用导入现有模式：

- 阶段徽标
- 说明文案
- 百分比
- 进度条
- `sourceTag / 总 snapshot / 已完成 snapshot`

这样可以降低实现成本，也保持导入与投影的一致性。

### 5. 进度过滤沿用当前页面上下文

前端监听投影事件时，只接收以下任一匹配的事件：

- 当前主动执行的 `sourceTag`
- 当前表单中的 `sourceTag`
- 已经展示中的投影进度 `sourceTag`

这样可以避免批量任务或切换选择时被别的 sourceTag 进度覆盖。

## 实施步骤

### 1. 补充 proposal 包

- 新建中文设计、评审和计划文件
- 固定事件模型与阶段划分

### 2. Rust 侧补进度事件

- 在 Tauri `lib.rs` 中新增投影事件常量和 payload 结构
- 在 `desktop_hsdata_projection.rs` 中增加发事件辅助函数
- 在投影主流程关键阶段发事件
- 在 snapshot 投影循环中累计完成数量
- 在异常退出路径补发 `failed`

### 3. 前端接入监听和进度卡片

- 在 `useHsdataRepo.ts` 中新增投影事件类型和监听函数
- 在页面中新增 `projectProgress` 状态和计算属性
- 在投影卡片下方渲染进度条与进度详情

### 4. 验证

- 运行桌面端 Rust 定向测试
- 运行页面相关 TypeScript 检查或最小构建验证
- 手动确认投影中、完成、失败三种状态都能更新 UI

## 风险与取舍

### 1. 进度是阶段性可观察，不是精确耗时预测

本方案只保证：

- 用户知道当前跑到哪一段
- 用户知道 snapshot 已处理到多少

不保证每个阶段耗时均匀，也不保证百分比与剩余时间线性对应。

### 2. 事件频率不能过高

如果每处理一条 snapshot 都发事件，较大 sourceTag 可能产生不必要的前端刷新压力。

实现上应允许：

- 每条都更新完成数，或
- 仅在关键增量时发事件

但无论选择哪种实现，都要保证最终完成数量准确。

### 3. 不处理历史任务恢复

当前页面刷新后不会恢复“上一轮投影执行到第几条 snapshot”的瞬时进度，这与导入现状一致。

本轮只解决运行中可观察性，不扩展到持久化恢复。
