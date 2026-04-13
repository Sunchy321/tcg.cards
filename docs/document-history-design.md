# 万智牌文档更新历史系统设计文档（修订版）

---

## 1. 概述

目标是追踪多个万智牌官方文档的历史变更。每类文档独立维护版本、节点、实体与变更记录，支持检测新增、删除、修改、移动、重命名、拆分、合并等变更，并提供任意两个版本的对比能力。

本版修订重点解决以下问题：

- 统一 `versionId` / `nodeId` / `entityId` 的命名边界
- 补齐唯一约束、外键约束、缓存失效与审核闭环
- 将复杂变更关系从 `details JSON` 中拆出，便于审核与修正
- 将匹配算法从“示意代码”收敛为“可实现流程”

### 1.1 设计目标

- 支持 `CR`、`MTR`、`IPG` 等多文档长期追踪
- 支持单节点历史查询和任意两版本对比
- 允许自动识别 + 人工复核并存
- 允许后续接入翻译状态和全文检索

### 1.2 非目标

- v1 不追求完全自动识别所有 split / merge
- v1 不做跨文档自动实体映射
- v1 不做复杂语义级 diff，只做结构化文本级 diff

---

## 2. 核心概念

### 2.1 DocumentDefinition（文档定义）

代表一个被系统长期追踪的官方文档序列，例如：

- `magic-cr`：Comprehensive Rules
- `magic-mtr`：Magic Tournament Rules
- `magic-ipg`：Infraction Procedure Guide

```typescript
interface DocumentDefinition {
  id: string;                    // Stable ID, e.g. "magic-cr"
  slug: string;                  // URL-friendly slug
  name: string;                  // Display name
  game: 'magic';                 // Expandable later
  sourceLocale: string;          // Source locale, e.g. "en"
  parserStrategy: string;        // Parser strategy, e.g. "cr-txt-v1"
  nodeIdPattern: string | null;  // Document-specific node ID pattern
  status: 'active' | 'archived';
  createdAt: string;
}
```

**作用：**
- 区分不同文档序列，避免版本号和实体空间冲突
- 为每类文档绑定独立解析器、匹配策略和导入入口
- 所有版本对比、历史查询、导入流程都必须带 `documentId`

### 2.2 Node ID（文档节点编号）

`nodeId` 是从文档文本中提取的官方编号或结构编号。不同文档可有不同格式。

```text
[chapter].[rule][subrule]
```

**示例：**
- `100.1`
- `100.1a`
- `702.1`

**说明：**
- 对 `Comprehensive Rules`，可直接沿用官方规则编号
- 对其他文档，可使用章节号、条款号、附录号等结构化编号
- 如果某类文档没有稳定编号，则由解析器生成版本内稳定 `nodeId`
- 对少数“标题 + 正文”结构的 section，采用“兄弟节点”方案：
  - `intro.title`
  - `intro.content`
- `Glossary` 仍按 term 存储，每个 `word + meaning` 是一个独立节点
- 独立 `Example` 块必须拆为单独的 `example` 节点，不并入相邻 `content`

**提取方式：**
```typescript
const nodeRegex = /^(\d+\.\d+[a-z]?)\.\s+(.+)$/;
// Match "100.1. ..."
```

### 2.2.1 Example 节点解析规则

对文档中独立出现、并以 `Example` 开头的内容块，采用单独节点建模：

- `nodeKind = 'example'`
- 不并入前后普通 `content` 节点
- 与最近的上级条目建立层级关系，便于展示时挂载

**建议编号：**
- `702.1.example.1`
- `702.1.example.2`
- `intro.example.1`

**建议路径：**
- `702/1/example/1`
- `meta/intro/example/1`

**统一约束：**
- `example` 节点的 `path` 必须始终挂在父节点之下
- 不再使用 `examples/1` 这类脱离父级的全局路径
- `Example` 行本身属于示例正文，不额外拆 `heading`
- 连续多行示例文本合并为同一个 `example` 节点

### 2.3 Entity ID（实体标识）

`entityId` 用于跨版本追踪同一逻辑节点的永久唯一标识，不随官方编号变化而变化。

```typescript
const entityId = 're_01HTX9A7M2...';
```

**配套元数据：**
- `documentId`
- `originVersionId`
- `originNodeId`

**优点：**
- 标识稳定，不受历史回填、误判修正影响
- 与展示编号解耦，后续更容易迁移和重算

