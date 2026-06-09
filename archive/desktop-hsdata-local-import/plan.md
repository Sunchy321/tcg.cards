# Todo

- [x] 调整导入任务相关 schema 和 migration，补充 `payloadFormatVersion`、`payloadEncoding`、`importEngineVersion`，并为正式来源版本元数据预留解析器版本记录位置
- [x] 在 desktop 侧落地标准化 snapshot 解析、canonical NDJSON 序列化、`sourceHash` / `payloadHash` 计算和 `importEngineVersion` 注入能力
- [x] 重构后端 hsdata 导入服务，改为接收结构化 snapshot staging，服务端重算 `snapshotHash`，并明确 `sourceHash` 的 trusted desktop 边界
- [x] 拆分控制面和数据面接口，保留 JSON job API，新增 gzip NDJSON 原始 HTTP `uploadImportChunk` 上传接口
- [x] 重构 desktop 导入命令和续传逻辑，改为本地解析、gzip NDJSON 分块上传、进度汇报和 finalize
- [x] 调整导入页和桌面调用链路，适配新协议并移除旧的 XML chunk 主路径
- [x] 验证 trusted desktop、全量重导、`dryRun` / `force`、续传、并发、冲突、清理和旧链路退出场景

# desktop hsdata 分块导入任务实施计划

## 步骤 1：调整数据模型和 migration

- 在 `packages/db/src/schema/hearthstone/data/` 中调整 hsdata 导入任务相关表定义
- 保持表统一归类到 `hearthstone_data`
- 在 `hsdata_import_jobs` 中补充：
  - `payloadFormatVersion`
  - `payloadEncoding`
  - `importEngineVersion`
- 保持 `sourceHash`、`manifestHash`、`chunkingVersion`、`totalChunkCount`、`totalEntityCount` 和切块阈值摘要
- 保持 `hsdata_import_job_chunks` 的任务清单真相职责不变：
  - `jobId + chunkIndex`
  - `payloadHash`
  - `entityCount`
  - 状态和错误
- 保持 `hsdata_import_job_snapshots` 以结构化 staging 行保存：
  - `jobId`
  - `chunkIndex`
  - `cardId`
  - `dbfId`
  - `entityXmlVersion`
  - `snapshotHash`
  - `tags`
  - `extraPayload`
- 明确 `snapshotHash` 代表服务端重算后的真相值，而不是客户端声明值
- 为正式来源版本元数据补充 `importEngineVersion` 的落点：
  - 可以是专用字段
  - 也可以是明确约定的元数据容器
  - 需要支持后续筛查哪些数据需要全量重导
- 通过 `drizzle-kit generate` 生成新的 migration 和 snapshot

交付结果：

- 与新协议一致的 schema
- 对应 migration 和 snapshot

## 步骤 2：落地 desktop 侧解析和 payload 生成能力

- 在 desktop 侧实现从 hsdata XML 到标准化 entity snapshot 的解析能力
- 明确本轮采用 trusted desktop 边界：
  - desktop 是受信任导入器
  - 服务端不独立验证 staged snapshot 与原始 XML 的可逆对应关系
- 在 desktop 侧生成：
  - `sourceHash`
  - chunk manifest
  - canonical NDJSON
  - `payloadHash`
  - `importEngineVersion`
- 固定 canonical NDJSON 规则：
  - 字段顺序
  - 嵌套对象 canonical JSON 规则
  - `tags` 顺序
  - 行分隔符
  - 末尾换行规则
- 按固定阈值完成切块：
  - 未压缩 NDJSON 字节数上限
  - `entityCount` 上限
  - 可选压缩后体积软上限

交付结果：

- desktop 可稳定生成结构化 chunk payload
- `payloadHash` 和 chunk 边界可重复复算

## 步骤 3：重构后端共享导入服务

- 在 `packages/console-api/src/lib/hearthstone/` 中重构 hsdata 导入服务
- 从“解析 XML chunk 再写 staging”改为“接收结构化 snapshot staging 再写入”
- 保持以下职责：
  - `createImportJob` 清单一致性校验
  - `manifestHash` 计算
  - chunk 状态抢占和幂等
  - finalize 单事务写入
  - staging 清理重试
- 新增以下职责：
  - 解析 NDJSON 行
  - 校验 canonical 约束
  - 服务端重算 `snapshotHash`
  - 基于服务端重算值执行 `jobId + cardId` 冲突判断
