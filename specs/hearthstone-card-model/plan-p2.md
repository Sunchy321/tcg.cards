# P2 原始归档链路详细计划

## TODO List

- [x] 确认 P2 输入输出边界与非目标
- [x] 建立 `CardDefs.xml` 解析与规范化模型
- [x] 实现 `source_versions` 写入与幂等策略
- [x] 完成控制台上传配套：上传后刷新 `hearthstone/hsdata/state.json` 并移除旧脚本
- [x] 完成控制台观测配套：在数据源页展示原始归档表概览
- [x] 实现 `raw_entity_snapshots` 快照池写入
- [x] 实现 `raw_entity_snapshot_tags` Tag 事件写入
- [x] 实现未知 Tag 自动登记
- [x] 实现导入事务、失败状态与日志
- [x] 增加 fixture 与幂等自动化验证
- [x] 回写 P2 验收完成状态

## 已确认边界（2026-04-20）

- P2 的导入输入固定为 `CardDefs.xml` 文本、`sourceTag`，并可附带 `sourceCommit`、`sourceUri` 作为来源元数据；`dryRun`、`force` 只作为导入控制参数，不扩大 P2 的数据边界
- P2 的持久化输出固定为 `hearthstone_data.source_versions`、`hearthstone_data.raw_entity_snapshots`、`hearthstone_data.raw_entity_snapshot_tags`，以及 `hearthstone.tags` 中未知 Tag 的 `discovered` 自动登记
- P2 的调用入口固定在 `apps/site-console/server/orpc/hearthstone/data-source/hsdata.ts`，实现主体固定在 `apps/site-console/server/lib/hearthstone/hsdata-import.ts`
- P2 只负责原始归档层，不生成默认层 `entities` / `entity_localizations` / `entity_relations`，不计算 `revisionHash`、`localizationHash`、`renderHash`
- P2 不切换卡牌查询，不处理卡图生成或迁移，不引入 watcher 共享导入模块；这些工作继续留给 P3、P4、P5
- 后续实现以“单份 `CardDefs.xml` 可稳定归档并可重复导入”为收口目标，不在 P2 中扩展新的领域建模职责
- `apps/site-console/scripts/hsdata-upload.ts` 作为归档入口的运维配套，在上传成功后负责刷新 `hearthstone/hsdata/state.json`，供控制台数据源页读取
- `hearthstone/data-source` 页面作为 P2 的控制台观测入口，需要直接展示 `hearthstone_data` 相关表/视图的统计概览

## 目标

P2 只负责把一份或多份 `CardDefs.xml` 原始数据可靠归档到 `hearthstone_data`，形成后续 P3 领域投影可重复消费的原始事实层。

核心输出表：

- `hearthstone_data.source_versions`
- `hearthstone_data.raw_entity_snapshots`
- `hearthstone_data.raw_entity_snapshot_tags`
- `hearthstone.tags` 中自动登记的未知 Tag

P2 完成后，应满足：

- 同一个 source version 重复导入不会产生重复快照或重复 Tag 事件
- 同一份规范化 Entity 内容在多个 source version 出现时，只复用一条 `raw_entity_snapshots`，并合并 `sourceTags`
- 未知 Tag 不阻塞导入，先以 `discovered` 状态登记
- 原始 XML 子结构仍可追溯，后续 Tag 映射规则变化时可以重投影

## 当前状态（2026-04-22）

P2 已完成：

- `apps/site-console/server/lib/hearthstone/hsdata-import.ts` 已实现 XML 事件解析、Entity 规范化、canonical hash、快照池写入、Tag 事件写入、未知 Tag 自动登记和导入报告
- `apps/site-console/server/orpc/hearthstone/data-source/hsdata.ts` 已提供 `importArchive`，可从 `R2_DATA/hearthstone/hsdata/data/` 读取归档 XML 并调用导入服务
- `apps/site-console/app/pages/hearthstone/data-import/index.vue` 已提供控制台导入页面，支持 R2 文件选择、dry run、force 和导入报告展示
- `source_versions` 已支持 `processing` / `completed` / `failed` 状态流转，解析失败或写库失败会回写失败状态并输出错误日志
- `raw_entity_snapshots` 已按 `(cardId, snapshotHash)` 复用快照，并在跨 source version 复现同一快照时合并升序去重的 `sourceTags`
- `raw_entity_snapshot_tags` 已保存 XML Tag 事件、raw payload、typed value 与 fallback 值；`ReferencedTag` 按 P2 边界保留在 `extraPayload.referencedTags`
- 未知 `enumID` 已自动登记到 `hearthstone.tags`，状态为 `discovered`，且不会覆盖已人工维护的 `slug`、`project*`、`normalize*`
- `card_ref` 类型 Tag 已在同 XML 内可得时回填 `cardRefDbfId`
- `apps/site-console/server/lib/hearthstone/hsdata-import.test.ts` 已覆盖基础 Tag、LocString、未知 Tag、XML 子结构、`card_ref`、重复导入和跨 sourceTag 快照复用
- `bun test apps/site-console/server/lib/hearthstone/hsdata-import.test.ts` 已通过，结果为 3 个用例通过

