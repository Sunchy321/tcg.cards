# 卡牌知识智能体数据库与服务设计文档

---

## 1. 概述

目标是在现有仓库内构建一套“拥有卡牌知识”的智能体基础设施，支持 Magic 与 Hearthstone 各自独立的智能体，并为后续统一多游戏智能体预留扩展路径。

该方案不复制现有卡牌主数据，而是在现有数据库上补一层智能体知识索引与受控服务层，使模型能够基于结构化事实、规则文档和裁定证据进行高精度、可追溯、接近实时的回答。

### 1.1 设计目标

- 复用现有 `magic`、`hearthstone` 主领域表作为权威事实源
- 保持 PostgreSQL 作为唯一数据库，事实数据与向量索引统一存放在 PG 中
- 在 `*_data` 中新增智能体派生索引层，不污染主领域表
- 在 `*_app` 中隔离会话、反馈、工具调用等运行态数据
- 模型只能通过应用内受控服务层访问知识，不直接执行 SQL
- 复用 Cloudflare 的模型推理能力在线生成 embedding，而不引入 Cloudflare 向量数据库作为第二主存储
- 输出必须可追溯到卡牌、规则节点、裁定或版本来源
- 支持增量重建索引，实现接近实时的知识刷新

### 1.2 非目标

- v1 不做模型直连数据库
- v1 不重构现有卡牌主 schema，不建立跨游戏统一底层总表
- v1 不将大量卡牌知识直接硬编码进提示词
- v1 不提供自动写回规则或卡牌主数据的能力
- v1 不引入 Cloudflare Vectorize 等外部向量数据库作为默认方案
- v1 不优先建设对外公开 API，先完成应用内服务层

---

## 2. 现有基础与复用边界

### 2.1 Magic 现有权威事实源

- `Card`、`CardLocalization`、`CardPart`、`CardPartLocalization`、`CardView`
- `Print`、`PrintPart`、`CardPrintView`
- `Ruling`
- `DocumentDefinition`、`DocumentVersion`、`DocumentNode`、`DocumentNodeContent`、`DocumentNodeChange`
- `CardRelation`
- `Deck`、`StaticDeck`

### 2.2 Hearthstone 现有权威事实源

- `Card`
- `Entity`、`EntityLocalization`、`EntityView`、`CardEntityView`
- `CardRelation`
- `Patch` 及相关版本上下文读模型

### 2.3 现有服务与搜索层

- Magic 已具备 ORPC 的卡牌、搜索、文档、牌组查询入口
- Hearthstone 已具备 ORPC 的卡牌与版本查询入口
- `packages/search` 已提供受控搜索 DSL 和 SQL 生成能力
- `apps/watcher` 已具备来源变化检测与任务触发范式

### 2.4 设计边界

数据库继续承担“权威事实存储”和“派生知识索引”的角色；模型推理、工具编排和答案生成全部放在应用服务层，避免数据库结构被智能体实现细节绑死。

---

## 3. 总体架构

```
用户问题
  -> 游戏智能体（magic / hearthstone / unified）
  -> 工具编排层
  -> 应用内知识服务层
  -> Cloudflare embedding 模型（仅在需要语义检索时生成 query embedding）
  -> PostgreSQL 结构化查询 + PostgreSQL 向量检索
  -> evidence bundle
  -> 模型生成带引用答案
```

### 3.1 三层数据分工

#### 主领域层：`magic` / `hearthstone`

存放卡牌、印刷版、裁定、规则文档、版本化实体等权威事实。

#### 派生索引层：`magic_data` / `hearthstone_data`

存放切块、embedding、索引任务、来源校验和、对象映射等派生数据。embedding 作为派生索引统一回写 PostgreSQL，不额外引入第二套向量数据库。

#### 运行态层：`magic_app` / `hearthstone_app`

存放会话、消息、工具轨迹、反馈、用户偏好等应用状态。

### 3.2 智能体分层

- 每个游戏一个独立智能体
- 后续统一智能体只做服务层路由，不改造底层数据库分层
- 每个智能体优先调用本游戏的结构化知识工具，必要时再做语义召回

---

## 4. 数据库设计

## 4.1 设计原则

- 不复制已有卡牌主数据
- 所有可重建的数据放入 `*_data`
- 所有用户交互态数据放入 `*_app`
- 所有可引用证据必须能回溯到源对象主键或版本键
- 所有索引必须支持按 checksum / version 做增量失效和重建

## 4.2 `*_data` 派生知识表