- 明确 `sourceHash` 的服务边界：
  - 作为 trusted desktop 声明的来源溯源值保留
  - 继续作为正式 `source_hash` 兼容值写入
  - 不作为服务端独立可证明事实
- 在 finalize 中把 `importEngineVersion` 一并写入正式来源版本元数据

交付结果：

- 可复用的新共享服务层
- 与 trusted desktop 边界一致的 finalize 语义

## 步骤 4：拆分控制面和数据面接口

- 保留控制面 JSON API：
  - `createImportJob`
  - `getImportJob`
  - `finalizeImportJob`
- 新增数据面原始 HTTP 上传接口：
  - `uploadImportChunk`
- `createImportJob` 输入中明确：
  - `sourceHash`
  - `chunkingVersion`
  - `payloadFormatVersion`
  - `payloadEncoding`
  - `importEngineVersion`
  - `totalChunkCount`
  - `totalEntityCount`
  - chunk manifest
- `createImportJob` 在落库前必须完成：
  - `totalChunkCount === chunks.length`
  - `totalEntityCount === sum(chunks.entityCount)`
  - `chunkIndex` 连续且唯一
  - `chunks` 作为任务清单真相
- `uploadImportChunk` 改为：
  - `Content-Type: application/x-ndjson`
  - `Content-Encoding: gzip`
  - 原始 body 传输 gzip NDJSON bytes
  - header 传 `payloadHash` 和 `entityCount`
- `finalizeImportJob` 继续只接收 `jobId`
- `getImportJob` 返回任务级进度摘要，不暴露逐行 payload 内容

交付结果：

- 控制面与数据面边界清晰的远端接口

## 步骤 5：重构 desktop 导入命令和续传逻辑

- 在 `apps/app-console-desktop/src-tauri/src/lib.rs` 中重构 hsdata 导入命令
- 保持前端仍然只看到单一命令入口
- 命令内部改为：
  - 来源解析
  - XML 读取
  - 本地规范化和标准化 snapshot 解析
  - canonical NDJSON 生成
  - `sourceHash`、`payloadHash`、manifest 计算
  - `importEngineVersion` 注入
  - 调用 `createImportJob`
  - 查询已完成 chunk
  - gzip 压缩
  - 有界并发调用原始 HTTP `uploadImportChunk`
  - 调用 `finalizeImportJob`
- 保持桌面进度事件和恢复逻辑与新 job 状态兼容
- 清理或下线旧的 XML chunk 上传主路径，避免双轨主实现并存

交付结果：

- desktop 本地解析驱动的新导入命令
- 可续传、可并发的 gzip NDJSON 上传链路

## 步骤 6：调整导入页和桌面调用链路

- 在 `apps/app-console-desktop/src/pages/hearthstone/data-import/index.vue` 中保持页面输入边界不变：
  - `id`
  - `dryRun`
  - `force`
- 保持以下行为不变：
  - loading 展示
  - 错误展示
  - 导入报告展示
  - `projectForm.sourceTag` 回填
- 适配新的桌面进度事件字段和状态文本
- 移除或替换旧的 XML chunk 主路径相关前端假设

交付结果：

- 前端继续只走单一 desktop 导入入口
- 页面行为与新协议一致

## 步骤 7：验证和收口

- 验证 100MB 级 XML 不再以整包请求进入远端
- 验证 Worker 上传阶段只做 gzip 解压、校验和 staging 写入
- 验证 trusted desktop 边界符合预期：
  - 服务端不反向验证 `sourceHash` 与原始 XML 的可逆对应关系
  - `sourceHash` 仍能作为来源溯源值写入正式版本
- 验证 `snapshotHash` 始终由服务端重算
- 验证 `importEngineVersion` 在 job 和正式来源版本元数据中的记录
- 验证解析器或标准化规则变化后，可通过 `importEngineVersion` 识别并执行全量重导
- 验证同一来源的 `dryRun`、正常导入、`force` 覆盖
- 验证 chunk 重复上传、断点续传和并发上传的幂等行为
- 验证同一 `chunkIndex` 并发请求的抢占、冲突和幂等返回
- 验证 `createImportJob` 会拒绝清单不一致任务
- 验证 finalize 的正式表写入失败会整体回滚
- 验证 finalize 成功后 staging 清理失败可再次重试
- 验证导入完成后仍能继续走既有 `projectSourceVersion` 链路
- 验证旧 XML chunk 主路径已退出正式导入路径

交付结果：

- 新导入协议链路可用
- trusted desktop 与全量重导边界可执行
- 基础失败场景可诊断
