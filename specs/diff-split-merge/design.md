# Diff 页面拆分/合并/移动的展示设计

## 现状分析

### 当前数据流

`DocumentNodeChange` 中 split/merged 的记录方式：

| 类型 | `fromNodeRefId` | `toNodeRefId` | `entityId` | Relations |
|------|----------------|---------------|------------|-----------|
| `split` | 旧节点 ID | `null` | 旧实体 | from: 1 条旧节点; to: N 条新节点 |
| `merged` | `null` | 新节点 ID | 新实体 | from: N 条旧节点; to: 1 条新节点 |

### 当前 compare 端点的问题

1. **未查询 `DocumentNodeChangeRelation`**，因此 split/merged 只有主记录的单侧数据
2. **split 的行为**：`fromNodeRefId` 有值、`toNodeRefId` 为 null → 被当作类似 removed 处理（左侧有，右侧空）；而拆分产生的新节点不在 `changeByToRef` 中，被当作"未变更"计入省略
3. **merged 的行为**：`toNodeRefId` 有值、`fromNodeRefId` 为 null → 被当作类似 added 处理（左侧空，右侧有）；被合并的旧节点不在 `changeByFromRef` 中，也不在 `toEntitySet` 中，被完全跳过

结论：split/merged 当前在 diff 页面上的展示是**不完整且有误导性的**。

### moved/renamed 的现状

moved 和 renamed 是 1:1 映射，`fromNodeRefId` 和 `toNodeRefId` 都有值，不涉及 relations。当前展示有位置问题：moved 节点只出现在 to 版本的位置，用户无法看出它从旧文档的哪个位置移走。

需要改为拆成两行：旧位置一行（左有右空），新位置一行（左空右有），配合箭头/跳转表达对应关系。

## 设计方案

### Schema 变更

在 `documentDiffRow` 的 discriminated union 中新增 kind：

```ts
z.discriminatedUnion('kind', [
  // 现有
  z.strictObject({ kind: z.literal('omitted'), count: z.number() }),
  z.strictObject({
    kind:     z.literal('change'),
    type:     nodeChangeType,
    from:     documentDiffSection.nullable(),
    to:       documentDiffSection.nullable(),
    textDiff: documentChangeTextDiff.nullable(),
  }),
  // 新增
  z.strictObject({
    kind:    z.literal('split'),
    pairKey: z.string(),
    from:    documentDiffSection,
    to:      documentDiffSection.array(),
  }),
  z.strictObject({
    kind:    z.literal('merged'),
    pairKey: z.string(),
    from:    documentDiffSection.array(),
    to:      documentDiffSection,
  }),
  z.strictObject({
    kind:    z.literal('moved'),
    pairKey: z.string(),
    side:    z.enum(['from', 'to']),
    section: documentDiffSection,
    peerSerial: z.string().nullable(),
  }),
])
```

说明：
- split/merged：数据形状为 1:N / N:1，独立 kind 让前端分支清晰
- moved：拆为两行，`side` 标识本行是起点还是终点，`peerSerial` 显示对端编号（如 "§7.1"）
- `pairKey`：同一变更产生的行共享相同 key，用于前端箭头绘制和跳转配对
- textDiff 对 split/merged/moved 暂不支持

### 后端变更（compare 端点）

#### 1. 加载 relations

对 split/merged 类型的 change 查询 `DocumentNodeChangeRelation`：

```ts
const splitMergedIds = changes
  .filter(c => c.type === 'split' || c.type === 'merged')
  .map(c => c.id);

const relations = splitMergedIds.length === 0 ? [] :
  await db.select(...).from(DocumentNodeChangeRelation)
    .where(inArray(DocumentNodeChangeRelation.changeId, splitMergedIds));
```

构建 `relationsMap: Map<changeId, Relation[]>`。

#### 2. 加载 relation 节点的内容

把 relation 中的 `nodeRefId` 加入 `changedNodeIds`，确保它们的 content 被加载到 `contentMap`。

#### 3. 排除 relation 节点

split 的 to-side 节点和 merged 的 from-side 节点需要从正常遍历中排除：

- 构建 `excludedToNodeIds: Set<string>` — split relations 的 to-side nodeRefId
- 构建 `excludedFromNodeIds: Set<string>` — merged relations 的 from-side nodeRefId
- 在遍历 `orderedTo` 时，跳过 `excludedToNodeIds` 中的节点
- 在构建 `removedInsertions` 时，跳过 `excludedFromNodeIds` 中的节点

#### 4. 生成行

**split 行的定位**：
- split change 有 `fromNodeRefId`，会出现在 `changeByFromRef` 中
- 当前的 removed 插入逻辑会将它定位到 to 版本中合适的位置
- 修改：当遇到 split 类型时，不生成 `kind: 'change'` 行，而是生成 `kind: 'split'` 行
- from 侧：主记录的 fromNodeRefId 对应的节点
- to 侧：relations 中 `side === 'to'` 的所有节点，按 `sortOrder` 排序

