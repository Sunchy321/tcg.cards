# Diff 页面拆分/合并/移动展示 — 实施计划

## Todo List

- [ ] 1. Schema：在 `documentDiffRow` 中新增 `split`、`merged`、`moved` kind
- [ ] 2. 后端：查询 relations 并构建 relationsMap
- [ ] 3. 后端：将 relation nodeRefId 加入内容加载列表
- [ ] 4. 后端：构建排除集合，在遍历中跳过 relation 节点
- [ ] 5. 后端：处理 moved 变更，拆为 from/to 两行
- [ ] 6. 后端：处理 split/merged 变更，生成对应 kind 的行
- [ ] 7. 后端：更新 stats 计数逻辑（moved 去重、split/merged 计数）
- [ ] 8. 前端：添加 split/merged 行渲染（三栏布局 + SVG 箭头）
- [ ] 9. 前端：添加 moved 行渲染（单侧 + 箭头/跳转按钮）
- [ ] 10. 前端：实现箭头/跳转统一策略（短距离完整箭头，长距离截断 + 跳转）
- [ ] 11. 前端：更新统计卡片，新增拆分/合并卡片
- [ ] 12. 前端：更新筛选器，添加拆分、合并选项；moved 筛选配对联动
- [ ] 13. i18n：添加相关翻译文本

## 详细步骤

### 1. Schema 变更

**文件**: `packages/model/src/magic/schema/document-page.ts`

在 `documentDiffRow` 的 discriminated union 中新增：
```ts
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
  kind:       z.literal('moved'),
  pairKey:    z.string(),
  side:       z.enum(['from', 'to']),
  section:    documentDiffSection,
  peerSerial: z.string().nullable(),
}),
```

同步更新类型导出。

### 2. 后端：查询 relations

**文件**: `apps/site-magic/server/orpc/magic/document.ts`

在加载 changes 之后，过滤出 split/merged 的 change id，查询 `DocumentNodeChangeRelation`：

```ts
const splitMergedChanges = changes.filter(c => c.type === 'split' || c.type === 'merged');
const splitMergedIds = splitMergedChanges.map(c => c.id);

const relations = splitMergedIds.length === 0 ? [] :
  await db.select({
    changeId:  DocumentNodeChangeRelation.changeId,
    side:      DocumentNodeChangeRelation.side,
    nodeRefId: DocumentNodeChangeRelation.nodeRefId,
    sortOrder: DocumentNodeChangeRelation.sortOrder,
  })
    .from(DocumentNodeChangeRelation)
    .where(inArray(DocumentNodeChangeRelation.changeId, splitMergedIds));

const relationsMap = new Map<string, typeof relations>();
for (const rel of relations) {
  const list = relationsMap.get(rel.changeId) ?? [];
  list.push(rel);
  relationsMap.set(rel.changeId, list);
}
```

### 3. 后端：加载 relation 节点内容

**文件**: `apps/site-magic/server/orpc/magic/document.ts`

在构建 `changedNodeIds` 时，追加 relation 中的 nodeRefId：

```ts
const relationNodeIds = relations
  .map(r => r.nodeRefId)
  .filter(Boolean) as string[];

const changedNodeIds = [
  ...new Set([
    ...changes.flatMap(c => [c.fromNodeRefId, c.toNodeRefId].filter(Boolean) as string[]),
    ...relationNodeIds,
  ]),
];
```

### 4. 后端：构建排除集合

**文件**: `apps/site-magic/server/orpc/magic/document.ts`

```ts
// split 的 to-side 节点不应在主遍历中出现
const excludedToNodeIds = new Set<string>();
// merged 的 from-side 节点不应在 removed 定位中出现
const excludedFromNodeIds = new Set<string>();

for (const change of splitMergedChanges) {
  const rels = relationsMap.get(change.id) ?? [];
  if (change.type === 'split') {
    for (const r of rels) {
      if (r.side === 'to' && r.nodeRefId) excludedToNodeIds.add(r.nodeRefId);
    }
  } else if (change.type === 'merged') {
    for (const r of rels) {
      if (r.side === 'from' && r.nodeRefId) excludedFromNodeIds.add(r.nodeRefId);
    }
  }
}
```

在遍历 `orderedTo` 时跳过 `excludedToNodeIds`。
在构建 `removedInsertions` 时跳过 `excludedFromNodeIds`。

### 5. 后端：处理 moved 变更

**文件**: `apps/site-magic/server/orpc/magic/document.ts`

当前 moved/renamed 作为普通 change 行出现在 `orderedTo` 遍历中。需改为：

1. 从 `changeByToRef` 和 `changeByFromRef` 中识别 moved/renamed 类型
2. 将 moved 节点从正常遍历中排除（`excludedToNodeIds` 追加 moved 的 toNodeRefId）
3. 在 `removedInsertions` 逻辑中，moved 的 from-side 产生一行 `{ kind: 'moved', pairKey, side: 'from', section, peerSerial }`
4. 在 `orderedTo` 遍历中的对应位置（不再被排除后需要特殊处理），在 moved 节点的 to 位置插入 `{ kind: 'moved', pairKey, side: 'to', section, peerSerial }`
5. `pairKey` 使用 change 的 id
6. `peerSerial` 取对端节点的 serial（如 `§7.1`）

