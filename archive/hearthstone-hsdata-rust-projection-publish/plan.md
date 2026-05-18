# hsdata Rust 投影与远端发布实施计划

- [x] 步骤 1：冻结 TypeScript 投影基线并补齐对照 fixture
- [x] 步骤 2：抽出 Rust 投影模块与配置解释层
- [x] 步骤 3：实现本地 Rust 投影命令与状态流转
- [x] 步骤 4：让 desktop 页面切换到本地 Rust 投影入口
- [x] 步骤 5：设计并落地本地 publish batch / manifest 表
- [x] 步骤 6：实现远端 publish target profile 与批次绑定校验
- [x] 步骤 7：实现 manifest diff、整卡重发和远端 ledger 更新
- [x] 步骤 8：完成端到端验证并冻结旧 TS 投影路径

## 步骤 1：冻结 TypeScript 投影基线并补齐对照 fixture

- 明确 `packages/console-api/src/lib/hearthstone/hsdata-project.ts` 进入冻结维护状态
- 抽取覆盖关键语义的 fixture：
  - locale 映射
  - set 映射
  - enum / bool / card ref 归一化
  - strong / weak relation
  - `legacyPayload`
  - `version[]` 合并
- 为每个 fixture 固化 TS 产物：
  - entities
  - entity_localizations
  - entity_relations
  - 关键 hash

交付物：

- Rust 迁移的 golden case 数据集
- 明确的“等价输出”验收口径

## 步骤 2：抽出 Rust 投影模块与配置解释层

- 新增 `desktop_hsdata_projection.rs`
- 新增独立的 rule/config parser：
  - `normalize_kind`
  - `project_kind`
  - `normalize_config`
  - `project_config`
- 把数据访问、配置解释、结果构建、hash 计算拆分成清晰子模块

交付物：

- 可独立单测的 Rust 投影内核
- 不依赖 UI 和 command 层的 projection library

## 步骤 3：实现本地 Rust 投影命令与状态流转

- 新增 Tauri command，例如：
  - `hsdata_project_source_version_local`
- 在命令内完成：
  - `source_versions` 校验
  - `projection_status` 写入 `processing/completed/failed`
  - dry run / force 行为
  - 本地领域表事务写入
- 保持页面所需的 report 字段与当前接口口径兼容

交付物：

- desktop 可直接调用的本地投影命令
- 可替代现有 ORPC 投影入口的本地 report

## 步骤 4：让 desktop 页面切换到本地 Rust 投影入口

- 更新 `apps/app-console-desktop/src/pages/hearthstone/data-import/index.vue`
- 移除页面对远端 `projectSourceVersion` 的依赖
- 投影成功、失败和刷新状态全部改为读本地数据库
- 页面文案明确“本地投影结果”和“远端发布结果”的区别

交付物：

- desktop 页面端到端走本地投影链路
- 旧 TS 投影按钮路径不再是主流程

## 步骤 5：设计并落地本地 publish batch / manifest 表

- 在 `hearthstone_data` 下新增发布侧系统表
- 至少包含：
  - 批次元数据
  - 每卡 manifest
  - 上次成功发布基线
- 先更新 schema，再生成 migration

交付物：

- 本地发布批次存储模型
- 可供恢复、重试和对账的 manifest 基线

## 步骤 6：实现远端 publish target profile 与批次绑定校验

- 在 desktop 设置中支持 publish target profile
- 保存：
  - `publishTargetId`
  - `environment`
  - `connectionString`
  - fingerprint
- 创建批次时固化目标身份
- 执行批次前复验：
  - 当前目标是否仍一致
  - fingerprint 是否满足前提

交付物：

- 不会因“当前设置变化”而误发到错误环境的批次模型

## 步骤 7：实现 manifest diff、整卡重发和远端 ledger 更新

- 基于本地当前投影结果生成 card manifest
- 与上次成功发布基线做 diff
- 对变更卡按整卡粒度重发 row family：
  - `entities`
  - `entity_localizations`
  - `entity_relations`
- 对删除卡执行远端清理
- 发布成功后更新：
  - 本地成功基线
  - 远端最小 ledger

交付物：

- 可重试、可对账的远端发布链路

## 步骤 8：完成端到端验证并冻结旧 TS 投影路径

- 用 fixture 对照 Rust/TS 输出
- 用真实本地数据库验证：
  - raw import -> local projection
  - local projection -> publish batch
  - publish batch -> remote apply
- 冻结并下线旧 TS 投影主路径
- 清理旧页面、旧 ORPC 和旧说明文档中的主流程表述

交付物：

- 完整的本地构建与远端发布闭环
- 可以进入后续实现或评审的稳定迁移基线