## 已完成的配套项（2026-04-22）

P2 主链路、验收测试与原始归档入口运维配套均已完成：

- `hsdata:upload` 成功上传 XML 后自动更新 `hearthstone/hsdata/state.json`
- 旧脚本 `scripts/sync-all-tags.sh` 已删除

### 当前行为

上传成功后，脚本会：

1. 读取现有 `state.json`（若不存在或损坏则回退为空历史）
2. 用本次上传的 `sourceTag`、`commit`、`shortCommit` 刷新顶层状态
3. 在 `history` 头部追加一条 `type = single` 的历史记录
4. 仅保留最近 50 条历史

### 当前字段约束

- `tag`：记录最近一次上传的 `sourceTag`
- `commit` / `short`：记录最近一次上传对应的 commit 信息
- `synced_at`：记录脚本写回时间
- `type`：当前固定写为 `single`
- `file_count`：按上传动作增量维护；若当前 `sourceTag + commit` 已出现过，则不重复增加

### 明确限制

- 当前不提供独立的全量重建脚本
- 若历史 `state.json` 已损坏或缺失，`file_count` 不负责回填历史总量
- `--dry-run` 不写 XML，也不写 `state.json`

### 已完成校验

- `apps/site-console/scripts/hsdata-upload.ts` 的 TypeScript 定向检查通过
- `bun run hsdata:upload -- --help` 自检通过
- 单文件 `eslint` 因仓库现有配置缺少 `@typescript-eslint` 插件未完成

## 已完成的观测项（2026-04-22）

P2 主链路之外，原始归档层的控制台观测配套也已经完成。

### 当前覆盖范围

数据源页当前直接展示以下 `hearthstone_data` 对象的概览：

- `source_versions`
- `raw_entity_snapshots`
- `raw_entity_snapshot_tags`
- `tag_value_view`

### 当前展示结果

前端已提供两层信息：

1. 总览卡片
   - 来源版本总数
   - 已完成导入版本数
   - 失败版本数
   - 快照总数
   - latest 快照数
   - Tag 行总数
2. 表级概览卡片
   - `source_versions` 的状态分布、最近导入时间、最近完成 `sourceTag`
   - `raw_entity_snapshots` 的总行数、latest 行数、不同 `card_id` 数量、最近更新时间
   - `raw_entity_snapshot_tags` 的总行数、不同 `snapshot_id` / `enum_id` 数量
   - `tag_value_view` 的总行数、不同 `snapshot_id` / `enum_id` 数量

### 当前实现结果

- 后端已在 `apps/site-console/server/orpc/hearthstone/data-source/hsdata.ts` 提供只读 `getOverview` 接口
- 前端已在 `apps/site-console/app/pages/hearthstone/data-source/index.vue` 接入概览加载，并与现有刷新动作并行执行
- 前端类型已在 `apps/site-console/app/composables/hearthstone-hsdata.ts` 中补齐

### 当前意义

这部分配套虽然不等于 P2 主导入链路本身，但已经满足两个关键目标：

- 不进入数据库即可快速确认原始归档表是否已有数据
- 可以直接在控制台确认最近一次导入是否已经反映到 `hearthstone_data`

## 非目标

P2 不做以下工作：

- 不生成 `hearthstone.entities`
- 不生成 `hearthstone.entity_localizations`
- 不生成 `hearthstone.entity_relations`
- 不计算 `revisionHash`、`localizationHash`、`renderHash`
- 不构造 `renderModel`
- 不切换卡牌详情查询
- 不生成或迁移卡图

这些属于 P3、P4、P5。

## 输入与来源

### 输入参数

每次导入至少需要以下参数：