**merged 行的定位**：
- merged change 有 `toNodeRefId`，会出现在 `changeByToRef` 中
- 遍历 `orderedTo` 时自然会遇到它
- 修改：当遇到 merged 类型时，生成 `kind: 'merged'` 行
- from 侧：relations 中 `side === 'from'` 的所有节点，按 `sortOrder` 排序
- to 侧：主记录的 toNodeRefId 对应的节点

### 前端变更

#### 颜色

为 split/merged 使用紫色系背景，与其他类型区分：
- `bg-violet-50/60` / `dark:bg-violet-500/5`

#### 布局

采用三栏布局：左侧节点区 | 中间箭头区 | 右侧节点区。

箭头区宽度固定（约 48px），使用 SVG 绘制贝塞尔曲线箭头，连接左侧节点的右侧锚点到右侧节点的左侧锚点。

**split 行**：
```
┌──────────────┬────┬──────────────┐
│              │  ↗ │  新节点 1     │
│  旧节点      │ ─→ ├──────────────┤
│              │  ↘ │  新节点 2     │
│              │    ├──────────────┤
│              │    │  新节点 3     │
└──────────────┴────┴──────────────┘
```

左侧 1 个旧节点垂直居中，箭头从旧节点右侧中点出发，分叉连向右侧每个新节点的左侧中点。

**merged 行**：
```
┌──────────────┬────┬──────────────┐
│  旧节点 1    │ ↘  │              │
├──────────────┤ ─→ │  新节点      │
│  旧节点 2    │ ↗  │              │
├──────────────┤    │              │
│  旧节点 3    │    │              │
└──────────────┴────┴──────────────┘
```

右侧 1 个新节点垂直居中，箭头从左侧每个旧节点右侧中点出发，汇聚到新节点的左侧中点。

#### 箭头绘制

使用 SVG `<path>` 绘制三次贝塞尔曲线（cubic bezier），箭头末端带三角形 `<marker>`。

锚点计算方式：
- 渲染完成后，通过 `ref` + `getBoundingClientRect()` 获取每个节点卡片相对于 SVG 容器的垂直中点
- 左侧锚点 x = 0（SVG 左边界），右侧锚点 x = svgWidth（SVG 右边界）
- 控制点：水平方向偏移 svgWidth 的 40%，形成平滑的 S 型曲线

```
M x1,y1 C x1+cp,y1 x2-cp,y2 x2,y2
```

其中 cp = svgWidth * 0.4。

使用 `useResizeObserver` 或在 `onMounted` + `nextTick` 中计算坐标，当窗口/容器尺寸变化时重新计算。

曲线样式：
- 线宽 1.5px，颜色与紫色主题一致（`stroke: var(--color-violet-400)`）
- 箭头 marker：三角形，大小 6x6，`fill` 同线色
- dark mode 下使用 `var(--color-violet-500)`

#### 箭头与跳转（统一策略）

对 moved、split、merged 三种类型，采用统一的箭头/跳转策略：

| 距离 | 渲染 | 交互 |
|------|------|------|
| 短（配对行均在视口内或相距不超过阈值） | 完整贝塞尔曲线箭头连线 | 无需交互 |
| 长（配对行超出阈值距离） | 出发端显示箭尾标记，到达端显示箭头标记 | 点击跳转到对端 + 高亮闪烁 |

**距离判断**：通过 `pairKey` 找到同组的所有行，计算它们之间的行数差。阈值初定为 10 行（可后续调整）。

**短距离箭头**：在行之间的间隙区域绘制 SVG 贝塞尔曲线，连接配对行。
- split/merged：箭头在同一行内绘制（三栏布局中的中间区域），始终为短距离
- moved：箭头跨行绘制，需要全局 SVG overlay

**长距离跳转标记**：
- 在行的边缘显示一个小箭头图标按钮
- moved-from 行：右侧显示 `→ §X.Y` 按钮
- moved-to 行：左侧显示 `← §X.Y` 按钮
- 点击后平滑滚动到对端行，对端行闪烁高亮 2 秒

#### 标签

在行的顶部显示操作类型标签：
- split：「拆分」/ "Split" — 带 `↗` 图标
- merged：「合并」/ "Merged" — 带 `↘` 图标
- moved-from：「移走」/ "Moved away" — 带 `→` 图标
- moved-to：「移入」/ "Moved here" — 带 `←` 图标

#### 统计卡片

stats 中已有 `split` 和 `merged` 字段。在统计栏新增一个卡片：
- 「拆分/合并」显示 `split + merged` 的总数，紫色，使用 split 图标

moved 已有统计，无需新增。

#### 筛选器

在类型筛选下拉中加入 split 和 merged 选项。
moved 筛选时应同时显示 from 和 to 两行。

### 不涉及的范围

- **textDiff**：split/merged/moved 不计算 inline diff
- **relations 的权重/置信度**：暂不在前端展示，但数据已返回，后续可扩展

### 已知问题（留作后续处理）

- **多箭头重叠**：多个短距离 moved 聚集在同一区域时，全局 overlay 上的贝塞尔曲线可能交叉重叠。实际场景中短距离 moved 较少见，初期不做防重叠处理。后续可选方案：降低不透明度（`opacity: 1/n`）、hover 时才显示对应曲线、为同区域多条曲线分配不同控制点偏移量。
