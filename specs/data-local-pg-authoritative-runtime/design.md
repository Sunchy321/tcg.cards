# 本地 PostgreSQL 权威构建层提案

> 稳定的运行时边界、数据归属维度、remote-owned 范围和同步规则以 [../../docs/project-architecture.zh-CN.md](../../docs/project-architecture.zh-CN.md) 为准。本文只描述本地 PostgreSQL 权威构建层的需求级设计；若有冲突，以主架构文档为准。

## 背景

当前关于数据导入与 `_data` 分层的讨论，已经收敛到同一条主线：

- 数据规模可能极其巨大，不适合依赖 Cloudflare Workers 完成单次导入
- 桌面端已经成为唯一可信的重型导入入口
- 现有 `*_data` 表混合了承载导入中间态、来源缓存、知识索引和远端注册信息
- 远端公开站点仍然需要稳定读取正式领域表与少量远端 serving 数据

如果继续把全部导入、重投影和中间状态都压在远端数据库与远端运行时上，会持续遇到以下问题：

- 大导入执行时长、内存与写入节奏受限
- 失败恢复、断点续传和幂等重试难以自然表达
- 导入中间态与正式业务表耦合过深
- 远端数据库同时承担构建权威层与 serving 层，职责混杂

因此，本提案将前面分散讨论的结论整理为一个统一方向：

- 以桌面端直连的本地 PostgreSQL 作为权威构建层
- 以远端 PostgreSQL 作为正式 serving 层
- 对仍需保留远端权威职责的少量表，采用显式协同策略
- 在远端保留一组轻量同步任务表，承接发布任务与任务分片状态

## 目标

- 让桌面端本地 PostgreSQL 成为导入、构建、重投影和发布准备的权威数据库
- 让超大导入链路具备分块上传、断点续传、失败恢复和幂等重试能力
- 保持公开站点继续只读远端正式表与必要远端 serving 表
- 为本地数据共享提供正式的 dump/export 能力
- 为远端残留表建立清晰的直连、镜像和发布边界

## 非目标

- 不在本轮改造公开站点的读路径
- 不在本轮将 `knowledge_*` 迁入本地并替代远端 serving
- 不在本轮引入持续双向实时同步系统
- 不在本轮重写正式领域表模型

## 核心结论

### 1. 系统边界调整为“本地权威构建层 + 远端 serving 层”

建议的新边界如下：

```text
desktop local postgres
  -> import / normalize / diff / build / materialize
  -> publish
remote postgres
  -> serving tables
  -> serving indexes
  -> minimal registry / publish ledger / remote-only editing tables
  -> lightweight sync job tables
```

这意味着：

- 本地 PostgreSQL 承接导入过程事实、来源缓存、候选变更和发布准备
- 远端 PostgreSQL 承接正式领域表、公开查询、知识索引和少量远端维护数据
- 远端 PostgreSQL 同时承接轻量同步任务、任务分片、租约与进度状态
- 公开站点继续不直接读取本地数据库

### 2. 桌面端可以直连数据库，但应只直连 staging / 构建层

桌面端直连 PostgreSQL 是可行的，尤其在只有桌面端、没有浏览器端直导的前提下。

但直连的目标不应是正式业务表，而应是 staging / 构建层表。原因主要不是浏览器式公开安全问题，而是：

- 需要断点续传
- 需要失败恢复
- 需要幂等重试
- 需要导入级审计
- 需要发布前校验和回滚

因此，桌面端应写入：

- `job`
- `chunk`
- `snapshot`
- `raw record`
- `change set`
- 其他明确属于导入中间态的表

而不应直接写入正式领域表。

### 3. 本地权威化的对象不是全部 `_data`

`*_data` 不是单一类型，不能整体视为一类表。应分为三组。

#### 3.1 适合迁入本地权威构建层

这类表服务于导入、构建和发布准备，适合迁入本地 PostgreSQL：

- `hearthstone_data.hsdata_import_*`
- `hearthstone_data.source_versions`
- `hearthstone_data.raw_entity_snapshots`
- `hearthstone_data.raw_entity_snapshot_tags`
- `magic_data.import_*`
- `magic_data.gatherer`
- `magic_data.mtgch`
- `magic_data.scryfall`

