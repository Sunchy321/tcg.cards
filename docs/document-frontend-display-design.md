# 文档模型前端展现方案（细化版）

## 1. 背景与目标

当前仓库已经具备一套通用文档历史模型，可支撑：

- 多文档定义：`DocumentDefinition`
- 多版本快照：`DocumentVersion`
- 版本内结构节点：`DocumentNode`
- 节点正文与本地化：`DocumentNodeContent`
- 跨版本稳定实体：`DocumentNodeEntity`
- 版本间变更结果：`DocumentNodeChange`
- 复杂变更关系：`DocumentNodeChangeRelation`
- 人工审核：`DocumentChangeReview`
- 版本对审核修订号：`DocumentVersionPairRevision`

但当前前端仍主要沿用旧 `rule` 模型：

- 阅读页以 `RuleItem` 为中心
- 对比页以文本 diff 为中心
- 历史页以 `itemId` 为中心

这套旧页面能满足“规则可读”，但不能完整承接新模型中的：

- `entityId` 跨版本连续性
- `moved` / `renamed` / `split` / `merged` 等结构化变化
- `reviewed` 与 `snapshot` 两类结果语义
- 控制台审核工作流

本方案目标是把“底层规范化模型”转成“前端可消费的信息架构与页面模型”，作为后续实现基线。

---

## 2. 对当前模型的前端解读

### 2.1 模型实际对应四种前端能力

从前端视角，不应按数据库表理解，而应按能力理解：

| 能力层 | 主要模型 | 用户问题 |
|--------|----------|----------|
| 文档层 | `DocumentDefinition` | 我在看哪一类文档？ |
| 版本层 | `DocumentVersion` | 我在看哪个版本？ |
| 阅读层 | `DocumentNode` + `DocumentNodeContent` | 这个版本怎么读、怎么导航？ |
| 历史层 | `DocumentNodeEntity` + `DocumentNodeChange` + `DocumentChangeReview` | 这个节点经历了什么变化？这些变化是否已确认？ |

也就是说，前端不应该渲染“表”，而应该渲染四类场景：

- 阅读
- 对比
- 历史
- 审核

### 2.2 现有页面已经证明了什么

当前 `site-magic` 页面已经验证了以下方向是正确的：

1. `path + level + siblingOrder` 能稳定生成目录树
2. 版本切换器适合与阅读页强绑定
3. 节点有天然的锚点链接与历史入口
4. diff 与 history 独立成页面是合理的

但它们也暴露出当前 UI 模型的边界：

1. 仍然围绕旧 `RuleItem`
2. history 用 `itemId` 串联，无法承接 rename / move
3. diff 偏文本，不适合复杂结构变化
4. 公共站点和控制台尚未形成清晰分工

---

## 3. 用户与场景拆分

### 3.1 读者用户

读者在公共站点最关心的是：

- 当前版本怎么读
- 某一条规则最近有没有改
- 两个版本之间改了哪些重要内容

读者不关心：

- 置信度分数
- override payload
- 复杂关系编辑
- 导入失败细节

### 3.2 维护者用户

维护者在控制台最关心的是：

- 新版本是否已导入完成
- 结构化对比是否稳定
- 哪些变更需要审核
- 如何修正 `split` / `merged` 关系

因此必须把公共站点与控制台拆开：

- `site-magic`：面向阅读与已确认历史
- `site-console`：面向导入、排查、审核、修正

---

## 4. 总体信息架构

## 4.1 公共站点页面结构

建议的公共站点结构如下：

### A. 文档阅读页

路由建议：

- `/document/[slug]`
- `/document/[slug]?version=20260410`

职责：

- 默认直接进入最新版文档浏览
- 版本切换
- 目录导航
- 正文阅读
- 节点锚点定位
- 节点历史入口

### B. 文档对比页

路由建议：

- `/document/[slug]/diff`

职责：

- 选择 `fromVersion` / `toVersion`
- 结构化展示变更
- 章节筛选、类型筛选、状态筛选
- 从变更跳回阅读页定位

### C. 实体历史页

路由建议：

- `/document/[slug]/history/[entityId]`

职责：

- 按 `entityId` 展示跨版本演化时间线
- 展示 rename / move / remove / reintroduce 等事件
- 支持跳回任意版本阅读页

## 4.2 控制台页面结构

建议的控制台结构如下：

### A. 版本列表页

职责：

- 展示版本导入状态
- 展示 R2 文件状态、来源链接、节点数量
- 提供导入、删除、重跑入口

### B. 版本详情页

职责：

