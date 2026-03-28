# 万智牌规则更新历史系统设计文档

## TODO List

- [ ] 数据库表结构设计（RuleSource, RuleNode, RuleEntity, RuleContent, RuleChange）
- [ ] 规则文件解析器（从 TXT 提取结构化数据）
- [ ] 内容指纹生成（sha256 + gzip 压缩）
- [ ] 变更检测 Worker（定时执行，检测增删改移拆分合并）
- [ ] 版本对比 API（含缓存策略）
- [ ] 重命名/拆分/合并检测算法实现
- [ ] 前端历史时间线展示组件
- [ ] 规则搜索功能（全文检索）
- [ ] 与现有 Announcement 系统集成
- [ ] 数据导入（历史版本批量导入）

---

## 1. 概述

追踪万智牌官方规则文档（Comprehensive Rules）的历史变更，支持检测增加、删除、修改、移动、重命名、拆分、合并等多种变更类型，并提供任意两个版本的对比功能。

## 2. 核心概念

### 2.1 Rule ID（官方编号）

从规则文件文本中直接提取的官方编号，遵循以下格式：

```
[章节号].[规则号][子规则字母]
```

**示例：**
- `100.1` - 第 100 章第 1 条规则
- `100.1a` - 100.1 的子规则
- `702.1` - 第 702 章（关键词异能）第 1 条

**提取方式：**
```typescript
const ruleRegex = /^(\d+\.\d+[a-z]?)\.\s+(.+)$/;
// 匹配 "100.1. 万智牌游戏使用..."
```

**特点：**
- 官方定义，非系统生成
- 同一版本内唯一
- **版本间可能改变**（重命名、拆分、合并）

### 2.2 Entity ID（实体标识）

用于跨版本追踪同一条规则的**永久唯一标识**，不随官方编号改变而改变。

**设计方案：** 语义化 ID

```typescript
// 格式：{首次出现版本}-{首次官方编号}
"20230101-702.1"   // 2023年1月首次出现的 702.1
"20230601-702.15"  // 2023年6月首次出现的 702.15
```

**优点：**
- 可读性强，知道规则起源
- 即使重命名为 702.1a 或 702.2，Entity ID 不变

---

## 3. 存储架构

### 3.1 数据库表结构

#### RuleSource（规则来源）

代表一次官方规则发布（对应一个 TXT 文件）。

```typescript
interface RuleSource {
  id: string;                    // 版本号，如 "20240328"
  effectiveDate: string;         // 生效日期
  publishedAt: string;           // 官方发布日期
  urls: {
    txt: string;
    pdf: string;
    docx: string;
  };
  totalRules: number;            // 规则条目总数
  importedAt: string;            // 系统导入时间
  status: 'active' | 'superseded'; // 是否被新版本取代
}
```

#### RuleNode（规则节点）

某个版本中一条规则的具体内容。

```typescript
interface RuleNode {
  id: string;                    // 复合ID: "{sourceId}/{ruleId}"，如 "20240328/702.1"
  sourceId: string;              // 所属版本
  ruleId: string;                // 官方编号，如 "702.1"

  // 层级（Materialized Path）
  path: string;                  // 层级路径: "702/1"（用于排序和范围查询）
  level: number;                 // 0=章节, 1=规则, 2=子规则
  parentId: string | null;       // 父节点ID，如 "20240328/702"

  // 内容
  title: string | null;          // 章节标题（如"关键词异能"）
  contentHash: string;           // 内容哈希（用于去重）
  contentRef: string;            // 指向 RuleContent 的引用

  // 实体关联
  entityId: string;              // 跨版本实体ID（重命名后不变）
}
```

**层级示例：**
```
path: "702"        → 702（章节，level=0）
path: "702/1"      → 702.1（规则，level=1）
path: "702/1/a"    → 702.1a（子规则，level=2）
```

#### RuleEntity（规则实体）

