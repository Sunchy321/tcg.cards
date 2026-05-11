# hsdata Rust 主导导入重构设计评审

## 评审结论

建议通过。

这次重构不是性能微调，而是边界纠偏。既然 XML 全量直导已经决定移除，就不应继续在 server 保留整套 XML 解析与 legacy fallback 逻辑。

## 阻塞问题

无。

## 主要判断

### 1. 删除 whole-XML import 是必要清理，不是可选优化

如果 `importArchive(xml)` 继续保留：

- server 仍必须继续维护 XML 解析
- Rust 仍然不是完整闭环
- “已废弃功能”会因为还能调用而长期残留

既然产品决策已经明确，这条路径就应作为死代码入口删除。

### 2. 静态 legacy dbfId 表应跟着 XML 解析职责一起移动

这张表本质上是 XML 解析期的兼容知识，不是 server 写库期的知识。

保留在 TS 侧只会让 Rust 多一次远程查询，而且把同一套导入准备语义拆在两处。

### 3. server 应保留 finalize 写库，不应强行下沉到 desktop

“导入功能调整到 Rust 部分”不应被误读为“数据库写入也放到 desktop”。

当前真正合理的边界是：

- Rust 负责把本地 XML 准备成 canonical payload
- server 负责接收 payload 并写数据库

这个边界既满足职责收敛，也不破坏现有数据库与认证模型。

## 非阻塞建议

### 1. 将 Rust 静态表单独放模块

不要把上千行静态映射直接塞进 `lib.rs` 或 `hsdata_import_payload.rs`。

建议单独文件承载：

- 更容易审阅
- 更容易后续再生成
- 更容易保持注释完整

### 2. TS 测试不要为了保留旧入口而保留旧结构

如果某些 TS 测试只是在验证 XML 解析行为，应直接删除并由 Rust 单测接管。

server 侧测试应只覆盖 server 仍然拥有的职责。

### 3. 先删 RPC，再删实现，避免留下半死接口

本轮改动点很多，但对外边界很清楚：

- 先停止暴露 `importArchive` / `resolveCardDbfIds`
- 再清理下层实现和测试

这样更容易判断调用面是否收敛干净。

## 通过条件

- server 不再暴露 hsdata whole-XML import API
- desktop Rust 不再请求 `resolveCardDbfIds`
- legacy 静态表进入 Rust 代码并保留来源注释
- server 仅保留 chunk job / finalize 所需能力
