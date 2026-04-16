# 文档历史系统实施计划表

## TODO List

- [x] 完成设计收口：拆分状态字段、明确 authoritative / derived 字段、补齐 `reviewRevision` 与导入溯源字段
- [x] 建立数据库 schema：完成核心表、唯一键、索引、外键与 migration
- [x] 实现文档解析器：支持 TXT 结构化解析、`nodeId` / `path` 生成与特殊节点处理
- [x] 实现内容摘要能力：完成规范化、`contentHash` 与 `fingerprintHash` 生成
- [x] 打通版本导入主链路：支持 `DocumentVersion`、`DocumentNode`、`DocumentNodeContent` 写入
- [x] 实现导入幂等与失败恢复：支持重跑、清理派生数据与按阶段提交事务
- [x] 实现实体匹配：完成 same `nodeId`、exact content、fingerprint、similarity 四阶段匹配
- [x] 实现基础变更检测：支持 `added`、`removed`、`modified`、`renamed`、`moved`
- [x] 实现复杂变更检测：补充 `split` / `merged` 候选识别与关系写入
- [x] 实现变更重算能力：支持单版本对重算和全文档批量重算，保留结构层数据仅清除派生层
- [x] 建立审核闭环：支持待审核队列、确认、拒绝、override 与缓存刷新
- [x] 实现节点历史与版本对比 API：支持相邻版本 diff 与任意版本对比
- [x] 实现缓存策略：支持 `reviewRevision` 参与缓存键和缓存失效
- [ ] 实现本地化读取规则：支持源语言回退和 `isStale` 标记
- [ ] 构建样本集与评估脚本：完成阈值调优、误判分析与实体漂移评估
- [ ] 接入前端历史时间线与审核后台
- [ ] 接入节点搜索与 Announcement 集成能力

## 目标

基于 `docs/document-history-design.md` 的设计，按“先收口设计、再打通主链路、最后补齐增强能力”的顺序推进实现，优先交付一个可稳定导入、可查询、可审核的 v1 版本。

## 实施原则

- 先解决设计中必须修改项，再进入核心开发
- 先实现单文档、相邻版本 diff，再扩展任意版本对比
- 先保证一致性和可重跑，再优化识别精度和前端体验
- `split` / `merged` 在 v1 中优先走审核优先策略，不追求完全自动化

## 阶段计划

| 阶段 | 目标 | 核心任务 | 输出物 | 依赖 | 验收标准 |
|------|------|----------|--------|------|----------|
| P0 设计收口 | 把设计稿收敛为可编码版本 | 拆分状态字段语义；明确 authoritative / derived 字段；补充 `reviewRevision`、source file hash、parser version、import run ID；明确 path 规则与索引方案 | 更新后的设计文档、字段清单、状态流转说明 | `docs/document-history-design.md`、`docs/document-history-design-review.md` | 设计文档中不存在明显冲突字段；关键状态和缓存来源可被清楚回答 |
| P1 数据模型落库 | 建立可支撑 v1 的数据库结构 | 建表 `DocumentDefinition`、`DocumentVersion`、`DocumentNode`、`DocumentNodeEntity`、`DocumentNodeContent`、`DocumentNodeChange`、`DocumentNodeChangeRelation`、`DocumentChangeReview`；补充唯一键、索引、外键；为导入状态与审核状态建立约束 | Migration、ORM schema、初始化脚本 | P0 | 可以本地完成迁移；核心表结构与设计稿一致；索引和唯一键覆盖主要查询路径 |
| P2 解析与指纹 | 产出结构化节点和稳定内容摘要 | 实现 TXT 解析器；抽取 `nodeId`、`path`、`parentNodeId`、`siblingOrder`；实现 `example`、`glossary`、`intro` 特殊节点规则；实现内容规范化和 `fingerprintHash` 生成 | Parser、fingerprint util、解析样例数据 | P1 | 对样本文档可稳定输出结构化节点；同一输入重复解析结果一致 |
| P3 导入主链路 | 打通版本导入与幂等重跑 | 下载源文件；创建 `DocumentVersion`；写入 `DocumentNode` 与源 `DocumentNodeContent`；记录 source file hash；实现按阶段提交的事务边界；实现失败恢复与重导入清理 | Import service、job runner、导入日志 | P2 | 同一版本可重复导入；失败后可重跑；不会留下半成品版本数据 |
| P4 实体匹配与基础变更检测 | 先交付稳定的简单变更识别 | 实现 same `nodeId`、exact content、fingerprint、similarity 四阶段匹配；先稳定支持 `added`、`removed`、`modified`、`renamed`、`moved`；写入 `DocumentNodeEntity` 当前态缓存 | Matching service、基础 diff 结果 | P3 | 相邻版本可输出基础变更；低风险场景误判率可接受；实体不会明显漂移 |
| P5 复杂变更与审核闭环 | 让复杂场景可被人工兜底 | 实现 `split` / `merged` 候选检测；默认进入审核队列；实现 `DocumentChangeReview`、override payload、审核后缓存刷新；禁止导入与审核并发修改同一版本对 | Review queue、review API / service、complex relation 写入逻辑 | P4 | 复杂变更可入队、可确认、可拒绝、可 override；审核后查询结果与缓存保持一致 |
| P6 查询与对比 API | 提供可消费的后端能力 | 实现节点历史查询、相邻版本对比、任意版本对比；支持 `diffMode: reviewed_chain | snapshot`；增加本地化读取与 `isStale` 输出；实现缓存键与失效策略 | Query API、compare API、cache invalidation 逻辑 | P4、P5 | 可以查询单节点时间线；可以对比两个版本；审核后旧缓存失效、新结果生效 |
| P7 样本评估与阈值调优 | 降低误判，建立可观测性 | 构建人工标注样本集；评估 precision / recall、审核队列比例、`rejected` 比例、实体漂移率；分别评估 `CR`、`MTR`、`IPG` 是否需要独立阈值 | 样本集、评估脚本、阈值建议文档 | P4、P5 | 能给出默认阈值建议；能明确哪些文档类型需要独立参数 |
| P8 前端与系统集成 | 让能力可见、可用 | 实现历史时间线组件；实现节点搜索入口；接入审核后台；与现有 Announcement 系统建立投递接口；补充权限与操作留痕 | 前端页面、后台页面、集成接口 | P6 | 用户可查看历史；审核人员可处理队列；规则变更可投递到 Announcement |