- 浏览某个版本下的节点快照
- 快速定位 node / entity / content hash

### C. 版本对审核页

职责：

- 展示某个版本对的全部变更
- 区分待审核 / 已确认 / 已驳回 / 已 override
- 按章节、类型、置信度筛选

### D. 变更详情侧栏 / 抽屉

职责：

- 对照 `from` / `to` 节点
- 展示 diff、关系、置信度、审核记录
- 提交确认、驳回、override

---

## 5. 页面模型设计

前端不应该直接消费底层表结构，应增加页面级 View Model。

## 5.1 阅读页 View Model

```ts
interface DocumentReaderPage {
  document: {
    id: string;
    slug: string;
    name: string;
  };
  version: {
    id: string;
    versionTag: string;
    effectiveDate: string;
    publishedAt: string;
    isLatest: boolean;
  };
  versions: Array<{
    versionTag: string;
    effectiveDate: string;
    publishedAt: string;
  }>;
  outline: DocumentOutlineItem[];
  sections: DocumentReaderSection[];
}

interface DocumentOutlineItem {
  key: string;
  nodeId: string;
  entityId: string;
  label: string;
  serial: string | null;
  level: number;
  kind: 'heading' | 'term' | 'content' | 'example';
  children?: DocumentOutlineItem[];
}

interface DocumentReaderSection {
  nodeId: string;
  entityId: string;
  kind: 'heading' | 'term' | 'content' | 'example';
  serial: string | null;
  title: string | null;
  content: string | null;
  navText: string | null;
  path: string;
  level: number;
  parentNodeId: string | null;
  siblingOrder: number;
  latestChange: {
    type: string;
    fromVersionTag: string;
    toVersionTag: string;
  } | null;
  historyCount: number;
  localeState: {
    locale: string;
    status: 'source' | 'draft' | 'reviewed' | 'published' | 'stale';
    isFallback: boolean;
  };
}
```

### 设计说明

1. `sections` 是正文真实渲染单位
2. `.title` 节点不直接暴露给前端，而是被聚合到 `title`
3. `navText` 专供目录树与页内导航使用
4. `latestChange` 用于右侧信息栏和悬浮工具条
5. `localeState` 允许后续加入翻译状态提示

## 5.2 对比页 View Model

```ts
interface DocumentComparePage {
  document: {
    id: string;
    slug: string;
    name: string;
  };
  fromVersion: VersionSummary;
  toVersion: VersionSummary;
  mode: 'snapshot' | 'reviewed';
  reviewRevision: number;
  stats: {
    added: number;
    removed: number;
    modified: number;
    moved: number;
    renamed: number;
    renamedModified: number;
    split: number;
    merged: number;
    pendingReview: number;
  };
  groups: DocumentCompareGroup[];
}

interface VersionSummary {
  id: string;
  versionTag: string;
  effectiveDate: string;
}

interface DocumentCompareGroup {
  chapterKey: string;
  chapterTitle: string;
  items: DocumentChangeCard[];
}

interface DocumentChangeCard {
  changeId: string;
  entityId: string | null;
  type: 'added' | 'removed' | 'modified' | 'moved' | 'renamed' | 'renamed_modified' | 'split' | 'merged';
  reviewState: 'unreviewed' | 'pending' | 'confirmed' | 'rejected' | 'overridden';
  confidenceScore: number;
  summary: string;
  fromNodes: ChangeNodeRef[];
  toNodes: ChangeNodeRef[];
  textDiff: ChangeTextDiff | null;
  relationGraph: ChangeRelationEdge[];
  reasons: string[];
}

interface ChangeNodeRef {
  nodeId: string | null;
  entityId: string | null;
  title: string | null;
  content: string | null;
  path: string | null;
}

interface ChangeTextDiff {
  mode: 'inline' | 'side-by-side';
  blocks: Array<{
    type: 'common' | 'added' | 'removed';
    text: string;
    isMinor?: boolean;
  }>;
}

interface ChangeRelationEdge {
  side: 'from' | 'to';
  nodeId: string | null;
  entityId: string | null;
  weight: number | null;
}
```

### 设计说明

1. 对比页的主单位是 `DocumentChangeCard`
2. 不是所有变化都适合双栏文本 diff
3. `relationGraph` 专门承接 `split` / `merged`
4. `mode` 与 `reviewRevision` 必须显式回传，避免缓存语义不清

## 5.3 历史页 View Model

