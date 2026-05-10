# desktop hsdata 分块导入任务设计

## 背景

当前 desktop 端的 hsdata 导入流程仍然是“整份 XML 读出后直接提交给远端导入接口”：

1. Tauri 从本地 hsdata git repo 读取指定来源的 `CardDefs.xml`
2. 前端或 desktop runtime 将整份 XML 作为字符串提交到远端 `importArchive`
3. 远端在 Cloudflare Workers 中完成整份 XML 的解析和入库

这条链路在小文件下可用，但当前最新 `CardDefs.xml` 已经接近 100MB，问题已经不只是“前端会不会卡”。

即使把大 XML 从前端挪走，只要远端仍然接收整份 XML 并在 Worker 中一次性解析，仍然存在以下风险：

- Worker 入站请求体体积过大
- Worker 默认 CPU 时间不适合长时间整包解析
- Worker 内存上限不适合整份字符串和整批解析对象同时驻留
- 一次失败会让整份来源重来，无法分片重试

因此，这一轮不能只做“前端不持有 XML”的局部优化，而是要把导入协议本身改成任务化分块导入，并把控制面与数据面分离：

- 控制面继续使用小 JSON 请求管理任务
- 数据面使用专用 chunk 上传接口传输压缩后的结构化 payload

## 目标

- desktop 本地负责读取 hsdata XML，并生成标准化 entity snapshot
- 远端每次请求只接收一个小 chunk，而不是整份来源
- chunk 上传采用可压缩、可流式处理、可校验的结构化格式
- 支持基于 chunk 状态的断点续传
- 支持有界并发的 chunk 上传
- 远端只在所有分块上传完成后统一 finalize，保持当前来源级导入语义
- 保持当前 `dryRun` / `force` 语义
- 保持当前导入报告结构和导入页主要交互
- 让前端不再中转整份 XML，让 Worker 不再接收近 100MB 请求体，也不再在上传阶段解析 XML

## 非目标

- 本轮不把远端改成直接处理整份 R2 对象
- 本轮不做复杂的跨来源任务编排
- 本轮不做无限并发或自适应并发调度
- 本轮不改 `projectSourceVersion` 投影链路
- 本轮不把长期审计归档作为主上传链路的一部分
- 本轮不要求服务端独立验证 staged snapshot 与原始 XML 的可逆对应关系

## 现状问题

### 1. 当前协议边界不适合 Worker

当前远端 `importArchive` 的输入仍然是：

- `xml`
- `sourceTag`
- `sourceCommit`
- `sourceUri`
- `dryRun`
- `force`

也就是说，远端入口天然要求整份 XML 以字符串形式进入 Worker。即使 desktop 端不再经过前端，这个边界本身仍然过重。

### 2. 当前上传格式不是远端真正需要的写入模型

远端最终写入 staging 和正式表时，需要的是标准化后的 entity snapshot，而不是原始 XML 语法树本身。

如果 chunk 仍然上传 XML，只是把“来源级 XML 解析”改成“chunk 级 XML 解析”，并没有从根上消除 Worker 端的解析 CPU 和内存开销。

### 3. 失败恢复粒度过粗

当前整份来源导入只要中途任何一步失败，就只能整份重试。对于 100MB 级 XML，这个粒度太粗。

## 数据分类

本轮新增的表都属于导入任务、导入中间态和导入暂存数据，均为用户无关的系统侧导入数据，因此统一归类到：

- `hearthstone_data`

不会放入：

- `hearthstone`
- `hearthstone_app`

## 设计决策

### 1. 引入远端 hsdata 导入任务模型

远端新增一组面向 hsdata 的任务表，建议命名为：

- `hsdata_import_jobs`
- `hsdata_import_job_chunks`
- `hsdata_import_job_snapshots`

职责划分如下：

