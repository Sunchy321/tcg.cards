# hsdata 本地投影进度事件实施计划

> 稳定的运行时边界、数据归属和同步规则以 [../../docs/project-architecture.zh-CN.md](../../docs/project-architecture.zh-CN.md) 为准。本文只记录本需求的实施计划；若有冲突，以主架构文档为准。

## TODO List

- [ ] 新增中文 proposal 包，固定投影进度事件方案
- [ ] 在 Tauri Rust 中新增投影进度事件结构和事件名
- [ ] 在本地投影链路关键阶段发出进度事件
- [ ] 在 snapshot 投影循环中上报累计完成数量
- [ ] 在前端新增投影进度监听、状态和进度卡片
- [ ] 运行定向验证，确认事件和页面展示都正常

## 实施步骤

### 1. 固定事件模型

- 事件名使用 `hsdata-project-progress`
- 载荷包含 `sourceTag / phase / message / totalSnapshotCount / completedSnapshotCount`
- 阶段固定为加载、投影、汇总、写入、完成、失败

### 2. 改造 Rust 投影入口

- 在 Tauri `lib.rs` 中定义 payload 结构和常量
- 在 `desktop_hsdata_projection.rs` 中新增发事件辅助函数
- 在 write mode 和 dry run 两条路径都发事件

### 3. 改造投影主流程

- 加载 snapshot 前发起始事件
- 加载 tag 和 projection 配置时发阶段事件
- 在 snapshot 循环中累计完成数量并持续上报
- 汇总和写库前发阶段事件
- 成功时发 `completed`
- 失败时发 `failed`

### 4. 前端接入

- 在 `useHsdataRepo.ts` 中新增事件类型和监听函数
- 在页面加入 `projectProgress` 状态
- 复用导入进度卡片模式展示投影阶段、百分比和计数
- 只接收与当前 `sourceTag` 匹配的事件

### 5. 验证

- 运行桌面端 Rust 定向测试
- 运行页面相关最小验证
- 确认投影成功和失败时进度卡片都会正确收口
