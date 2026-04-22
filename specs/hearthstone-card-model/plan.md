# 炉石传说卡牌模型实施计划

## TODO List

- [x] 盘点当前实现状态并标注阶段完成度
- [x] 产出首版渲染字段白名单提案
- [x] 完成 P0 技术收口：冻结 `sourceTag` / `sourceTags` / `build[]` / `version[]` 的语义与查询规则
- [x] 完成 P0 技术收口剩余项：冻结 XML 子结构边界（`Power` / `EntourageCard`）并回写计划状态
- [x] 完成 P1 数据模型收尾：校正 schema、迁移与回填方案，补齐约束和索引
- [x] 完成 P2 配套运维：统一 `hsdata:upload` 的 `state.json` 写回并移除旧脚本
- [x] 完成 P2 配套观测：在数据源页展示 hsdata 原始归档表概览
- [x] 完成 P2 原始归档链路：写入 `source_versions`、`raw_entity_snapshots`、`raw_entity_snapshot_tags`
- [x] 完成 P2 验收封口：补齐 fixture、幂等自动化验证与最终状态回写
- [x] 完成 P3 详细设计与实施计划：明确领域投影边界、hash 规则、renderModel 和写库幂等策略
- [x] 完成 P3 领域投影链路：生成 `entities`、`entity_localizations`、`entity_relations` 与三类 hash
- [ ] 完成 P4 查询兼容迁移：切换卡牌查询、历史查询、Tag 查询和输出 schema
- [ ] 完成 P5 历史回填与图片迁移：导入历史版本、重算渲染字段、按 hash diff 迁移 R2 图片
- [ ] 完成 P6 验证与回归：补齐 fixture、幂等、重投影、稳定性和性能测试

## 当前状态（2026-04-22）

- 整体完成度约为 `60% ~ 65%`
- `P0` 已完成：`sourceTag` / `sourceTags` / `build[]` / `version[]` 语义、渲染字段白名单、首批 Tag 映射与 XML 子结构边界均已冻结
- `P1` 已完成：Drizzle schema、生成式 migration、legacy backfill、版本数组约束、查询索引与 `renderModel` 静态结构均已收口
- `P2` 已完成：XML 导入、原始快照池、Tag 事件、未知 Tag 自动登记、控制台 dry run / 写库入口、fixture 与幂等自动化验证均已收口
- `P3` 已完成：单 `sourceTag` 领域投影、三类 hash、`renderModel`、build 版本合并与关系投影均已落地并通过定向测试
- `P4 ~ P6` 尚未形成闭环：查询迁移、历史回填、图片迁移与全量回归仍需继续推进

### 已落地内容