- `sourceTag`：导入侧 source version 身份，写入 `source_versions.sourceTag`
- `sourceCommit`：可选，记录来源仓库 commit
- `sourceUri`：可选，记录 XML 或源仓库路径
- `CardDefs.xml` 内容

从 XML 解析得到：

- `CardDefs._attributes.build` -> `source_versions.build`
- `Entity._attributes.CardID` -> `raw_entity_snapshots.cardId`
- `Entity._attributes.ID` -> `raw_entity_snapshots.dbfId`
- `Entity._attributes.version` -> `raw_entity_snapshots.entityXmlVersion`
- `Entity.Tag` -> `raw_entity_snapshot_tags`
- `Entity.Power` / `Entity.EntourageCard` / `Entity.MasterPower` / `Entity.TriggeredPowerHistoryInfo` -> `raw_entity_snapshots.extraPayload`
- `Entity.ReferencedTag` -> P2 先规范化保留到 `extraPayload.referencedTags`，P3 再投影到 `entities.referencedTags`

### 实现位置

P2 导入能力只由控制台使用，不做跨应用共享模块。实现集中放在 `apps/site-console` 后端：

- `apps/site-console/server/lib/hearthstone/hsdata-import.ts`：实现 XML 解析、规范化、hash、DB 写入和报告生成
- `apps/site-console/server/orpc/hearthstone/data-source/hsdata.ts`：提供控制台调用的验收入口
- `packages/db/src/schema/hearthstone/data/card-model.ts`：只在发现 schema 缺口时调整
- `packages/model/src/hearthstone/schema/data/hsdata.ts`：仅在需要补充 XML 输入类型时调整

不把 P2 导入逻辑放入 `apps/watcher`，也不抽成共享导入模块。后续如果 watcher 或其他入口确实需要复用，再按实际需求迁移。

XML 解析使用 `saxes` 事件解析器，不再使用手写 tokenizer。P2 当前仍由控制台传入 XML 文本，但解析过程只构建当前 `Entity` 子树并在实体闭合时立即规范化，避免构造整份 `CardDefs.xml` DOM。

## 数据流

### 1. 读取 XML

步骤：

1. 接收 XML 文件路径、URL 或已加载文本
2. 计算 `sourceHash`
3. 解析为 `XCardDefs`
4. 提取 `build`
5. 展平 `Entity` 数组

验收：

- XML 解析失败时，`source_versions.status` 不标记为 `completed`
- 空 Entity 列表视为失败
- 缺少 `CardID`、`ID`、`version` 的 Entity 视为解析错误

### 2. 写入 `source_versions`

策略：

1. 以 `sourceTag` 为主键 upsert
2. 写入 `sourceCommit`、`build`、`sourceHash`、`sourceUri`
3. 导入开始时标记 `status = processing`
4. 导入完成后标记 `status = completed`，并写入 `importedAt`
5. 导入失败时标记 `status = failed`，错误详情先进入日志，不新增字段

幂等规则：

- 如果同一 `sourceTag` 已是 `completed` 且 `sourceHash` 相同，可以跳过或走验证模式
- 如果同一 `sourceTag` 已存在但 `sourceHash` 不同，默认失败，除非显式使用覆盖参数
- 不使用 `hsdata` 的 Tag 语义记录领域版本，`sourceTag` 只留在 `hearthstone_data`

### 3. 规范化 Entity 快照

每个 Entity 生成一份稳定 snapshot payload，用于计算 `snapshotHash`。

纳入 snapshot payload：

- Entity 基本属性：`cardId`、`dbfId`、`entityXmlVersion`
- 所有 `Tag` 的规范化结构
- `ReferencedTag` 原始结构
- `Power` 原始结构
- `EntourageCard` 原始结构
- `MasterPower` 原始结构
- `TriggeredPowerHistoryInfo` 原始结构

规范化规则：

- 对 XML 中单对象 / 数组两种形态统一转为数组
- 保留 XML 内部顺序，并生成 `tagOrder`
- 数字字符串在结构化字段中转为整数
- 空字符串与缺失字段按固定规则区分
- JSON key 使用稳定顺序参与 hash
- 不把 `sourceTag` / `build` 纳入 `snapshotHash`

验收：

- 相同 Entity 内容跨 source version 得到相同 `snapshotHash`
- 同 source version 重跑得到相同 `snapshotHash`
- XML 节点顺序实际影响语义时，hash 能反映差异