```ts
interface DocumentEntityHistoryPage {
  document: {
    id: string;
    slug: string;
    name: string;
  };
  entity: {
    id: string;
    originNodeId: string;
    originVersionTag: string;
    currentNodeId: string | null;
    currentVersionTag: string | null;
    totalRevisions: number;
  };
  timeline: DocumentEntityHistoryEntry[];
}

interface DocumentEntityHistoryEntry {
  versionId: string;
  versionTag: string;
  effectiveDate: string;
  nodeId: string | null;
  title: string | null;
  content: string | null;
  state: 'present' | 'removed' | 'split' | 'merged';
  change: {
    changeId: string;
    type: string;
    reviewState: string;
    summary: string;
  } | null;
}
```

### 设计说明

1. 历史页必须改为 `entityId`
2. 历史页不是简单“版本列表”，而是“实体时间线”
3. 即使 `nodeId` 改名或路径变化，`entity` 仍可连续追踪

## 5.4 审核页 View Model

```ts
interface DocumentReviewQueuePage {
  document: {
    id: string;
    slug: string;
    name: string;
  };
  versionPair: {
    fromVersionTag: string;
    toVersionTag: string;
    reviewRevision: number;
  };
  stats: {
    total: number;
    pending: number;
    confirmed: number;
    rejected: number;
    overridden: number;
  };
  items: ReviewQueueItem[];
}

interface ReviewQueueItem {
  changeId: string;
  type: string;
  reviewState: string;
  confidenceScore: number;
  title: string;
  summary: string;
  chapterKey: string | null;
  hasOverride: boolean;
}

interface DocumentReviewDetail {
  changeId: string;
  type: string;
  reviewState: string;
  confidenceScore: number;
  details: Record<string, unknown>;
  fromNodes: ChangeNodeRef[];
  toNodes: ChangeNodeRef[];
  relations: ChangeRelationEdge[];
  latestReview: {
    revision: number;
    status: string;
    reviewerId: string | null;
    reviewedAt: string | null;
    reason: string | null;
  } | null;
}
```

---

## 6. 交互方案细化

## 6.1 阅读页交互

### 页面布局

桌面端建议三栏：

- 左栏：版本切换 + 目录树
- 中栏：正文阅读区
- 右栏：当前节点上下文

移动端建议两层：

- 顶部：版本切换、对比入口、搜索入口
- 底部抽屉：目录树与当前节点信息

### 正文区交互

每个 section hover 或 focus 后显示轻工具条：

- 复制锚点
- 打开历史
- 查看最近变更
- 在对比页中定位

### 右栏信息卡

建议第一版只显示：

- 当前 `nodeId`
- 当前节点类型
- 最近一次已确认变更摘要
- 历史入口

不要第一版就塞入审核信息，避免公共页后台化。

## 6.2 对比页交互

### 顶部过滤区

建议提供：

- 版本选择器
- 章节筛选
- 变更类型筛选
- 只看已确认 / 包含待审核
- 只看重要变更

### 变更卡片展现规则

#### `added`

- 单栏绿色强调块
- 展示新增位置与新增内容

#### `removed`

- 单栏红色强调块
- 展示原位置与删除内容

#### `modified`

- 双栏或行内 diff
- 默认折叠长文本，仅展开差异片段

#### `moved`

- 展示“原路径 -> 新路径”
- 正文差异若无变化，正文默认折叠

#### `renamed`

- 展示“原编号/原标题 -> 新编号/新标题”
- 保持正文对照可展开

#### `renamed_modified`

- 同时展示 rename 摘要与正文差异

#### `split`

- 使用“1 -> N”关系组
- 左侧为源节点，右侧为多个目标节点

#### `merged`

- 使用“N -> 1”关系组
- 左侧为多个源节点，右侧为目标节点

## 6.3 历史页交互

历史页建议采用时间线：

- 时间线节点展示版本日期
- 展开后显示该版本节点内容
- 若该版本发生变更，则展示变更摘要标签
- 提供“在该版本中阅读”按钮

### 时间线折叠规则

建议把连续未变更的区间折叠为一个“稳定区间”：

- 例如 `20250101 - 20250715 无变化`

但第一版可先不做自动区间折叠，只保证结构正确。

## 6.4 审核页交互

审核页建议采用工作台布局：

- 左侧列表：待审核项
- 中部详情：正文对照 / 关系展示
- 右侧动作：确认 / 驳回 / override

### override 交互原则

第一版只支持：

- 改变 change type
- 调整 from / to 关系
- 留审核备注

不建议第一版就做复杂图形化拖拽。

---

## 7. 视觉与组件建议

本方案建议的视觉方向是：