---

## 3. 存储架构

### 3.1 数据库表结构

#### DocumentVersion（文档版本）

代表某个被追踪文档的一次官方发布。

```typescript
interface DocumentVersion {
  id: string;                    // Stable ID, e.g. "magic-cr:20240328"
  versionTag: string;            // Official tag, e.g. "20240328"
  documentId: string;            // Parent document ID
  effectiveDate: string;         // Effective date
  publishedAt: string;           // Publish date
  urls: {
    txt: string | null;
    pdf: string | null;
    docx: string | null;
  };
  totalNodes: number;
  importedAt: string;
  status: 'active' | 'superseded';
}
```

#### DocumentNode（版本内节点）

某个版本中一个节点的具体结构与实体映射。

```typescript
interface DocumentNode {
  id: string;                    // "{versionId}/{nodeId}", e.g. "magic-cr:20240328/702.1"
  versionId: string;             // Parent version ID
  documentId: string;            // Parent document ID
  nodeId: string;                // Official or generated node ID
  nodeKind: 'heading' | 'term' | 'content' | 'example';

  path: string;                  // Materialized path, e.g. "702/1"
  level: number;                 // 0=chapter, 1=rule, 2=subrule
  parentNodeId: string | null;   // Parent DocumentNode.id
  siblingOrder: number;          // Stable order inside the same parent

  sourceContentHash: string | null;
  sourceFingerprintHash: string | null;
  sourceContentRefId: string | null;

  entityId: string;              // Cross-version stable entity ID
  createdAt: string;
}
```

**层级示例：**
```text
702                    -> chapter node
702/title              -> 702.title
702/1                  -> 702.1
702/1/a                -> 702.1a
702/1/example/1        -> 702.1.example.1
meta/intro/title       -> intro.title
meta/intro/content     -> intro.content
meta/intro/example/1   -> intro.example.1
glossary/deathtouch    -> glossary.deathtouch
```

#### DocumentNodeEntity（跨版本实体）

用于跨版本追踪同一个逻辑节点。

```typescript
interface DocumentNodeEntity {
  id: string;                    // Stable ID (ULID / UUID)
  documentId: string;

  originVersionId: string;       // First seen version
  originNodeId: string;          // First seen node ID

  currentNodeRefId: string;      // Current DocumentNode.id
  currentNodeId: string;         // Current node ID
  currentVersionId: string;      // Current version ID

  totalRevisions: number;
  createdAt: string;
  updatedAt: string;
}
```

**说明：**
- `currentNodeRefId / currentNodeId / currentVersionId` 属于“当前态缓存字段”，用于加速查询
- 当前态缓存不是唯一事实来源，必要时可由 `DocumentNode` 历史记录重建
- 所有导入和审核 override 必须同步维护当前态缓存，避免实体漂移

#### DocumentNodeContent（节点内容 / 本地化内容）

一条记录表示“某个节点在某个语言下的一份内容”。

```typescript
interface DocumentNodeContent {
  id: string;                    // UUID
  documentNodeId: string;        // Parent DocumentNode.id
  locale: string;                // e.g. "en", "zhs"
  content: Buffer;               // Gzip-compressed text
  contentHash: string;           // SHA256 of raw content
  fingerprintHash: string;       // SHA256 of normalized content
  size: number;                  // Raw byte size
  sourceContentHash: string;     // Source hash used for this record
  status: 'source' | 'draft' | 'reviewed' | 'published' | 'stale';
  createdAt: string;
  updatedAt: string;
}
```

**说明：**
- 源文本也存为一条 `DocumentNodeContent`
- 本地化文本按语言分别存储
- 当源文本变化时，旧翻译通过 `sourceContentHash` 比对后标记为 `stale`
- `DocumentNode.sourceContentRefId` 只是源文本内容的快捷引用，真正的正文事实来源仍是 `DocumentNodeContent`

#### DocumentNodeChange（相邻版本变更）

预计算的版本间变更主记录。