- 已新增与新模型相关的 schema / migration 骨架
- 已引入 `renderModel` / `renderHash` 的字段设计方向
- 已将首版渲染字段白名单结论并入当前 spec
- 已确认 XML 子结构边界：`ReferencedTag` 独立投影到 `entities.referencedTags`，`Power` / `EntourageCard` 在 v1 继续保留于 `raw_entity_snapshots.extraPayload`
- 已将 `raw_entity_snapshots.version` 更正为 `sourceTags`，消除 `data` 层与默认层版本语义混淆
- 已明确 `renderModel` 的静态结构，并在模型层使用 Zod 类型约束
- 已通过 `drizzle-kit generate` 生成 P1 约束与索引迁移，手写部分仅保留 Drizzle 无法推断的 legacy backfill
- 已将 `hearthstone/hsdata/state.json` 的维护收敛到 `apps/site-console/scripts/hsdata-upload.ts`
- 已移除旧脚本 `scripts/sync-all-tags.sh`
- 已完成 `hsdata:upload` 配套校验：TypeScript 定向检查通过，`--help` 自检通过；单文件 `eslint` 因仓库缺少 `@typescript-eslint` 插件未完成
- 已在 `hearthstone/data-source` 页面增加 hsdata 原始归档表概览，覆盖 `source_versions`、`raw_entity_snapshots`、`raw_entity_snapshot_tags`、`tag_value_view`
- 已在后端落地只读概览接口，用于聚合 `hearthstone_data` 侧统计并回传前端卡片展示
- 已实现 `apps/site-console/server/lib/hearthstone/hsdata-import.ts`，覆盖 `CardDefs.xml` 事件解析、Entity 规范化、canonical hash、`source_versions` 状态流转、快照复用与 `sourceTags` 合并
- 已实现 `raw_entity_snapshot_tags` 写入，支持基础 typed value 分流、fallback 保真、LocString 保留和 `ReferencedTag` 写入 `extraPayload`
- 已实现未知 Tag 自动登记为 `discovered`，并在已存在 Tag 再次出现时只合并追溯字段，不覆盖人工维护字段
- 已在控制台后端提供 `importArchive` 入口，并在 `hearthstone/data-import` 页面提供 R2 归档选择、dry run、force 和导入报告展示
- 已补齐 `apps/site-console/server/lib/hearthstone/hsdata-import.test.ts`，覆盖基础 Tag、LocString、未知 Tag、XML 子结构、`card_ref`、重复导入与跨 sourceTag 快照复用
- 已补齐 `raw_entity_snapshot_tags.cardRefDbfId` 的同 XML 内可得回填
- 已通过 `bun test apps/site-console/server/lib/hearthstone/hsdata-import.test.ts` 定向验证
- 已实现 `apps/site-console/server/lib/hearthstone/hsdata-project.ts`，覆盖 `source_versions` 状态校验、raw snapshot / Tag 聚合读取、显式 Tag 配置投影、三类 hash、`renderModel` 构造和 build 版本合并
- 已实现 `entity_relations` 的强弱关系投影，覆盖 `heroPower`、`buddy`、`tripleCard` 与 `heroicHeroPower`
- 已补齐 `apps/site-console/server/lib/hearthstone/hsdata-project.test.ts`，覆盖首轮投影、重复投影幂等和跨 build 复用
- 已通过 `bun test apps/site-console/server/lib/hearthstone/hsdata-project.test.ts` 定向验证
- 已在 `hearthstone/data-import` 页面增加手动 `P3` 投影入口，并在后端提供 `projectSourceVersion` 控制台调用路径

### 主要缺口

- 查询层仍有旧模型残留，卡牌接口仍依赖旧 relation 结构
- 输出 schema 尚未完整暴露 `revisionHash`、`localizationHash`、`renderHash`

## 目标与已确认边界

- 以当前仓库中已部分落地的 schema 为基础补齐完整链路，而不是重新设计一套新模型
- `renderModel` 继续作为 `entity_localizations` 上的字段维护，不新增独立表或 view
- `renderHash` 由 canonical `renderModel` 确定性生成，不引入随机值
- `hearthstone_data.source_versions.sourceTag` 保留导入侧身份
- `hearthstone_data.raw_entity_snapshots.sourceTags` 表示 `sourceTag[]`
- 默认层 `entities.version`、`entity_localizations.version`、`entity_relations.version` 统一表示 `build[]`
- 渲染字段一旦进入白名单，即始终参与 hash，不再按模板条件分支决定是否纳入
- `mechanics` 不整体进入白名单，只提取固定 `renderMechanics` 子集
- 白名单逻辑变化时，必须全量重算 `renderModel` 与 `renderHash`，但图片迁移按 hash diff 执行，不默认全量重生成

## 首版渲染字段白名单

### 直接渲染字段

- `cardId`
- `localization.name`
- `localization.richText`
- `type`
- `cost`
- `attack`
- `health`
- `durability`
- `armor`
- `classes`
- `race`
- `spellSchool`
- `mercenaryFaction`
- `set`
- `overrideWatermark`
- `rarity`
- `elite`
- `techLevel`
- `rune`

### 渲染上下文

- `lang`
- `variant`
- 模板版本
- 资源版本

### `renderMechanics`

- `tradable`
- `forge`
- `hide_cost`
- `hide_attack`
- `hide_health`
- `in_mini_set`
- `hide_watermark`

## 阶段计划

