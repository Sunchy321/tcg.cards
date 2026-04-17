# 卡牌知识智能体实施计划表

## TODO List

- [ ] 固化每个游戏的权威知识源与证据模型
- [ ] 为 `magic_data` 与 `hearthstone_data` 设计并落地 `knowledge_*` 表与迁移
- [ ] 确认 PostgreSQL 向量存储实现与 Cloudflare embedding 模型契约
- [ ] 为每个游戏实现第一批结构化知识工具
- [ ] 为每个游戏实现派生知识索引构建与增量刷新链路
- [ ] 引入统一 `evidence bundle` 与答案编排层
- [ ] 视需要落地 `*_app` 运行态表与反馈闭环
- [ ] 实现统一多游戏智能体的服务层路由
- [ ] 完成精度、可追溯性、时效性验证

## 目标

基于 `docs/agent-knowledge-design.md` 的设计，在不改造现有主卡牌数据库结构的前提下，完成卡牌知识智能体的数据库分层、知识服务层、索引更新链路和验证闭环。

首期交付目标分为三部分：

1. **单游戏智能体可用**：Magic 与 Hearthstone 各自拥有独立的受控知识工具，可回答卡牌事实问题、规则解释问题和基础构筑建议问题。
2. **知识索引可维护**：`*_data` 层具备切块、embedding、索引任务、来源映射和增量失效能力。
3. **答案可追溯**：所有回答都能回溯到卡牌、规则节点、裁定或版本上下文。

## 实施原则

- 先精确检索，再语义召回，最后再补运行态与统一智能体
- 优先复用现有 ORPC、Drizzle、Zod 和搜索 DSL
- 不复制现有卡牌主数据，不在主表中塞入智能体运行态字段
- 每个阶段完成后都要可以独立验证
- 证据链先于模型生成，证据不足时拒答优先于猜测

## 阶段计划

| 阶段 | 目标 | 核心任务 | 输出物 | 依赖 | 验收标准 |
|------|------|----------|--------|------|----------|
| P0 事实与证据建模 | 固化智能体依赖的事实源和返回契约 | 明确 Magic 与 Hearthstone 各自的权威来源；定义统一 `evidence bundle`；固定默认 embedding 模型、维度、距离度量、超时与降级策略 | Zod 契约、服务层约定、引用格式约定 | 无 | 不同游戏工具可输出统一 evidence 结构；关键回答都能回溯到源对象 |
| P1 派生知识表 | 在 `*_data` 中落地智能体索引底座 | 创建 `knowledge_sources`、`knowledge_chunks`、`knowledge_embeddings`、`knowledge_index_jobs`、`knowledge_source_links`；补充 pgvector 列、HNSW 索引、唯一键与迁移 | Drizzle schema 与迁移文件 | P0 | 数据库可承载来源、切块、embedding、任务和来源映射 |
| P2 结构化知识工具 | 优先交付高精度查询能力 | 包装现有 card/search/document/ruling/patch 查询为智能体工具；补充输入输出 Zod；统一 evidence 生成 | Magic 与 Hearthstone 的第一批知识工具 | P0 | 可以稳定回答卡牌事实问答、版本问答、规则节点查询 |
| P3 语义索引与召回 | 增加长文本解释与模糊检索能力 | 固定 `@cf/baai/bge-m3` 与 `1024` 维；实现切块、embedding、PG 相似检索；接入规则文档、裁定、补丁说明等长文本 | 向量索引能力、语义检索工具 | P1, P2 | 能基于语义召回补充规则解释，但仍保留证据链 |
| P4 增量刷新链路 | 让知识随数据更新而快速同步 | 将导入或 watcher 变化转成 `knowledge_index_jobs`；实现索引 worker；异步调用 Cloudflare 模型生成 document embedding 并回写 PG；支持 checksum 级失效和重建 | 增量索引流水线 | P1, P3 | 数据变更后，只重建受影响来源，且可追踪状态 |
| P5 运行态与反馈 | 建立可诊断的会话闭环 | 视业务需要新增 `agent_sessions`、`agent_messages`、`agent_tool_calls`、`agent_feedback`；保存工具轨迹与人工反馈 | 运行态表和调试闭环 | P2 | 能追踪问题、工具调用与用户反馈 |
| P6 统一多游戏智能体 | 支持单入口跨游戏路由 | 建立游戏路由器；统一包装每个游戏工具输出；避免跨游戏混查数据库 | 服务层统一智能体 | P2, P4 | 同一入口可按游戏路由调用工具，且引用结构一致 |
| P7 验证与收敛 | 验证精度、时效和可追溯性 | 编写端到端场景验证；验证拒答逻辑、版本隔离、更新延迟、证据完整性 | 验证用例与验收记录 | P2-P6 | 满足精度、可追溯性和时效性目标 |