跨版本追踪同一条逻辑规则。

```typescript
interface RuleEntity {
  id: string;                    // 语义化ID: "{首次版本}-{首次编号}"
                                  // 如: "20230101-702.1"

  // 当前状态（随版本更新）
  currentNodeId: string;         // 当前版本对应的 RuleNode.id
  currentRuleId: string;         // 当前官方编号
  currentSourceId: string;       // 当前版本

  // 统计
  totalRevisions: number;        // 历史版本数
  createdAt: string;             // 首次出现时间
}
```

#### RuleContent（规则内容）

内容去重存储（内容寻址）。

```typescript
interface RuleContent {
  hash: string;                  // sha256，主键
  content: Buffer;               // gzip压缩后的文本
  size: number;                  // 原始大小（字节）
  refCount: number;              // 引用计数（垃圾回收用）
}
```

#### RuleChange（规则变更）

预计算的版本间变更记录。

```typescript
interface RuleChange {
  id: string;                    // UUID
  fromSourceId: string;          // 旧版本
  toSourceId: string;            // 新版本

  // 涉及的规则
  entityId: string;              // 变更的规则实体
  fromNodeId: string | null;     // 旧版本节点（null=新增）
  toNodeId: string | null;       // 新版本节点（null=删除）

  // 变更类型
  type: ChangeType;

  // 详情
  details: {
    // type='modified'
    oldContentHash?: string;
    newContentHash?: string;
    diffPatch?: string;           // unified diff 格式

    // type='renamed' | 'moved'
    oldRuleId?: string;
    newRuleId?: string;
    similarityScore?: number;     // 0-1

    // type='split'
    splitInto?: string[];         // 实体ID数组
    splitRatios?: number[];       // 内容占比

    // type='merged'
    mergedFrom?: string[];        // 实体ID数组
  };

  createdAt: string;
}

type ChangeType =
  | 'added'           // 新增规则
  | 'removed'         // 删除规则
  | 'modified'        // 内容修改
  | 'renamed'         // 重命名（内容基本不变）
  | 'renamed_modified' // 重命名+内容修改
  | 'moved'           // 移动到不同章节
  | 'split'           // 拆分为多条
  | 'merged';         // 多条合并为一条
```

### 3.2 表关系图

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   RuleSource    │◄────┤    RuleNode     │────►│   RuleEntity    │
│   (版本)        │     │   (版本内规则)   │     │  (跨版本实体)   │
└─────────────────┘     └─────────────────┘     └─────────────────┘
         ▲                       │
         │                       ▼
         │              ┌─────────────────┐
         │              │  RuleContent    │
         │              │  (内容去重)      │
         │              └─────────────────┘
         │
         └──────────────────────────────────┐
                                            ▼
                                   ┌─────────────────┐
                                   │   RuleChange    │
                                   │  (预计算变更)   │
                                   └─────────────────┘
```

### 3.3 内容压缩

```typescript
// 压缩存储
const compressed = await gzip(ruleContent);
// 702KB → 82KB（压缩率约 88%）

// 20 个版本估算
// 原始: 702KB × 20 = 14MB
// 压缩后: 82KB × 20 = 1.6MB
// 去重后: ~10MB（考虑重复内容）
```

### 3.4 索引设计

```sql
-- RuleNode 索引
CREATE INDEX idx_node_source ON RuleNode(sourceId);
CREATE INDEX idx_node_entity ON RuleNode(entityId);
CREATE INDEX idx_node_path ON RuleNode(sourceId, path);
CREATE INDEX idx_node_parent ON RuleNode(parentId);

-- RuleEntity 索引
CREATE INDEX idx_entity_current ON RuleEntity(currentSourceId);