```typescript
interface DocumentNodeChange {
  id: string;                    // UUID
  documentId: string;
  fromVersionId: string;         // Old version ID
  toVersionId: string;           // New version ID

  entityId: string | null;       // Primary entity for simple changes
  fromNodeRefId: string | null;  // Old DocumentNode.id
  toNodeRefId: string | null;    // New DocumentNode.id

  type: ChangeType;
  confidenceScore: number;       // 0..1
  reviewStatus: 'auto' | 'needs_review' | 'confirmed' | 'rejected';

  details: {
    oldContentHash?: string;
    newContentHash?: string;
    diffPatch?: string;
    oldNodeId?: string;
    newNodeId?: string;
    oldPath?: string;
    newPath?: string;
    similarityScore?: number;
    note?: string;
  };

  createdAt: string;
  reviewedAt: string | null;
}

type ChangeType =
  | 'added'
  | 'removed'
  | 'modified'
  | 'moved'
  | 'renamed'
  | 'renamed_modified'
  | 'split'
  | 'merged';
```

#### DocumentNodeChangeRelation（复杂变更关系）

用于描述 `split` / `merged` 等多对多关系，避免全部塞进 `details JSON`。

```typescript
interface DocumentNodeChangeRelation {
  id: string;                    // UUID
  changeId: string;              // Parent DocumentNodeChange.id
  side: 'from' | 'to';
  entityId: string | null;
  nodeRefId: string | null;      // DocumentNode.id
  nodeId: string | null;         // Snapshot node ID for display
  weight: number | null;         // Contribution ratio or similarity
  sortOrder: number;
}
```

#### DocumentChangeReview（审核记录）

用于承载待人工确认队列与审核结论。

```typescript
interface DocumentChangeReview {
  id: string;                    // UUID
  changeId: string;              // Parent DocumentNodeChange.id
  status: 'pending' | 'confirmed' | 'rejected' | 'override';
  reason: string | null;
  reviewerId: string | null;
  reviewedAt: string | null;
  overridePayload: string | null; // JSON string of override result
  createdAt: string;
}
```

### 3.2 关系说明

```text
DocumentDefinition 1 --- n DocumentVersion
DocumentVersion    1 --- n DocumentNode
DocumentNode       1 --- n DocumentNodeContent
DocumentNodeEntity 1 --- n DocumentNode
DocumentNodeChange 1 --- n DocumentNodeChangeRelation
DocumentNodeChange 1 --- 0..1 DocumentChangeReview
```

**说明：**
- `DocumentNode` 连接“版本内结构”和“跨版本实体”
- `DocumentNodeContent` 只从属于 `DocumentNode`
- `DocumentNodeChange` 是变更主记录，复杂边由 `DocumentNodeChangeRelation` 表示
- 审核动作通过 `DocumentChangeReview` 留痕，而不是直接覆盖原始识别结果

### 3.2.1 冗余字段一致性原则

为兼顾查询性能，设计中保留了少量冗余字段，例如：

- `DocumentNode.documentId`
- `DocumentNode.sourceContentHash`
- `DocumentNode.sourceFingerprintHash`
- `DocumentNode.sourceContentRefId`
- `DocumentNodeEntity.currentNodeRefId / currentNodeId / currentVersionId`

统一约束：

- `DocumentVersion` + `DocumentNodeContent` 是结构和正文的主事实来源
- `DocumentNode` 上的源文本摘要字段属于派生缓存，必须由导入流程统一回写
- `DocumentNodeEntity.current*` 属于派生当前态，必须由实体匹配结果统一回写
- 禁止业务接口直接分别更新事实字段和派生字段，必须通过单一导入 / 审核服务写入
- 审核 override 后若修改实体归属，必须同步刷新受影响实体的 `current*` 字段

### 3.3 内容压缩

```typescript
const compressed = await gzip(nodeContent);
```

原则：

- 仅压缩正文，不压缩关键查询字段
- `contentHash` 与 `fingerprintHash` 基于原始文本计算
- 热路径查询尽量依赖元数据，避免频繁解压正文

### 3.4 唯一约束与索引