- `hsdata_import_jobs`
  - 记录一次来源级导入任务
  - 保存 `sourceTag`、`sourceCommit`、`sourceUri`、`build`、`sourceHash`、`manifestHash`
  - 保存 `chunkingVersion`、`payloadFormatVersion`、`payloadEncoding`、`importEngineVersion`
  - 保存 `dryRun`、`force`
  - 保存 `totalChunkCount`、`totalEntityCount` 和切块阈值摘要
  - 保存任务状态、错误信息、最终报告摘要
  - 保存 `stagingCleanupStatus`、`stagingCleanupError`、`cleanedAt`，用于区分业务完成和暂存清理完成

- `hsdata_import_job_chunks`
  - 记录每个 chunk 的上传状态
  - 以 `jobId + chunkIndex` 保证幂等
  - 保存 `entityCount`、`payloadHash`、状态和错误
  - 作为断点续传和并发上传的显式状态表
  - chunk 状态至少包含 `pending`、`processing`、`completed`、`failed`

- `hsdata_import_job_snapshots`
  - 保存 chunk 上传后的来源级暂存 entity snapshot
  - 显式保存 `jobId`、`chunkIndex`、`cardId`、`dbfId`、`entityXmlVersion`、`snapshotHash`
  - 每行除 snapshot 基础字段外，直接以 `jsonb` 保存该 entity 的 normalized `tags`
  - 直接以 `jsonb` 保存 `extraPayload`
  - 只服务于当前 job 的 finalize，不直接暴露给投影链路

这些 staging 表的存在是必要的，因为 chunk 上传阶段不能直接修改正式表，否则任务中断时会留下半成品。

#### 1.1 chunk 状态机

`hsdata_import_job_chunks.status` 的语义必须显式收口：

- `pending`
  - chunk 已登记，但尚未被任何请求占用
- `processing`
  - 某个请求已经原子抢占了这个 chunk
  - 在该请求完成前，其他请求不能再写入这条 chunk 记录
- `completed`
  - chunk 的 staging 写入已经成功
  - 相同 `payloadHash` 的重复请求只能走幂等返回
- `failed`
  - 上一次上传失败，允许重试

抢占规则如下：

- `uploadImportChunk` 先尝试把 `pending` 或 `failed` 原子切换为 `processing`
- 如果 chunk 已经是 `processing`，说明有并发请求正在处理，直接返回冲突或忙碌状态，不写入 staging
- 如果 chunk 已经是 `completed` 且 `payloadHash` 一致，直接返回幂等成功
- 如果 chunk 已经是 `completed` 但 `payloadHash` 不一致，视为冲突并把 job 标记为失败
- 只有持有 `processing` 状态的请求可以继续写入 staging
- 任一校验或写入步骤失败后，chunk 退回 `failed`，以便后续重新抢占

### 1.2 服务端拥有任务真相

任务化之后，服务端不能只做“被动接收 chunk”，还必须在 `createImportJob` 阶段固定本次任务的预期形态。

因此服务端需要拥有以下真相数据：

- 预期 chunk 总数
- 预期 entity 总数
- 每个 chunk 的 `chunkIndex`、`payloadHash`、`entityCount`
- `chunkingVersion`
- `payloadFormatVersion`
- `payloadEncoding`
- `importEngineVersion`
- 切块阈值摘要

其中 `chunks` 是任务清单真相，`totalChunkCount` 和 `totalEntityCount` 只是冗余校验字段：

- `totalChunkCount` 必须等于 `chunks.length`
- `totalEntityCount` 必须等于所有 `chunks.entityCount` 之和
- `chunks` 内的 `chunkIndex` 必须连续且唯一
- `payloadHash` 和 `entityCount` 必须与每个 chunk 的实际内容一致
- 任一校验失败时，`createImportJob` 必须直接拒绝创建，不允许先落库再补救

这些信息在 `createImportJob` 时一次性写入 job 和 `job_chunks`，后续：

- `uploadImportChunk` 只允许上传服务端已登记过的 chunk
- `finalizeImportJob` 不再信任客户端补报任务完整性

### 1.3 hash 分层