这类表的共同特征是：

- 主要服务于导入流水线
- 可以本地重建
- 不要求公开站点直接读取

#### 3.2 应保留远端 serving 或远端权威角色

以下表不适合只保留本地：

- `magic_data.knowledge_*`
- `hearthstone_data.knowledge_*`

原因是：

- 这类表承担远端在线检索与向量索引职责
- 依赖 PostgreSQL 侧索引和在线查询
- 更接近远端 serving copy，而不是导入中间态

#### 3.3 边界型表

以下表需要按职责拆分处理：

- `hearthstone_data.card_image_assets`
- `hearthstone_data.card_image_exports`
- `hearthstone_data.card_image_imports`

当前更稳妥的判断是：

- `card_image_assets` 更接近远端资产注册表，宜保留远端权威或远端副本
- `card_image_exports` / `card_image_imports` 更接近批次日志，后续可评估本地化

### 4. 公开站点继续依赖远端正式表

当前非 console 的前端页面并不直接查询 `_data` 表，而是通过远端 ORPC 读取正式领域表、视图或面向 serving 的查询结构。

这意味着本轮改造可以维持：

- 公开站点页面不改
- 公开站点接口不改
- 仅通过“本地构建 -> 远端发布”兼容现有读路径

## 当前冻结边界

本提案当前先冻结以下边界，作为后续实现的统一前提。

### 1. 本地权威构建层

以下对象优先归入本地权威构建层：

- `hearthstone_data.hsdata_import_*`
- `hearthstone_data.source_versions`
- `hearthstone_data.raw_entity_snapshots`
- `hearthstone_data.raw_entity_snapshot_tags`
- `magic_data.import_*`
- `magic_data.gatherer`
- `magic_data.mtgch`
- `magic_data.scryfall`
- 本地构建阶段生成的候选结果、临时结果表和发布批次快照

这层负责：

- 导入任务状态
- 原始快照与中间态
- 本地候选结果生成
- 审核前准备
- 发布批次生成

### 2. 远端 serving 层

以下对象继续归入远端 serving 层：

- 各游戏正式领域表
- 面向公开站点的正式视图和 serving query 结构
- `magic_data.knowledge_*`
- `hearthstone_data.knowledge_*`

这层负责：

- 公开查询
- 远端检索
- 线上正式结果承载

### 3. 远端控制面与残留 authority

以下对象继续保留在远端，但不回退为完整构建中间态中心：

- 远端轻量同步任务表
- 任务分片、lease、heartbeat、retry、checkpoint
- 远端资产注册表
- 远端简单编辑表
- 远端发布日志和最小对账基线

这层负责：

- 发布控制面
- 远端权威小表
- 必要远端协同状态

### 4. 按游戏冻结的发布一致性前提

当前先冻结两类不同前提：

- `hearthstone`
  - 远端正式结果表优先视为 `publish-owned`
  - 主发布 diff 基线为“本次 manifest vs 上次成功发布 manifest”
- 其他允许远端修改的游戏
  - 不得只依赖上次发布基线
  - 发布前必须补 live drift check 或等价冲突控制

### 5. 发布目标连接边界

当前先冻结以下约束：

- 本地构建数据库固定为用户自行提供的本地 PostgreSQL（本机安装或 Docker 部署均可）
- 设置界面可动态配置远端发布目标连接
- 该连接只用于发布、发布前校验和必要远端协调
- 发布批次必须绑定 `publishTargetId`、`environment` 和 fingerprint
- 不允许把远端发布目标连接回用为本地构建数据库

## 本地 PostgreSQL 的职责

本地 PostgreSQL 承接以下职责：

- 导入任务状态
- 分块上传状态
- 原始快照与规范化中间态
- 来源缓存
- 字段级 diff 与候选变更
- 发布前校验与构建中间事实

推荐沿用现有 schema 组织：

- `magic`
- `magic_data`
- `magic_app`
- `hearthstone`
- `hearthstone_data`
- `hearthstone_app`

