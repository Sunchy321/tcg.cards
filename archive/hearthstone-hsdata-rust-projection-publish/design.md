# hsdata Rust 投影与远端发布设计

> 稳定的运行时边界、数据归属和同步规则以 [../../docs/project-architecture.zh-CN.md](../../docs/project-architecture.zh-CN.md) 和 [../../specs/data-local-pg-authoritative-runtime/design.md](../../specs/data-local-pg-authoritative-runtime/design.md) 为准。本文只描述 hsdata 纯 Rust 投影与远端发布链路的需求级设计；若有冲突，以主架构文档为准。

## 背景

当前 hsdata 原始导入已经基本收口到 desktop Rust 与本地 PostgreSQL，但领域投影仍然依赖 TypeScript 实现：

- tag 归一化与投影规则在 `packages/console-api/src/lib/hearthstone/hsdata-project.ts`
- desktop 页面仍通过 ORPC 调用 TS 投影入口
- `source_versions.projection_*` 的状态流转仍由 TS 路径负责
- 投影结果只写本地领域表，没有正式的“本地结果 -> 远端正式表”发布链路

这带来两个结构性问题：

1. `hsdata` 的重型构建链路仍被拆在 Rust 和 TS 两个运行时里
2. 本地投影结果虽然已经成为构建真相的一部分，但还没有稳定、可审计的远端更新方案

当前项目架构已经冻结为：

- desktop 是领域数据重型工作流的唯一预期执行面
- 本地 PostgreSQL 是构建权威层
- remote 是 serving 层与最小发布控制面
- `hearthstone` 的正式结果表可以优先视为 `publish-owned`

因此，下一步需要同时回答两件事：

- 如何把 hsdata 投影彻底迁为纯 Rust 实现
- 如何把本地投影结果以受控方式更新到远端正式表

## 目标

- 让 hsdata 投影在 desktop Rust 内闭环执行，不再依赖 TS/Node 运行时
- 保持当前 tag 驱动的投影语义，不把规则重新写死到 Rust 代码中
- 让本地 `source_versions`、`entities`、`entity_localizations`、`entity_relations` 成为投影权威结果
- 为 `hearthstone` 建立一条“本地投影结果 -> 远端正式表”的发布链路
- 让远端发布遵循 manifest/batch 模型，而不是临时按 live 表做全表比较

## 非目标

- 本轮不改造 hsdata tag 编辑页的信息架构
- 本轮不把公开站点改为直接读取本地数据库
- 本轮不为所有游戏统一设计发布协议
- 本轮不引入 Bun/Node sidecar 复用现有 TS 投影代码
- 本轮不重做 `cards`、`sets` 等非 hsdata 投影表的生成逻辑

## 现状问题

### 1. 投影语义仍然跨运行时分裂

当前 raw import 已经在 Rust，本地库状态页也已经在 Rust，但真正把 raw snapshot 转成领域行的逻辑仍在 TS。

这意味着：

- 行为基线在 TS
- 执行入口在 desktop 页面
- 数据权威层在本地 PostgreSQL

这三者没有统一到同一个运行时边界内。

### 2. 当前投影实现和 Node/Drizzle 细节深度耦合

`hsdata-project.ts` 当前同时承担：

- 数据加载
- tag 归一化
- 实体与本地化草稿构建
- hash 计算
- 行版本合并
- 事务写库
- 状态回写

如果继续保留这条 TS 路径，desktop 就始终无法摆脱对外部 JS 执行面的依赖。

### 3. 本地投影结果还没有正式发布基线

当前本地结果表虽然可读，但还缺少：

- 当前结果快照的 manifest
- 面向远端某个发布目标的批次定义
- 上次成功发布基线
- 失败恢复和重试时的对账信息

没有这些对象，远端更新只能退化成临时脚本式整库覆盖或直接 live diff。

### 4. `projection` 一词同时承担“本地构建”和“远端更新”语义

当前 `projection` 既指：