- **公共站点：克制、文献型、带少量编辑感**
- **控制台：高信息密度、明确状态色、偏工作台**

## 7.1 公共站点组件清单

- `DocumentHeader`
- `DocumentVersionPicker`
- `DocumentOutline`
- `DocumentSection`
- `DocumentSectionToolbar`
- `DocumentContextPanel`
- `DocumentChangeBadge`
- `DocumentHistoryTimeline`
- `DocumentCompareCard`

## 7.2 控制台组件清单

- `DocumentVersionTable`
- `DocumentNodeTable`
- `DocumentReviewQueue`
- `DocumentReviewDetail`
- `DocumentRelationPanel`
- `DocumentReviewActionBar`

## 7.3 节点类型视觉语义

### `heading`

- 更强字号与留白
- 适合作为目录锚点

### `content`

- 标准正文宽度
- 强调可读性与长文本扫描

### `example`

- 弱底色 + 左侧边线
- 与正文区分，但不要像 warning

### `term`

- 术语名称与释义分层
- glossary 中建议卡片式或 definition list

---

## 8. 路由与 URL 设计

## 8.1 公共站点

建议：

- `/document/[slug]`
- `/document/[slug]?version=20260410`
- `/document/[slug]?version=20260410#702.1a`
- `/document/[slug]/diff?from=20260227&to=20260410`
- `/document/[slug]/history/[entityId]`

### 约束

- `/document/[slug]` 默认解析到最新版阅读视图，不再提供单独文档首页
- 阅读页锚点继续使用 `nodeId`
- 历史页参数必须使用 `entityId`
- 对比页 query 继续用 `versionTag`

## 8.2 控制台

建议：

- `/console/document/[slug]/versions`
- `/console/document/[slug]/versions/[versionTag]`
- `/console/document/[slug]/review?from=20260227&to=20260410`

---

## 9. BFF / API 设计草案

## 9.1 公共站点接口

### `getDocumentReader`

```ts
input: {
  slug: string;
  versionTag?: string;
  locale?: string;
}
output: DocumentReaderPage
```

### `getDocumentCompare`

```ts
input: {
  slug: string;
  fromVersionTag: string;
  toVersionTag: string;
  mode?: 'snapshot' | 'reviewed';
  locale?: string;
  chapter?: string;
  types?: string[];
  reviewStates?: string[];
}
output: DocumentComparePage
```

### `getDocumentEntityHistory`

```ts
input: {
  slug: string;
  entityId: string;
  locale?: string;
}
output: DocumentEntityHistoryPage
```

## 9.2 控制台接口

### `listDocumentVersions`

复用现有版本列表接口语义，但补充：

- `importStatus`
- `lifecycleStatus`
- `parserVersion`
- `normalizedContentVersion`

### `getDocumentVersionNodes`

复用现有节点浏览接口语义，但补充：

- `nodeKind`
- `locale content status`
- `entity current state`

### `listDocumentReviewQueue`

```ts
input: {
  slug: string;
  fromVersionTag: string;
  toVersionTag: string;
  types?: string[];
  reviewStates?: string[];
  minConfidence?: number;
}
output: DocumentReviewQueuePage
```

### `getDocumentReviewDetail`

```ts
input: { changeId: string }
output: DocumentReviewDetail
```

### `submitDocumentReview`

```ts
input: {
  changeId: string;
  action: 'confirm' | 'reject' | 'override';
  reason?: string;
  overridePayload?: {
    type?: string;
    entityId?: string | null;
    fromNodeRefId?: string | null;
    toNodeRefId?: string | null;
    relations?: Array<{
      side: 'from' | 'to';
      nodeRefId: string | null;
      entityId: string | null;
      weight: number | null;
    }>;
  };
}
output: {
  reviewRevision: number;
  latestState: string;
}
```

---

## 10. 数据映射规则

## 10.1 `DocumentNode` 到阅读 section

映射规则：

1. 过滤 `.title` 作为独立 section 的输出
2. 将父节点下的 `.title` 内容聚合为 `title`
3. 将正文节点映射为可渲染 section
4. 保留 `nodeId` 用于锚点与路由 hash
5. 保留 `entityId` 用于历史入口

## 10.2 `DocumentNodeChange` 到变更卡片

映射规则：

1. 以 change 为卡片主单位
2. `fromNodeRefId` / `toNodeRefId` 为基础关系
3. `DocumentNodeChangeRelation` 为复杂关系补充
4. `details` 只作为补充解释，不作为主要结构来源

