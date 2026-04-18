# 万智牌旧字段锁迁移设计方案

## 1. 背景

万智牌主领域表当前通过内联字段 `__lockedPaths` 保存字段锁状态：

- `magic.cards.card_locked_paths`
- `magic.card_localizations.card_localization_locked_paths`
- `magic.card_parts.card_part_locked_paths`
- `magic.card_part_localizations.card_part_localization_locked_paths`
- `magic.prints.print_locked_paths`
- `magic.print_parts.print_part_locked_paths`

这套设计的问题在于：

- 字段锁混入主领域事实表，职责不清
- 锁只有字段路径列表，没有操作者、原因、时间、来源和释放记录
- 不利于后续导入系统统一读取、审计、批量分析和解除
- 难以区分“人工创建的锁”和“历史拒绝动作留下的锁”

因此，本次不再采用“直接删除 `__lockedPaths`”的方案，而是先对旧锁进行分析，再迁移到新的字段锁系统，最后再下线旧列。

## 2. 目标

- 分析 6 张主领域表中的旧 `__lockedPaths` 数据分布
- 设计新的字段锁系统，并把用户无关事实归类到 `magic_data`
- 将旧锁迁移到新系统，并保留迁移来源信息
- 让后续导入链路改为读取新系统中的字段锁
- 在验证迁移完成后，再移除主表中的旧 `__lockedPaths`

## 3. 非目标

- 本次不迁移 `__updations`
- 本次不实现完整的新导入执行器
- 本次不设计复杂的锁层级继承
- 本次不处理跨游戏统一字段锁
- 本次不修改历史 migration 文件

## 4. 新系统归属与命名

按照仓库分类规则，字段锁的当前生效事实属于导入相关且用户无关的状态，应归入 `magic_data`；如果未来需要记录具体用户创建、解除或备注动作，应拆分到 `magic_app` 独立表。

第一版建议新增以下表：

### 4.1 `magic_data.import_field_locks`

保存当前生效的字段锁。

建议字段：

- `id`
- `entityType`
- `targetKey`
- `fieldPath`
- `status`
- `source`
- `reason`
- `note`
- `createdAt`
- `releasedAt`
- `migrationBatchId`
- `legacyTable`

其中：

- `entityType` 取值限定为 6 类导入目标实体
- `targetKey` 使用结构化 JSON，保存定位该实体所需的主键
- `status` 第一版建议支持 `active`、`released`
- `source` 第一版建议支持 `legacy_migration`、`review_projection`、`sync_projection`、`system`
- 第一版不记录用户标识，只记录迁移批次、时间和原因；若锁来自用户动作，只在本表保留投影来源，具体用户动作另建 `magic_app.import_field_lock_actions`

### 4.2 `magic_data.import_field_lock_events`

保存追加式系统事件日志，用于审计迁移、投影与同步，不记录用户标识或用户备注。

建议字段：

- `id`
- `lockId`
- `eventType`
- `createdAt`
- `payload`

第一版建议事件类型：

- `migrated`
- `projected`
- `released`
- `reconciled`

如果未来需要记录“谁创建了锁、谁解除、附带什么人工备注”，必须新增 `magic_app.import_field_lock_actions`，不要继续向 `magic_data.import_field_lock_events` 塞入用户字段。

## 5. 旧数据分析要求

迁移前必须先对旧 `__lockedPaths` 做分析，而不是直接搬运。

### 5.1 分析维度

至少要统计：

- 每张表中非空锁行数
- 每张表中锁路径总数
- 每个 `fieldPath` 的出现次数
- 重复字段路径数量
- 不在字段注册表中的路径
- 已不属于导入系统关注范围的路径

### 5.2 分析输出

迁移前需要得到一份分析结果，回答以下问题：

- 旧锁主要集中在哪些实体类型
- 最常见的被锁字段有哪些
- 是否存在非法路径或历史脏数据
- 是否存在同一实体重复锁同一字段的情况
- 是否存在锁住已不再导入的字段

如果分析结果中存在非法路径，不应直接迁移为正式锁，而应进入异常清单等待人工处理。

## 6. 迁移映射规则

### 6.1 旧表到实体类型的映射

