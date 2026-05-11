# hsdata Rust 主导导入重构实施计划

## TODO List

- [ ] 新增中文设计包，固定 Rust 主导导入的职责边界
- [ ] 将 legacy dbfId 静态表迁移到 Rust 模块
- [ ] 删除 desktop 到 server 的 `resolveCardDbfIds` 远程依赖
- [ ] 删除 server 的 hsdata whole-XML import API 与相关输入输出
- [ ] 删除 TS 侧 XML 解析、legacy fallback 与静态表实现
- [ ] 重写或删除不再成立的 TS 测试，并补齐 Rust 测试
- [ ] 运行 targeted verification，确认 desktop/job/finalize 链路仍然成立

## 实施步骤

### 1. 固定职责边界

- 保留 `createImportJob / uploadImportChunk / finalizeImportJob`
- 删除 `importArchive(xml)` 与 `resolveCardDbfIds`
- 明确 XML 规范化、解析、legacy fallback、payload 准备全部归 Rust

### 2. 迁移 legacy 静态表

- 新增 Rust 静态模块
- 将现有 TS 表内容迁移为 Rust 常量
- 保留来源注释与人工决策注释
- 让 Rust 解析逻辑直接读取该表

### 3. 改造 desktop 导入准备流程

- 删除远程 `resolveCardDbfIds` request / response 类型
- 删除导入准备阶段的 legacy RPC 请求
- 改为本地收集 cardId 并本地静态查表
- 确保 unresolved 继续落为 `dbfId = 0`

### 4. 收缩 server 端实现

- 从 ORPC `hsdata` 数据源中删除 `importArchive` 与 `resolveCardDbfIds`
- 从 `hsdata-import.ts` 中删除 XML 解析与 legacy fallback 逻辑
- 保留 `ParsedHsdata` / `ParsedEntity` 与 raw import 应用逻辑
- 删除不再使用的 TS 静态表文件

### 5. 更新测试

- 删除 `importHsdata(xml)` 相关 server 测试
- 将 XML 解析与 legacy fallback 覆盖转移到 Rust 单测
- 保留并调整 `importParsedHsdata` / staged job / finalize 相关 TS 测试

### 6. 验证

- 运行 Rust `hsdata_import_payload` 相关测试
- 运行 TS `hsdata-import` / `hsdata-import-job` 相关测试
- 检查删除接口后是否还有残留调用点
