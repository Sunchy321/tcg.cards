# 万智牌旧字段锁迁移实施计划

## TODO List

- [ ] 统计旧 `__lockedPaths` 分布
- [ ] 设计并落地新锁表结构
- [ ] 编写旧锁迁移映射逻辑
- [ ] 回填旧锁并记录迁移事件
- [ ] 切换运行时锁读取入口
- [ ] 更新控制台与快照说明
- [ ] 校验迁移结果后下线旧列

## 目标

将万智牌主领域表中的旧 `__lockedPaths` 字段迁移到新的 `magic_data` 字段锁系统，使用户无关的当前锁状态成为可审计、可扩展、可独立演进的静态数据维护事实，并在验证完成后下线旧列。

## 实施原则

- 先分析，再迁移，最后删除
- 锁事实进入 `magic_data`，不回流到主领域表
- `magic_data.import_field_lock_events` 只保留迁移、投影、同步事件；用户动作后续单独拆到 `magic_app`
- 非法路径不静默迁移
- 迁移必须可对账、可回溯
- 切换读取必须先于旧列删除
- `__updations` 不纳入本次范围

## 实施步骤

### 1. 统计旧 `__lockedPaths` 分布

**目标**

搞清楚旧锁总量、字段分布、重复情况和异常路径。

**任务**

- 编写统计 SQL
- 按 6 张表统计非空锁行数
- 按 `fieldPath` 统计出现次数
- 识别重复锁和非法路径
- 输出分析结果

**验收标准**

- 能明确看到每张表的锁数量
- 能列出主要锁字段分布
- 能识别异常路径清单

### 2. 设计并落地新锁表结构

**目标**

在 `magic_data` 中建立新的字段锁事实表和系统事件表。

**任务**

- 新增 `magic_data.import_field_locks`
- 新增 `magic_data.import_field_lock_events`，并明确不包含用户字段
- 定义 `entityType`、`status`、`source` 枚举
- 定义 `targetKey` 存储格式
- 定义唯一键与查询索引

**验收标准**

- 新系统可以唯一表示一个实体上的一个字段锁
- 新系统可以记录锁来源和迁移批次

### 3. 编写旧锁迁移映射逻辑

**目标**

把旧主表行转换成新锁记录。

**任务**

- 设计 6 类实体的 `targetKey` 生成逻辑
- 把旧表映射到新 `entityType`
- 对旧字段路径去重
- 对路径做注册表校验
- 将非法路径输出为异常记录

**验收标准**

- 每个合法旧锁都能映射为标准化新锁
- 非法路径不会进入正式锁表

### 4. 回填旧锁并记录迁移事件

**目标**

将合法旧锁写入新系统，并留存事件。

**任务**

- 执行迁移脚本或回填逻辑
- 写入 `import_field_locks`
- 同步写入 `import_field_lock_events`
- 为每批迁移生成 `migrationBatchId`
- 输出迁移统计结果

**验收标准**

- 合法旧锁已回填完成
- 每条迁移锁都有对应 `migrated` 事件
- 迁移结果包含总量、去重后数量、异常数量

### 5. 切换运行时锁读取入口

**目标**

让导入系统改为从新锁表读取字段锁。

**任务**

- 更新运行时锁判断逻辑
- 将新表作为唯一主读取来源
- 保留短期对账能力
- 确认控制台展示改为新系统说明

**验收标准**

- 运行时不再依赖主表 `__lockedPaths`
- 字段锁判断结果与迁移前对齐

### 6. 更新控制台与快照说明

**目标**

让配置快照和控制台说明与新锁系统一致。

**任务**

- 更新 `packages/model/src/magic/schema/data/import.ts`
- 将锁约束描述改为“来自 `magic_data.import_field_locks`”
- 更新 `apps/site-console/app/pages/magic/data-source/index.vue`
- 删除旧内联锁字段的说明

**验收标准**

- 快照不再把锁事实来源写成 `__lockedPaths`
- 控制台页面说明与新系统一致

### 7. 校验迁移结果后下线旧列

**目标**

在新系统接管后安全移除旧列。

**任务**

- 对比迁移前后锁数量
- 抽样校验关键实体
- 生成删除旧列 migration
- 删除 6 张表中的旧锁列
- 再次执行引用搜索

**验收标准**

- 新系统校验通过
- 旧列删除后运行时代码无残留引用
- 删除旧列发生在切换与校验之后

## 推荐验证命令

```bash
rg "__lockedPaths|lockedPath|import_field_locks|import_field_lock_events" apps packages --glob '!packages/db/migrations/**'
bun --cwd packages/db run db:check
bun --cwd apps/site-magic run typecheck
bun --cwd apps/site-console run typecheck
```

## 预期提交信息

```text
feat(db/magic): migrate legacy locked paths
```

提交前仍需先向用户展示提交信息并等待确认。