其中：

- 已明确本地化的 `_data` 继续保留在本地同名 schema
- 远端 `knowledge_*` 不要求本地完整复制
- 若未来需要本地只读镜像远端 serving 数据，可单独引入 `*_mirror` 或 `workspace_*`

## 远端 PostgreSQL 的职责

远端 PostgreSQL 继续承接：

- 正式领域表
- 公开站点查询依赖的正式视图
- `knowledge_*`
- 远端资产注册表
- 少量远端简单编辑表
- 轻量同步任务表
- 任务分片与 lease 状态表
- 发布进度、重试与最小 checkpoint 状态
- 最小发布日志、发布状态和对账基线

远端不再承担完整构建状态中心职责。

## 本地 PostgreSQL 的运行边界

当前实现不再要求桌面 app 托管 PostgreSQL 进程。

本提案冻结为以下边界：

- 本地 PostgreSQL 由用户自行提供
- 形态可以是本机安装、容器运行或其他本地长期可达实例
- 桌面 app 只负责保存连接信息、测试连接、执行构建链路和发布链路
- 桌面 app 不负责 `initdb`、启动、停止、备份 data dir 或进程恢复

这样做的直接含义是：

- 数据库生命周期 owner 不是 app runtime，而是用户本地环境
- app 关闭与数据库是否继续运行没有强绑定
- “窗口关闭”“任务结束”“app 退出”都不等于数据库必须停机

### app 侧需要承担的状态

虽然 app 不托管 PostgreSQL 进程，但仍需要维护自己的连接状态语义。

建议最少区分：

- `missing_connection`
  - 尚未配置连接字符串
- `connection_ready`
  - 连接测试成功，可作为本地构建库使用
- `connection_failed`
  - 连接字符串存在，但连通性、认证或能力检查失败
- `capability_mismatch`
  - 数据库可连接，但 schema、扩展、权限或版本前提不满足

### 与窗口和任务生命周期的关系

在当前边界下，窗口和任务都不拥有数据库生命周期，只影响 app 是否尝试发起连接与执行任务。

建议固定：

- 页面进入数据库设置页时，可以主动读取已保存连接串并执行显式测试
- 导入、构建、审核和发布任务开始前，应再次执行最小健康检查
- 若健康检查失败，应阻止任务继续，而不是尝试由 app 拉起数据库

### 生命周期 owner

本地 PostgreSQL 的 lifecycle owner 应固定为用户本地环境，而不是：

- 单个前端页面
- 单个窗口
- 某个导入任务
- 桌面 app runtime

## 本地 PostgreSQL 接入流程

在当前方向下，app 侧不再设计数据库进程托管底座，而是设计“连接、校验、使用、导出”的接入流程。

### 1. 连接配置流程

建议固定以下步骤：

1. 用户在设置界面录入本地 PostgreSQL 连接字符串
2. app 将连接字符串保存到系统 keyring
3. 保存前或保存后立即执行一次读取校验
4. 用户可显式执行“测试连接”

### 2. 连接测试流程

连接测试的目标是确认：

- 目标数据库可达
- 凭证可用
- 当前数据库身份符合预期

第一版最少应包含：

1. 建立连接
2. 执行 `current_database()` 与 `current_user` 查询
3. 返回连接延迟和目标身份

后续如需扩展，可继续加入：

- schema 存在性检查
- 扩展存在性检查
- 版本前提检查
- 最小权限检查

### 3. schema 与 migration 流程

当数据库可连接后，app 仍然需要对自己的 schema 负责。

建议顺序为：

1. 连接本地 PostgreSQL
2. 读取本地 schema 版本
3. 执行待应用 migration
4. 记录 migration 结果
5. 只有全部成功后，才向上层暴露“数据库可用于构建”

### 4. 导出与恢复流程

由于 app 不持有 PostgreSQL data dir，备份与恢复也应改为逻辑层能力，而不是 data dir 级托管能力。

建议正式支持：

- 工作区逻辑导出
  - 面向完整共享与跨机器继续工作
  - 以 `pg_dump` 或等价逻辑导出为主