以下表在 `magic_data` 和 `hearthstone_data` 下分别各建一套，表结构保持一致，便于每个游戏独立演进。

### 4.2.1 `knowledge_sources`

表示一个可被智能体引用、切块和索引的知识源对象。

建议字段：

- `id`：主键
- `sourceType`：来源类型，如 `card`、`ruling`、`document_node`、`entity`、`patch_note`
- `sourceKey`：来源对象主键，如 `cardId`、`documentNodeId`
- `versionKey`：版本标识，如 `versionTag`、规则文档版本、Hearthstone 版本号
- `locale`：语言或地区
- `title`：展示标题
- `checksum`：来源内容校验值
- `status`：`pending` / `ready` / `stale` / `failed`
- `metadata`：JSON 扩展信息
- `lastIndexedAt`
- `invalidatedAt`
- `createdAt`
- `updatedAt`

约束建议：

- 唯一键：`(sourceType, sourceKey, versionKey, locale)`
- 索引：`status`、`checksum`、`updatedAt`

### 4.2.2 `knowledge_chunks`

表示从一个知识源切出的文本块，是语义检索和证据组织的核心单元。

建议字段：

- `id`：主键
- `sourceId`：关联 `knowledge_sources`
- `chunkIndex`：块序号
- `chunkKind`：如 `summary`、`oracle_text`、`ruling`、`rule_section`、`patch_note`
- `text`：原始文本
- `normalizedText`：标准化后文本
- `tokenCount`
- `checksum`
- `citations`：JSON 数组，记录源引用片段
- `metadata`：JSON 扩展字段
- `createdAt`
- `updatedAt`

约束建议：

- 唯一键：`(sourceId, chunkIndex)`
- 索引：`sourceId`、`chunkKind`

### 4.2.3 `knowledge_embeddings`

表示某个 chunk 的向量结果。该表默认存放在 PostgreSQL 中，并作为唯一向量索引来源。Cloudflare 仅提供 embedding 推理，不承担向量存储职责。

默认方案：

- PostgreSQL 启用 `pgvector`
- 默认 embedding 模型使用 Cloudflare Workers AI 的 `@cf/baai/bge-m3`
- 默认向量维度固定为 `1024`
- 默认距离度量使用 cosine distance
- 默认索引类型使用 HNSW，操作符使用 `vector_cosine_ops`

建议字段：

- `id`：主键
- `chunkId`：关联 `knowledge_chunks`
- `provider`：embedding 提供方
- `model`：embedding 模型名
- `modelVersion`：模型版本或固定快照标识
- `dimensions`
- `embedding`：向量列，默认使用 pgvector
- `checksum`：与 chunk 对应的校验值
- `indexedAt`
- `createdAt`

约束建议：

- 唯一键：`(chunkId, provider, model)`
- 索引：`chunkId`
- 向量索引：基于 `embedding` 建立 pgvector 相似检索索引

索引建议：

- 列定义：`vector(1024)`
- 查询操作：优先使用 cosine distance
- 索引方式：`USING hnsw (embedding vector_cosine_ops)`
- 召回策略：先取向量 Top K，再回 PG 做版本、locale、sourceType 过滤与证据补全

### 4.2.4 `knowledge_index_jobs`

表示知识索引增量任务。

建议字段：

- `id`：主键
- `sourceType`
- `sourceKey`
- `versionKey`
- `locale`
- `triggerType`：`import` / `watcher` / `manual` / `repair`
- `status`：`queued` / `running` / `completed` / `failed` / `cancelled`
- `priority`
- `attempts`
- `payload`：JSON 参数
- `error`
- `scheduledAt`
- `startedAt`
- `finishedAt`
- `createdAt`
- `updatedAt`

约束建议：

- 索引：`status`、`scheduledAt`
- 去重键：可按 `(sourceType, sourceKey, versionKey, locale, status in queued/running)` 控制并发重复任务

### 4.2.5 `knowledge_source_links`

用于把知识源或 chunk 显式映射回领域对象，便于证据回溯和跨实体跳转。

建议字段：

- `id`：主键
- `sourceId`
- `chunkId`：可空，表示精确到 chunk 的链接
- `targetType`：如 `card`、`print`、`ruling`、`document_node`、`entity`、`patch`
- `targetKey`
- `targetLocale`
- `targetVersionKey`
- `relationType`：如 `primary`、`mentions`、`explains`、`recommends`
- `metadata`

约束建议：

- 索引：`targetType + targetKey`、`sourceId`

## 4.3 `*_app` 运行态表