本轮保留客户端生成的 `sourceHash`，并把服务端任务清单 hash 和 chunk payload hash 明确拆层：

- `sourceHash`
  - desktop 端对本地完整来源计算出的声明值
  - 需要保持与现有 `source_versions.source_hash` 相同的计算语义
  - 计算前必须复用现有导入相同的 XML 规范化规则
  - 用于来源溯源、兼容旧语义和排障对照
  - 服务端不独立验证 staged snapshot 是否可逆对应这份原始 XML

- `manifestHash`
  - 服务端基于 `createImportJob` 时提交的 chunk 清单计算出的任务清单 hash
  - 用于校验续传时任务清单是否漂移

- `payloadHash`
  - 针对单个 chunk 的未压缩 canonical NDJSON 字节串计算出的 hash
  - 不对 gzip 后的传输字节计算
  - 不允许因为压缩级别变化而改变

也就是说：

- `sourceHash` 是受信任 desktop 导入器声明的原始来源 hash
- 服务端只验证任务清单、chunk payload 和 staging 内容的自洽性
- 客户端 `sourceHash` 仍然有用，并继续作为正式来源 hash 的兼容值
- 任务完整性和续传边界以服务端自算的 `manifestHash` 为准
- chunk 幂等和重传校验以未压缩 `payloadHash` 为准
- 除客户端外，其他地方不会生成 `sourceHash`

### 2. desktop 负责读取 XML、解析并切块

新的导入主路径改为由 desktop runtime 驱动：

1. 从本地 hsdata repo 读取目标来源的 XML
2. 在本地完成 XML 规范化
3. 在本地把来源解析成标准化 entity snapshot
4. 按固定规则切成多个 chunk
5. 对每个 chunk 生成 canonical NDJSON
6. 计算 `sourceHash`、chunk 清单和切块配置摘要
7. 调用 `createImportJob` 固定服务端任务清单
8. 对每个 chunk 做 gzip 压缩并逐块上传
9. 触发远端 finalize
10. 把最终导入报告返回给前端

这里的关键变化是：

- desktop 不再只做 XML 传输层切块
- desktop 需要先得到标准化 entity snapshot，再生成上传 payload
- Worker 在上传阶段不再承担 hsdata XML 解析责任

### 2.1 desktop 是受信任导入器，`importEngineVersion` 必须显式记录

把解析前移到 desktop 端之后，服务端在上传阶段不再拥有原始 XML，因此本轮必须明确采用以下信任边界：

因此必须明确：

- desktop 是受信任的 hsdata 导入器
- 服务端不反向验证 staged snapshot 是否真的来自 `sourceHash` 声明的那份 XML
- 解析器或标准化规则发生变化时，通过全量重新导入修正历史数据

为了让这条运维策略可执行，每次导入都必须显式记录：

- `importEngineVersion`
  - 表示当次 desktop 解析器和标准化规则版本
  - 写入 `hsdata_import_jobs`
  - 在最终正式来源版本元数据中也需要保留，便于后续识别需要全量重导的数据

本轮不再把“共享单一解析语义内核”作为首版强依赖。

是否复用共享 Rust crate、Wasm 模块或其他统一解析内核，属于后续质量强化方向，但不是当前协议成立的前置条件。

### 3. chunk payload 采用 gzip NDJSON

如果不受当前实现约束，最佳的 chunk 传输形式不是 XML，也不是大 JSON array，而是：

- 未压缩内容使用 `NDJSON`
- 传输时使用 `gzip`
- 上传接口使用原始 HTTP body，而不是 JSON envelope

#### 3.1 payload 内容是标准化 snapshot，而不是原始 XML

每条 NDJSON 记录对应一个标准化后的 entity snapshot，字段至少包括：

- `cardId`
- `dbfId`
- `entityXmlVersion`
- `tags`
- `extraPayload`

这些字段已经接近最终 staging 表真正需要的写入模型，因此 Worker 上传阶段只需要：

