# 新增万智牌赛制禁牌公告重放调研

调研日期：2026-10-17

范围为 `feat(magic): add formats and normalize format URL identifiers`（`d082f0f`）新增的六个赛制，加上用户补充的 Conquest：Tiny Leaders: Reborn、PreDH、Gladiator、Old School、Premodern、Competitive Brawl、Conquest。

目标是整理一组按时间应用后可还原游戏当前禁牌状态的公告，而不是只列出各赛制的来源网页。

## 重放规则

- 每个独立维护的赛制需要一条带日期的初始快照公告，完整记录当时禁牌及限制类别；之后按生效日期应用禁牌、解禁、类别变更。
- 历史档案不完整时，以最近一条有依据的完整快照作为起点，不臆造更早的变更。将重放终态与游戏当前 `Format.banlist` 逐牌核对后，才能称为一致。
- PreDH 没有独立公告流；它应从 Commander 公告序列计算，再应用该格式的牌池截止规则。
- Old School 有多个 93/94 变体；本次 Scryfall `oldschool` 快照按用户确认的 Eternal Central (EC) 规则核对。

## 历史基底加后续公告：可重放性结论

按“取一份最早可确认的完整历史名单作基底，再逐条应用之后的公告”评估，区分来源自身的最新名单与本地游戏数据库：

| 赛制 | 能否重放到来源最新状态 | 基底与边界 |
| --- | --- | --- |
| Tiny Leaders: Reborn | **可以，从最早可确认的完整快照起** | 以官方历史名单页标注的 2026-03-09 完整名单为基底，叠加之后的规则 changelog 和公告至 2026-10。类别（整牌禁用、仅禁作 Tiny Leader、仅禁作 Companion）分别重放。更早的完整快照未确认。 |
| Gladiator | **可以** | 以 2022-08 官方介绍所列五张初始禁牌为基底，叠加维护者公告至 2025-11；当前维护者名单为七张，和重放结果相符。 |
| Old School（EC 93/94） | **可以** | 以 EC 2019-09-07 完整规则名单为基底；同日更新公告明确解禁 Maze of Ith，后续未查到 EC 93/94 禁限变更。该终态与 Scryfall 2026-08-24 快照的 7 banned / 22 restricted 完全一致。 |
| Competitive Brawl | **可以** | 以 Wizards 2026-06-08 正式上线名单为基底，叠加 2026-06-29、08-10 无变更公告及 10-12 类别调整公告；可还原到目前官方公告状态。 |
| PreDH | **有条件可以** | 它没有独立公告流；从 Commander 历史名单逐时点应用后，再按 PreDH 牌池截止日过滤即可。当前游戏采用的具体截止日/收录规则尚未确认，因此不能给出唯一终态。 |
| Premodern | **目前不能证明完整重放** | 2018-06 起能找到变更公告，之后公告链和当前 33 张名单可查；但尚未找到可确认为起点的完整历史名单，故目前不能证明从历史基底一路还原至今。 |
| Conquest | **不能** | 2026-01 公告与静态禁牌表相互冲突；没有可靠终态前，无法验证叠加公告的结果。 |

这里的“可以”先表示从所列基底重放后能还原到规则维护者/公告来源的最新名单。下文的“本地写入与官方对比结果”记录了随后导入和逐项核对的实际结果。Scryfall 本地数据仍是 2026-08-24 快照，晚于该日的公告不在其内。

## Scryfall 数据与终态对照

本次通过 `scripts/.env` 连接本地数据库读取真实导入数据。最近一条成功 Scryfall 导入任务于 2026-08-29 执行，使用 `all-cards-20260824211815.jsonl.gz`，即 2026-08-24 bulk 快照。英文卡数据中六个 Scryfall key 均有值；按 Oracle ID 去重的当前 `banned`/`restricted` 数量如下：

| 游戏赛制 | Scryfall key | banned | restricted | 对照说明 |
| --- | --- | ---: | ---: | --- |
| Tiny Leaders: Reborn | `tlr` | 62 | 11 | Scryfall 的 11 个 `restricted` 恰好对应 2026-08 快照时官方“仅禁作 Tiny Leader”类别；2026-10-03 后官方增加 Rograkh 至该类并解禁 Umezawa's Jitte。旧快照仍把 Jitte 记为 `banned`、Rograkh 记为 `legal`，因此不是当前终态。 |
| PreDH | `predh` | 48 | 0 | Scryfall 已按其 PreDH 规则给出 48 张 `banned`；它是 Commander 禁牌与 PreDH 牌池的当前交集快照，不是独立 PreDH 公告历史。 |
| Gladiator | `gladiator` | 7 | 0 | 七张与维护者当前名单相同。 |
| Old School | `oldschool` | 7 | 22 | 7 张 banned、22 张 restricted 与 Eternal Central (EC) 93/94 列表逐项吻合。 |
| Premodern | `premodern` | 33 | 0 | 33 张与维护者当前禁牌数相同；但这仍是 8 月快照，不是事件历史。 |
| Competitive Brawl | `competitivebrawl` | 10 | 0 | 这是 2026-06 正式起点的十张名单快照。2026-10-12 公告后状态已过时：数据库仍将旧十张全记为 `banned`，Yuriko、Spider-Man 2099、Light-Paws 仍为 `legal`；官方现态是 Lutri 继续整牌禁用、九张改为仅禁作指挥官，另有三张仅禁作指挥官。 |

