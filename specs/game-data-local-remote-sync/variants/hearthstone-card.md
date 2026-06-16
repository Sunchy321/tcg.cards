# Hearthstone Card 领域特定规则

> 稳定的运行时边界、数据归属和同步规则以 [../../../docs/project-architecture.zh-CN.md](../../../docs/project-architecture.zh-CN.md) 和 [../design.md](../design.md) 为准。本文只保留 `hearthstone-card` 的领域特定发布说明，不重复总文档中的通用 `publish-owned` 设计。

## 关联表范围

当前 `hearthstone-card` 的 `publish-owned` 结果主要覆盖以下表：

- `hearthstone.cards`
- `hearthstone.entities`
- `hearthstone.entity_localizations`
- `hearthstone.entity_relations`

这些表在通用设计中仍然按**行级增量发布**处理。

## 领域分组术语

虽然总文档中的首轮 `publish-owned` 骨架采用行级增量发布，但在 Hearthstone card 场景里，仍然保留两类领域分组术语，便于描述结果组织方式：

- `card_head`
  - 指 card 级、非 version 展开的结果范围
- `card_versions`
  - 指共享同一 `versions` 数组的版本化结果范围

这里的 `versions` 仍需满足：

- 稳定排序
- 去重
- 固定序列化

这些术语用于解释领域结果如何组织，不表示总文档中的通用 `publish-owned` 发布计划需要切换回对象级执行模型。

## 行级成员关系说明

`hearthstone-card` 的结果行并不是来自单一父表主键，而是来自 card 级与 version 级投影结果的组合。

固定说明为：

- `hearthstone.cards` 更接近 `card_head` 范围
- `hearthstone.entities`、`hearthstone.entity_localizations`、`hearthstone.entity_relations` 更接近 `card_versions` 范围
- 某些版本化结果的成员关系需要依赖共享的 `versions` 数组来解释，而不是依赖单一父表行

这条说明的目标是帮助后续实现理解：

- 为什么这些表需要作为同一 `publishType` 的关联表组一起收敛到最终一致状态
- 为什么某些重投影或排障分析需要同时看多张表，而不是逐表孤立理解

## 重建与排障注意事项

`hearthstone-card` 的 bootstrap / rebuild 仍然遵循总文档中的通用规则，但在领域分析上还应注意：

- 重建时应同时关注 card 级结果和 version 级结果
- 同一 generation、同一 source/build 范围下，`versions` 相关结果必须保持稳定
- 当需要解释为什么若干行属于同一组结果时，应优先使用 `card_head` / `card_versions` 这两个领域术语，而不是重新引入对象级 publish 单元

## 边界

本文不再维护以下内容：

- 对象级 manifest 设计
- 对象级 dirty queue
- 对象级 baseline cursor
- `hsdata` 术语

这些内容要么已经被总文档中的通用规则取代，要么已不再作为当前方案的实现方向保留。
