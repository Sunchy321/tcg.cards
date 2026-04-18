# 炉石传说卡牌模型实施计划

## TODO List

- [ ] 完成 P0 技术收口：确认 `int4multirange` 类型封装、渲染字段白名单、首批 Tag 映射和 XML 子结构边界
- [ ] 完成 P1 数据模型调整：新增 `hearthstone.tags`、`hearthstone_data.source_versions`、`raw_entity_snapshots`、`raw_entity_snapshot_tags`
- [ ] 完成 P1 现有表改造：调整 `hearthstone.entities` 与 `hearthstone.entity_localizations`，补充版本范围、哈希和渲染字段
- [ ] 完成 P2 XML 解析与原始归档：解析 `CardDefs.xml`、自动登记未知 Tag、写入快照和 Tag 类型化值
- [ ] 完成 P3 投影与哈希生成：从原始快照生成 `entities`、`entity_localizations`、`revisionHash`、`localizationHash`、`renderHash`
- [ ] 完成 P4 查询与兼容视图：更新现有卡牌查询、历史查询、Tag 查询和兼容视图
- [ ] 完成 P5 历史导入与迁移：导入 `hsdata` 历史版本，回填新表和改造后的旧表
- [ ] 完成 P6 验证与回归：覆盖导入幂等、版本区间、去重、重投影和渲染哈希稳定性

## 目标

基于 `docs/hearthstone-card-model-design.md` 的当前设计，落地一套更少表、更易查询、可完整保存历史的炉石卡牌模型。

本计划采用以下最终边界：

- Tag 定义进入 `hearthstone.tags`
- 原始归档进入 `hearthstone_data.source_versions`、`raw_entity_snapshots`、`raw_entity_snapshot_tags`
- 领域事实继续使用 `hearthstone.entities` 和 `hearthstone.entity_localizations`
- 不新增 `raw_entity_spans`、`entity_revisions`、`entity_revision_localizations`、`card_timelines`、`render_models`
- `renderHash` 由 canonical `renderModel` 确定性生成，不使用随机值

## 实施原则

- 优先复用现有 `hearthstone.entities` 和 `hearthstone.entity_localizations`
- 不为单一映射关系额外建表
- 原始层负责保真，领域层负责查询和渲染
- 所有哈希必须由规范化内容确定性生成
- 所有版本范围先按 `int4multirange` 设计，若 ORM 支持不足再用自定义类型封装
- 未知 Tag 必须自动入库，不能阻塞导入

## 阶段计划

| 阶段 | 目标 | 核心任务 | 输出物 | 验收标准 |
|------|------|----------|--------|----------|
| P0 技术收口 | 冻结实现边界 | 验证 `int4multirange` 在 Drizzle 中的封装方式；冻结渲染字段白名单；补首批 `Tag -> 字段` 映射；抽样确认 `Power`、`ReferencedTag`、`EntourageCard` 可先进入 `extraPayload` | 字段清单、渲染白名单、Tag 映射表、范围类型方案 | 不再存在影响建表的未决问题 |
| P1 数据模型 | 建立最小表结构 | 新增 `hearthstone.tags`；新增 `hearthstone_data.source_versions`、`raw_entity_snapshots`、`raw_entity_snapshot_tags`；改造 `entities`、`entity_localizations`；补索引、唯一约束和范围不重叠约束 | Drizzle schema、migration、模型类型 | 本地迁移可生成；新旧表结构与设计一致 |
| P2 原始归档 | 完整接住 XML | 实现 `CardDefs.xml` 解析；按 `enumID` 自动匹配或创建 Tag；写入原始快照；写入 Tag 类型化值；维护 `sourceSpan` | XML parser、归档服务、导入记录 | 同一源版本重复导入幂等；未知 Tag 不报错 |
| P3 领域投影 | 生成可查询事实 | 根据 `hearthstone.tags` 的解析和字段映射配置生成 `entities`；生成多语言 `entity_localizations`；计算 `revisionHash`、`localizationHash`、`renderModel`、`renderHash` | 投影服务、哈希工具、渲染模型构造器 | 相同结构复用同一 `revisionHash`；相同渲染得到同一 `renderHash` |
| P4 查询兼容 | 保持现有能力可用 | 更新 `entity_view`、`card_entity_view`；更新 card summary/full/diff 查询；补 Tag 查询视图或查询 helper；按 `sourceSpan` 支持指定版本查询 | 视图、查询服务、ORPC handler 调整 | 现有卡牌详情接口继续可用；指定版本查询命中正确记录 |
| P5 历史导入 | 回填完整历史 | 从 `hsdata` 历史文件导入所有 source version；压缩相同快照的 `sourceSpan`；回填结构和本地化领域表 | 历史导入脚本、回填结果、导入日志 | 能导入全量历史；可按卡牌查看历史版本 |
| P6 验证回归 | 确认可维护性 | 增加样例 XML fixture；验证未知 Tag、Tag 重命名、重投影、版本区间、渲染哈希稳定性；检查查询性能 | 测试用例、验证脚本、性能记录 | 关键链路测试通过；重复导入和重投影结果稳定 |