```sql
-- DocumentDefinition
CREATE UNIQUE INDEX uq_document_definition_slug
  ON DocumentDefinition(slug);

-- DocumentVersion
CREATE UNIQUE INDEX uq_document_version_tag
  ON DocumentVersion(documentId, versionTag);

-- DocumentNode
CREATE UNIQUE INDEX uq_document_node_version_node
  ON DocumentNode(versionId, nodeId);

CREATE INDEX idx_document_node_document_entity
  ON DocumentNode(documentId, entityId);

CREATE INDEX idx_document_node_version_path
  ON DocumentNode(versionId, path);

CREATE INDEX idx_document_node_parent
  ON DocumentNode(parentNodeId);

CREATE INDEX idx_document_node_version_fingerprint
  ON DocumentNode(versionId, sourceFingerprintHash);

-- DocumentNodeContent
CREATE UNIQUE INDEX uq_document_node_content_locale
  ON DocumentNodeContent(documentNodeId, locale);

CREATE INDEX idx_document_node_content_hash
  ON DocumentNodeContent(contentHash);

CREATE INDEX idx_document_node_content_source_hash
  ON DocumentNodeContent(sourceContentHash);

CREATE INDEX idx_document_node_content_status
  ON DocumentNodeContent(status);

-- DocumentNodeEntity
CREATE INDEX idx_document_node_entity_current
  ON DocumentNodeEntity(documentId, currentVersionId);

CREATE INDEX idx_document_node_entity_origin
  ON DocumentNodeEntity(documentId, originVersionId, originNodeId);

-- DocumentNodeChange
CREATE INDEX idx_document_node_change_version_pair
  ON DocumentNodeChange(documentId, fromVersionId, toVersionId);

CREATE INDEX idx_document_node_change_entity
  ON DocumentNodeChange(documentId, entityId);

CREATE INDEX idx_document_node_change_type
  ON DocumentNodeChange(documentId, type);

CREATE INDEX idx_document_node_change_review
  ON DocumentNodeChange(documentId, reviewStatus, confidenceScore);

-- DocumentNodeChangeRelation
CREATE INDEX idx_document_node_change_relation_change
  ON DocumentNodeChangeRelation(changeId, side, sortOrder);

-- DocumentChangeReview
CREATE UNIQUE INDEX uq_document_change_review_change
  ON DocumentChangeReview(changeId);
```

### 3.5 建议外键

- `DocumentVersion.documentId -> DocumentDefinition.id`
- `DocumentNode.versionId -> DocumentVersion.id`
- `DocumentNode.entityId -> DocumentNodeEntity.id`
- `DocumentNodeContent.documentNodeId -> DocumentNode.id`
- `DocumentNodeChange.fromNodeRefId -> DocumentNode.id`
- `DocumentNodeChange.toNodeRefId -> DocumentNode.id`
- `DocumentNodeChangeRelation.changeId -> DocumentNodeChange.id`
- `DocumentChangeReview.changeId -> DocumentNodeChange.id`

---

## 4. 变更检测算法

### 4.1 总体流程

采用“分阶段匹配 + 冲突仲裁 + 复杂变更补偿 + 人工复核”的流程。

```typescript
function detectChanges(oldNodes: DocumentNode[], newNodes: DocumentNode[]) {
  const state = createMatchState(oldNodes, newNodes);

  matchBySameNodeId(state);
  matchByExactContent(state);
  matchByExactFingerprint(state);
  matchBySimilarity(state);

  detectSplits(state);
  detectMerges(state);
  classifyResidualAddedRemoved(state);
  enqueueReviews(state);

  return state.changes;
}
```

### 4.2 匹配状态

```typescript
interface MatchState {
  oldById: Map<string, DocumentNode>;
  newById: Map<string, DocumentNode>;
  matchedOldIds: Set<string>;
  matchedNewIds: Set<string>;
  changes: DocumentNodeChange[];
}
```

关键原则：

- 每个节点最多参与一个“简单匹配”
- `split` / `merged` 只在剩余未匹配节点中检测
- 冲突必须显式仲裁，不能在循环中直接 `return`

### 4.3 分阶段匹配

#### 阶段 1：同 `nodeId` 匹配

- 若 `nodeId` 相同且 `contentHash` 相同，则记为 unchanged，不生成变更
- 若 `nodeId` 相同但 `contentHash` 不同，则记为 `modified`

#### 阶段 2：精确内容匹配

- `contentHash` 相同，`nodeId` 不同
- 若路径位置变化明显，则判为 `moved`
- 若路径接近但编号变化，则判为 `renamed`

#### 阶段 3：规范化指纹匹配

- 用于忽略空白、大小写、轻微标点变化
- 常见于格式修订、行宽变化、编号重排

#### 阶段 4：候选集相似度匹配

- 仅对未匹配节点执行
- 仅在受限候选集内比较
- 得分不足阈值则不自动归类

### 4.3.1 变更类型判定优先级

为避免同一对节点被同时解释为 `moved`、`renamed` 或 `renamed_modified`，统一采用如下互斥优先级：