这里的“终态”有两层，不能混为一张简单禁牌名单：

1. `magic_data.scryfall_cards.legalities` / `magic.cards.legalities` 是逐卡、逐赛制的合法性快照；Scryfall 状态只有 `legal`、`not_legal`、`restricted`、`banned`。它没有日期，也没有事件顺序。
2. `magic.formats.banlist` 是游戏格式记录中的名单状态，能记录 `banned`、`banned_as_commander`、`banned_as_companion`、`restricted` 等细类。当前数据库中上述六个新赛制以及 Conquest 的 `banlist` 数组均为 **0 条**。所以目前没有可称为“游戏当前禁牌终态”的这七个名单；卡牌 legalities 不能冒充已经写入的格式名单。

状态名也要按赛制语义解释：例如 TLR 的 `restricted` 对应官方“仅禁作指挥官”，而 Old School 的 `restricted` 表示限一张。Scryfall 上同一个状态值并不保证跨赛制含义相同。Competitive Brawl 的 2026-10 更新还说明，单看 Scryfall 卡牌状态可能把“在 99 合法、仅不能作指挥官”与整牌合法混为一类；需要公告类别和格式规则补足。

结论：Scryfall 快照很适合核验可表达的逐卡终态，也足以确认 Gladiator、Premodern 的当前 banned 数量；但当前本地数据导入早于 TLR 10 月公告和 Competitive Brawl 10 月公告。更关键的是，`magic.formats.banlist` 尚未填入这些新格式的名单。要证明公告按序应用后与游戏状态一致，必须先有实际写入的格式终态，再逐卡比较牌名和类别。Scryfall API 将 `legalities` 定义为单卡各赛制状态，允许值为上述四类：[Scryfall API 卡牌字段定义](https://github.com/scryfall/api-types/blob/main/src/objects/Card/CardFields.ts)。

## 已查实的公告序列

| 赛制 | 初始状态与按时间顺序应用的公告 | 重放核对 |
| --- | --- | --- |
| `tiny-leader-reborn` | 以官方历史[完整名单快照](https://tiny-leaders-reborn.blogspot.com/p/tiny-leader-reborn-ban-liste-09292021.html)（更新到 2026-03-09）为基底；之后按序应用：[2026-06-30](https://tiny-leaders-reborn.blogspot.com/2026/06/marvel-super-heroes-format-update-ban.html)加入 The Fantasticar、Light-Paws 仅禁作 Tiny Leader；[2026-08-17](https://tiny-leaders-reborn.blogspot.com/2026/08/the-hobbit-format-update-banlist-and.html)禁 Flawless Maneuver；[2026-10-03](https://official-tlr.com/rules/tsmtr/999_changelog/)Rograkh 改为仅禁作指挥官并解禁 Umezawa's Jitte。更早 changelog 的事件已包含在完整基底中，不重复应用。 | 显式逐卡状态能重放到现行牌表；官方名单还包含规则组和印刷边框/Acorn 范围，现有格式名单无法将这些范围完整展开，比较器返回 incomplete，详见下文。 |
| `predh` | 没有独立 PreDH 委员会或公告。使用 [Commander 当前禁牌规则](https://mtgcommander.net/index.php/banned-list/)和 [Commander 公告归档](https://mtgcommander.net/index.php/category/rules/)；每个时点将 Commander 名单与 PreDH 牌池截止日相交。 | 需确认游戏采用的精确截止日/发售定义。历史起点用 PreDH 开始采用的 Commander 名单快照。 |
| `gladiator` | 以 [Wizards 2022-08 社区赛制公告](https://magic.wizards.com/en/news/mtg-arena/mtg-arena-community-spotlight-gladiator)作完整初始快照，后续依次应用 2023-04、2023-06、2024-05、2025-01、2025-06、2025-08、2025-11 更新，详见前表链接。 | 已写入并回放；重放终态与 [GladiatorMTGA 当前名单](https://gladiatormtga.com/about/)逐项一致（7 张）。 |
| `old-school` | 以 Eternal Central (EC) 93/94 为口径。EC 官方规则页列出的 7 张 banned、22 张 restricted 与 2026-08-24 的 Scryfall `oldschool` 快照逐项一致。以 EC 完整规则页作为 2019-09-07 终态快照；同日的[EC 更新公告](https://www.eternalcentral.com/banned-and-restricted-list-changes-to-eternal-central-old-school-94-95-and-96-09-2019-update/)记录 Maze of Ith 解禁，并说明 Recall 继续受限。 | **可按 EC 口径重放至 Scryfall 2026-08-24 快照。** 2019-09-07 更新后的完整规则/禁限牌快照作为基底，之后暂无已发现的 EC 93/94 B&R 变更；得到 7 banned、22 restricted，与 Scryfall 一致。该结论对应 Scryfall 快照日，不表示本地格式表已填充，也不自动证明游戏数据库终态。 |
| `premodern` | 目前找到的最早时间线线索是 [2018-06-25 公告](https://premodernmagic.com/blog/ban-list-update-june-2018/)：公告回述此前 5 月 16 日已解禁 Black Vise；6 月公告没有新增禁牌并解禁 Land Tax。之后依序：[2019-08-20](https://premodernmagic.com/blog/ban-list-update-2019/)禁 Yawgmoth's Bargain、解禁 Frantic Search；[2022-10-05](https://premodernmagic.com/blog/ban-list-update-2022/)解禁 Show and Tell；[2023-07-15](https://premodernmagic.com/blog/ban-list-update-2023/)禁 Land Tax；[2026-01-18](https://premodernmagic.com/blog/ban-list-update-2026/)禁 Parallax Tide。 | 当前[官方名单](https://premodernmagic.com/banned-watched)列出 33 张禁牌。2018 年 6 月公告不是完整名单快照；继续寻找最早完整名单，或用有日期的完整快照截断重放起点。 |
| `competitive-brawl` | 正式赛制起点采用 Wizards [2026-06-08 Competitive Brawl 公告](https://magic.wizards.com/en/news/mtg-arena/introducing-ranked-brawl)：确认 6 月 23 日上线，列出 10 张禁牌（Ajani、Nadu、Lutri、Oko、Old Stickfingers、Ragavan、Rusko、Tamiyo、Wrenn and Six、Tajic）。2025 年末的 Brawl: Our Plans 是限时测试活动，不是正式格式起点。之后：[2026-06-29](https://www.magic.wizards.com/en/news/announcements/banned-and-restricted-june-29-2026)无变更；[2026-08-10](https://www.magic.wizards.com/en/news/announcements/banned-and-restricted-august-10-2026)无变更；[2026-10-12](https://www.magic.wizards.com/en/news/announcements/banned-and-restricted-october-12-2026)新增 Yuriko、Spider-Man 2099、Light-Paws 仅禁作指挥官；Ajani、Nadu、Oko、Old Stickfingers、Ragavan、Rusko、Tamiyo、Wrenn and Six、Tajic 改为仅禁作指挥官；Nashi 重新平衡。 | 正式起点及后续公告已找到。6 月公告未细分禁用类别；10-12 公告明确说明此前这九张是整牌禁用、现仅禁作指挥官。终态还要与游戏当前数据逐卡核对。 |
| `conquest` | 可确认：[2025-01-13](https://conquesthub.wordpress.com/2025/01/13/conquest-update-january-2025/)解禁 Food Chain、Limited Resources、Imperial Seal、Griselbrand，Leovold 改为可作指挥官；[2025-06-23](https://conquesthub.wordpress.com/2025/06/23/conquest-update-july-2025/)摘要列出禁 Ancient Tomb、Gemstone Caverns、Chrome Mox、Brain Freeze、Cyclonic Rift，并称解禁 Ral, Monsoon Mage；[2026-01-22](https://conquesthub.wordpress.com/2026/01/22/conquest-update-january-2026/)全面禁止 Nadu, Winged Wisdom。 | **无法核实终态：来源之间有冲突。** 2026-01-22 公告正文确认前次禁掉的五张牌仍然影响环境，但标为同日更新的[静态名单](https://conquesthub.wordpress.com/banlist/)只列 Nadu，没有这五张。另，2025-06 公告摘要称 Ral 解禁，正文理由段却称 Ral 已被禁作指挥官。网站声明目前只读。 |

### Old School 与 Scryfall 口径核验

本次比较对象是 **Scryfall 2026-08-24 快照**，不是 2026-10 当前数据。用户确认 Scryfall `oldschool` 遵循 Eternal Central (EC) 93/94。核对 EC 官方规则页后，7 张 banned 完全一致；22 张 restricted 也完全一致，包括 Recall、Time Vault，并且不包含 Maze of Ith、Mishra's Workshop、Strip Mine。EC 页面说明该完整列表适用于 EC 主办赛事，且最后更新日为 2019-09-07；[同日更新公告](https://www.eternalcentral.com/banned-and-restricted-list-changes-to-eternal-central-old-school-94-95-and-96-09-2019-update/)记载解禁 Maze of Ith，并明确 Recall 继续受限。因此将 2019-09-07 EC 完整规则页作为基底，可得到与 2026-08-24 Scryfall 快照相同的终态；检索中未发现此后 EC 93/94 禁限牌变更。[EC 93/94 完整规则与名单](https://www.eternalcentral.com/9394rules/)。

先前与瑞典规则比较产生的差异，正是 EC 与 Swedish 的变体差异，不能据此判为 Scryfall 过时。对本次 Scryfall `oldschool` 数据应采用 EC，而非 Swedish 或 Atlantic。[Old School 变体说明](https://oldschool-mtg.blogspot.com/p/banrestriction.html?m=0)。

## 下一步检索计划

1. 已找到完整起点的赛制：Gladiator（Wizards 2022-08），Competitive Brawl（Wizards 2026-06-08 正式上线公告）；Old School 已确认按 EC 93/94 重放。Tiny Leaders: Reborn、Premodern 仍缺更早的完整起点；PreDH 要明确游戏采用的截止牌池。
2. 已检索到上述赛制可用的主要变更公告；后续重点是复核 TLR 早期历史是否存在完整名单、Premodern 2018 年以前的名单档案，以及 Commander 公告按 PreDH 截止日筛选后的逐项变化。
3. 对 PreDH 重放 Commander 公告后按截止牌池过滤；Old School 按 EC 93/94 规则页快照及公告链核对。
4. 对 Conquest 处理静态名单与公告流冲突：先取得游戏当前名单或维护者确认，不从矛盾的静态页猜测终态。
5. 终态核验需要游戏当前 `Format.banlist`。尝试读取本地开发数据库时，`127.0.0.1:5432` 没有 PostgreSQL 服务监听，因此本轮无法读取当前游戏名单；仓库也没有随附静态格式数据。待数据库服务可用后，逐条应用公告并与游戏数据对比，列出残差。只有残差为零、限制类别也一致，才能交付“应用后与游戏一致”的序列。

来源终态的历史重放和本地官方比较结果已在下文列明。对于无法确认游戏终态或缺少类别/牌池语义的赛制，不据静态 Scryfall 快照自行补造公告。

## 本地写入与官方对比结果（2026-10-17）

按“有完整基底并能按公告顺序重放”的范围，已向本地数据库写入 Gladiator、Old School（EC 93/94）和 Tiny Leaders: Reborn；Conquest 不在本次写入范围。Competitive Brawl 因 Lutri 在正式起点公告和 Scryfall 快照中仍整牌禁用、但当前官方名单与后续公告没有给出可确认的解禁/类别变更，未写入，以免造出无法证明的终态。

导入使用现有 `Announcement` / `AnnouncementItem` 事件流，并调用全量公告回放生成 `Format.banlist`，没有直接编辑格式名单，也没有新增表或 migration。来源值和中英文显示名已补齐。此次导入使用的一次性脚本与数据清单已删除；数据库内公告及本文档保留了导入结果。实际新增 13 条公告、143 条公告项：

| 赛制 | 基底与后续公告数 | 公告项数 | 官方对比 |
| --- | ---: | ---: | --- |
| Gladiator | 1 个基底 + 7 条更新 | 34 | **一致**：官方 7，游戏 7；无缺项、额外项或类别差异。 |
| Old School（EC 93/94） | 1 个完整规则快照 | 29 | **一致**：官方 29（7 banned、22 restricted），游戏 29；逐项一致。 |
| Tiny Leaders: Reborn | 1 个完整基底 + 3 条更新 | 80 | **不完整**：显式牌项类别一致、已无未匹配牌名；官方比较还展开了 102 张规则组成员（Conspiracy、ante、offensive、Unfinity），而回放后的 `Format.banlist` 为 74 条，没有纳入这些规则组成员；官方另有“银边、金边或 Acorn 印记”范围条款需人工核对。 |

官方对比器新增/扩展了 TLR、Gladiator、EC 93/94 的来源配置和解析器；EC 页面使用 `<br>` 分隔名单的结构也已纳入解析。Wizards 来源继续用于 Competitive Brawl 的官方名单比较。控制台原有“核对官方禁限表”入口和比较流程直接复用，没有另造一套页面功能。

本次全量回放返回 165 条历史数据警告，均为数据库现有公告中超出当前格式注册表的旧格式关键词（如旧 block、Prismatic、100-card-singleton）；目标三格式的官方比较结果如上。重跑导入脚本确认新增公告数为 0，表示公告插入具备幂等性。