### 4. 写入 `raw_entity_snapshots`

写入规则：

1. 以 `(cardId, snapshotHash)` 查找现有快照
2. 不存在时插入新快照
3. 存在时合并 `sourceTags`
4. `sourceTags` 必须升序、去重、非空
5. `extraPayload` 写入未拆分 XML 子结构
6. 当前 sourceTag 导入结束后，按该 sourceTag 的最新出现集合更新 `isLatest`

字段映射：

- `cardId` <- `Entity._attributes.CardID`
- `dbfId` <- `Entity._attributes.ID`
- `sourceTags` <- 包含当前 `sourceTag` 的规范化数组
- `entityXmlVersion` <- `Entity._attributes.version`
- `snapshotHash` <- canonical snapshot payload hash
- `extraPayload` <- P2 保留的 XML 子结构

`isLatest` 规则：

- P2 中只保证“本次 sourceTag 对应快照集合”的最新标记可用
- 更复杂的跨 build latest 语义可以在 P3/P4 查询层再明确
- 如果同一卡在当前 sourceTag 出现多个不同快照，应记录冲突并失败，避免 latest 不确定

### 5. 写入 `raw_entity_snapshot_tags`

每个 XML Tag 写成一条或多条事件行。

主键：

- `(snapshotId, enumId, tagOrder)`

通用字段：

- `snapshotId`
- `enumId`
- `tagOrder`
- `rawName`
- `rawType`
- `rawPayload`
- `valueKind`
- `parseStatus`

类型化值规则：

- `type = Int` 且 value 可解析为整数：`valueKind = int`，写入 `intValue`
- `type = String`：`valueKind = string`，写入 `stringValue`
- `type = Card`：`valueKind = card_ref`，写入 `cardRefCardId`，可得时写入 `cardRefDbfId`
- `type = LocString`：`valueKind = loc_string`，写入 `locStringValue`
- 布尔型 Tag 由配置或值规则识别：`valueKind = bool`，写入 `boolValue`
- 枚举语义统一通过 `int + normalizeKind = enum_from_int + normalizeConfig.enumMap` 处理，不再使用 `valueKind = enum`
- 无法识别但可保留的值：`valueKind = json`，写入 `jsonValue`，`parseStatus = fallback`

LocString 规则：

- XML 中语言节点统一转为 `{ lang: text }`
- 语言 key 使用当前 `locale` 枚举可接受值
- 不认识的语言 key 先保存在 `rawPayload`，并将该 Tag 标记为 `fallback`

`ReferencedTag` 规则：

- P2 不写入 `raw_entity_snapshot_tags`
- P2 先把 `ReferencedTag` 规范化为 `enumId -> bool | int` 的 map，保留在 `extraPayload.referencedTags`
- 当 `value = 0 / 1` 时按布尔值处理；出现特殊整数时保留整数
- P3 再按与 `mechanics` 一致的 map 形式投影到 `entities.referencedTags`

### 6. 未知 Tag 自动登记

当 XML Tag 的 `enumID` 在 `hearthstone.tags` 中不存在时，自动插入：

- `enumId`
- `slug`：由 `rawName` 生成稳定 slug，冲突时追加 enumId
- `rawName`
- `rawType`
- `rawNames`
- `valueKind`
- `normalizeKind = identity`
- `projectTargetType = null`
- `projectTargetPath = null`
- `projectKind = null`
- `status = discovered`
- `firstSeenSourceTag`
- `lastSeenSourceTag`

当已存在 Tag 再次出现时：

- 合并 `rawNames`
- 更新 `lastSeenSourceTag`
- 不覆盖人工维护的 `slug`、`project*`、`normalize*`
- 不把 `sourceTag` 写入默认层表

验收：

- 未知 Tag 不导致导入失败
- 已配置 Tag 不被导入流程覆盖人工配置
- 同一 enumId 多个 rawName 会保留追溯信息

### 7. 事务与幂等

单个 sourceTag 导入使用事务：

1. upsert `source_versions` 为 `processing`
2. 解析所有 Entity
3. upsert 所有未知 Tag
4. upsert 所有快照
5. 删除并重写受影响 snapshot 的 Tag 事件，或使用主键 upsert 保证一致
6. 更新 `sourceTags`
7. 更新 `isLatest`
8. 标记 `source_versions.status = completed`

失败处理：