1. `unchanged`
2. `modified`
3. `moved`
4. `renamed`
5. `renamed_modified`
6. `split`
7. `merged`
8. `added / removed`

判定规则：

- 同 `nodeId`：
  - 同 `contentHash` => `unchanged`
  - 不同 `contentHash` => `modified`
- 不同 `nodeId` 且同 `contentHash`：
  - 路径变化显著、结构位置变化明显 => `moved`
  - 路径接近、主要差异在编号或标题标签 => `renamed`
- 不同 `nodeId` 且 `fingerprintHash` 相同或高相似：
  - 若同时存在编号变化和正文轻微改动 => `renamed_modified`
- 当一个旧节点与多个新节点形成高覆盖关系时，`split` 覆盖前述简单类型
- 当多个旧节点与一个新节点形成高覆盖关系时，`merged` 覆盖前述简单类型
- 无法满足上述条件时，回退为 `added / removed`

补充原则：

- `moved` 强调“实体位置变化”，编号是否变化不是必要条件
- `renamed` 强调“编号或展示标识变化”，结构位置变化应较小
- 若同时发生大幅迁移和编号变化，默认归入 `renamed_modified` 或待审核，而不是强行判为 `moved`

### 4.4 指纹生成

```typescript
function generateFingerprint(content: string): string {
  const normalized = content
    .toLowerCase()
    .replace(/[.,;:!?()[\]"]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  return sha256(normalized);
}
```

### 4.5 候选集约束

```typescript
function collectCandidates(oldNode: DocumentNode, newNodes: DocumentNode[]): DocumentNode[] {
  return newNodes.filter((candidate) => {
    if (candidate.level !== oldNode.level) return false;
    if (candidate.nodeKind !== oldNode.nodeKind) return false;

    const sameChapter = getChapter(candidate.nodeId) === getChapter(oldNode.nodeId);
    const closePath = isNearbyPath(oldNode.path, candidate.path);
    const sameParent = candidate.parentNodeId === oldNode.parentNodeId;

    return sameChapter || closePath || sameParent;
  });
}
```

### 4.6 评分策略

不只依赖单一 Jaccard，相似度采用加权评分：

```typescript
function scoreCandidate(oldText: string, newText: string, structureBonus: number): number {
  const tokenScore = diceSimilarity(tokenize(oldText), tokenize(newText));
  const trigramScore = trigramSimilarity(oldText, newText);
  return tokenScore * 0.45 + trigramScore * 0.40 + structureBonus * 0.15;
}
```

结构加分可来自：

- 同 `nodeKind`
- 同父节点
- 同章节
- 相邻路径

结构降权可来自：

- 跨章节迁移
- 层级不同
- heading / content / example 类型不一致

### 4.6.1 阈值调优与评估方法

文档中的 `0.55`、`0.8`、`0.92` 仅作为初始建议值，不能视为最终线上阈值。

建议建立一组人工标注样本集，覆盖：

- 纯新增 / 删除
- 同编号改写
- 编号重命名但内容不变
- 编号重命名且内容轻微修改
- 跨章节移动
- 拆分 / 合并
- `example`、`glossary`、`intro` 等特殊节点

建议评估指标：

- 简单匹配 precision / recall
- `split` / `merged` 命中率
- 进入审核队列比例
- 审核后被 `rejected` 的比例
- 实体漂移率（错误继承旧 `entityId` 的比例）

上线前至少输出两类结论：

- 推荐默认阈值
- 不同文档类型（`CR`、`MTR`、`IPG`）是否需要独立阈值

### 4.7 拆分与合并检测

`split` / `merged` 只在未匹配节点中识别，并默认进入审核队列。

```typescript
function detectSplits(state: MatchState) {
  for (const oldNode of getUnmatchedOldNodes(state)) {
    const candidates = collectCandidates(oldNode, getUnmatchedNewNodes(state))
      .map((candidate) => ({
        candidate,
        score: scoreCandidate(oldNodeText(oldNode), newNodeText(candidate), 1),
      }))
      .filter((item) => item.score >= 0.55)
      .sort((a, b) => b.score - a.score);

    if (candidates.length < 2) continue;

    const topCandidates = candidates.slice(0, 4);
    const combinedScore = coverageScore(oldNode, topCandidates.map((item) => item.candidate));

    if (combinedScore < 0.8) continue;

    createSplitChange(oldNode, topCandidates, combinedScore);
  }
}
```

### 4.8 人工复核机制

