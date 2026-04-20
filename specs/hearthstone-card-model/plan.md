# 炉石传说卡牌模型实施计划

## TODO List

- [x] 盘点当前实现状态并标注阶段完成度
- [x] 产出首版渲染字段白名单提案
- [x] 完成 P0 技术收口：冻结 `sourceTag` / `sourceTags` / `build[]` / `version[]` 的语义与查询规则
- [x] 完成 P0 技术收口剩余项：冻结 XML 子结构边界（`Power` / `EntourageCard`）并回写计划状态
- [ ] 完成 P1 数据模型收尾：校正 schema、迁移与回填方案，补齐约束和索引
- [ ] 完成 P2 原始归档链路：写入 `source_versions`、`raw_entity_snapshots`、`raw_entity_snapshot_tags`
- [ ] 完成 P3 领域投影链路：生成 `entities`、`entity_localizations`、`entity_relations` 与三类 hash
- [ ] 完成 P4 查询兼容迁移：切换卡牌查询、历史查询、Tag 查询和输出 schema
- [ ] 完成 P5 历史回填与图片迁移：导入历史版本、重算渲染字段、按 hash diff 迁移 R2 图片
- [ ] 完成 P6 验证与回归：补齐 fixture、幂等、重投影、稳定性和性能测试

## 当前状态（2026-04-19）

- 整体完成度约为 `25% ~ 30%`
- `P0` 已完成：`sourceTag` / `sourceTags` / `build[]` / `version[]` 语义、渲染字段白名单、首批 Tag 映射与 XML 子结构边界均已冻结
- `P1` 部分完成：Drizzle schema 与一版 migration 已落地，但仍缺迁移安全校验、回填路径和约束验收
- `P2 ~ P6` 基本未完成：XML 导入、领域投影、查询迁移、历史回填、测试尚未形成闭环

### 已落地内容

- 已新增与新模型相关的 schema / migration 骨架
- 已引入 `renderModel` / `renderHash` 的字段设计方向
- 已将首版渲染字段白名单结论并入当前 spec
- 已确认 XML 子结构边界：`ReferencedTag` 独立投影到 `entities.referencedTags`，`Power` / `EntourageCard` 在 v1 继续保留于 `raw_entity_snapshots.extraPayload`

### 主要缺口

- 导入链路尚未真正消费 `source_versions`、`raw_entity_snapshots`、`raw_entity_snapshot_tags`
- 查询层仍有旧模型残留，卡牌接口仍依赖旧 relation 结构
- 输出 schema 尚未完整暴露 `revisionHash`、`localizationHash`、`renderHash`
- 现有 migration 仍存在回填与切换风险，尚未看到完整 backfill 闭环

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
| P1 数据模型收尾 | 部分完成 | 审核现有 schema 和 migration；补齐约束、索引、回填与切换方案；明确 `renderModel` 列结构 | 修订后的 schema、迁移说明、回填计划 | 迁移可安全执行，且不依赖人工修补数据 |
| P2 原始归档 | 未开始 | 实现 `CardDefs.xml` 解析；写入 `source_versions`、`raw_entity_snapshots`、`raw_entity_snapshot_tags`；未知 Tag 自动登记 | XML parser、归档服务、导入日志 | 同一 source version 重复导入幂等，未知 Tag 不阻塞 |
| P3 领域投影 | 未开始 | 从原始快照生成 `entities`、`entity_localizations`、`entity_relations`；计算 `revisionHash`、`localizationHash`、`renderHash` | 投影服务、哈希工具、renderModel 构造器 | 相同结构、文本、渲染可稳定去重 |
| P4 查询兼容 | 少量旧逻辑已存在 | 切换卡牌查询到新 relation / view；补齐历史查询、Tag 查询和输出 schema | 查询层、兼容 view、ORPC 调整 | 现有卡牌详情接口和历史查询可在新模型下工作 |
| P5 历史回填与图片迁移 | 未开始 | 导入 `hsdata` 历史版本；全量重算 `renderModel` / `renderHash`；仅对 hash diff 记录做第三方出图与 R2 迁移 | 历史导入脚本、diff 清单、迁移记录 | 数据全量可回填，图片迁移规模受控 |
| P6 验证回归 | 未开始 | 增加 XML fixture、幂等测试、重投影测试、渲染稳定性测试和性能检查 | 测试用例、验证脚本、性能记录 | 重复导入、重投影和查询结果稳定 |

## 实施顺序

1. 先处理 `P1` 迁移安全问题，确认哪些现有 migration 需要重做或拆分
2. 再打通 `P2 -> P3` 的最小闭环，先跑通单份 `CardDefs.xml`
3. 在最小闭环稳定后完成 `P4` 查询迁移
4. 最后执行 `P5` 历史回填与图片迁移，并用 `P6` 做回归封口

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
| 现有 migration 缺少回填闭环 | required 列落地后可能导致数据不可用 | 在 `P1` 先补 backfill 与切换方案，再决定是否沿用现有 migration |
| 查询层仍依赖旧 relation | 新旧模型并存时间过长，接口行为不一致 | 在 `P4` 明确 relation 切换顺序，并保留短期兼容层 |
| 白名单与上游渲染契约脱节 | `renderHash` 去重结果失真 | 以 `references/hearthstone/raw/into-json.ts` 输出契约为准冻结首版白名单 |
| 图片全量存放在 R2 且不能按需生成 | 白名单调整可能引发高成本迁移 | 采用“全量重算 hash + 差异迁移图片”的策略 |
| schema 仍未落实 `raw_entity_snapshots.sourceTags` 命名 | `data` 层与默认层版本语义仍可能混淆 | 在 `P1` 将 `raw_entity_snapshots.version` 改名为 `sourceTags` 并补约束 |
