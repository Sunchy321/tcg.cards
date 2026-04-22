# P4 查询兼容迁移详细计划

## TODO List

- [x] 确认 P4 继续归属 `specs/hearthstone-card-model`
- [x] 盘点 `site-hearthstone` 当前卡牌查询入口
- [x] 明确 `card_relations -> entity_relations` 的切换范围
- [x] 补齐卡牌详情输出 schema 的 hash 字段
- [x] 收敛 `latest` / `version` 的查询规则
- [x] 切换 `random`、`summary`、`full`、`diff` 到新查询语义
- [ ] 补齐独立 Tag 查询入口
- [x] 回写主计划中的 P4 当前状态

## 当前状态（2026-04-22）

P4 已进入首轮实现，并已完成查询兼容迁移中的核心闭环：

- `site-hearthstone` 现有卡牌详情链路已切到新默认层视图语义
- `full` 详情页相关卡片查询已从旧 `card_relations` 切到 `entity_relations`
- `cardEntityView` / `cardFullView` 输出 schema 已补齐 `revisionHash`、`localizationHash`、`renderHash`
- `random` 已收敛到已投影的最新卡集合，避免抽到未进入新视图的数据
- 历史 diff 查询已复用与详情页一致的版本选卡逻辑

当前仍未完成项：

- 尚未新增独立的 Tag 查询接口
- 仍需补充 P4 的定向验证与可能的前端历史查询入口

## 已确认边界

- P4 只切换查询层，不重新导入 XML，也不重跑投影
- P4 继续复用 `hearthstone.entity_view`、`hearthstone.card_entity_view`、`hearthstone.entity_relations`
- P4 不回填历史 build，不处理图片迁移
- P4 不再新增独立提案包，设计与计划继续收敛在当前 `specs/hearthstone-card-model`

## 目标

P4 首轮完成后，应满足：

- 现有 `card.summary`、`card.full`、`card.profile`、`card.diff` 可稳定读取新模型
- `relatedCards` 聚合不再依赖旧 `card_relations`
- 默认“最新版本”查询显式依赖 `isLatest`
- 指定 `version` 的查询继续按 build 命中对应版本集合
- 输出 schema 对外暴露结构修订和渲染修订 hash

## 非目标

P4 首轮不做以下工作：

- 不设计新的全文搜索或高级筛选 DSL
- 不新增控制台 Tag 管理页面
- 不一次性补齐所有未来可能的查询接口
- 不移除数据库中的旧 `card_relations` 表，只停止在查询层继续依赖它

## 查询迁移规则

### 1. 最新版本查询

当请求未显式提供 `version` 时：

- 卡牌详情与摘要查询显式要求 `isLatest = true`
- 相关卡牌的反向关系查询也显式要求 `entity_relations.isLatest = true`
- 随机卡牌只从已投影且 `isLatest = true` 的卡集合中抽取

### 2. 指定版本查询

当请求显式提供 `version` 时：

- 卡牌详情与摘要继续使用 `version = any(view.version)` 命中
- 历史 diff 查询的两端都必须使用同一套版本命中逻辑
- 反向 related cards 聚合使用 `version = any(entity_relations.version)` 限定

### 3. related cards 聚合

`full` 详情页中的 related cards 分两部分：

- 正向关系：从 `entity_relations` 按 `sourceId + sourceRevisionHash` 读取
- 反向关系：从 `entity_relations` 按 `targetId` 读取，并按 `version` / `isLatest` 过滤

兼容输出仍保留：

- `relation`
- `cardId`
- `version`

其中反向关系继续用兼容 relation 值 `source` 表示“被哪些卡引用”。

## 输出 schema 调整

`cardEntityView` / `cardFullView` 需要对外暴露：

- `revisionHash`
- `localizationHash`
- `renderHash`

这些字段已在数据库视图中存在，P4 只负责把模型层契约补齐并让 ORPC 输出显式携带这些字段。

## 实施步骤

### Step 1：梳理旧依赖

- 确认 `apps/site-hearthstone/server/orpc/hearthstone/card.ts` 仍依赖 `card_relations`
- 确认 `packages/model/src/hearthstone/schema/entity.ts` 尚未暴露 hash 字段

### Step 2：收敛选卡逻辑

- 抽出统一的 `findCardView` 逻辑
- 对 `summary`、`full`、`diff` 使用统一版本匹配规则
- 默认 latest 查询显式依赖 `isLatest`

### Step 3：切换关系查询

- 将 `full` 的正向关系查询切到 `entity_relations`
- 将 `full` 的反向关系查询切到 `entity_relations`
- 保持前端 `relatedCards` 现有结构不变

### Step 4：补齐契约

- 在模型层补齐 `revisionHash`、`localizationHash`、`renderHash`
- 将 `diff` 暴露到 `cardTrpc`
- 保持现有页面无需修改即可继续消费

## 验收标准

- `card.full` 在新模型下可返回 related cards
- `card.diff` 可以按 build 读取两个历史版本
- `cardEntityView` / `cardFullView` 输出包含三类 hash
- 随机卡牌不会落到未投影卡数据

## 后续缺口

- 新增独立 Tag 查询入口
- 评估是否需要把 `renderModel` 也作为查询输出的一部分
- 补齐 P4 对应的自动化验证
