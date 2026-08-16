# 收藏界面卡牌文本投影实施计划

## Todo

- [x] 建立 UberText 纯文本转换的失败测试与实现。
- [ ] 建立固定字符串目录和静态显示上下文的失败测试与实现（部分完成）。
- [x] 将 extracted 投影改为提供同版本跨卡本地化索引。
- [ ] 按游戏实现补齐静态 CardTextBuilder 与 TextUtils 路径。
- [ ] 执行聚焦测试并检查投影回归。

**目标：** 使静态收藏界面的 `displayText` 复刻游戏的格式化文本内容，并使 `text` 由 UberText 规则脱样式生成。

**架构：** 将格式化、固定字符串和 UberText 纯文本规则收敛在 `task/project` 的纯函数模块。投影层只负责构建同版本静态上下文并传入该模块，不读取 hsdata `Strings` 文件，也不新增数据库结构。

**技术栈：** Bun、TypeScript、Drizzle、本地 PostgreSQL、`bun test`。

---

## 文件结构

- 修改 `apps/service-desktop-runtime/src/lib/hearthstone/task/project/display.ts`：定义静态文本上下文，复刻 builder、TextUtils、语言规则和 UberText 纯文本转换。
- 新建 `apps/service-desktop-runtime/src/lib/hearthstone/task/project/display.test.ts`：覆盖纯函数显示与纯文本行为。
- 修改 `apps/service-desktop-runtime/src/lib/hearthstone/task/project/project.ts`：一次加载同版本 extracted 卡牌名称和 tags，建立 dbfId/语言索引并传入显示转换。
- 修改 `apps/service-desktop-runtime/src/lib/hearthstone/task/project/definition.ts`（仅在投影块大小或预加载查询需要调整时）：确保每个块可获得同版本静态上下文。

## 实施状态细目

以下清单以当前 `display.ts`、`constant.ts`、`project.ts` 与聚焦测试为准；`[~]` 表示已实现静态基线但仍缺少游戏完整路径或真实 fixture。

### 上下文与固定目录

- [x] `DisplayContext`：卡牌 ID、dbfId、语言、静态 tags、同版本 dbfId/卡牌 ID/本地化名称/原始卡牌文本索引。
- [x] `DisplayContext.classes`：由已完成的实体草稿提供，供 `herald` 的 EntityDef 分支使用。
- [x] `GAMEPLAY` 固定字符串：`GALAKROND_*`、未知创建者与 `herald` 所需键已内联 14 种语言。
- [x] `KEYWORD_TEXT.m_name`：188 个可解析关键词 tag 与 14 种语言名称已内联；废弃或未知 tag 明确失败。
- [x] `GameplayStringTextBuilder`：十个已知 cardId 前缀的 EntityDef 第 1 段 `GAMEPLAY_*_1` 已内联。
- [x] 普通/战场种族名称：反编译 `GameStrings` 映射及 14 种语言 `GLOBAL_RACE_*` 已内联。
- [x] 职业名称固定目录：14 种语言的 `GLOBAL_CLASS_*` 已内联，`reference_script_data_num_1_class` 已接入。
- [x] Zilliax 模块与组合字符串目录：28 个组合字符串已内联 14 种语言；单模块文本使用同版本同语言原始卡牌文本索引。

### 已完成的 Builder 路径

- [x] `default`、`modular_entity`、`investigate`、`zombeast`：已按当前静态空文本/原始文本行为处理。
- [x] `jade_golem`、`jade_golem_trigger`、`galakrond_counter`、`score_value_count_down`。
- [x] `script_data_num_1`、`script_data_num_1_num_2`、`drustvar_horror`、`reference_script_data_num_1_entity`。
- [x] `reference_script_data_num_1_card_dbid`、`multiple_alt_text_script_data_nums_ref_sdn6_card_dbid`：使用同版本同语言名称索引。
- [x] `entity_tag_threshold`、`player_tag_threshold`、`primordial_wand`、`reference_script_data_num_1_entity_power`、`spell_absorb`。
- [x] `alternate_card_text`、`alt_text_reference_script_data_num_1_num_2_entity_power`、`hidden_choice`、`kazakus_potion_effect`。
- [x] `battlegrounds_tavern_spell`：EntityDef 初始 tags 的四个格式参数；运行时战场加成不在静态范围。
- [x] `multiple_alt_text_script_data_nums`、`alternate_card_text_with_script_data`、`battlegrounds_deep_blues_spell`。
- [x] `dynamic_keyword`：普通模式关键词名称；不选择 `_MERC` 覆写。
- [x] `gameplay_string`：EntityDef 固定第 1 段。
- [x] `herald`：唯一受支持职业使用对应名称，否则 `GAMEPLAY_HERALD_DEFAULT`。
- [x] `reference_script_data_num_card_race`：普通/战场种族名、`@` 与两个格式参数。

### 待补 Builder 路径