- 从 raw/import 层生成本地领域结果

又很容易被继续拿来指：

- 把结果发到远端后刷新 serving 表

这会污染状态字段、任务命名和页面文案。

## 设计结论

### 1. hsdata 投影执行面彻底收口到 desktop Rust

新增 Rust 模块：

- `desktop_hsdata_projection.rs`
  - 本地投影入口
  - tag 归一化与 project 逻辑
  - hash 计算与版本合并
  - 本地领域表写入
- `desktop_hsdata_publish.rs`
  - 发布目标加载
  - 本地 manifest 物化
  - 发布批次与远端写入

desktop 前端不再调用远端 `projectSourceVersion`。投影按钮只调用本地 Tauri command。

### 2. 纯 Rust 投影仍然保持“tag 配置驱动”

Rust 版本不改成硬编码映射表，而是继续读取本地 `hearthstone.tags` 表中的以下字段：

- `value_kind`
- `normalize_kind`
- `normalize_config`
- `project_target_type`
- `project_target_path`
- `project_kind`
- `project_config`

实现方式为：

- 在 Rust 内定义与当前字符串配置一一对应的 enum / parser
- 未识别的配置值直接报错并阻断投影
- 保留 `unprojectedTagCount` 统计，用于识别未配置或未成功投影的 tag

这样可以延续“规则在表里、执行在 runtime 内”的模型，而不是把 tag 语义复制成第二份静态代码配置。

### 3. Rust 投影管线按现有 TS 语义等价迁移

Rust 投影分为以下阶段：

1. 校验 `source_versions`
   - `status = completed`
   - `build` 存在
2. 将 `projection_status` 置为 `processing`
3. 读取 `raw_entity_snapshots`、`raw_entity_snapshot_tags`、`tags`
4. 构建上下文
   - `slug_by_enum_id`
   - `card_id_by_dbf_id`
   - `set_id_by_dbf_id`
5. 对每个 snapshot 执行投影
   - 归一化 tag 值
   - 写入 entity draft / localization draft / relation draft
   - 统计 `unprojectedTagCount`
6. 计算结果 hash
   - `revisionHash`
   - `localizationHash`
   - `renderHash`
   - 后续发布用 `cardManifestHash`
7. 与本地现有领域行做版本合并
8. 在事务中重写本地结果表
9. 将 `projection_status` 置为 `completed` 或 `failed`

行为上必须保留以下现有语义：

- locale 归一化规则
- `set` 的 placeholder 解析与失败阻断
- `minion` / `weapon` 的字段补全规则
- strong relation 与 weak relation 的拆分
- `legacyPayload` / `mechanics` / `referencedTags` 的保留方式
- `force` 与 `dryRun` 行为
- `version[]` 与 `is_latest` 的合并规则

### 4. 现有 TS 投影实现冻结为行为基线

迁移完成前：

- `hsdata-project.ts` 不再承接新需求
- 它只作为 Rust 迁移的语义基线和对照对象

建议保留一组 fixture/golden case，用于对比：

- 投影前 raw 输入
- TS 输出
- Rust 输出

首轮验收以“同一输入下，Rust 与 TS 产出等价”为准，而不是以“页面看起来差不多”为准。

### 5. 术语拆分采用“投影兼容 + 发布新术语”过渡

考虑到现有表和页面已经存在 `projection_status` 字段，本轮不立即重命名数据库字段。

过渡规则如下：

- `source_versions.projection_*`
  - 继续表示“raw/import -> 本地领域结果”的状态
- 新的远端更新链路
  - 使用 `publish`、`batch`、`manifest`、`apply` 术语

这样可以避免本轮同时做大规模字段改名，但从新模块开始不再把“发布到远端”也叫做 projection。

## Rust 投影模块设计

### 1. 数据访问层

Rust 投影层应直接复用本地 PostgreSQL 连接与 SeaORM entity，不再经由 TS ORM。

读取对象：