## 任务拆解

### P0 事实与证据建模

| 序号 | 任务 | 说明 |
|------|------|------|
| 0.1 | 梳理 Magic 权威知识源 | 固定 `Card`、`CardPrintView`、`Ruling`、`Document*`、`CardRelation` 的智能体使用边界 |
| 0.2 | 梳理 Hearthstone 权威知识源 | 固定 `CardEntityView`、版本上下文、relation、patch 相关读模型 |
| 0.3 | 定义 `evidence bundle` | 明确 `game`、`sourceType`、`sourceKey`、`versionKey`、`locale`、`snippet`、`citation`、`score` |
| 0.4 | 固定默认向量契约 | 默认模型 `@cf/baai/bge-m3`、维度 `1024`、距离度量 cosine、query 超时 `1500ms`、document embedding 超时 `15000ms` |
| 0.5 | 定义工具返回契约 | 每个工具必须带 evidence，避免自由文本直出 |

### P1 派生知识表

| 序号 | 任务 | 说明 |
|------|------|------|
| 1.1 | 新增 `knowledge_sources` schema | 记录来源对象、版本、checksum、状态 |
| 1.2 | 新增 `knowledge_chunks` schema | 记录切块文本、token 量、citation |
| 1.3 | 新增 `knowledge_embeddings` schema | 使用 pgvector 存储 `vector(1024)`，并记录 provider、model、modelVersion、dimensions |
| 1.4 | 新增 `knowledge_index_jobs` schema | 支持队列、重试、失败信息和状态追踪 |
| 1.5 | 新增 `knowledge_source_links` schema | 映射回卡牌、规则节点、裁定、补丁等领域对象 |
| 1.6 | 编写迁移与索引 | 补齐唯一键、状态索引、HNSW 向量索引和查询索引 |

### P2 结构化知识工具

| 序号 | 任务 | 说明 |
|------|------|------|
| 2.1 | 实现 Magic `search_cards` | 复用现有搜索 DSL 与 ORPC 搜索入口 |
| 2.2 | 实现 Magic `get_card_summary` / `get_card_full` | 复用现有 card summary/full 查询，补齐 evidence |
| 2.3 | 实现 Magic `get_rulings` / `get_rule_sections` | 复用 rulings 与 document reader，按节点返回证据 |
| 2.4 | 实现 Hearthstone `search_cards` / `get_card_summary` / `get_card_full` | 复用版本化实体查询逻辑 |
| 2.5 | 实现 Hearthstone `get_patch_context` | 输出与版本、补丁相关的证据块 |
| 2.6 | 实现 `recommend_deck_candidates` 基础版 | 基于已有 card、relation、format、deck 数据做可解释推荐 |

### P3 语义索引与召回

| 序号 | 任务 | 说明 |
|------|------|------|
| 3.1 | 确认向量存储实现 | 固定 pgvector、`1024` 维、cosine distance 与 HNSW 索引策略 |
| 3.2 | 实现切块策略 | 卡牌说明、裁定、规则节点、补丁说明分别定义切块规则 |
| 3.3 | 接入 Cloudflare embedding 模型 | 使用 `@cf/baai/bge-m3` 为 query embedding 提供在线生成能力，并为 document embedding 提供异步生成能力 |
| 3.4 | 实现 embedding 回写与 PG 相似检索 | 为 `knowledge_chunks` 生成向量并回写 `knowledge_embeddings`，基于 PG 执行相似检索 |
| 3.5 | 实现语义检索工具 | 如 `semantic_search_rules`、`semantic_search_patch_notes` |
| 3.6 | 实现可选 rerank | 视质量需要引入 `@cf/baai/bge-reranker-base` 做候选重排 |
| 3.7 | 合并结构化与语义结果 | 所有召回结果统一落成 evidence bundle |