- [x] `bg_quest`：未覆盖 `BuildCardTextInHand(EntityDef)`，收藏路径继承默认原始文本；奖励、进度、种族和 `@` 选择仅属于实时 `Entity` 路径，按范围不投影。
- [x] `battlegrounds_zilliax`：三个 `BACON_TRIPLED_BASE_MINION_ID*` 定义 tags 按顺序去重，固定模块 dbfId 映射为普通模式关键词名称；未知模块明确失败。
- [x] `zilliax_deluxe_3000`：两个 `MODULAR_ENTITY_PART_*` 定义 tags 分别复刻无模块默认文本、单模块同 build 文本和双模块固定组合文本。
- [x] `multiple_entity_names`：十个 `CARDTEXT_ENTITY_*` tags 为零时复刻 EntityDef 的“未知创建者”；任一非零值需要 `GameState` 实体名，明确失败。
- [x] `reference_creator_entity`、`reference_script_data_num_1_num_2_entity`、`undatakah_enchant`、`zombeast_enchantment`、`hidden_entity`：均未覆盖 `BuildCardTextInHand(EntityDef)`，收藏路径继承默认原始文本。
- [x] `decorate`、`spell_damage_only`、`powered_up`、`reference_script_data_num_1_num_2_entity_power`、`rewind_mechanic_card_text_builder`、`silver_hand_recruit`：经反编译核对，均仅覆盖实时 `Entity` 或目标箭头路径；收藏路径继承默认原始文本。

### TextUtils 与验证

- [x] 解码 `\\n`、`\\t`，静态 `$`/`#` 数值简化，非战场大数值 `∞`，语言规则单次执行。
- [x] 韩语 `|1` 的韩文、拉丁、数字与尾部标记处理；`|4` 选择规则。
- [x] UberText 脱样式、空白折叠、连字符换行、尖括号转义，以及中日韩泰搜索换行偏移。
- [x] `TextUtils.TransformCardText`：收藏 `EntityDef` 路径固定全零运行时加成，完整处理 `$`、`#`、`$a`、`$d` 的零值显示；不会生成仅在非零实时伤害/治疗加成时出现的 `*数值*`。
- [~] 聚焦测试：当前 17 个测试、34 个断言通过；缺真实 hsdata fixture 与每个 builder 的独立覆盖。
- [x] 相关 `display.ts`/`project.ts` 类型检查过滤与 `git diff --check` 已通过。
- [x] `bun test apps/service-desktop-runtime/src/lib/hearthstone/task` 完整任务回归通过（17 项、34 个断言）。

## 任务 1：锁定 UberText 纯文本语义

**文件：**

- 新建：`apps/service-desktop-runtime/src/lib/hearthstone/task/project/display.test.ts`
- 修改：`apps/service-desktop-runtime/src/lib/hearthstone/task/project/display.ts`

- [x] 新增 `textFromDisplayText` 的失败测试，覆盖 `<b>...</b>`、任意 `<...>` 标记、`[b]`/`[d]`/`[x]`、`_`、连续空白与连字符换行。

```ts
expect(textFromDisplayText('<b>Deal</b>_[d]3[/d]\n damage.')).toBe('Deal 3 damage.');
expect(textFromDisplayText('well-\nknown')).toBe('well-known');
```

- [x] 新增无空格语言换行偏移测试，明确 locale 是函数输入而非全局状态。

```ts
expect(textFromDisplayText('造成\n3点伤害', 'zhs')).toBe('造成3点伤害');
expect(textFromDisplayText('Deal\n3 damage', 'en')).toBe('Deal 3 damage');
```

- [ ] 运行 `bun test apps/service-desktop-runtime/src/lib/hearthstone/task/project/display.test.ts`，确认新测试在现有实现下失败。

- [x] 移植 UberText `RemoveMarkupAndCollapseWhitespaces` 的扫描规则：识别 `<...>` 与 `[b]`/`[d]`/`[x]`，将空格、制表符、回车、换行和 `_` 压缩，并保留连字符紧邻换行的连接语义。先处理 `zhs`、`zht`、`ja`、`th` 的 CR/LF 删除；在该分支处写一条英文注释说明这是为搜索去除卡面折行的有意偏移。

- [x] 在移除富文本前按 UberText 规则处理 `<_` 和 `_>` 的字面尖括号转义，避免把它们误删为样式标签。

- [x] 重新运行同一测试文件，确认通过。

## 任务 2：建立固定字符串和显示上下文

**文件：**

- 修改：`apps/service-desktop-runtime/src/lib/hearthstone/task/project/display.ts`
- 修改：`apps/service-desktop-runtime/src/lib/hearthstone/task/project/display.test.ts`

- [ ] 新增失败测试，要求固定字符串按 `Locale` 和键精确解析，并在缺少语言或键时抛出包含 builder、cardId、locale、key 的错误。

```ts
expect(() => getDisplayText(context, 'GALAKROND_ONCE', 'galakrond_counter')).toThrow('GALAKROND_ONCE');
```

- [ ] 在 `display.ts` 中维护只读的最新固定字符串常量。常量覆盖模型中的 14 个语言，并从 hsdata `Strings/<locale>/GAMEPLAY.txt` 录入全部静态 builder 所需键；保留原始 `<b>`、`[b]`、`_` 和显式换行表达。