- 解压
- 校验
- 写入 staging

不需要再做 XML 解析。

这里有一个明确边界：

- `snapshotHash` 不是客户端声明的真相字段
- 服务端必须基于接收到的标准化 snapshot 内容自行重算 `snapshotHash`
- 如果客户端为了调试附带 `snapshotHash`，它也只能作为对照值，不能直接落为正式真相

#### 3.2 选择 NDJSON 而不是 JSON array

选择 NDJSON 的原因如下：

- 一行一条 entity snapshot，天然贴合 staging 行模型
- 服务端可以按行处理，不需要先把整块 payload `JSON.parse` 成一个大数组
- 失败排查时更容易定位到具体行
- 本地临时文件、日志、回放都更容易观察

协议命名统一使用 `NDJSON`，请求头使用：

- `Content-Type: application/x-ndjson`

#### 3.3 选择 gzip 而不是 base64 JSON 或更重的二进制协议

选择 gzip 的原因如下：

- XML 和 JSON 都有较高重复度，gzip 压缩率稳定
- gzip 在跨端实现、调试、兼容性上都最成熟
- 不需要 `base64`，避免额外体积膨胀
- 不需要引入 MessagePack、Protobuf、CBOR 一类额外协议复杂度

协议层统一要求：

- `Content-Encoding: gzip`

### 3.4 chunk 上传走专用 HTTP 数据面

控制面与数据面分离：

- 控制面
  - `createImportJob`
  - `getImportJob`
  - `finalizeImportJob`
  - 继续使用小 JSON 请求即可

- 数据面
  - `uploadImportChunk`
  - 使用专用原始 HTTP 上传接口
  - 请求体直接承载 gzip 后的 NDJSON bytes
  - 不走 ORPC 的 JSON envelope

这样做的原因是：

- 避免 `base64` 膨胀
- 避免 RPC envelope 对大 payload 的额外复制
- 让控制面和数据面的职责更清晰

### 4. chunk 边界和切块规则

chunk 的最小原子单位不再是原始 XML `Entity` 片段，而是一个标准化后的 entity snapshot。

每个 chunk 必须满足：

- 只包含完整的 entity snapshot
- 不跨 snapshot 边界截断
- 行顺序与来源顺序一致
- 相同来源、相同解析内核、相同切块规则下，必须得到稳定一致的 chunk 边界

chunk 大小由 desktop 按固定阈值切分，阈值可由以下维度共同约束：

- 单个 chunk 的未压缩 NDJSON 字节数上限
- 单个 chunk 的 `entityCount` 上限
- 可选的压缩后体积软上限

这样做的目的不是追求极限吞吐，而是先把每个 Worker 请求的：

- 请求体大小
- 解压后内存占用
- 单次 staging 写入规模

压到稳定可控的范围内。

基于这些阈值，desktop 可以在安全范围内启用有界并发上传，而不是要求所有 chunk 串行完成。

### 4.1 切块规则和 payload 规则都必须版本化

断点续传成立的前提是：

- 同一个 job 在恢复上传时仍然使用同一套切块算法
- 同一份来源在同一 job 中不会因为客户端升级而重新切出不同边界
- 同一种 snapshot 序列化方式在同一 job 中不能漂移

因此 job 元数据中必须显式记录：

- `chunkingVersion`
- `payloadFormatVersion`
- `payloadEncoding`
- `importEngineVersion`
- `maxBytesPerChunk`
- `maxEntitiesPerChunk`

后续续传时，如果客户端切块版本、payload 格式版本或阈值摘要与 job 不一致，服务端应拒绝继续上传该 job。

### 4.2 canonical NDJSON 规则必须固定

为了让 `payloadHash` 稳定可复算，NDJSON 不能是“随手 `JSON.stringify`”。

必须固定：

- 每条记录的字段顺序
- 嵌套对象的 canonical JSON 序列化规则
- `tags` 顺序
- 行分隔符统一为 `\n`
- 最后一行是否带换行符的规则