- 结果级逻辑导出
  - 面向分享指定结果、批次或审核后数据
  - 以 `JSON / NDJSON / CSV` 为主
- 逻辑恢复入口
  - 从 dump 或结果导出恢复到目标本地 PostgreSQL

## 桌面端直连与权限模型

虽然桌面端不是浏览器，但仍然存在以下风险：

- 数据库凭证泄漏
- 客户端被逆向分析
- 操作员机器失陷后滥用写权限
- 旧版本客户端按过时语义写库
- 客户端 bug 大规模写坏数据

因此需要最小权限模型：

- 桌面端只写 staging / 构建层表
- 不直接授予正式领域表写权限
- 优先使用独立数据库角色
- 凭证应可轮换、可撤销，不应长期硬编码

对于 Sealos 这类托管环境，不应默认假设一定有完整权限管理界面。落地前必须确认：

- 是否支持创建独立数据库角色
- 默认连接账号是否具备授权能力
- 是否可以轮换桌面端使用的受限凭证

### 设置界面动态配置远端发布目标连接的可行性

本提案采用以下约束：

- 本地构建数据库仍然是用户自行提供的本地 PostgreSQL
- “发布到远端生产库”时使用的连接字符串，可以在设置界面里动态配置

这套方式是可行的，而且比“让构建数据库直接切换到远端”更合理。

这类配置的本质不是“数据库运行模式切换”，而是：

- 发布目标配置
- 环境目标配置
- 运维侧连接参数配置

这种方式的好处是：

- 不破坏“本地权威构建层 + 远端 serving 层”的主边界
- 可以在不同环境之间切换发布目标
- 不需要把生产连接硬编码在应用包内
- 更适合桌面端作为受控内部工具的使用方式

推荐的理解方式是：

- 本地 PostgreSQL 负责导入、投影、审核前准备和发布批次生成
- 设置界面配置的是“远端发布目标”
- 发布链路在执行时，再读取该目标连接去写远端正式表和远端轻量同步任务表

### 远端发布目标连接的建议约束

虽然这条路可行，但不建议只提供一个完全自由的裸连接串输入框。

更稳妥的做法是把它设计成“发布目标 profile”，至少包含：

- `label`
- `publishTargetId`
- `connectionString`
- `environment`
- `sslMode`
- 可选的只读说明或 operator note

并附带以下约束：

- 明确这是“发布目标连接”，不是“本地构建数据库连接”
- 保存前执行连接测试
- 保存前校验目标 schema、扩展、权限和最小版本前提
- 默认只接受受限发布角色，不接受无约束超级权限账号
- 凭证存储在系统 keyring 或等价安全存储中，而不是明文写入普通配置文件

### 建议的使用边界

若支持设置界面动态配置远端发布目标连接，建议边界如下：

- 默认仍使用用户自行提供的本地 PostgreSQL 作为构建数据库
- 远端连接只在发布、发布前校验、远端轻量任务协调和必要远端读取时使用
- 不让同一个配置同时承担“本地构建库”和“远端生产发布库”两种角色
- 不让自由切换目标连接破坏发布审计和环境识别

此外，发布批次必须绑定目标身份，而不是只在执行发布时临时读取当前设置。

建议发布批次至少固化：

- `publishTargetId`
- `environment`
- 连接测试后的 schema / capability fingerprint

执行发布前，应再次校验：

- 当前设置中的发布目标是否仍然等于批次创建时的目标
- 当前目标 fingerprint 是否仍然满足批次创建时的前提

若任一项不一致，应阻断发布，而不是静默改发到新的目标。

换句话说，动态配置远端生产库连接是可行的，但它应被建模为“publish target configuration”，而不是“runtime database mode switch”。

## 导入与发布链路

推荐的数据流如下：

```text
桌面端读取源数据
  -> 本地解析与规范化
  -> 本地分块与计算 hash
  -> 写入本地 PostgreSQL 构建层
  -> 本地校验与候选变更生成
  -> 创建发布批次
  -> 远端执行受控写入
  -> 记录发布结果
```

如果某些阶段仍需远端 staging，也应保持同样原则：