- `hearthstone_data.source_versions`
- `hearthstone_data.raw_entity_snapshots`
- `hearthstone_data.raw_entity_snapshot_tags`
- `hearthstone.tags`
- `hearthstone.sets`
- 现有本地 `hearthstone.entities`
- 现有本地 `hearthstone.entity_localizations`
- 现有本地 `hearthstone.entity_relations`

### 2. 配置解释层

为避免把 JSON 字段随意散落在主流程内，Rust 侧新增显式配置解释层：

- `normalize_kind` -> `NormalizeRule`
- `project_kind` -> `ProjectRule`
- `normalize_config` / `project_config` -> typed config

原则：

- 只接受当前设计已知的规则
- 配置结构错误视为硬错误
- 不做 silent fallback

### 3. 结果构建层

Rust 内部按三类结果构建：

- `ProjectedEntityRow`
- `ProjectedLocalizationRow`
- `ProjectedRelationRow`

每类结果都先构建内存草稿，再统一进入 hash 与 reconcile 阶段，避免边读边写数据库导致流程难以推导。

### 4. 渲染模型校验

当前 TS 通过 Zod 校验 `renderModel`。Rust 版需要提供等价校验，而不是跳过。

建议做法：

- 在 Rust 内定义与当前 render model 对齐的结构和枚举约束
- 先保证数据形状、枚举值和必填字段等价
- 与 fixture 对照输出 `renderHash`

如果后续需要复用同一份 schema，可再单独讨论跨语言 schema 生成；本轮先保证语义等价。

## 远端发布方案

### 1. 发布前提

本方案只覆盖 `hearthstone/hsdata`：

- 远端 `hearthstone.entities`
- 远端 `hearthstone.entity_localizations`
- 远端 `hearthstone.entity_relations`

这三张表视为 `publish-owned`。

也就是说：

- 它们的正式结果由 desktop 本地构建后发布
- 不允许 remote 侧继续人工带外修改
- 若发现带外修改，应视为 drift/违规，而不是纳入正常合并策略

### 2. 发布目标模型

远端连接继续采用 publish target profile，而不是把远端库当成本地构建库切换过去。

每个 publish target 至少包含：

- `publishTargetId`
- `label`
- `environment`
- `connectionString`
- `sslMode`
- capability fingerprint

profile 存在 desktop 安全配置中，批次创建时必须绑定目标身份。

### 3. 本地发布批次模型

建议新增本地 `hearthstone_data` 表：

- `publish_batches`
  - 一次面向某个 publish target 的发布批次
- `publish_batch_cards`
  - 批次内每张卡的 manifest、动作和执行结果
- `publish_baselines`
  - 每个 publish target 上次成功发布的总体基线

这些表都归类为 `hearthstone_data`，因为它们属于导入/构建/发布侧系统事实，不承载用户语义。

批次至少固化：

- `publishTargetId`
- `environment`
- source build / sourceTag 范围
- target fingerprint
- 当前 manifest hash
- 上次成功发布 manifest hash
- 状态、错误、开始/完成时间

### 4. 发布粒度

发布粒度采用“整卡重发”，不是逐字段、逐 localization 或逐 relation 微调。
当前这套 publish 模型只覆盖有限表集合，不是任意表发布框架。

原因：

- 当前本地结果本身已经以 card family 为主要聚合单元
- `version[]` 变化会同时影响 entity、localization、relation 的行集
- 按整卡重发更容易保证远端结果与本地 manifest 一致

因此，一旦某张卡的 `cardManifestHash` 变化，就整张卡重发其：

- 全部 `entities` 行
- 全部 `entity_localizations` 行
- 全部以该卡为 `source_id` 的 `entity_relations` 行

### 5. manifest 生成

本地发布时，为每张卡生成稳定 manifest：

- entity row family hash
- localization row family hash
- relation row family hash
- `cardManifestHash`

总体发布 manifest 由全部卡 manifest 聚合而成。