`payloadHash` 必须以这份 canonical NDJSON 的未压缩字节串为输入计算。

### 5. 远端新增任务化 API

远端 hsdata 路由不再只暴露单一的 `importArchive(xml)`，而是拆成两类接口：

- 控制面 JSON API
  - `createImportJob`
  - `getImportJob`
  - `finalizeImportJob`
- 数据面原始上传 API
  - `uploadImportChunk`

职责如下：

#### 5.1 `createImportJob`

输入建议包含：

- `sourceTag`
- `sourceCommit`
- `sourceUri`
- `build`
- `sourceHash`
- `chunkingVersion`
- `payloadFormatVersion`
- `payloadEncoding`
- `importEngineVersion`
- `maxBytesPerChunk`
- `maxEntitiesPerChunk`
- `dryRun`
- `force`
- `totalChunkCount`
- `totalEntityCount`
- `chunks`
  - `chunkIndex`
  - `payloadHash`
  - `entityCount`

返回：

- `jobId`

该接口负责：

- 在落库前强校验 `totalChunkCount`、`totalEntityCount` 与 `chunks` 的一致性
- 创建任务主记录
- 计算并写入 `manifestHash`
- 固化服务端认可的任务清单
- 为所有预期 chunk 预创建 `job_chunks`
- 清理或拒绝同一来源上的冲突活动任务
- 必要时返回可恢复 job 的状态摘要

需要强调的是：

- `createImportJob` 发生在 desktop 完成解析、切块和 hash 计算之后
- 服务端从这一刻开始拥有本次任务的完整清单真相

#### 5.2 `uploadImportChunk`

这不是普通 JSON RPC，而是专用原始 HTTP 上传接口。

建议形态：

- 路径：`POST /hearthstone/hsdata/import-jobs/:jobId/chunks/:chunkIndex`
- 请求头：
  - `Content-Type: application/x-ndjson`
  - `Content-Encoding: gzip`
  - `X-Hsdata-Payload-Hash`
  - `X-Hsdata-Entity-Count`
- 请求体：
  - gzip 后的 canonical NDJSON bytes

返回：

- 当前 chunk 接收结果
- 当前 job 的已完成 chunk 计数
- 当前 job 状态摘要

该接口负责：

1. 校验 `jobId` 和任务状态
2. 校验 `chunkIndex` 必须存在于服务端预登记的任务清单中
3. 校验请求头中的 `payloadHash`、`entityCount` 必须与 `job_chunks` 中的预期值一致
4. 尝试把 `pending` 或 `failed` 原子抢占到 `processing`
5. 如果抢占失败且当前状态是 `processing`，直接返回冲突或忙碌，不写入 staging
6. 如果当前状态是 `completed` 且内容一致，则直接返回幂等成功
7. 如果当前状态是 `completed` 但内容不一致，则视为冲突并使 job 失败
8. 对请求体做 gzip 解压
9. 在解压过程中按行读取 NDJSON，并同步计算未压缩 payload 的 `payloadHash`
10. 校验每条记录的 schema 和 canonical 约束
11. 基于服务端认可的标准化字段重算每条记录的 `snapshotHash`
12. 校验解析得到的行数必须等于 `entityCount`
13. 把结果写入 `hsdata_import_job_snapshots`
14. 标记 `hsdata_import_job_chunks` 中该分块为完成

`job_snapshots` 需要明确以下唯一键和冲突语义：

- 至少存在 `unique(jobId, cardId)`
- 需要存在 `index(jobId, chunkIndex)` 便于按 chunk 清理和排查
- 若同一 `jobId + cardId` 再次写入且服务端重算出的 `snapshotHash` 一致，则视为幂等重复
- 若同一 `jobId + cardId` 再次写入但服务端重算出的 `snapshotHash` 不一致，则视为来源冲突并使 job 失败

这里不会修改正式表：

- `source_versions`
- `raw_entity_snapshots`
- `raw_entity_snapshot_tags`
- `hearthstone.tags`