注意：moved 节点不排除在 `orderedTo` 中，而是遍历时遇到 moved 类型的 change，直接生成 moved-to 行（而非 change 行）。moved 的 from-side 行通过 `removedInsertions` 逻辑插入。

### 6. 后端：处理 split/merged 变更

**文件**: `apps/site-magic/server/orpc/magic/document.ts`

在 removed 节点插入逻辑中，当 change 类型为 `split` 时：
- 获取 relations，取 to-side 节点按文档顺序排序（使用 `toAllNodes` 中的位置）
- 如果 relation 为空或只有 1 个 to-side 节点，fallback 为普通 change 行
- 否则生成 `{ kind: 'split', pairKey: change.id, from: buildSection(removed), to: [...] }`

在 `orderedTo` 遍历中，当 change 类型为 `merged` 时：
- 获取 relations，取 from-side 节点按文档顺序排序（使用 `fromAllNodes` 中的位置）
- 如果 relation 为空或只有 1 个 from-side 节点，fallback 为普通 change 行
- 否则生成 `{ kind: 'merged', pairKey: change.id, from: [...], to: buildSection(toNode) }`

### 7. 后端：更新 stats

**文件**: `apps/site-magic/server/orpc/magic/document.ts`

遍历 rows 时：
- `kind === 'split'` → `stats.split++`
- `kind === 'merged'` → `stats.merged++`
- `kind === 'moved' && side === 'to'` → `stats.moved++`（仅 to 侧计一次，避免重复）
- `kind === 'change' && type === 'moved'` 不应再出现（已拆分）

### 8. 前端：split/merged 行渲染

**文件**: `apps/site-magic/app/pages/document/[slug]/diff.vue`

新增 split/merged 行的模板：
- 外层容器：紫色背景 + 三栏 grid（`grid-cols-[1fr_48px_1fr]`）
- 左栏：单节点（split）或多节点堆叠（merged），垂直居中
- 中栏：SVG 容器，绘制贝塞尔曲线箭头
- 右栏：多节点堆叠（split）或单节点（merged），垂直居中

SVG 箭头组件逻辑：
- 用 `ref` 获取左右节点的 DOM 元素
- `onMounted` + `nextTick` 计算各节点垂直中点
- `useResizeObserver` 监听容器变化，重新计算
- 贝塞尔路径：`M 0,y1 C cp,y1 w-cp,y2 w,y2`（cp = w * 0.4）
- 箭头 marker：SVG `<marker>` 三角形

### 9. 前端：moved 行渲染

**文件**: `apps/site-magic/app/pages/document/[slug]/diff.vue`

moved-from 行：琥珀色背景，左栏显示节点内容，右栏空白，右侧边缘显示 `→ §X.Y` 跳转按钮。

moved-to 行：琥珀色背景，左栏空白，右栏显示节点内容，左侧边缘显示 `← §X.Y` 跳转按钮。

### 10. 前端：箭头/跳转统一策略

**文件**: `apps/site-magic/app/pages/document/[slug]/diff.vue`

对同一 `pairKey` 的配对行：
1. 渲染后计算配对行间的像素距离
2. 若距离 ≤ 阈值（如 500px）：绘制 SVG 贝塞尔曲线连接两行（全局 overlay）
3. 若距离 > 阈值：各行显示箭头尾/头标记，点击平滑滚动到对端 + 高亮闪烁 2 秒

对于 split/merged 行：箭头始终在行内部的中间栏绘制（不受距离影响），因为多侧节点与单侧节点在同一行内。

对于 moved 行：根据距离选择完整箭头或截断跳转。

跳转实现：
- 每行通过 `data-pair-key` 属性标记
- 点击跳转时 `document.querySelector([data-pair-key="..."])` 找到对端
- `scrollIntoView({ behavior: 'smooth', block: 'center' })`
- 对端行添加 `animate-highlight` class，2 秒后移除

### 11. 前端：统计卡片

**文件**: `apps/site-magic/app/pages/document/[slug]/diff.vue`

在现有统计卡片（added/removed/modified/other）之后，新增一张紫色卡片：
- 显示 `stats.split + stats.merged`
- 图标使用 split 相关图标
- 仅在 `split + merged > 0` 时显示

moved 已有统计，无需新增。

### 12. 前端：筛选器

**文件**: `apps/site-magic/app/pages/document/[slug]/diff.vue`

在筛选下拉的选项中新增：
- `{ value: 'split', label: t('magic.document.split') }`
- `{ value: 'merged', label: t('magic.document.merged') }`

筛选逻辑更新：
- `kind === 'split'` 匹配 filter `'split'`
- `kind === 'merged'` 匹配 filter `'merged'`
- `kind === 'moved'` 匹配 filter `'moved'`
- moved 的配对行（同 pairKey）在筛选时同时显示或同时隐藏

### 13. i18n

**文件**: `apps/site-magic/i18n/locales/en/magic/index.ts` 和 `zhs/magic/index.ts`

添加：
- `split`: "Split" / "拆分"
- `merged`: "Merged" / "合并"
- `splitMerged`: "Split / Merged" / "拆分/合并"
- `movedAway`: "Moved away" / "移走"
- `movedHere`: "Moved here" / "移入"