以下情况进入待审核队列：

- `split`
- `merged`
- `renamed_modified`
- `confidenceScore < 0.92`
- 同一节点存在多个竞争候选

审核结论：

- `confirmed`：接受自动结果
- `rejected`：拒绝自动结果并回退为 added / removed 或重新匹配
- `override`：人工指定新的实体关系和复杂边

---

## 5. 支持的变更类型

| 类型 | 检测方式 | 主记录字段 | 辅助关系 |
|------|---------|-----------|---------|
| **Added** | 新版本存在、旧版本不存在 | `toNodeRefId` | 无 |
| **Removed** | 旧版本存在、新版本不存在 | `fromNodeRefId` | 无 |
| **Modified** | 同编号、内容哈希不同 | `diffPatch` | 无 |
| **Moved** | 内容一致、路径变化 | `oldPath/newPath` | 无 |
| **Renamed** | 内容一致或指纹一致、编号变化 | `oldNodeId/newNodeId` | 无 |
| **Renamed_Modified** | 编号变化且内容微改 | `diffPatch + similarityScore` | 无 |
| **Split** | 一个旧节点对应多个新节点 | `type='split'` | `DocumentNodeChangeRelation` |
| **Merged** | 多个旧节点对应一个新节点 | `type='merged'` | `DocumentNodeChangeRelation` |

---

## 6. 任意版本对比

### 6.1 性能优化策略

| 策略 | 适用场景 | 实现 |
|------|---------|------|
| **相邻版本预计算** | 常用对比 | 直接读取 `DocumentNodeChange` |
| **热点版本快照缓存** | 热数据 | 缓存最近若干版本完整节点快照 |
| **任意对比结果缓存** | 冷数据复用 | 将 diff 结果缓存到 KV |
| **实时计算** | 冷数据首次访问 | 读取两个版本快照后内存计算 |

### 6.1.1 对比语义定义

任意两个版本之间的对比需要明确区分两种语义：

- **Snapshot Diff**
  - 直接比较两个版本快照
  - 适合冷启动、调试和回填场景
- **Reviewed Change View**
  - 优先折叠相邻版本之间已审核的变更记录
  - 适合用户面向的“官方历史视图”

v1 建议规则：

- 相邻版本对比：直接读取 `DocumentNodeChange`
- 非相邻版本对比：
  - 若中间链路的相邻版本变更均已完成计算，则优先组合已审核变更结果
  - 若链路不完整，回退为 `Snapshot Diff`
  - 返回结果中增加 `diffMode: 'reviewed_chain' | 'snapshot'`

这样可以避免“用户看到的历史结果”和“后台重新快照计算结果”长期不一致。

### 6.2 缓存失效原则

- 新版本导入完成后，失效该文档相关 diff 缓存
- 审核结论变更后，失效对应版本对的 diff 缓存
- 缓存键建议包含 `reviewRevision`

```typescript
const cacheKey = `diff:${documentId}:${fromVersionId}:${toVersionId}:${reviewRevision}`;
```

### 6.3 对比 API

```typescript
async function compareVersions(
  documentId: string,
  fromVersionId: string,
  toVersionId: string,
  env: Env,
) {
  const reviewRevision = await getReviewRevision(documentId, fromVersionId, toVersionId);
  const cacheKey = `diff:${documentId}:${fromVersionId}:${toVersionId}:${reviewRevision}`;

  const cached = await env.WATCHER_KV.get(cacheKey);
  if (cached) return JSON.parse(cached);

  const adjacent = await areVersionsAdjacent(fromVersionId, toVersionId);

  const result = adjacent
    ? await getAdjacentDiff(documentId, fromVersionId, toVersionId)
    : await computeFullDiff(documentId, fromVersionId, toVersionId);

  await env.WATCHER_KV.put(cacheKey, JSON.stringify(result), {
    expirationTtl: 86400,
  });

  return result;
}
```

### 6.4 复杂度分析

| 场景 | 时间复杂度 | 空间复杂度 |
|------|-----------|-----------|
| 相邻版本查表 | `O(1)` | `O(1)` |
| 缓存命中 | `O(1)` | `O(1)` |
| 实时计算（平均） | `O(n + c)` | `O(n)` |
| 实时计算（最坏） | `O(n²)` | `O(n)` |

其中 `c` 为候选相似度比较总数。正常情况下通过 `nodeId / contentHash / fingerprintHash / level / path / parentNodeId` 约束后，`c` 远小于 `n²`。

