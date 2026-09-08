# 游戏王卡名与本地化数据重构方案

## 背景

当前 `yugioh.cards` 直接按百鸽 `cards.json` 的字段建模：`cn_name`、`sc_name`、`md_name`、`nwbbs_name`、`cnocg_name`、`jp_name`、`en_name` 等均为卡表列。

这使卡表同时承担卡牌身份、游戏规则事实、不同语言文本和同语言不同叫法四种职责；未来新增一个别名就要修改数据库结构和发布流程。

百鸽页面会将一个中文主名与多个中文名称共同展示。项目需要保留其中 MD、CNOCG、NWBBS 等中文名称，并让它们参与检索。

## 已确认的领域定义

- **卡牌事实**：不随语言变化的资料，例如 `cid`、密码、OT、属性、种族、攻击、守备、等级、类型位掩码和系列位掩码。
- **本地化**：同一张卡在一个语言下的名称及该语言的文本资料。
- **卡名变体**：同一张卡、同一语言下的另一个名称；MD、CNOCG、NWBBS 中文名均为中文卡名变体，不是独立卡牌，也不是独立导入源。
- **导入源**：本次仅为百鸽。导入源与卡名变体必须分开建模。
- **中文主名称**：本站默认显示 YGOPro 译名 `cn_name`；它不是唯一可检索的中文名称。

## 目标结构

### `yugioh.cards`

只保留语言无关的卡牌事实和现有图片元数据：

```text
id / cid / password
ot / setcode / type / attack / defense / level / race / attribute
图片元数据 / 审计字段 / 软删除字段
```

删除所有名称与文本列，不再出现 `cn_name`、`md_name` 等按来源命名的列。

### `yugioh.card_localizations`

一行表示一张卡在一种语言下的规范本地化资料：

```text
card_id + locale                 // 联合主键
name                             // 该语言主名称
name_ruby                        // 仅日文等有读音的语言可填
types_text
pendulum_description
description
created_at / updated_at / deleted_at
```

现有百鸽数据投影为：

- 简中：`cn_name` 为主名称，当前中文效果/类型/灵摆文本随该本地化保存；
- 日文：日文名称和日文读音；
- 英文：英文名称；

百鸽当前提供的效果文本是中文；没有日文、英文效果文本时，对应字段保持空，不伪造翻译。

### `yugioh.card_name_variants`

一行表示一个可检索的额外名称：

```text
card_id + locale + name + kind
```

- `locale`：当前中文变体均为简中；
- `name`：官方简中、MD、CNOCG、NWBBS 等名称；
- `kind`：记录名称用途，例如 `official`、`master_duel`、`cnocg`、`nwbbs`；
- 对同一张卡的同名值去重；
- 建立按 `locale + name` 的检索索引。

它属于 `yugioh`：这些名称将发布给网站、可独立导出，并直接服务于卡牌检索；不是导入运行状态，也没有用户语义。

## 百鸽字段投影

| 百鸽字段 | 目标 |
| --- | --- |
| `cn_name` | 简中规范主名称，YGOPro 译名 |
| `sc_name` | 简中卡名变体，`kind = official` |
| `md_name` | 简中卡名变体，`kind = master_duel` |
| `nwbbs_n` | 简中卡名变体，`kind = nwbbs` |
| `cnocg_n` | 简中卡名变体，`kind = cnocg` |
| `jp_name` / `jp_ruby` | 日文本地化的名称 / 读音 |
| `en_name` | 英文本地化的名称 |
| `md_en_n` / `wiki_en` | 暂不纳入本次范围；可在确认英文别名需求后按相同模型导入 |
| `text.types` / `text.pdesc` / `text.desc` | 简中本地化文本 |
| `set_ext` | 暂不迁移；需先定义其是否代表发行/印刷资料，不能继续作为卡本体字段 |

## 检索资料规则

- 卡片详情和结果列表在接入数据后显示简中规范主名称。
- 数据层为简中主名称及所有中文卡名变体建立检索索引；站点接入查询时必须合并匹配这些值，并保证一张卡只返回一次。
- 与主名称相同的变体不额外写入，因为检索语义相同。
- MD、CNOCG、NWBBS 等标记默认不在普通卡面信息中展示；如日后需要，可在“别名”区域统一展示。

## 实施范围

1. 新增 `yugioh.card_localizations` 与 `yugioh.card_name_variants` 的 Drizzle 定义和关联导出。
2. 将导入解析结果投影到三个表，保留官方、MD、CNOCG、NWBBS 中文名称。
3. 调整本地到远端的发布流程、幂等更新及软删除处理。
4. 生成一次本次提交所需的本地与远端数据库迁移；迁移包含旧列到新表的数据回填。
5. 为未来检索创建主名称与中文变体的索引；当前游戏王站点尚未接入数据库查询，不在本次新增站点 API。
6. 为字段投影、去重和发布快照覆盖添加测试。

## 不在本次范围内

- 补齐日文或英文效果文本。
- 为 `set_ext` 猜测业务含义。
- 改动用户数据或用户设置表。