这样可以确保上传阶段是可重复、可失败、可重试的 staging 阶段。

#### 5.3 `getImportJob`

该接口负责返回任务聚合状态，至少包括：

- job 状态
- `totalChunkCount`
- `completedChunkCount`
- `failedChunkCount`
- `processingChunkCount`
- 最终报告
- 错误信息
- staging 清理状态

前端和 desktop 都不需要逐条读取 chunk 行内容，只需要任务级进度摘要。

#### 5.4 `finalizeImportJob`

输入建议包含：

- `jobId`

返回：

- 与当前 `importArchive` 相同结构的导入报告

该接口负责：

1. 仅根据服务端 `job_chunks` 状态校验 chunk 是否完整上传
2. 汇总 job staging 数据
3. 执行缺失 set 校验
4. 使用 `sourceHash` 执行 `skip` / `force` 和来源版本判定
5. 统一更新 `source_versions`，并以 `sourceHash` 作为正式 `source_hash`
6. 从 `hsdata_import_job_snapshots.tags` 展开 tag 数据，并把 staging 数据合并进正式 raw archive 表
7. 统一处理旧 snapshot 清理和 `isLatest` 切换
8. 统一处理 discovered tag 的写入与更新
9. 记录本次导入的 `importEngineVersion`
10. 生成最终导入报告
11. 在同一事务内提交正式表结果，并把 job 标记为 `completed`、`stagingCleanupStatus` 置为 `pending`
12. 触发独立的 staging 清理步骤

这样，来源级语义仍然只发生在 finalize 阶段，不会被 chunk 上传阶段破坏。

#### 5.4.1 finalize 必须是单事务

`finalizeImportJob` 的正式表写入必须放在单个数据库事务里完成。

事务边界至少覆盖：

- `source_versions`
- `raw_entity_snapshots`
- `raw_entity_snapshot_tags`
- discovered tag 写入

事务成功后才允许清理 staging。若任一正式表步骤失败，事务整体回滚，不能留下部分可见结果。

#### 5.4.2 staging 清理是独立且可重试的收尾步骤

正式表事务提交成功后，staging 清理不再和业务完成状态绑定在一起。

清理步骤只负责删除：

- `hsdata_import_job_snapshots`
- `hsdata_import_job_chunks`

清理步骤的语义如下：

- 清理成功后，将 `stagingCleanupStatus` 置为 `succeeded`，并写入 `cleanedAt`
- 清理失败不影响 job 的业务完成态，job 仍然视为已完成
- 清理失败时记录 `stagingCleanupStatus = failed` 和 `stagingCleanupError`
- 清理步骤必须可再次触发，并且重复执行时不能破坏正式表结果

#### 5.5 为 `finalizeImportJob` 预留 Cloudflare Workflows 扩展路径

v1 可以先把 `finalizeImportJob` 实现为普通同步 Worker 请求，但设计上需要明确为 Cloudflare Workflows 预留升级路径。

Cloudflare Workflows 适合承载：

- 持久化多步骤后台任务
- 失败后按 step 自动重试
- 长链路状态保存和继续执行

这与 hsdata finalize 的潜在演进方向是匹配的，因为随着来源规模继续增长，真正的瓶颈可能会从“上传整份 XML”转移到“来源级 finalize 收口”和“正式表批量合并”本身。

当同步 `finalizeImportJob` 的单次 Worker 请求出现以下问题时，可以切换到 Workflow 方案：

- 单次 finalize CPU 时间过长
- 单次 finalize 需要拆成多个数据库批处理步骤
- 单次 finalize 失败后希望从中间步骤恢复，而不是整次任务重跑

切换后的形态建议为：

1. `finalizeImportJob` 不再直接完成所有收口逻辑，而是创建或触发一个 Workflow 实例
2. Workflow 分 step 执行：
   - 校验 chunk 完整性
   - 汇总 staging 数据
   - 分批执行缺失 set 校验、discovered tag 更新、snapshot 合并
   - 分批执行旧 snapshot 清理和 `isLatest` 切换
   - 更新 job 状态和最终报告