## v1 建议范围

### 必做

- 完成 P0 ~ P6
- 支持 `CR` 至少一类文档稳定导入
- 支持相邻版本 diff
- 支持单节点历史查询
- 支持人工审核与 override

### 可降级

- `split` / `merged` 自动识别精度不作为 v1 阻塞项
- 任意版本对比可以先以 `snapshot` 为主，`reviewed_chain` 逐步补齐
- 节点搜索可先做基础检索，不强依赖完整全文搜索能力

### 可后置

- 多文档类型独立参数优化
- 更复杂的审核运营能力
- 前端高级可视化
- 深度存储优化与归档

## 任务拆解建议

| 优先级 | 任务 | 说明 |
|--------|------|------|
| H | 统一状态模型 | 最先完成，否则实现阶段会反复返工 |
| H | 建立 migration 和 ORM schema | 所有后续能力的基础 |
| H | 实现 TXT parser 与特殊节点解析 | 没有稳定节点结构，后面无法推进 |
| H | 打通幂等导入流程 | 这是整个系统的骨架 |
| H | 实现基础变更检测 | 先稳定简单类型 |
| H | 实现审核闭环 | 用人工兜底复杂变更 |
| M | 实现 compare API 与缓存失效 | 面向消费端的核心接口 |
| M | 实现变更重算能力 | 匹配逻辑调整后可按单版本对或全文档批量重跑，无需重新导入节点 |
| M | 建样本集做阈值调优 | 提升识别质量 |
| M | 接入前端时间线和审核后台 | 形成完整使用闭环 |
| L | 接入全文检索与统计分析 | 可在主链路稳定后补上 |

## 里程碑定义

| 里程碑 | 完成条件 |
|--------|----------|
| M1 设计冻结 | P0 完成，字段和状态定义稳定 |
| M2 数据可落库 | P1 完成，数据库结构可迁移 |
| M3 可导入单版本 | P2、P3 完成，可成功导入并重跑 |
| M4 可输出基础 diff | P4 完成，相邻版本可比对 |
| M5 可审核复杂变更 | P5 完成，审核闭环打通 |
| M6 v1 可交付 | P6 完成，后端查询与对比能力可用 |
| M7 精度与体验增强 | P7、P8 逐步完成 |

## 风险与应对

| 风险 | 影响 | 应对策略 |
|------|------|----------|
| 状态字段设计不清 | 后续实现大量返工 | 先完成 P0，再进入开发 |
| 解析结果不稳定 | 实体匹配和 diff 全部失真 | 为 parser 建立样例回归集 |
| 派生字段漂移 | 查询结果不一致 | 所有写操作统一走导入 / 审核服务 |
| 相似度阈值不准 | 审核量过大或误判严重 | 用样本集做调参与分文档评估 |
| 复杂变更过早追求自动化 | 开发周期失控 | v1 先以审核优先策略落地 |
| 缓存失效不完整 | 用户看到旧结果 | 将缓存版本号和审核版本号绑定 |

## 完成顺序建议

1. 先修设计稿中的必须修改项
2. 再完成数据库 schema 与 parser
3. 然后打通导入、实体匹配、基础 diff
4. 接着补审核闭环和 compare API
5. 最后做阈值调优、前端展示与系统集成