- [x] 定义 `DisplayContext`，至少包含 `cardId`、`dbfId`、`locale`、当前 tags、dbfId 到同版本卡牌的索引、同语言卡名索引和固定字符串解析能力。为所有导出与本地函数补充简短英文函数注释。

- [x] 将 `getDisplayText` 改为接收该上下文；删除调用侧重复的 `applyLanguageRules`，保证语言规则只运行一次。

- [ ] 为 `galakrond_counter`、`drustvar_horror`、`reference_script_data_num_1_entity` 添加真实本地化结果断言，不允许输出固定字符串键。

- [x] 运行 `bun test apps/service-desktop-runtime/src/lib/hearthstone/task/project/display.test.ts`，确认通过。

## 任务 3：提供同版本跨卡本地化索引

**文件：**

- 修改：`apps/service-desktop-runtime/src/lib/hearthstone/task/project/project.ts`
- 修改：`apps/service-desktop-runtime/src/lib/hearthstone/task/project/display.test.ts`

- [x] 为 `projectExtracted` 的输入建立同版本索引：dbfId 到 extracted 卡牌，以及 `(dbfId, Locale)` 到 `name`。索引必须来自当前 `build`，不得混用其他 build 的同 dbfId 快照。

- [x] 调整 `projectExtractedCard` 与 `finalizeLocalizationRows` 签名，将每张本地化行所需的 `DisplayContext` 传入 `getDisplayText` 和 `textFromDisplayText`。

- [x] 添加 dbfId 引用 builder 的测试：引用存在时 `{0}` 被替换为同语言卡名；缺失卡牌、缺失语言卡名或无效 dbfId 时失败。

```ts
expect(getDisplayText(referenceContext, 'Discover {0}.', 'reference_script_data_num_1_card_dbid')).toBe('Discover Fireball.');
```

- [x] 运行 display 测试，确认同版本名称索引的纯函数路径通过。

## 任务 4：按游戏实现补齐静态 builder 与 TextUtils

**文件：**

- 修改：`apps/service-desktop-runtime/src/lib/hearthstone/task/project/display.ts`
- 修改：`apps/service-desktop-runtime/src/lib/hearthstone/task/project/display.test.ts`

- [ ] 对照 `/Users/sunchy321/Desktop/WebServer/other/hearthstone/exporter/tmp/ilspy/Assembly-Csharp/*CardTextBuilder.cs` 和 `TextUtils.cs`，为模型 `textBuilderType` 的每个枚举值写出静态收藏分支；测试先覆盖每个 builder，禁止以 `return rawText` 代替实现。

- [ ] 实现可由静态 tags 决定的段选择、`@`、`{0}` 至 `{3}`、固定字符串和引用卡名替换。对需要实体控制者、区域、历史、战场加成或其他非静态状态的路径抛出明确错误。

- [ ] 移植静态 `TextUtils.TransformCardText`：解码 `\\n`/`\\t`，处理 `$`、`#`、`$a`、`$d` 与 `*` 标记、静态 bonus 为零时的显示、非战场模式大数值 `∞` 转换，并在完成后执行一次 `GameStrings.ParseLanguageRules`。

- [ ] 将韩语 `|1` 的前置字符逻辑补齐为游戏的拉丁字符、数字和富文本尾部规则；保留 `|4` 的游戏选择规则。

- [ ] 增加真实 hsdata fixture 覆盖 `battlegrounds_tavern_spell`、`gameplay_string`、`multi_alt_text_*`、`dynamic_keyword`、`multiple_entity_names`、引用 dbfId/race，以及翡翠魔像的静态收藏路径。

- [ ] 对任何模型枚举值缺少实现的情况保留抛错；为所有异常断言 builder、cardId 和缺失输入。

- [x] 运行 `bun test apps/service-desktop-runtime/src/lib/hearthstone/task/project/display.test.ts`，确认全部通过。

## 任务 5：回归验证

**文件：**

- 修改：`apps/service-desktop-runtime/src/lib/hearthstone/task/project/project.ts`（仅修复测试发现的投影上下文问题）
- 测试：`apps/service-desktop-runtime/src/lib/hearthstone/task/project/display.test.ts`

- [x] 运行 `bun test apps/service-desktop-runtime/src/lib/hearthstone/task/project/display.test.ts`。

- [x] 运行 `bun test apps/service-desktop-runtime/src/lib/hearthstone/task`，确认任务投影的现有回归测试仍通过。

- [x] 运行 `bun --cwd apps/service-desktop-runtime typecheck`，确认新增上下文和索引满足类型检查（相关文件无错误）。

- [x] 检查 `git diff --check`；不运行 lint。未完成 Todo 保持未勾选并在实施状态细目中说明。

## 自检

- 固定字符串采用源码常量，没有新增表或运行时 hsdata 文件读取。
- 旧卡统一使用最新固定字符串，符合已确认语义。
- `displayText` 不包含控件宽度相关的自动折行。
- `text` 以 UberText 规则为基线，并仅对 `zhs`、`zht`、`ja`、`th` 的 CR/LF 保留有意偏移。
- 每项设计要求都由上述任务覆盖；没有未定义的降级路径或待定实现。
