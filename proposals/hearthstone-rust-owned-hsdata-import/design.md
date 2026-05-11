# hsdata Rust 主导导入重构设计

## 背景

当前 hsdata 导入同时存在两条路径：

- server 端 `importArchive(xml)` 直接接收整份 XML，完成解析并写库
- desktop 端本地解析 XML、分块上传，再由 server `finalizeImportJob` 落库

这导致同一套导入语义被拆在两侧维护：

- XML 规范化与 source hash
- `Entity.ID` 缺失 / `0` 的 legacy dbfId 处理
- 静态 legacy dbfId 表
- 解析与 payload 准备测试

现在已经明确：

- XML 全量直导功能移除
- desktop Rust 成为 hsdata XML 导入准备的唯一入口

因此需要把“XML 到 chunk payload”这一整段职责彻底收敛到 Rust，server 只保留 staged job 与最终写库能力。

## 目标

- 移除 server 端整份 XML 直导入口
- 将 legacy dbfId 静态表迁移到 desktop Rust
- 将 legacy dbfId 解析从远程 RPC 改为本地 Rust 处理
- 让 server 端只接受 canonical chunk payload，不再理解 hsdata XML
- 删除 TS 侧不再需要的 XML 解析 / legacy fallback 代码与测试

## 非目标

- 不改动 hsdata 原始快照表结构
- 不改动 staged job 上传协议的整体形态
- 不将最终数据库写入移动到 desktop
- 不重做 sourceTag / projection UI

## 现状问题

### 1. XML 导入语义被双端拆分

当前 Rust 已负责：

- 读取本地 hsdata 仓库
- 规范化 XML
- 解析 XML
- 构建 canonical NDJSON chunk

但 legacy dbfId 决策仍然依赖 server：

- Rust 先扫描缺失 / `0` 的 `cardId`
- 调用 `resolveCardDbfIds` RPC
- 再把映射回灌给 Rust 解析器

这使 Rust 侧并不是完整、闭环的导入准备实现。

### 2. server 仍保留已废弃的 whole-XML import

`importArchive(xml)` 直导路径与当前 desktop 主流程并存，带来：

- 重复实现 XML 解析逻辑
- 重复维护 legacy fallback 规则
- 重复测试面
- 后续继续重构时很难判断哪些逻辑仍有调用面

既然功能已决定移除，就应立即删掉对应入口和实现，避免形成“已废弃但还能用”的隐式兼容层。

### 3. 静态 legacy dbfId 表放在 TS 侧，不符合单一职责

这张表只服务“把旧版 hsdata XML 解析成 canonical payload”。

在新边界下，这个职责已经属于 desktop Rust，因此静态表继续留在 TS 侧只会造成：

- 多一次 RPC
- 多一份跨端接口
- Rust 代码无法自足

## 目标边界

重构后职责划分如下：

### desktop Rust 负责

- 读取本地 hsdata 源
- 规范化 XML
- 解析 `CardDefs`
- 本地收集 legacy `cardId`
- 本地静态查表补全 legacy dbfId
- 对无解对象保留 `dbfId = 0`
- 构建 canonical NDJSON chunk
- 创建 job、上传 chunk、触发 finalize

### server TypeScript 负责

- 校验 chunk manifest
- 接收 staged chunk
- 解析 canonical NDJSON payload
- 复用共享 raw import 应用逻辑写库
- 维护 source version / import job 状态

## 设计决策

### 1. 删除 server 的 whole-XML import API

移除：

- `hearthstone.dataSource.hsdata.importArchive` 路由
- `ImportHsdataInput`
- `importHsdata(xml)` whole-XML 导入入口

保留：

- `importParsedHsdata(...)`
- staged job 的 `createImportJob / uploadImportChunk / finalizeImportJob`

理由：

- `importParsedHsdata` 仍是 server 最终写库所需的共享入口
- whole-XML import 已失去产品意义，只会继续拖住 XML 相关 TS 逻辑

### 2. legacy dbfId 静态表迁移到 Rust

新增 Rust 侧静态模块，承载：

- git 跟踪的 legacy `cardId -> dbfId` 静态映射
- 手工冲突决策注释
- unresolved 行继续保留 `0` 的注释说明

TS 侧 `hsdata-legacy-dbf-id-table.ts` 删除。

理由：

- 表的唯一消费者应是 Rust XML 准备逻辑
- 避免跨端 RPC 和双份查表语义

### 3. 删除 `resolveCardDbfIds` RPC

Rust 侧不再向 server 请求 legacy 映射，改为：

- 本地扫描 legacy `cardId`
- 本地静态表查值
- 解析时直接使用本地 `HashMap`

移除：

- ORPC `resolveCardDbfIds`
- TS `resolveHsdataCardDbfIds`
- Rust 侧对应 request / response 类型与调用逻辑

### 4. 删除 TS 侧 XML 解析与 legacy fallback 逻辑

在 server 不再接收 XML 后，以下逻辑不再需要：

- `normalizeHsdataSourceXml`
- `computeHsdataSourceHash`
- `collectLegacyEntityCardIds`
- `parseHsdataXml`
- `ParseHsdataOptions`
- legacy dbfId static lookup

server 端只保留：

- canonical chunk payload 解析
- `ParsedHsdata` / `ParsedEntity` 数据结构
- raw import 应用逻辑

这会显著收缩 `hsdata-import.ts` 的职责范围。

### 5. 测试分层跟随新边界收敛

Rust 测试负责覆盖：

- XML 规范化
- legacy `ID` 缺失 / `0`
- 静态表命中
- unresolved 保留 `0`
- payload 构建稳定性

TS 测试负责覆盖：

- canonical payload 导入写库
- staged job 上传 / finalize
- source version 状态流转

TS 侧围绕 `importHsdata(xml)` 的测试全部删除或重写为 `importParsedHsdata(...)` / job 流程测试。

## 实施步骤

### 阶段一：定义 Rust 主导边界

- 新建 proposal
- 固定“server 不再接收 hsdata XML”这条边界
- 固定 legacy 静态表迁移方案

### 阶段二：Rust 侧完成本地闭环

- 抽出 Rust 静态 legacy dbfId 模块
- 替换远程 `resolveCardDbfIds` 调用
- 让 `prepare_hsdata_import_source` 仅依赖本地数据完成 payload 准备

### 阶段三：server 删减 XML 相关能力

- 删除 ORPC `importArchive`
- 删除 ORPC `resolveCardDbfIds`
- 删掉 TS 侧 XML 解析与静态表逻辑
- 保留 `importParsedHsdata` 与 job finalize

### 阶段四：测试与清理

- 更新 Rust 单测
- 更新 TS 单测
- 跑 targeted test
- 清理不再使用的类型、注释与导出

## 风险与取舍

### 1. server 失去直接 XML 导入能力是预期破坏性变更

这不是兼容性回退，而是有意移除。

只要仍有任何调用点依赖 `importArchive(xml)`，本轮就必须同步删除或改造这些调用点。

### 2. 静态表迁移到 Rust 后需要重新维护生成方式

虽然表的内容不变，但代码载体从 TS 变成 Rust，意味着：

- 注释仍要保留来源
- 生成脚本可以保留在仓库中
- 但最终产物要以 Rust 常量形式进入 git

### 3. server 测试需要重新聚焦

删除 XML 入口后，原本靠 `importHsdata(xml)` 覆盖的部分行为要么：

- 转移到 Rust 单测
- 要么改为对 parsed payload / staged job 进行 server 侧验证

这是职责收敛后的正常测试重排，不应再强行维持旧测试结构。