- 桌面端只写 staging
- finalize / apply / refresh 与正式写入分离
- 不依赖单次长事务完成整次导入

### 发布术语应固定拆分

为避免本地构建和远端发布后动作混用同一套状态词，本提案建议固定以下术语：

- `import`
  - 写入原始层与中间态
- `build`
  - 从 raw/import 层生成本地候选结果
- `materialize`
  - 将本次候选结果落到本地结果表、临时发布表或发布批次快照
- `review`
  - 审核候选结果
- `approve`
  - 批准候选结果进入发布批次
- `finalize`
  - 冻结批次、校验输入、创建远端任务
- `apply`
  - 将批次内容写入远端正式表
- `refresh`
  - 刷新远端派生结构、索引、serving copy 或其他发布后副产物

因此，本提案不再推荐继续让 `projection` 同时表示：

- 本地从 raw/import 到结果表的构建动作
- 远端 `apply` 之后的派生刷新动作

若历史实现仍保留 `projection` 字段或函数名，可视为兼容遗留命名；但新设计语义应以上述术语为准。

### 后半段应采用异步分片模型

从 staging / 构建层写入远端正式表，也可能非常耗时，因此不应设计成一个长时间阻塞的同步请求。

推荐拆成：

- `finalize`：校验构建输入完整性，冻结发布版本，创建后续任务
- `apply`：按分片把规范化数据写入正式表
- `refresh`：按分片或依赖顺序刷新派生结果

执行模型建议为：

- 远程服务负责 job、partition、lease、heartbeat 和重试状态
- 上述状态应持久化在远端轻量同步任务表中，而不是只存在内存任务队列
- 桌面端负责触发、认领、执行和上报每个分片
- 每个分片独立事务、独立提交、独立重试

这意味着正式导入到远端也可以继续整合进桌面端，但形式应是“桌面端驱动远程服务的异步任务”，而不是一个超长同步 RPC。

这组远端轻量表的职责应刻意收敛，只负责：

- 发布任务元数据
- 分片队列与认领状态
- lease / heartbeat
- 重试计数与失败原因
- 最小结果确认与 checkpoint

它们不应重新膨胀为完整构建中间态中心。

### `hsdata` 发布应基于 manifest，而不是直接全表 diff

对 `hsdata` 这类“本地导入 -> 本地投影 -> 远端 serving”的链路，不建议发布时直接与远端正式结果表做逐行 diff。

更合适的方式是：

- 本地保留导入后的原始层：
  - `hearthstone_data.source_versions`
  - `hearthstone_data.raw_entity_snapshots`
  - `hearthstone_data.raw_entity_snapshot_tags`
- 本地在发布前生成投影结果：
  - `hearthstone.entities`
  - `hearthstone.entity_localizations`
  - `hearthstone.entity_relations`
- 基于投影结果再生成一份轻量 manifest
- 用“本次 manifest”和“上次成功发布 manifest”做 diff
- 只把新增、变更、删除的卡牌结果写到远端

这意味着发布比较的基线不应是“远端 live 结果表当前长什么样”，而应是“上次成功发布时，本地认为自己发布了什么”。

这个前提只适用于 `hsdata` 这类可以把远端正式结果表视为 `publish-owned` 的链路。也就是说：

- 远端正式结果表不接受带外人工修改
- 或者至少不将带外修改视为常规工作流的一部分

只有在这个前提成立时，“本次 manifest vs 上次成功发布 manifest”才能作为主要 diff 基线。

这样可以避免：

- 将远端正式表全量拉回本地做逐行比对
- 对 `entity_localizations` 和 `entity_relations` 做高成本集合 diff
- 让远端正式表重新承担构建事实基线职责

### 允许远端修改的游戏应采用不同发布一致性策略

不是所有游戏都能复用 `hsdata` 的发布前提。

对于存在远端人工修改、远端简单编辑表或其他带外写入动作的游戏，不能把“上次成功发布 manifest”当成唯一 truth。对这类游戏，发布链路必须额外处理以下问题：

- 远端 live 状态检查
- 发布前 drift check
- 冲突检测与阻断
- 必要时的审核或合并逻辑