仅在需要保留对话和反馈时引入，避免过早扩大范围。

### 4.3.1 `agent_sessions`

- `sessionId`
- `userId`
- `agentType`
- `game`
- `title`
- `context`
- `createdAt`
- `updatedAt`

### 4.3.2 `agent_messages`

- `messageId`
- `sessionId`
- `role`
- `content`
- `evidenceBundle`
- `latencyMs`
- `createdAt`

### 4.3.3 `agent_tool_calls`

- `toolCallId`
- `sessionId`
- `messageId`
- `toolName`
- `input`
- `output`
- `status`
- `latencyMs`
- `createdAt`

### 4.3.4 `agent_feedback`

- `feedbackId`
- `sessionId`
- `messageId`
- `userId`
- `rating`
- `label`
- `comment`
- `createdAt`

---

## 5. 证据模型设计

智能体回答必须围绕统一的 evidence bundle 构建，而不是让模型自由拼接来源。

### 5.1 evidence item 结构

建议统一包含：

- `game`
- `sourceType`
- `sourceKey`
- `versionKey`
- `locale`
- `title`
- `snippet`
- `citation`
- `score`
- `metadata`

### 5.2 引用要求

- 卡牌事实回答至少引用 `cardId` 或 `entity cardId`
- 规则解释至少引用 `document versionTag + nodeId` 或 `ruling source + date`
- 版本问题至少引用 Hearthstone `version`
- 构筑建议中的每个关键推荐都要能回溯到已有事实或规则证据

### 5.3 无证据处理

若 evidence bundle 无法支撑结论，服务层应要求模型输出“不足以确定”或请求补充条件，不能直接生成肯定性答案。

---

## 6. 数据库与智能体的连接方式

## 6.1 总原则

模型不直接访问数据库。数据库只通过应用内受控服务暴露为工具。PostgreSQL 既承担权威事实存储，也承担向量索引存储；Cloudflare 只承担模型推理职责。

## 6.2 服务层结构

每个游戏新增一组智能体知识服务，建议继续基于现有 ORPC 组织：

- Magic：`apps/site-magic/server/orpc/magic/agent.ts`
- Hearthstone：`apps/site-hearthstone/server/orpc/hearthstone/agent.ts`

若后续跨站点复用增多，再抽到独立 package。

## 6.3 工具列表

### Magic 工具

- `search_cards`
- `get_card_summary`
- `get_card_full`
- `get_related_cards`
- `get_rulings`
- `get_rule_sections`
- `semantic_search_rules`
- `recommend_deck_candidates`

### Hearthstone 工具

- `search_cards`
- `get_card_summary`
- `get_card_full`
- `get_related_cards`
- `get_patch_context`
- `semantic_search_patch_notes`
- `recommend_deck_candidates`

### Unified 工具编排

- 根据显式游戏参数或问题分类决定路由目标
- 统一证据结构，不统一底层数据库 schema

## 6.4 连接流程

```
LLM
  -> tool call
  -> ORPC knowledge service
  -> 如需语义检索则调用 Cloudflare embedding 模型生成 query embedding
  -> Drizzle 查询现有主表 / 查询 knowledge_* 派生表 / 查询 PG 向量索引
  -> 返回结构化结果 + evidence bundle
  -> LLM 生成最终答案
```

## 6.5 向量生成职责划分

- 用户问题的 query embedding 在请求时在线生成，优先服务语义召回
- 知识库文本的 document embedding 不放在用户请求链路中，而是通过异步任务生成后回写 PG
- Cloudflare 模型调用只负责返回 embedding 向量，不负责保存或管理向量索引

默认运行约定：

- query embedding 模型：`@cf/baai/bge-m3`
- document embedding 模型：`@cf/baai/bge-m3`
- query embedding 超时：`1500ms`
- document embedding 单次任务超时：`15000ms`
- query embedding 重试：请求链路不自动重试，失败后直接降级为纯结构化检索
- document embedding 重试：最多 `3` 次，指数退避
- 可选 rerank 模型：`@cf/baai/bge-reranker-base`

## 6.6 结构化优先策略

优先级如下：

1. 精确主键或名称命中
2. 结构化搜索 DSL 命中
3. 规则节点或裁定精确查询
4. 向量召回补充长文本上下文
5. 模型生成归纳答案

该顺序保证回答先基于确定性事实，再使用语义检索补充上下文。

默认召回流程：