| 阶段 | 状态 | 核心任务 | 输出物 | 验收标准 |
|------|------|----------|--------|----------|
| P0 技术收口 | 已完成 | 已冻结 `sourceTag` / `sourceTags` / `build[]` / `version[]` 语义、渲染白名单、首批 `Tag -> 字段` 映射与 XML 子结构边界 | 白名单结论、字段映射表、版本集合规则 | 不再存在影响建模和迁移的关键未决项 |
| P1 数据模型收尾 | 已完成 | 已审核现有 schema 和 migration；补齐约束、索引、回填与切换方案；明确 `renderModel` 列结构 | 修订后的 schema、生成式 migration、legacy backfill、`renderModel` 类型 | 迁移可安全执行，且不依赖人工修补数据 |
| P2 原始归档 | 已完成 | 已实现 `CardDefs.xml` 解析；写入 `source_versions`、`raw_entity_snapshots`、`raw_entity_snapshot_tags`；未知 Tag 自动登记；控制台导入入口与自动化验收已可用 | XML parser、归档服务、控制台导入页、导入报告、fixture 与幂等测试 | 同一 source version 重复导入幂等、跨 sourceTag 快照复用、未知 Tag 不阻塞、XML 子结构保留均已通过定向测试 |
| P3 领域投影 | 已完成 | 从原始快照生成 `entities`、`entity_localizations`、`entity_relations`；计算 `revisionHash`、`localizationHash`、`renderHash` | `plan-p3.md`、投影服务、哈希工具、renderModel 构造器 | 相同结构、文本、渲染可稳定去重 |
| P4 查询兼容 | 少量旧逻辑已存在 | 切换卡牌查询到新 relation / view；补齐历史查询、Tag 查询和输出 schema | 查询层、兼容 view、ORPC 调整 | 现有卡牌详情接口和历史查询可在新模型下工作 |
| P5 历史回填与图片迁移 | 未开始 | 导入 `hsdata` 历史版本；全量重算 `renderModel` / `renderHash`；仅对 hash diff 记录做第三方出图与 R2 迁移 | 历史导入脚本、diff 清单、迁移记录 | 数据全量可回填，图片迁移规模受控 |
| P6 验证回归 | 未开始 | 增加 XML fixture、幂等测试、重投影测试、渲染稳定性测试和性能检查 | 测试用例、验证脚本、性能记录 | 重复导入、重投影和查询结果稳定 |

## 实施顺序

1. 基于已完成的 P2 原始归档层推进 `P3` 领域投影链路
2. 在最小闭环稳定后完成 `P4` 查询迁移
3. 最后执行 `P5` 历史回填与图片迁移，并用 `P6` 做回归封口

## 渲染哈希与图片迁移规则

- `renderModel` 只保留渲染相关字段，不直接对整行 `entities` / `entity_localizations` 做 hash
- `mechanics` 不整体入 hash，只投影固定 `renderMechanics`
- 白名单逻辑变化后：
  1. 全量重算 `renderModel`
  2. 全量重算 `renderHash`
  3. 产出 `oldRenderHash != newRenderHash` 的差异清单
  4. 仅对差异清单调用第三方工具生成图片
  5. 上传到新对象路径或命名空间
  6. 抽样校验后切换线上引用
  7. 稳定后延迟清理旧 R2 对象
- 不把“白名单版本号”强制并入 `renderHash`，避免无意义的全量图片迁移

## 当前高优先级风险

| 风险 | 影响 | 应对 |
|------|------|------|
| 查询层仍依赖旧 relation | 新旧模型并存时间过长，接口行为不一致 | 在 `P4` 明确 relation 切换顺序，并保留短期兼容层 |
| 白名单与上游渲染契约脱节 | `renderHash` 去重结果失真 | 以 `references/hearthstone/raw/into-json.ts` 输出契约为准冻结首版白名单 |
| 图片全量存放在 R2 且不能按需生成 | 白名单调整可能引发高成本迁移 | 采用“全量重算 hash + 差异迁移图片”的策略 |