-- RuleChange 索引
CREATE INDEX idx_change_version ON RuleChange(fromSourceId, toSourceId);
CREATE INDEX idx_change_entity ON RuleChange(entityId);
CREATE INDEX idx_change_type ON RuleChange(type);
```

---

## 4. 变更检测算法

### 4.1 多级匹配策略

```typescript
function detectChanges(oldRules: Map<string, RuleNode>, newRules: Map<string, RuleNode>) {
  for (const [oldId, oldRule] of oldRules) {
    // 1. 精确匹配（内容完全一致）
    const exact = exactMatch(oldRule, newRules);
    if (exact) return { type: 'unchanged', ... };

    // 2. 指纹匹配（规范化后相同）
    const fingerprint = fingerprintMatch(oldRule, newRules);
    if (fingerprint) return { type: 'renamed', ... };

    // 3. 相似度匹配（内容微改）
    const similar = similarityMatch(oldRule, newRules, threshold = 0.85);
    if (similar) return { type: 'modified' | 'renamed_modified', ... };
  }
}
```

### 4.2 匹配算法详解

**精确匹配：**
```typescript
function exactMatch(oldRule: RuleNode, newRules: Map<string, RuleNode>): string | null {
  const hash = oldRule.contentHash;
  for (const [id, rule] of newRules) {
    if (rule.contentHash === hash) return id;
  }
  return null;
}
```

**指纹匹配（忽略大小写、标点）：**
```typescript
function generateFingerprint(content: string): string {
  return content
    .toLowerCase()
    .replace(/[.,;:!?]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
```

**相似度匹配（Jaccard）：**
```typescript
function jaccardSimilarity(text1: string, text2: string): number {
  const words1 = new Set(tokenize(text1));
  const words2 = new Set(tokenize(text2));
  const intersection = new Set([...words1].filter(w => words2.has(w)));
  const union = new Set([...words1, ...words2]);
  return intersection.size / union.size;
}
```

### 4.3 层级限制

为避免跨章节误匹配，限制在同章节内比较：

```typescript
function getChapter(ruleId: string): string {
  return ruleId.split('.')[0]; // "702.1" → "702"
}

// 只比较相同章节的规则
if (getChapter(oldId) !== getChapter(newId)) continue;
```

---

## 5. 支持的变更类型

| 类型 | 检测方式 | 存储内容 |
|------|---------|---------|
| **Added** | 新版本存在，旧版本不存在 | 新增规则完整内容 |
| **Removed** | 旧版本存在，新版本不存在 | 删除前内容 |
| **Modified** | 同编号，内容哈希不同 | 文本 diff patch |
| **Moved** | 内容完全相同，编号不同 | 旧编号 → 新编号映射 |
| **Renamed** | 相似度 > 0.85，编号不同，内容基本相同 | 重命名轨迹 |
| **Renamed_Modified** | 相似度 > 0.85，编号不同，内容微改 | 重命名 + diff |
| **Split** | 一条旧规则 → 多条新规则（内容分散） | 关联规则列表 + 相似度分数 |
| **Merged** | 多条旧规则 → 一条新规则（内容聚合） | 来源规则列表 |

### 5.1 拆分检测

```typescript
function detectSplits(
  removedRules: Map<string, RuleNode>,
  newRules: Map<string, RuleNode>,
  threshold = 0.6
): SplitResult[] {
  const splits: SplitResult[] = [];

  for (const [oldId, oldRule] of removedRules) {
    const candidates: { id: string; similarity: number }[] = [];

    // 查找所有新规则中与旧规则内容相似的
    for (const [newId, newRule] of newRules) {
      const similarity = jaccardSimilarity(oldRule.content, newRule.content);
      if (similarity > threshold) {
        candidates.push({ id: newId, similarity });
      }
    }

    // 多条高相似 = 拆分
    if (candidates.length >= 2) {
      const combinedContent = candidates.map(c => newRules.get(c.id)!.content).join(' ');
      const totalSimilarity = jaccardSimilarity(oldRule.content, combinedContent);

      if (totalSimilarity > 0.8) {
        splits.push({
          type: 'split',
          from: oldId,
          into: candidates.map(c => c.id),
          similarities: candidates.map(c => c.similarity),
        });
      }
    }
  }

  return splits;
}
```

### 5.2 重命名追踪

```typescript
// 即使重命名 10 次，仍能通过 Entity ID 追踪
const history = await db.query.RuleNode.findMany({
  where: { entityId: "20230101-702.1" },
  orderBy: { sourceId: 'asc' },
});

// 显示历史轨迹：
// 702.1 (2023-01-01) → 702.1a (2023-06-01) → 702.2 (2024-03-28)
```

---

## 6. 任意版本对比

### 6.1 性能优化策略

| 策略 | 适用场景 | 实现 |
|------|---------|------|
| **版本缓存** | 热数据 | 用 Cloudflare Cache API 缓存最近 10 个版本完整快照 |
| **增量链** | 相邻版本 | 如果版本相邻，直接查 RuleChange 表 |
| **KV 结果缓存** | 任意对比 | 对比结果缓存 24 小时（TTL: 86400） |
| **实时计算** | 冷数据 | 读取两个版本快照，内存中计算 diff |

### 6.2 对比 API

```typescript
async function compareVersions(
  fromVersion: string,
  toVersion: string,
  env: Env
): Promise<VersionDiff> {
  const cacheKey = `diff:${fromVersion}:${toVersion}`;

  // 1. 检查缓存
  const cached = await env.WATCHER_KV.get(cacheKey);
  if (cached) return JSON.parse(cached);

  let result: VersionDiff;

  // 2. 判断版本关系
  const versionOrder = compareVersionDates(fromVersion, toVersion);
  const adjacentVersions = await areVersionsAdjacent(fromVersion, toVersion);

  if (adjacentVersions) {
    // 相邻版本：直接读预计算的变更
    result = await getAdjacentDiff(fromVersion, toVersion);
  } else {
    // 非相邻版本：实时计算
    result = await computeFullDiff(fromVersion, toVersion);
  }

  // 3. 缓存结果（24小时）
  await env.WATCHER_KV.put(cacheKey, JSON.stringify(result), {
    expirationTtl: 86400,
  });

  return result;
}
```

### 6.3 复杂度分析

| 场景 | 时间复杂度 | 空间复杂度 |
|------|-----------|-----------|
| 相邻版本 | O(1)（查表） | O(1) |
| 缓存命中 | O(1) | O(1) |
| 实时计算 | O(n)（n = 规则数量） | O(n) |

---

## 7. 查询场景

### 7.1 查看单条规则历史（含重命名）

```typescript
async function getRuleHistory(entityId: string) {
  const entity = await db.RuleEntity.findOne({ id: entityId });

  // 获取该实体的所有版本
  const revisions = await db.RuleNode
    .find({ entityId })
    .sort({ sourceId: 1 })
    .populate('sourceId', 'effectiveDate');

  // 获取变更记录
  const changes = await db.RuleChange
    .find({ entityId })
    .sort({ createdAt: 1 });

  return {
    entity,
    timeline: revisions.map(r => ({
      version: r.sourceId,
      ruleId: r.ruleId,
      title: r.title,
      change: changes.find(c => c.toNodeId === r.id)?.type || 'unchanged',
    })),
  };
}

// 使用
const history = await getRuleHistory('20230101-702.1');
// 显示: 702.1 → 702.1a → 702.2 的历史轨迹
```

### 7.2 查看两个版本间所有变更

```typescript
const changes = await compareVersions('20240202', '20240328');
// 返回：
// {
//   added: [...],
//   removed: [...],
//   modified: [...],
//   renamed: [...],
//   split: [...],
//   merged: [...]
// }
```

### 7.3 层级查询（Materialized Path）

```typescript
// 获取章节 702 下的所有规则
const chapter702 = await db.RuleNode.findMany({
  where: {
    sourceId: '20240328',
    path: { startsWith: '702' },
  },
  orderBy: { path: 'asc' },
});

// 获取 702.1 的直接子规则
const subrules = await db.RuleNode.findMany({
  where: {
    sourceId: '20240328',
    parentId: '20240328/702.1',
  },
});
```

---

## 8. 数据导入流程

```
1. 下载官方 TXT 文件
   ↓
2. 解析文件，提取结构化数据
   - 章节 (100, 101, ...)
   - 规则 (100.1, 100.2, ...)
   - 子规则 (100.1a, 100.1b, ...)
   ↓
3. 创建 RuleSource 记录
   ↓
4. 对每条规则：
   a. 计算 contentHash，存入 RuleContent（或复用已有）
   b. 尝试匹配上一版本的实体（内容相似度匹配）
   c. 创建 RuleNode
   d. 创建或更新 RuleEntity
   e. 生成 RuleChange（如果是新版本）
   ↓
5. 标记旧版本为 superseded
```

---

## 9. 与现有系统集成

### 方案 A：独立系统（推荐）

规则历史作为独立模块，通过 API 与现有系统交互：

```typescript
// 现有卡片查询时，关联规则历史
const card = await Card.findOne({ id: 'Lightning Bolt' });
const ruleHistory = await ruleHistoryAPI.getEntityHistory(card.ruleRef);
```

### 方案 B：与 Announcement 合并

在现有 Announcement 系统中增加 `type: 'rule'`：

```typescript
// 规则变更同时生成 Announcement
await Announcement.create({
  type: 'rule',
  title: '规则更新：702.1 关键词异能',
  content: '702.1 拆分为 702.1a, 702.1b, 702.1c',
  relatedRules: ['20240328-702.1a', '20240328-702.1b', '20240328-702.1c'],
  source: 'wizards',
  date: '2024-03-28',
});
```

---

## 10. 存储优化

### 10.1 数据压缩

- 规则文本使用 gzip 压缩（88% 压缩率）
- 相同内容的规则跨版本只存一份，通过 `contentHash` 关联

### 10.2 数据量估算

| 项目 | 数值 |
|------|------|
| 更新频率 | 约每季度 1 次（4 次/年） |
| 规则总数 | 约 1000-1500 条 |
| 单版本原始大小 | ~700KB |
| 单版本压缩后 | ~80KB |
| 5 年存储总量 | ~10MB |

### 10.3 存储位置选择

| 方案 | 适用场景 | 成本 |
|------|---------|------|
| **Cloudflare D1** | 低频查询、简单结构 | 低（免费额度够用） |
| **PostgreSQL**（Supabase/Neon） | 复杂查询、全文搜索 | 中等 |
| **R2 + D1 元数据** | 大文本、长期归档 | 低（R2 便宜） |

**推荐：D1 单表存储**
- 写入：5000 rows/day（免费额度）
- 查询：简单直接，支持 JOIN
- 成本：免费档够用

---

## 11. 关键设计决策

1. **RuleNode.id 使用复合键**：`"{sourceId}/{ruleId}"` 如 `"20240328/702.1"`
   - 优点：唯一标识、包含版本信息、便于调试

2. **层级使用 path 字段（Materialized Path）**：如 `"702/1/a"`
   - 优点：支持高效范围查询 `LIKE '702/%'`

3. **Entity ID 语义化**：`"{首次版本}-{首次编号}"` 如 `"20230101-702.1"`
   - 优点：可读性强，跨版本追踪重命名

4. **内容去重存储**：独立的 `RuleContent` 表，hash 作为主键
   - 优点：节省 85-90% 存储空间

5. **预计算变更**：相邻版本生成 `RuleChange` 记录
   - 优点：相邻版本对比 O(1)，任意版本可链式查询

6. **邮件失败不更新状态**：Watcher 监控系统的经验
   - 优点：确保通知不丢失