## 10.3 `DocumentChangeReview` 到前端状态

映射规则：

- 公共站点默认消费“已审核视图”
- 控制台消费“审核事实 + 审核缓存状态”
- `reviewRevision` 必须显式回传，用于客户端缓存键

---

## 11. 缓存、SEO 与可访问性

## 11.1 缓存

### 阅读页

- 可按 `slug + versionTag + locale` 缓存
- 稳定性高

### 对比页

- 必须将 `mode` 与 `reviewRevision` 纳入缓存键
- 否则审核后页面可能读取旧结果

### 历史页

- 可按 `entityId + locale + currentVersionTag` 缓存

## 11.2 SEO

公共站点中建议让以下页面可索引：

- 默认最新版阅读页

默认不建议索引：

- diff 页
- history 页

## 11.3 可访问性

必须保证：

- 目录树支持键盘导航
- section 锚点可聚焦
- diff 色彩不是唯一信息来源
- 时间线和审核状态有可读文本标签

---

## 12. 分阶段落地建议

## 12.1 第一阶段：统一公共阅读模型

目标：

- 让 `magic-cr` 阅读页完全切到文档模型

范围：

- 文档阅读页
- 目录树
- 节点历史入口

不含：

- 结构化对比
- 审核工作台

## 12.2 第二阶段：结构化对比与实体历史

目标：

- 让 diff / history 与新模型语义一致

范围：

- 变更卡片
- `entityId` 历史时间线
- reviewed / snapshot 模式切换

## 12.3 第三阶段：控制台审核

目标：

- 打通待审核到确认 / override 的工作链路

范围：

- 审核队列
- 详情页
- 关系编辑

---

## 13. 风险与约束

### 风险 1：继续沿用 `RuleItem`

后果：

- 多文档扩展会再次绑死在规则页语义

应对：

- 第一阶段先建立 `DocumentReaderPage`

### 风险 2：history 继续用 `nodeId`

后果：

- rename / move 后历史断裂

应对：

- 历史页强制改为 `entityId`

### 风险 3：diff 继续只做文本双栏

后果：

- `split` / `merged` 无法被清晰表达

应对：

- 对比页主单位改为变更卡片

### 风险 4：公共站点暴露未审核结果

后果：

- 用户看到之后还会被推翻的变化

应对：

- 公共站点默认只展示 `reviewed`

---

## 14. 当前完成情况（2026-04-15）

### 14.1 已完成

- 公共阅读页已从旧 `rule` 模型迁移到 `/document/[slug]`
- 阅读链路已接入通用文档 BFF
- `DocumentReaderPage` / `DocumentReaderSummary` / `DocumentReaderChapter` 已落地
- 阅读页已支持最新版默认打开、版本切换、目录导航、正文锚点定位
- 目录树与正文 section 已按通用文档模型渲染
- 左侧目录已收敛为 `heading` 与 `implicit_heading`
- 正文快捷菜单已支持复制文本与复制链接
- `example` 已改为独立示例块展示，不再显示 serial
- 阅读页节点类型中的 `term` 已统一重命名为 `implicit_heading`

### 14.2 部分完成

- 阅读页整体可用，但历史入口仍未真正接通，当前仅保留占位
- 阅读页样式已明显简化，但设计稿中提到的右栏上下文面板未保留到当前实现

### 14.3 尚未完成

- 文档对比页的结构化 BFF 与变更卡片
- `entityId` 视角的历史页
- 控制台审核队列、详情与提交链路
- 审核相关缓存失效与旧 `rule` 模型彻底收口

### 14.4 与原方案的偏差说明

- 原方案中的右侧上下文面板在当前实现中被移除，阅读页现阶段以正文阅读为主
- `DocumentOutlineItem.kind` 与 `DocumentReaderSection.kind` 中的 `term` 已调整为 `implicit_heading`
- `latestChange`、审核状态与关系图等重信息暂未进入当前公共阅读页

## 15. 结论

当前文档模型在前端的正确打开方式不是“做一个更通用的 rule 页面”，而是建立一套面向任务的产品分层：

- 阅读页：按 `nodeId` 导航与阅读
- 对比页：按 `change` 聚合展示版本变化
- 历史页：按 `entityId` 追踪节点演化
- 审核页：按工作台模型处理复杂变更

它们共同构成一套完整的文档前端系统：

- 公共站点强调稳定、已确认、可阅读
- 控制台强调透明、可追踪、可修正

这套分层既能承接当前 `magic-cr`，也能为后续 `MTR`、`IPG` 等文档提供统一前端骨架。