1. 先做结构化命中和版本过滤
2. 在线生成 query embedding
3. 对 `knowledge_embeddings` 做 Top 20 相似检索
4. 回 PG 对候选结果做 `game`、`sourceType`、`versionKey`、`locale` 过滤
5. 必要时使用 reranker 做 Top 5 重排
6. 将最终候选整理成 evidence bundle

---

## 7. 索引与更新链路

## 7.1 触发来源

- 数据导入完成
- 规则文档导入完成
- watcher 发现源站版本变化
- 人工重建或修复任务

## 7.2 增量流程

1. 发现源对象或版本变化
2. 基于 `sourceType + sourceKey + versionKey + locale` 计算 checksum
3. 若 checksum 变化，则写入 `knowledge_index_jobs`
4. worker 或队列消费者读取 PG 原文，执行切块、映射，并调用 Cloudflare embedding 模型生成向量
5. 将向量回写 `knowledge_embeddings`，并失效旧记录
6. 更新 `knowledge_sources.status = ready`
7. 记录 `lastIndexedAt`

默认批处理策略：

- 单批次 document embedding 文本数控制在模型和任务超时允许范围内
- 大型规则文档按节点拆任务，不做整本文档单任务嵌入
- 同一 `sourceType + sourceKey + versionKey + locale + checksum + modelVersion` 只保留一份最新向量结果

## 7.3 失效策略

- 同一来源对象新版本到达时，旧 `knowledge_sources` 标记为 `stale`
- 旧 chunk 和 embedding 不立即物理删除，可延后清理
- 查询默认只读取 `ready` 且非 `stale` 的最新记录

## 7.4 接近实时目标

v1 目标不是严格实时，而是“导入完成后尽快可查”。

建议目标：

- 单对象增量索引：分钟级
- 规则文档版本级重建：可接受更长，但要可追踪进度

---

## 8. 分阶段实施建议

### 阶段 A：精确检索能力

- 固化证据模型
- 包装现有 ORPC 查询为智能体工具
- 支持卡牌事实问答与规则引用问答

### 阶段 B：派生知识索引

- 新增 `knowledge_*` 表
- 实现切块、映射、Cloudflare embedding 推理回写 PG 与增量任务
- 支持语义召回和长文本规则解释

### 阶段 C：运行态与反馈

- 引入 `agent_session`、`agent_message`、`agent_tool_call`、`agent_feedback`
- 建立质量回流与人工诊断闭环

### 阶段 D：统一多游戏智能体

- 实现跨游戏工具路由与证据标准化
- 保持数据库仍按游戏拆分，不做底层总表

---

## 9. 风险与应对

### 9.1 关系语义不稳定

`CardRelation.relation` 当前是自由文本，建议在服务层先维护允许值清单，后续再考虑 schema 级枚举化。

### 9.2 向量存储能力不确定

若 PostgreSQL 未启用 pgvector，则首期只交付结构化检索，不进入正式向量检索阶段。启用 pgvector 后，再接入 Cloudflare embedding 推理与 PG 向量索引。

### 9.3 Cloudflare 模型推理的外部依赖风险

query embedding 在线生成、document embedding 异步生成都依赖 Cloudflare 模型服务，因此需要额外处理超时、重试、限流、成本和模型版本固定。

默认应对策略：

- 固定模型 ID 为 `@cf/baai/bge-m3`
- 在 schema 中记录 `provider`、`model`、`modelVersion`、`dimensions`
- query embedding 失败时直接降级到结构化检索，不阻塞主请求
- document embedding 失败时保留任务状态并进入重试，不污染已生效索引
- 若后续切换模型或维度，采用并行重建新索引而不是原地覆盖旧索引

### 9.4 多版本文本混用风险

Hearthstone 与规则文档均存在版本维度，必须在 evidence bundle 中显式带出版本键，禁止服务层自动混合。

### 9.5 智能体幻觉风险

通过“结构化优先 + evidence bundle + 无证据拒答”控制，而不是依赖提示词约束。

---

## 10. 结论

该方案的核心不是建立一套新的卡牌数据库，而是在现有卡牌数据库上增加一层可增量更新、可追溯引用、可被受控工具访问的知识索引与服务层。

对当前仓库而言，最重要的决策有三项：

- 主事实继续留在 `magic` / `hearthstone`
- 派生知识索引进入 `magic_data` / `hearthstone_data`
- PostgreSQL 同时承担事实存储与向量存储，Cloudflare 仅负责 embedding 推理
- 模型只能通过应用内知识服务层访问数据库

在此基础上，可以先交付每个游戏独立智能体，再稳定扩展到统一多游戏智能体。
