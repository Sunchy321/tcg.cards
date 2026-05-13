# hsdata 本地数据库处理迁移实施计划

## TODO List

- [x] 新增中文设计包，固定 hsdata 本地数据库处理迁移的运行时边界
- [x] 为 desktop 本地 PostgreSQL 建立可复用的 hsdata 连接与 transaction 模块
- [x] 为 desktop 新增本地 hsdata source version、overview 和 import job 状态命令
- [x] 将 hsdata staged import、finalize 和 raw snapshot 写入迁入本地数据库
- [ ] 将 desktop 导入页和数据源页切换为读取本地 hsdata 状态
- [ ] 将 hsdata projection 执行迁入 desktop 本地运行时
- [ ] 收缩远端 hsdata 写路径为非主路径或冻结维护路径
- [ ] 运行 targeted verification，确认本地 import、overview、projection 闭环成立

## 实施步骤

### 1. 固定运行时边界

- 明确 hsdata 本地数据库处理由 desktop Rust 执行
- 明确不引入本地 Bun/Node sidecar
- 明确远端 hsdata ORPC 不再作为 desktop 默认写路径
- 明确本轮只处理本地构建层，不处理远端发布

### 2. 建立本地数据库执行基础设施

- 在 `src-tauri/src/` 下拆出数据库连接与 transaction 模块
- desktop Rust 本地 PostgreSQL 访问统一切到 SeaORM，避免继续扩展临时查询接口
- 统一本地 PostgreSQL 错误格式
- 统一“未配置连接 / 连接失败 / schema 未初始化 / 能力不满足”四类阻断结果
- 为 hsdata 命令复用同一套数据库入口

### 3. 迁移本地只读状态面

- 新增本地 `source_versions` 查询命令
- 新增本地 raw overview 查询命令
- 新增本地 import job 状态读取命令
- 先让 desktop 能只读展示本地数据库现状

### 4. 迁移 staged import 与 raw snapshot 写入

- 复用现有 Rust payload 准备流程
- 在 desktop 本地执行 import job 创建
- 在 desktop 本地执行 chunk 应用与 finalize
- 写入本地：
  - `hsdata_import_jobs`
  - `hsdata_import_job_chunks`
  - `hsdata_import_job_snapshots`
  - `source_versions`
  - `raw_entity_snapshots`
  - `raw_entity_snapshot_tags`

### 5. 切换 desktop 页面到本地状态源

- 修改导入页，导入动作改为本地 command
- 修改数据源页，概览改为本地 command
- 明确页面文案中的“本地数据库状态”语义
- 保持 repo 读取、批量任务和进度事件体验不倒退

### 6. 迁移本地 projection

- 以现有 `hsdata-project.ts` 为语义基线
- 在 Rust 中实现等价的 projection 行为
- 本地更新 `projection_status / projection_error / projected_at`
- 本地写入 `hearthstone.*` 构建结果表

### 7. 收缩远端职责

- 冻结远端 hsdata 写路径，不再继续扩展
- 将远端路径降级为迁移期回退面或后续移除对象
- 评估 `site-console` 中 hsdata 页面是否需要下线、改名或显式标注非权威状态

### 8. 验证

- 使用真实 hsdata repo 验证本地导入
- 验证 sourceTag 状态和 raw overview 与本地数据库一致
- 验证 projection 后本地 `hearthstone` 结果表可用
- 验证数据库连接缺失、schema 未初始化和处理失败时的页面反馈
