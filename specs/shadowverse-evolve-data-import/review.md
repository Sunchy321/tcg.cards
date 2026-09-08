# 影之诗 Evolve 卡牌数据导入设计评审

## 评审记录

评审于 2026-08-30 通过逐项问答完成，设计方向与各决策点均已由用户确认。

| 决策点 | 结论 |
| --- | --- |
| 语言范围 | 日文官方 + 英文官方 + 简中（SVE Helper 公开接口）；简中约 6661 张，最新卡包可能滞后置空 |
| 抓取深度 | 详情页全量（画师、风味、Q&A 全字段） |
| 官方 Q&A | 入库（带编号与日期） |
| errata | 第一期不做，另立需求 |
| publish | 第一期不做（与 Beyond 一致，本地闭环优先） |

## 数据源验证

以下结论均于 2026-08-30 实测验证：

- 日文官方：cardsearch 列表（GET 筛选）+ `?cardno=` 详情页 + 卡图 URL 规律（`/wordpress/wp-content/images/cardlist/{卡包}/{小写卡号}.png`），约 7366 张
- 英文官方：`/cards/searchresults/?expansion={卡包}` 按包列表（有分页）+ `EN` 后缀卡号 + 卡图规律（`{卡包}/{卡号EN}.png`）
- 简中 SVE Helper：`POST https://www.svehelperwin.com/api/card/getCardList`（`pageable.page/limit`）公开可用，返回 `name_jp/name_cn/desc_jp/desc_cn/drawer/related_card_nos/speech` 等完整字段

若官方站点改版或 SVE Helper 接口变更，导入实现会失败并暴露问题，届时重新验证并更新 design.md。

## 遗留事项

- 英文卡号（`EN` 后缀）与日文卡号的映射规则在实施期确认并落库
- errata（卡牌修正）另立需求
- 简中来源为第三方社区服务（SVE Helper），可用性不受我方控制；接口变更时导入失败并暴露，简中字段缺失不阻塞日/英数据导入