| 旧表 | 新实体类型 |
|------|------------|
| `magic.cards` | `card` |
| `magic.card_localizations` | `cardLocalization` |
| `magic.card_parts` | `cardPart` |
| `magic.card_part_localizations` | `cardPartLocalization` |
| `magic.prints` | `print` |
| `magic.print_parts` | `printPart` |

### 6.2 主键到 `targetKey` 的映射

迁移时必须把每行记录的主键提取为结构化 `targetKey`：

- `card`：`{ cardId }`
- `cardLocalization`：`{ cardId, locale }`
- `cardPart`：`{ cardId, partIndex }`
- `cardPartLocalization`：`{ cardId, partIndex, locale }`
- `print`：`{ cardId, lang, set, number }`
- `printPart`：`{ cardId, partIndex, lang, set, number }`

### 6.3 旧锁到新锁的映射

每个旧 `fieldPath` 迁移为一条新的 `import_field_locks` 记录：

- `status = active`
- `source = legacy_migration`
- `reason = legacy_locked_path`
- `createdAt = migration execution time`
- `legacyTable = 原始表名`

### 6.4 非法路径处理

如果旧锁路径：

- 不在字段注册表中
- 指向系统字段
- 指向已废弃字段

则不直接迁移到 `import_field_locks`，而是记录到迁移异常结果中。

## 7. 迁移阶段设计

### 阶段 1：建立新表

- 新增 `magic_data.import_field_locks`
- 新增 `magic_data.import_field_lock_events`

### 阶段 2：分析旧锁

- 运行分析 SQL 或脚本
- 产出旧锁分布报告
- 确认非法路径和脏数据处理策略

### 阶段 3：回填迁移

- 按实体类型读取旧 `__lockedPaths`
- 去重后写入 `import_field_locks`
- 同步写入 `import_field_lock_events`
- 记录迁移批次号与原始表来源

### 阶段 4：切换读取

- 导入系统和控制台改为读取新表中的锁
- 旧 `__lockedPaths` 仅作为校验和回归比较来源

### 阶段 5：校验一致性

- 比较迁移前后锁数量
- 比较每类实体的锁分布
- 抽样核对关键字段

### 阶段 6：下线旧列

仅当以下条件全部满足后，才删除主表旧列：

- 新系统已经成为唯一读取入口
- 迁移校验通过
- 非法路径已处理或明确放弃
- 维护确认可以下线旧列

## 8. 运行时读取规则

迁移完成后，字段锁的读取来源应为：

- 当前生效锁：`magic_data.import_field_locks`
- 审计历史：`magic_data.import_field_lock_events`

不再直接读取主领域表中的 `__lockedPaths`。

字段锁命中判断规则为：

- `entityType` 完全匹配
- `targetKey` 完全匹配
- `fieldPath` 完全匹配
- `status = active`

## 9. 与导入快照和策略系统的关系

当前 P0 快照中的 `lockedPathAware` 只是规则展示字段，不是真正的锁事实来源。

迁移后应调整为：

- 快照继续声明“策略是否受字段锁系统约束”
- 但约束来源从旧 `__lockedPaths` 改为 `magic_data.import_field_locks`
- 控制台页面应展示“字段锁来自新系统”，而不是主表内联字段

## 10. 风险与缓解

### 风险 1：旧路径不规范

- 缓解：迁移前先跑字段路径分析
- 缓解：非法路径进入异常清单，不直接迁移

### 风险 2：迁移后数量不一致

- 缓解：迁移前后按表、按实体、按字段统计对比
- 缓解：保留迁移批次号，支持回溯

### 风险 3：用户动作审计与当前状态混在一起

- 缓解：`magic_data.import_field_lock_events` 只保留迁移、投影、同步事件
- 缓解：若后续需要记录用户锁动作，单独新增 `magic_app.import_field_lock_actions`

### 风险 4：切换期间双重读取导致行为不一致

- 缓解：切换阶段明确“新表主读、旧列仅校验”
- 缓解：完成校验后尽快删除旧读路径

## 11. 验收标准

- 旧 `__lockedPaths` 已完成分布分析
- 新系统表结构确定并通过评审
- 旧锁可以按实体和字段完整迁移到新系统
- 非法路径不会被静默迁移
- 导入读取路径切换到新系统
- 控制台说明更新为新字段锁系统
- 只有在迁移与校验完成后才进入旧列删除阶段