3. `getImportJob` 继续作为统一状态查询入口，由前端或 desktop 轮询 job 状态

这样做的好处是：

- 不需要改变 desktop 端的分块上传主路径
- 不需要让前端理解 Workflow 细节
- 可以把来源级重操作拆成多个可恢复 step
- 可以继续复用 `job_chunks` 作为 Workflow 的进度和恢复边界

### 6. finalize 才允许触碰正式表

正式表写入必须全部后置到 finalize 阶段。

原因是当前导入不是“简单 append”，而是带有来源级一致性语义：

- 相同 `sourceTag` 的覆盖
- 相同 `cardId + snapshotHash` 的复用
- 历史 snapshot 的保留或删除
- `source_versions.status` 的统一状态流转
- `isLatest` 的整批切换

如果在 `uploadImportChunk` 阶段就写正式表，这些语义会在任务失败时变得不可恢复。

### 6.1 任务状态机需要显式收口

本轮建议的 job 状态至少包含：

- `uploading`
- `ready_to_finalize`
- `finalizing`
- `completed`
- `failed`

边界如下：

- 只有 `uploading` 状态允许继续上传 chunk
- 当全部 `job_chunks` 完成后，job 进入 `ready_to_finalize`
- 调用 finalize 后进入 `finalizing`
- finalize 的正式表事务成功后进入 `completed`
- finalize 失败后进入 `failed`
- `stagingCleanupStatus` 独立表示收尾清理状态，不改变业务完成态

### 7. dryRun 和 force 在任务模型中的语义保持不变

#### 7.1 `dryRun`

`dryRun` 仍然表示：

- 允许创建 job 和 staging 数据
- 不修改正式 raw archive 表
- 不修改正式 `source_versions` 完成态
- 返回完整导入报告

也就是说，dry run 仍然可以真实经过“本地解析 + 分块上传 + 聚合校验”，只是最终不落到正式表。

#### 7.2 `force`

`force` 仍然表示：

- 遇到同一 `sourceTag` 的冲突版本时允许覆盖
- finalize 时允许重建该来源对应的最新 raw archive 结果

任务化不会改变 `force` 的用户语义，只改变其实现边界。

### 8. desktop 仍然作为前端的单一入口

前端导入页仍然不需要直接理解 chunk。

建议保留 desktop 侧单一命令边界，例如：

- `hsdata_import_source`

前端仍然只传：

- `id`
- `dryRun`
- `force`

desktop 侧命令内部完成：

1. 解析来源
2. 读取 XML
3. 本地规范化并解析为标准化 entity snapshot
4. 生成 chunk manifest
5. 为每个 chunk 生成 canonical NDJSON
6. 计算 `sourceHash`、`payloadHash` 和切块配置摘要
7. 调用 `createImportJob`
8. 查询已完成 chunk，并跳过已完成部分
9. 对剩余 chunk 执行 gzip 压缩和有界并发上传
10. 调用 `finalizeImportJob`
11. 返回最终导入报告

这意味着：

- 前端不持有大 XML
- 前端不需要知道 job/chunk 协议细节
- 未来若要加进度展示，也只需在 desktop 边界上扩展

### 9. 旧 `importArchive(xml)` 退出主路径

当前整包 `importArchive(xml)` 不再适合作为 desktop 主路径。

本轮目标是：

- desktop 导入页完全切到任务化分块链路

至于旧接口本身：

- 如果还有测试或其他调用方，可短期保留
- 但不再作为大 XML 来源的正式导入路径

### 10. 任务清理策略先做保守收口

本轮支持断点续传和并发上传，但仍要避免 staging 无上限堆积。

建议策略：