因此，本提案在发布一致性上采用按游戏分策略的做法：

- `hearthstone`
  - 优先采用 `publish-owned` 的正式结果表
  - 以“本次 manifest vs 上次成功发布 manifest”作为主 diff 基线
- 其他允许远端修改的游戏
  - 不得只依赖上次发布基线
  - 必须在发布前引入远端 live drift check 或等价冲突控制

这条分策略规则优先于任何统一化的发布实现。

### `hsdata` manifest 推荐结构

`hsdata` 的 manifest 推荐按 `cardId` 聚合，一张卡一行。

推荐至少包含：

- `batchId`
- `sourceTag`
- `build`
- `cardId`
- `dbfId`
- `entityRevisionHash`
- `localizationsHash`
- `relationsHash`
- `cardManifestHash`
- `localizationCount`
- `relationCount`

其中：

- `entityRevisionHash`
  - 直接复用 `hearthstone.entities.revisionHash`
- `localizationsHash`
  - 将同一张卡全部 `entity_localizations` 的 `(lang, revisionHash, localizationHash, renderHash)` 按稳定顺序聚合后再做 hash
- `relationsHash`
  - 将同一张卡全部 `entity_relations` 的 `(relation, targetId, sourceRevisionHash)` 按稳定顺序聚合后再做 hash
- `cardManifestHash`
  - 再对上面三类 hash 做一次总聚合，作为整张卡的最终发布判定

这套结构的目标不是替代正式结果表，而是提供一个轻量、稳定、可恢复的发布基线。

### `hsdata` 发布粒度建议

对 `hsdata`，推荐采用：

- diff 粒度按 `cardId`
- 上传粒度也按 `cardId`

也就是说，一旦某张卡的 `cardManifestHash` 变化，就整张卡重新发布其：

- `entity`
- 全部 `localizations`
- 全部 `relations`

不建议第一版把发布粒度细化到：

- 单条 localization patch
- 单条 relation patch
- 单字段级别 patch

按整卡粒度重发会明显降低发布协议复杂度，更适合当前架构阶段。

### manifest diff 的收益

采用 manifest 后，发布链路会变成：

1. 本地投影出当前目标结果
2. 生成本次发布 manifest
3. 与上次成功发布 manifest 比较
4. 识别 `added / changed / removed` 的 `cardId`
5. 仅对这些卡执行远端写入或删除
6. 发布成功后，将本次 manifest 记录为新的发布基线

这样本地即使不长期保留所有历史结果表，也仍然可以：

- 在发布前短期物化本次结果
- 进行低成本 diff
- 支持断点续发
- 支持发布后清理临时结果

因此，本提案中的“不长期保留本地全量结果表”应理解为：

- 不要求永久保存所有历史投影结果
- 但允许在发布批次内短期物化结果和 manifest
- 发布完成后只保留必要基线、批次记录和恢复元数据

### `magic` 的发布前提与 `hsdata` 不同

`magic` 需要额外考虑一个与 `hsdata` 不同的约束：

- 本地投影结果并不会默认直接接受
- 投影结果需要先经过审核
- 只有审核通过的结果，才允许进入远端正式表发布链路

这意味着本提案中的“本地构建 -> 远端发布”对 `magic` 不能简单理解为：

- 导入完成
- 投影完成
- 直接发布

对 `magic`，更准确的语义应是：

- 本地导入与规则评估
- `build`
- `materialize`
- 生成待审核候选结果
- `review`
- `approve`
- 审核通过后再进入发布批次
- `finalize`
- `apply`
- `refresh`
- 最终写入远端正式表

因此，`magic` 的本地结果层应优先被视为：

- 候选事实层
- 审核输入层
- 发布前准备层

而不是默认等同于“可立即发布的正式结果层”。

本提案在当前阶段只记录这一约束，不急于展开审核模型、审核表结构或审核后发布协议的详细设计。

## dump / export 能力

本地 PostgreSQL 方案非常适合提供正式的数据共享能力。

建议同时提供两类导出。

### 1. 工作区快照导出