### P4 增量刷新链路

| 序号 | 任务 | 说明 |
|------|------|------|
| 4.1 | 定义索引任务触发协议 | 导入成功、watcher 更新、人工重建都转成 `knowledge_index_jobs` |
| 4.2 | 实现索引 worker | 拉取任务、切块、调用 Cloudflare 模型生成 embedding、回写 PG、更新状态 |
| 4.3 | 实现失效逻辑 | 同源对象新版本到达时标记旧索引 `stale` |
| 4.4 | 实现修复与重放 | 支持失败任务重试和人工重建 |

### P5 运行态与反馈

| 序号 | 任务 | 说明 |
|------|------|------|
| 5.1 | 新增 `agent_sessions` | 保存会话级上下文 |
| 5.2 | 新增 `agent_messages` | 保存消息和 evidence bundle |
| 5.3 | 新增 `agent_tool_calls` | 保存工具输入输出和状态 |
| 5.4 | 新增 `agent_feedback` | 保存人工评分与问题标签 |

### P6 统一多游戏智能体

| 序号 | 任务 | 说明 |
|------|------|------|
| 6.1 | 定义游戏路由器 | 显式游戏参数优先，分类兜底 |
| 6.2 | 统一工具输出结构 | 确保 Magic 与 Hearthstone 都输出同构 evidence |
| 6.3 | 实现统一入口 | 单入口编排不同游戏工具，不改数据库 schema |

### P7 验证与收敛

| 序号 | 任务 | 说明 |
|------|------|------|
| 7.1 | 验证卡牌事实问答 | 核对是否能回溯到 card/card_view 或 card_entity_view |
| 7.2 | 验证规则解释 | 核对是否能回溯到 document 节点或 ruling |
| 7.3 | 验证版本隔离 | Hearthstone 与规则文档不得混用不同版本证据 |
| 7.4 | 验证构筑建议 | 推荐必须可解释，不得输出无证据推荐 |
| 7.5 | 验证时效性 | 更新后仅重建受影响来源，且索引延迟可观测 |
| 7.6 | 验证拒答逻辑 | 证据不足、歧义冲突、索引滞后时必须拒答或请求补充 |

## 关键实现决策

- 权威事实继续放在 `magic` / `hearthstone`，不复制主卡牌数据
- 派生知识索引统一落在 `magic_data` / `hearthstone_data`
- PostgreSQL 同时承担事实存储与向量存储，Cloudflare 仅提供 embedding 推理能力
- 运行态数据只在需要时进入 `magic_app` / `hearthstone_app`
- 模型不直接连数据库，所有访问都通过受控工具与 ORPC 服务层完成
- query embedding 在线生成，document embedding 异步生成，不把文本侧 embedding 构建放进用户请求链路
- 默认 embedding 模型固定为 `@cf/baai/bge-m3`，默认维度固定为 `1024`
- query embedding 失败时降级为纯结构化检索，document embedding 失败时进入异步重试
- 先落结构化检索与证据链，再增加语义召回，不反过来做

## 验收标准

### 功能验收

- Magic 与 Hearthstone 各自具备独立知识工具
- 智能体能回答卡牌事实、规则解释和基础构筑建议问题
- 每个回答都具备明确 evidence bundle

### 数据验收

- `knowledge_*` 表能承载来源、切块、embedding、任务和映射关系
- `knowledge_embeddings` 能在 PostgreSQL 中稳定存储并执行相似检索
- 索引任务支持失败重试和状态追踪
- 旧版本索引可被显式失效或回收

### 质量验收

- 证据不足时拒答而不是猜测
- 版本问题不混用不同版本文本
- 更新链路达到“导入完成后尽快可查”的目标

## 建议实施顺序

1. 先做 P0 和 P2，快速交付结构化问答能力。
2. 再做 P1 和 P3，补齐索引和语义检索底座。
3. 接着做 P4，解决接近实时更新。
4. 最后按业务需要推进 P5 和 P6。