### 6.5 本地化读取规则

```typescript
async function getLocalizedNodeContent(
  documentNodeId: string,
  locale: string,
  sourceLocale = 'en',
) {
  const localized = await db.DocumentNodeContent.findOne({
    documentNodeId,
    locale,
    status: 'published',
  });

  if (localized) return localized;

  return await db.DocumentNodeContent.findOne({
    documentNodeId,
    locale: sourceLocale,
    status: 'source',
  });
}
```

规则：

- 优先读取目标语言且 `status='published'` 的内容
- 若不存在，则回退到源语言内容
- 若翻译记录的 `sourceContentHash` 落后于当前源文本，则标记为 `stale`
- 若返回的是过期翻译，接口应显式暴露 `isStale`，不要仅在后台静默标记

---

## 7. 查询场景

### 7.1 查看单个节点历史（含重命名）

```typescript
async function getNodeHistory(documentId: string, entityId: string) {
  const entity = await db.DocumentNodeEntity.findOne({ id: entityId, documentId });

  const revisions = await db.DocumentNode
    .find({ entityId, documentId })
    .sort({ versionId: 1 });

  const changes = await db.DocumentNodeChange
    .find({ entityId, documentId })
    .sort({ createdAt: 1 });

  return {
    entity,
    timeline: revisions.map((revision) => ({
      versionId: revision.versionId,
      nodeId: revision.nodeId,
      nodeKind: revision.nodeKind,
      change: changes.find((change) => change.toNodeRefId === revision.id)?.type ?? 'unchanged',
    })),
  };
}
```

### 7.2 查看两个版本间所有变更

```typescript
const changes = await compareVersions('magic-cr', 'magic-cr:20240202', 'magic-cr:20240328', env);
```

### 7.3 层级查询（Materialized Path）

```typescript
const chapter702 = await db.DocumentNode.findMany({
  where: {
    versionId: 'magic-cr:20240328',
    path: { startsWith: '702' },
  },
  orderBy: { path: 'asc' },
});

const introNodes = await db.DocumentNode.findMany({
  where: {
    versionId: 'magic-cr:20240328',
    nodeId: { in: ['intro.title', 'intro.content'] },
  },
  orderBy: { path: 'asc' },
});

const exampleNodes = await db.DocumentNode.findMany({
  where: {
    versionId: 'magic-cr:20240328',
    path: { startsWith: '702/1/example/' },
  },
  orderBy: { path: 'asc' },
});

const subrules = await db.DocumentNode.findMany({
  where: {
    versionId: 'magic-cr:20240328',
    parentNodeId: 'magic-cr:20240328/702.1',
  },
});
```

---

## 8. 数据导入流程

```text
1. Download source document files
   - Input: documentId + versionTag
   ↓
2. Parse document into structured nodes
   - Chapters / rules / subrules
   - heading + content sibling nodes
   - glossary term nodes
   - standalone example nodes
   ↓
3. Create DocumentVersion
   - versionId = "{documentId}:{versionTag}"
   ↓
4. Create DocumentNode records first
   - Build nodeId / path / parentNodeId / siblingOrder
   ↓
5. Create source DocumentNodeContent records
   - Calculate contentHash / fingerprintHash
   - Write back sourceContentHash / sourceFingerprintHash / sourceContentRefId to DocumentNode
   ↓
6. Match entities only inside the same document and previous version
   - Exact match -> fingerprint match -> similarity match
   - Low-confidence results go to review queue
   ↓
7. Create or update DocumentNodeEntity
   ↓
8. Generate DocumentNodeChange and DocumentNodeChangeRelation
   ↓
9. Insert or update localized DocumentNodeContent records
   - Mark old translations as stale if source hash changed
   ↓
10. Mark previous version as superseded
   ↓
11. Invalidate related diff caches
```

**说明：**
- 必须先创建 `DocumentNode`，再创建 `DocumentNodeContent`
- 复杂变更关系与审核记录必须在同一事务内写入
- 历史批量导入时，按版本时间顺序串行导入，避免实体漂移

### 8.1 幂等与失败恢复

导入流程必须支持幂等重试，避免出现“版本已创建一半、节点只导入一部分”的中间态。

建议规则：

- `(documentId, versionTag)` 作为版本级幂等键
- 同一版本重复导入时：
  - 若源文件哈希未变化，可直接跳过或执行校验式重跑
  - 若源文件哈希变化，必须标记为“源内容变更重导入”，并清理该版本的派生结果后重建