比较方式不是“拿远端 live 表全量算 diff”，而是：

1. 生成本次本地 manifest
2. 读取该 publish target 上次成功发布基线
3. 比较两次 manifest
4. 得出 `insert / update / delete / unchanged`

### 6. 远端 apply 策略

对发生变化的卡：

1. 读取本地该卡当前完整 row family
2. 在远端事务中删除该卡旧的：
   - `entities`
   - `entity_localizations`
   - `entity_relations`
3. 插入本地当前 row family

对删除卡：

1. 按上次成功发布基线中存在、而本次 manifest 不再存在的 `cardId`
2. 删除远端对应 row family

第一版不做“远端单行 on conflict 合并”，而采用“按卡删后重写”的方式，简化一致性语义。

### 7. 远端发布日志

为支持恢复与对账，建议在 remote 保留最小 ledger 表，记录：

- 最后成功的 publish batch
- 目标身份
- manifest hash
- 时间戳

remote ledger 只承担：

- 发布历史
- 基线恢复
- 环境级对账

它不是新的构建权威层。

## 状态与页面影响

### 1. desktop 导入页

导入页改为三段式心智模型：

- 导入 raw
- 构建本地投影结果
- 发布到远端

页面应新增：

- 发布目标选择
- 发布批次列表
- 上次成功发布时间
- 当前批次 diff 统计

### 2. `source_versions` 状态

保留：

- `projection_status`
- `projected_at`
- `projection_error`

新增发布状态不写回 `source_versions`，而写入独立 publish batch 表，避免把“本地构建状态”和“远端发布状态”压成同一个字段。

### 3. site-console

site-console 不承担 hsdata 构建或发布权威入口。

若后续需要远端查看发布结果，只应展示：

- 最小发布 ledger
- 当前远端 serving 状态

而不是重新接管投影执行权。

## 风险与取舍

### 1. Rust 与 TS 行为漂移风险

这是本轮最大技术风险。

必须用 fixture 对照、hash 对照和结果表对照来压制，而不是靠人工 spot check。

### 2. 远端正式表会进入更强的 publish-owned 约束

一旦采用 manifest + batch 发布，就意味着这几张远端正式表不再适合作为手工编辑入口。

如果未来还有 remote 写需求，必须显式拆到别的表或别的流程。

### 3. 发布批次是新对象，不能偷懒复用 `source_versions`

`source_versions` 表达的是来源导入与本地投影状态，不是远端环境上的发布状态。

若继续复用它，会把：

- sourceTag
- build
- publish target
- environment
- retry
- ledger

混在一起，后续很难扩展。

### 4. `multiclass` 存在历史编码漂移风险

当前 `MULTIPLE_CLASSES` 的主流数据形态符合位掩码语义，Rust 与 TS 兼容层也按位掩码展开。

但旧项目中的 `multiclass.yml` 反映过另一套历史组合枚举编码，而且其中还存在 `knight -> paladin` 这类旧命名痕迹。这意味着：

- 旧版本数据理论上可能出现“组合枚举值”而不是“位掩码值”
- 该历史编码与当前位掩码编码并不兼容
- 不能依赖数值大小或运行时猜测去自动区分两种编码

因此，当前实现虽然可以继续默认采用位掩码语义，但必须把这项风险显式记录下来。

如果后续在旧 build / sourceTag 的真实样本中确认存在历史组合枚举编码，兼容策略应按版本分段处理，而不是在通用投影路径里做模糊判断。

## 验收标准

- desktop 可以在不依赖 TS 投影入口的情况下完成 hsdata 本地投影
- 同一份 fixture 输入下，Rust 与现有 TS 投影结果等价
- `projection_status`、`projected_at`、`projection_error` 仍能被页面稳定展示
- 可以为某个 publish target 生成发布批次和 manifest diff
- 可以把变更卡片的完整 row family 更新到远端正式表
- 发布成功后，本地基线与远端最小 ledger 能形成一致对账