- 成功 finalize 后先提交正式表结果，再执行独立的 staging 清理步骤
- 若 staging 清理失败，保留 job/chunk 摘要和错误，并允许后续重试清理
- finalize 失败时仍按事务回滚处理，不保留正式表半成品
- 创建新 job 时，优先清理同一 `sourceTag` 的活动失败残留
- 对长时间未继续上传的 job，允许后续补充过期清理策略

## 方案效果

改造后，导入主路径会从：

- desktop 读取整份 XML
- 整份 XML 进入前端或远端整包接口
- Worker 单次处理整份来源

收敛为：

- desktop 本地读取整份 XML
- desktop 本地解析成标准化 entity snapshot
- desktop 上传 gzip NDJSON chunk
- Worker 只做解压、校验和 staging 写入
- finalize 时再统一应用来源级语义

直接收益包括：

- 不再有近 100MB 的 Worker 入站请求
- 不再要求 Worker 在上传阶段持有整份 XML 字符串
- 不再要求 Worker 在上传阶段解析 hsdata XML
- 传输体积可以通过 gzip 和 chunk 阈值控制在稳定范围内
- 失败可以按 chunk 粒度重试上传
- 前端仍然保持简单调用方式

## 风险与取舍

### 1. 本地解析前移会提高 desktop 侧复杂度

相比“上传 XML 让 Worker 解析”，新方案把解析前移到了 desktop 端。

这意味着：

- desktop 侧需要承受解析 CPU 和内存开销
- 需要维护可复用的解析内核
- 需要对 canonical NDJSON 序列化做稳定约束

但这是换来 Worker 上传阶段足够轻量、稳定和可恢复所必须承担的复杂度。

### 2. 受信任 desktop 与全量重导是显式运维边界

相比 XML 由服务端解析的方案，新方案明确采用受信任 desktop 导入边界：

- 服务端不验证 staged snapshot 与原始 XML 的可逆对应关系
- `sourceHash` 作为客户端声明的来源溯源值保留
- 解析器或标准化规则变化时，通过全量重新导入修正历史数据

因此运维上必须同步做到：

- 明确维护 `importEngineVersion`
- 能识别哪些正式数据由旧版本解析器导入
- 在解析语义变化时执行全量重新导入

### 3. finalize 仍然是来源级重操作

chunk 上传把大请求拆开了，但 finalize 仍然需要完成来源级合并。

不过 finalize 的输入已经从“整份 XML 字符串”变成“数据库中的 staging 结构化行”，CPU 和内存压力会明显小于当前直接解析整份 XML。

### 4. 新增了 staging 表、任务状态机和专用上传接口

相比当前单接口导入，新方案复杂度更高：

- 新增表
- 新增路由
- 新增任务状态
- 新增清理逻辑
- 新增控制面与数据面的边界

但这是把大对象导入稳定落在 Workers 上所必须付出的复杂度。

## 验收标准

- 导入页不再通过整包 `xml` 调用远端导入
- desktop 成为唯一的 XML 读取、解析和 chunk 驱动方
- 远端新增 `createImportJob`、`getImportJob`、`finalizeImportJob`
- `uploadImportChunk` 改为专用原始 HTTP 上传接口
- chunk 请求体使用 `gzip` 压缩的 `NDJSON`
- Worker 在上传阶段不再解析 hsdata XML
- 支持基于 chunk 状态的断点续传和有界并发上传
- `finalizeImportJob` 不再依赖客户端补报 `chunkCount`
- 最终来源版本判定和正式 `source_hash` 以客户端 `sourceHash` 为准
- `sourceHash` 的信任边界被显式定义为“受信任 desktop 声明”
- `snapshotHash` 必须由服务端基于 staging 内容重算
- 最终正式来源版本元数据需要记录 `importEngineVersion`
- `payloadHash` 以未压缩 canonical NDJSON 为准
- 正式 raw archive 表只在 finalize 阶段被修改
- `dryRun` / `force` 语义保持不变
- 导入完成后仍返回现有导入报告结构
- 导入完成后页面 `projectForm.sourceTag` 和后续投影行为保持不变
