# hsdata sourceTag 导入与投影状态展示实施计划

> 稳定的运行时边界、数据归属和同步规则以 [../../docs/project-architecture.zh-CN.md](../../docs/project-architecture.zh-CN.md) 为准。本文只记录本需求的实施计划；若有冲突，以主架构文档为准。

## TODO List

- [x] 更新设计，改为 source_versions 持久化 projection 字段
- [x] 在 schema 中新增 projectionStatus、projectedAt、projectionError
- [x] 在导入与投影流程中写回 projection 状态
- [x] 生成 Drizzle migration
- [x] 运行相关测试并确认迁移与逻辑一致
- [x] 新增 sourceTag 状态查询接口
- [x] 在 desktop 导入页按 sourceTag 合并本地来源与数据库状态
- [x] 在来源列表、选中详情区、投影面板显示导入与投影状态
- [x] 在同步、导入、投影后刷新状态并完成前端验证

## 实施步骤

### 1. 更新设计，固定持久化字段口径

- 将“已导入”继续定义为 `source_versions.status = completed`
- 将“已投影”改为 `source_versions.projectionStatus = completed`
- 明确新增 `projectionStatus`、`projectedAt`、`projectionError`

### 2. 在 schema 中新增 projection 字段

- 修改 `source_versions` Drizzle schema
- 选择 `not_started | processing | completed | failed` 作为状态集合
- 为新增字段设置合理默认值和空值语义

### 3. 在导入与投影流程中写回状态

- 非 dry-run 导入成功后重置 projection 状态为 `not_started`
- 非 dry-run 投影开始前写入 `processing`
- 非 dry-run 投影成功后写入 `completed` 和 `projectedAt`
- 非 dry-run 投影失败后写入 `failed` 和 `projectionError`

### 4. 生成 Drizzle migration

- 先改 schema，再运行 `drizzle-kit generate`
- 检查生成的 migration SQL 和 snapshot
- 为历史数据补一条最小 backfill SQL，把当前已能证明完成投影的 sourceTag 标成 `completed`
- 不手改由 Drizzle 可推导的 schema 结果

### 5. 运行相关测试并完成验证

- 运行与 hsdata import / project 相关的测试
- 确认新增字段不会破坏现有导入逻辑
- 确认设计文档与代码实现口径一致

### 6. 新增 sourceTag 状态查询接口

- 新增一个只读查询，直接从 `source_versions` 返回页面需要的状态字段
- 暴露 ORPC 接口给 desktop 页面使用
- 不复用概览接口，不在页面层做 build 级别推导

### 7. 在 desktop 导入页合并本地来源与数据库状态

- 保留现有本地 git 来源列表
- 加载 sourceTag 状态列表
- 按 `sourceTag` 合并数据
- 对没有 `sourceTag` 的本地来源走降级展示

### 8. 更新页面展示与交互

- 在右侧来源列表展示导入状态 badge 和投影状态 badge
- 在当前选中来源详情区展示状态、时间与失败信息
- 在投影面板展示当前 sourceTag 的动态可执行状态

### 9. 刷新状态并完成前端验证

- 页面初始化时加载状态
- 同步远端版本后刷新来源列表和状态
- 导入完成后刷新状态
- 投影完成后刷新状态
- 验证页面展示与真实可执行行为一致