用途：

- 完整交接本地构建环境
- 排障、审计、复盘
- 在另一台机器继续构建

建议实现：

- 基于 `pg_dump` 的完整数据库快照
- 或按 schema / 表级别导出的构建层快照

建议最少支持：

- 全量本地构建库导出
- 仅 `hearthstone_data`
- 仅 `magic_data`
- 指定导入批次相关表导出

### 2. 面向消费方的逻辑导出

用途：

- 只分享最终构建结果
- 不要求对方恢复完整 PostgreSQL 工作区
- 供外部脚本、分析工具或下游系统使用

建议实现：

- `JSON`
- `NDJSON`
- `CSV`

这类导出不替代 `pg_dump`，而是提供更轻量的分享形式。

### 3. 导出应配套恢复能力

若系统支持正式导出，也应同步支持：

- 从 dump 恢复本地构建库
- 从逻辑导出恢复指定批次输入或结果

这样“dump 给别人使用”才是完整能力，而不是一次性文件输出。

## 远端残留表的协同策略

本地权威化后，远端仍可能保留少量表。它们不应统一处理，而应分为三类。

### 1. 远端直连型

适用于：

- 体量小
- 读取频率低
- 只在发布前后少量访问

例如：

- 少量远端维护配置
- 少量发布状态确认信息

这类表可由桌面端直接访问远端，不必强制镜像到本地。

### 2. 本地镜像拉取型

适用于：

- 本地构建需要反复读取
- 远端仍是权威来源
- 但不值得每次构建都频繁直连远端查询

例如：

- 远端简单编辑表
- 远端资产状态注册表的只读副本

建议策略：

- 会话开始时拉取
- 构建前按需手动拉取
- 发布前强制刷新

### 3. 远端发布写入型

适用于：

- 正式领域表
- 远端 serving copy
- 远端轻量同步任务表

这类表不应在本地长期镜像为权威副本，而应由发布链路统一写入。

## 特殊表处理建议

### 1. R2 状态表

若远端存在类似 `card_image_assets` 的表，建议：

- 远端继续作为 authority
- 本地按需拉取为镜像或缓存
- 发布图片资产时回写远端状态表

第一版不建议把这类表整体改造成纯本地权威。

### 2. 远端简单编辑表

若远端存在少量人工维护的简单表，建议：

- 远端仍然是权威来源
- 本地构建前拉取最新状态
- 发布前再次校验远端版本或 checksum
- 若发现未合并远端修改，则阻断覆盖

## 同步策略建议

第一版不建议引入持续双向同步。

推荐采用显式流程：

1. 打开桌面端或开始构建前，执行远端依赖表拉取
2. 本地完成导入、构建、重投影
3. 发布前再次校验远端关键表版本
4. 发布正式结果
5. 如有必要，回写远端注册表或发布日志

这种模型更简单，也更容易排障。

## 风险与取舍

### 1. 本地 PostgreSQL 的部署与环境一致性成本提升

收益是最大程度复用现有 PostgreSQL 模型与查询能力，代价是需要约束本地环境、连接配置和 schema 前提。

### 2. 远端失去完整构建中间态可见性

迁移后，远端不再天然拥有全量原始快照、全量导入任务状态和全量候选变更日志。这是本地权威化的直接取舍。

### 3. 远端残留表越多，混合模型越复杂

因此第一版应尽量只保留必要远端表，不扩大混合边界。

### 4. 同步问题主要来自仍可人工修改的远端表

对这类表，发布前拉取与版本校验是必需能力。

## 最终提案

本轮建议正式采用以下方向：

- 以本地 PostgreSQL 作为桌面端权威构建层
- 将导入流水线型 `_data` 和来源缓存迁入本地
- 保留远端正式领域表作为公开 serving 层
- 保留远端 `knowledge_*` 作为 serving / 检索层
- 保留远端轻量同步任务表，用于发布任务、分片、租约和进度追踪
- 对 R2 状态表和远端简单编辑表采用“远端权威 + 本地按需拉取 + 发布前校验”的混合策略
- 将 dump/export 作为正式产品能力纳入设计