- 事务内失败应回滚快照与 Tag 事件写入
- `source_versions.status = failed` 可在独立小事务中记录
- 日志中必须包含 `sourceTag`、`build`、`cardId`、阶段、错误摘要

幂等验收：

- 同一 XML 连续导入两次，表行数稳定
- 同一 XML 连续导入两次，所有 `snapshotHash` 稳定
- 第二次导入不新增重复 `raw_entity_snapshot_tags`
- 同一快照跨 sourceTag 出现时，只追加 `sourceTags`

### 8. 校验与测试

最小 fixture：

- 单 Entity，基础 Int/String/Card Tag
- LocString Tag
- 包含 `ReferencedTag`
- 包含 `Power`
- 包含 `EntourageCard`
- 未知 enumId
- 同一 Entity 重复导入
- 两个 sourceTag 共享同一 snapshot

测试重点：

- XML 单对象 / 数组形态兼容
- canonical hash 稳定
- `sourceTags` 升序去重
- `raw_entity_snapshot_tags` 主键幂等
- 未知 Tag 自动登记
- 已知 Tag 不被覆盖
- fallback 值完整保留 `rawPayload`

建议命令：

- `bun run --cwd packages/model typecheck`
- `bun run --cwd packages/db typecheck`
- `bun run --cwd apps/watcher typecheck`
- 针对新增导入模块运行局部测试

## 实施分步

### Step 1：类型与解析器

输出：

- XML 解析入口
- `toArray` 规范化工具
- `normalizeEntitySnapshot` 函数
- canonical JSON / hash 工具

完成标准：

- fixture XML 能解析为稳定中间结构
- 相同输入生成相同 snapshot hash

### Step 2：Tag 规范化

输出：

- `normalizeRawTag` 函数
- LocString 解析
- typed value 分流
- fallback raw payload 保留

完成标准：

- 每个 XML Tag 都能产生可写入 `raw_entity_snapshot_tags` 的事件行
- 未识别值不丢失

### Step 3：Tag 自动登记

输出：

- `ensureTags` / `upsertDiscoveredTags`
- rawName 合并规则
- first/last seen 更新规则

完成标准：

- 未知 Tag 自动入库
- 人工字段不被覆盖

### Step 4：source version 与快照写入

输出：

- `importSourceVersion`
- `upsertRawEntitySnapshot`
- `mergeSourceTags`
- `replaceSnapshotTags`

完成标准：

- source version 可完整导入
- 重复导入行数稳定
- 快照复用与 sourceTags 合并正确

### Step 5：事务、日志和控制台验收入口

输出：

- console ORPC 入口
- 导入状态更新
- 错误日志
- dry-run / validate-only 模式

完成标准：

- 控制台可提交单份 `CardDefs.xml` 并导入
- 控制台可执行 dry-run 并返回报告
- 失败可定位到具体阶段和 cardId

### Step 6：测试与文档回写

输出：

- fixture 测试
- 幂等测试
- P2 状态回写

完成标准：

- P2 TODO 全部完成
- `specs/hearthstone-card-model/plan.md` 中 P2 标记为已完成
- P3 可以直接消费原始快照层

## 风险与决策点

| 风险 | 影响 | 处理 |
|------|------|------|
| XML 历史格式不完全一致 | 解析器遗漏旧节点 | P2 先保留 rawPayload 和 extraPayload，未知结构 fallback 不阻塞 |
| Tag 类型配置不完整 | typed value 可能不准确 | 优先保真，无法判断时写 `jsonValue` 并标记 fallback |
| 重复导入导致事件行膨胀 | 原始层不可控增长 | 使用 snapshot 主键和 Tag 主键幂等写入 |
| sourceTag 与 build 混淆 | 后续查询版本错误 | P2 严格只在 data 层记录 sourceTag，默认层 build 留给 P3 |
| `isLatest` 语义提前复杂化 | P2 范围膨胀 | P2 只维护原始快照层快捷标记，领域 latest 由 P3/P4 收口 |

## P2 完成定义

- 有可执行入口导入单份 `CardDefs.xml`
- `source_versions` 正确记录 source metadata 和状态
- `raw_entity_snapshots` 能稳定去重并合并 `sourceTags`
- `raw_entity_snapshot_tags` 能完整保存 Tag 事件和值
- 未知 Tag 自动登记且不阻塞导入
- 重复导入同一 source version 幂等
- 至少一组 fixture 覆盖基础 Tag、LocString、未知 Tag、XML 子结构和重复导入