- `DocumentVersion` 建议增加导入状态：
  - `pending`
  - `processing`
  - `completed`
  - `failed`
- 节点、内容、变更、审核建议按“版本”为单位分阶段提交，避免长事务覆盖整个下载流程
- 任何阶段失败后，重跑逻辑必须先删除该版本下的派生数据，再按同一版本完整重建
- 非相邻版本缓存必须在版本重导入成功后统一失效，不能在处理中途失效

推荐事务边界：

- 事务 A：创建 / 锁定 `DocumentVersion`
- 事务 B：写入 `DocumentNode` + `DocumentNodeContent`
- 事务 C：写入 `DocumentNodeEntity` + `DocumentNodeChange` + `DocumentNodeChangeRelation`
- 事务 D：写入本地化状态、更新前一版本状态、刷新缓存版本号

运行约束：

- 同一 `documentId` 的导入任务串行执行
- 不同 `documentId` 之间可并行
- 审核 override 与导入任务不能同时修改同一版本对

---

## 9. 与现有系统集成

### 方案 A：独立系统（推荐）

文档历史作为独立模块，通过 API 与现有系统交互：

```typescript
const card = await Card.findOne({ id: 'Lightning Bolt' });
const nodeHistory = await documentHistoryAPI.getEntityHistory('magic-cr', card.ruleRef);
```

优点：

- 领域边界清晰
- 规则历史与公告系统解耦
- 更适合后续接审核后台、全文检索和多语言内容

### 方案 B：与 Announcement 联动

保留规则变更到 `Announcement` 的投递能力，但不建议直接复用其主数据模型。

```typescript
await Announcement.create({
  type: 'rule',
  title: '规则更新：702.1 关键词异能',
  content: '702.1 拆分为 702.1a, 702.1b, 702.1c',
  relatedRules: ['re_01HTX9A7M2...', 're_01HTX9D41...', 're_01HTX9G77...'],
  source: 'wizards',
  date: '2024-03-28',
});
```

---

## 10. 存储优化

### 10.1 数据压缩

- 节点文本使用 gzip 压缩
- 节点内容按“节点 + 语言”存储
- 通过 `contentHash` 支持校验与重复分析

### 10.2 数据量估算

| 项目 | 数值 |
|------|------|
| 文档数量 | 3 - 10 个（初期） |
| 单文档更新频率 | 月更 / 季更 |
| 单文档节点总数 | 500 - 2000 条 |
| 单文档单版本原始大小 | ~200KB - 1MB |
| 5 年总存储量 | 仍在几十 MB 级别 |

### 10.3 存储位置选择

| 方案 | 适用场景 | 成本 |
|------|---------|------|
| **PostgreSQL** | 主库、复杂查询、全文搜索、审核后台 | 中等 |
| **PostgreSQL + 对象存储** | 正文显著增大、需要长期归档 | 中等 |

**推荐：PostgreSQL 多表关系模型（v1）**

- `DocumentDefinition` 作为顶层维度
- `DocumentVersion / DocumentNode / DocumentNodeEntity / DocumentNodeContent / DocumentNodeChange / DocumentNodeChangeRelation / DocumentChangeReview` 直接落在主库
- 支持事务、一致性更新和审核留痕
- 后续可逐步接入全文检索、`pg_trgm` 和后台统计

---

## 11. 关键设计决策

1. **引入 `DocumentDefinition` 顶层定义**
   - 支持多文档追踪，不同文档之间版本、实体、缓存完全隔离

2. **统一版本维度命名为 `versionId`**
   - 避免 `sourceId` 与“源文本”概念混淆

3. **`DocumentNode.id` 使用复合键**
   - 形式为 `"{versionId}/{nodeId}"`，便于调试和定位

4. **层级使用 `path` + `parentNodeId`**
   - 同时兼顾范围查询与直接子节点查询

5. **`entityId` 使用稳定系统 ID**
   - 历史补录、误判修正时不需要改主键

6. **复杂变更使用关系表建模**
   - `details JSON` 只存摘要，不承担全部 split / merge 关系

7. **相邻版本预计算，任意版本缓存或实时计算**
   - 热路径快，冷路径仍可接受

8. **审核结论独立留痕**
   - 自动识别结果与人工决策分离，便于重算和审计
