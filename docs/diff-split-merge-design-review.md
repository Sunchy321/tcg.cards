# Diff 页面拆分/合并展示 — 设计评审

## 评审结论

**通过**，有以下补充建议。

## 方案优点

1. **问题分析透彻**：准确指出 split/merged 当前仅展示单侧、另一侧被省略或消失的问题
2. **Schema 设计合理**：将 1:N/N:1 的 split/merged 与 1:1 的 change 分离为独立 kind，类型安全，前端分支清晰
3. **排除机制正确**：relation 节点从正常遍历中排除，避免重复出现
4. **moved 重新设计合理**：拆为 from/to 两行，准确反映节点在两个版本中的实际位置
5. **统一箭头/跳转策略**：短距离完整箭头、长距离截断箭头 + 跳转，视觉语言一致

## 补充建议

### 1. split 行中 relation 节点的顺序

方案中提到 to-side 节点按 `sortOrder` 排序。需要确认：这些节点在 to 版本中的物理顺序（siblingOrder）可能与 sortOrder 不一致（sortOrder 是按匹配分数排的）。建议在前端展示时按节点在 to 版本中的实际文档顺序排列，而非 relation 的 sortOrder。

### 2. split/merged 节点的内容加载

方案提到把 relation 中 `nodeRefId` 加入 `changedNodeIds`。当前端点是全量加载两个版本的节点，所以节点元数据已有，只需确保 content 被加载即可。

### 3. 箭头/跳转的距离阈值

方案初定阈值为 10 行。建议按像素距离而非行数判断，因为不同行的高度差异很大（heading vs 多段落内容）。具体阈值可在实现时调整。

### 4. 统计卡片的筛选交互

方案中 split 和 merged 合并为一张统计卡片显示。筛选器中分开为 "拆分" 和 "合并" 两个选项，合理。

### 5. moved 的 stats 计数

moved 拆成两行后，stats 应仍然计为 1 个 moved（而非 2 个）。后端生成 rows 时仅对其中一行计数，或者用 pairKey 去重。

### 6. 边界情况

- split/merged 的 relation 为空（数据异常）：应 fallback 为普通 change 行展示
- split 的 to-side 只有 1 个 relation（逻辑上不应出现，但防御性处理）：退化为普通 change 行
- moved 的两行在筛选时应同时显示或同时隐藏