## 最小表结构

### 新增表

| 表 | Schema | 作用 |
|----|--------|------|
| `tags` | `hearthstone` | 保存 Tag 的 `enumID`、slug、说明、解析配置和唯一字段映射 |
| `source_versions` | `hearthstone_data` | 保存上游 `hsdata` 版本、build、hash、来源 URI 和导入状态 |
| `raw_entity_snapshots` | `hearthstone_data` | 保存规范化后的原始 Entity 快照、`sourceSpan`、`snapshotHash` 和 `extraPayload` |
| `raw_entity_snapshot_tags` | `hearthstone_data` | 保存每个原始快照中的 Tag 明细、原始值和类型化值 |

### 改造表

| 表 | Schema | 改造方向 |
|----|--------|----------|
| `entities` | `hearthstone` | 增加 `sourceSpan`、`revisionHash`、`rawSnapshotId`、`isLatest`，作为结构修订事实表 |
| `entity_localizations` | `hearthstone` | 增加 `sourceSpan`、`revisionHash`、`localizationHash`、`renderHash`、`renderModel`、`isLatest`，作为本地化和渲染事实表 |
| `cards` | `hearthstone` | 保持卡牌稳定身份和非 XML 侧事实，按需要补索引或缓存字段 |

### 不新增表

- `raw_entity_spans`
- `entity_revisions`
- `entity_revision_localizations`
- `card_timelines`
- `render_models`
- `tag_matchers`
- `tag_projection_rules`
- `tag_normalizer_rules`
- `tag_values`

## 关键字段与约束

### `sourceSpan`

- 推荐类型：`int4multirange`
- 使用位置：
  - `raw_entity_snapshots`
  - `entities`
  - `entity_localizations`
- 约束：
  - 同一 `cardId` 的结构记录不能覆盖同一源版本两次
  - 同一 `cardId + lang` 的本地化记录不能覆盖同一源版本两次

### `revisionHash`

- 存在于 `entities` 和 `entity_localizations`
- 仅覆盖结构字段
- 不包含本地化文本
- 用于结构修订去重和本地化记录关联结构修订

### `localizationHash`

- 存在于 `entity_localizations`
- 覆盖 `lang` 和所有本地化字段
- 不包含结构字段
- 用于判断某语言文本修订是否相同

### `renderHash`

- 存在于 `entity_localizations`
- 不使用随机值
- 基于 canonical `renderModel` 生成
- 输入包括所有影响最终卡面的结构字段、本地化字段、`lang`、模板版本和资源版本

## 导入流程

1. 读取 `source_versions` 中的待导入源版本
2. 解析对应 `CardDefs.xml`
3. 对每个 `Entity` 规范化排序并计算 `snapshotHash`
4. 根据 `enumID` 查找或创建 `hearthstone.tags`
5. 根据 `tags` 配置将原始 Tag 转成类型化值
6. 写入或复用 `raw_entity_snapshots`
7. 写入 `raw_entity_snapshot_tags`
8. 更新原始快照的 `sourceSpan`
9. 投影结构字段到 `entities`
10. 投影本地化字段到 `entity_localizations`
11. 生成 `renderModel` 和 `renderHash`
12. 更新 `isLatest`

## 查询策略

- 最新卡牌：查询 `isLatest = true`
- 指定版本卡牌：查询 `sourceSpan` 包含指定 source version
- 卡牌历史：按 `cardId` 查询 `entities` 和 `entity_localizations` 的所有 `sourceSpan`
- Tag 查询：从 `raw_entity_snapshot_tags` 通过 `enumId` 和类型化值列查询
- 渲染缓存：以 `entity_localizations.renderHash` 作为缓存 key

## 风险与应对

| 风险 | 影响 | 应对 |
|------|------|------|
| `int4multirange` ORM 支持不足 | migration 和查询实现受阻 | P0 先写自定义类型封装，必要时临时退回 `versionStart/versionEnd` |
| 渲染字段白名单不完整 | `renderHash` 过度复用或过度分裂 | P0 冻结白名单并为每次白名单调整加版本号 |
| 未知 Tag 默认解析不准确 | 后续投影结果缺字段 | 先保留原始值和类型化默认值，补配置后支持重投影 |
| `extraPayload` 过大 | 原始快照存储压力增加 | v1 先保真，后续按稳定查询需求拆表 |
| 版本范围重叠 | 指定版本查询出现多行命中 | 增加导入校验和数据库约束或事务内冲突检查 |

## 验收标准

- 可以导入至少一份完整 `CardDefs.xml`
- 未知 Tag 自动进入 `hearthstone.tags`
- 可以重复导入同一 source version 且结果幂等
- 可以按 `cardId + sourceVersion + lang` 查询完整卡牌
- 结构相同的记录复用 `revisionHash`
- 本地化相同的记录复用 `localizationHash`
- 渲染字段相同的记录生成相同 `renderHash`
- 现有卡牌详情接口通过兼容视图或查询适配继续可用

