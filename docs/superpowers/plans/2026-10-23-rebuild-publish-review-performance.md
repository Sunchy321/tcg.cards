# T4 手动重建、静态关系发布与旧审核兼容实施计划

> **For agentic workers:** Execute inline task-by-task as requested by the user. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 允许显式重建静态文档和用户文章的相邻关系；静态发布运输已有关系但不让关系状态影响正文发布；保留旧比较审核依据；以真实数据完成性能验收。

**Architecture:** 复用现有 `computeRelations` 事务作为唯一关系生成入口，并以源节点/结构指纹继续判定旧关系失效。重新解析只继续禁止覆盖已有译文源节点引用，不因旧 `DocumentComparison` / `DocumentChangeReview` 记录而拒绝修复。发布正文和关系运输分成独立事务：正文保持现有原子发布契约，关系复制只转移已存的静态关系，不在发布中运行匹配或校验；运输失败回滚关系事务并保留已发布正文。

**Tech Stack:** TypeScript、Bun、Drizzle、现有 `DocumentStore`/`createDocumentService` 操作契约与 PostgreSQL。

---

## 文件责任图

- `packages/console-api/src/lib/magic/documents/reparse.ts`：限制允许重新解析的来源内容及其译文引用保护。
- `packages/console-api/src/lib/magic/documents/database.ts`：本地与远端 store 的持久化、事务和重新解析实现。
- `packages/console-api/src/lib/magic/documents/store.ts`、`testing.ts`：为发布提供读取完整关系参与行的明确 store 契约及内存实现。
- `packages/console-api/src/lib/magic/documents/publish.ts`：现有正文发布流程和独立、原子、尽力而为的静态关系运输。
- `packages/console-api/src/lib/magic/documents/publish.test.ts`：发布后历史可复用、未准备时正文可读、关系运输失败不回滚正文及重试行为。
- `packages/console-api/src/lib/magic/documents/adjacency.test.ts`、`adjacency.integration.ts`、`database.integration.ts`：重建、重新解析失效、PostgreSQL 持久化和旧审核保留。
- `.scratch/rule-history-performance/measure.ts`、`measure-compare.ts`：无完整响应缓存的历史与 diff 操作计时及 store 读取量。
- `.scratch/rule-history-performance/findings.md`：补记真实开发库基准输入、版本、语言、节点规模、查询数和重复运行结果。
- `docs/project-architecture.md`、`docs/project-architecture.zh-CN.md`：仅在本票实际改变关系发布/运行责任边界时同步更新。
- `.scratch/rule-history-performance/issues/04-rebuild-publish-review-performance.md`：所有验收完成后标记 T4 已完成。

## Task 1：让派生关系失效后可安全重新解析

- [x] 重新解析只检查精确译文源引用；已添加单元契约和 PostgreSQL 审核保留集成用例。
- [ ] 在 disposable PostgreSQL 数据库运行审核保留、重新解析和重建用例。


1. 在 reparse 契约测试中锁定两条规则：同一正式源修订允许重解析，即使旧的自动比较和审核记录仍存在；有精确引用该源节点的译文时仍拒绝重解析。
2. 将 `assertReparse` 的宽泛 `referenced` 输入改为描述精确译文依赖的输入。`database.ts` 不再把 `DocumentComparison` 当作不可修改内容的外键引用保护；保留已有译文引用查询。
3. 保持重新解析在同一文档事务内替换节点并更新 `contentHash`。不要删除或改写旧 `DocumentComparison`、`DocumentChangeReview`、它们的原始 `changes` 或审核历史。
4. 验证旧关系因指纹变化被 `relationStatus` 报为 outdated，历史/diff 报关系失效；显式重复 `computeRelations` 后历史/diff 使用新节点。
5. 使用 PostgreSQL 集成操作断言旧比较行、审核行和原始 `changes` 逐字段保留；新计算不把旧 `changeId` 审核套到新关系结果。

## Task 2：给静态发布提供精确的关系行读取能力

- [x] 为数据库与内存 store 增加按相邻关系读取参与行的接口，并由静态发布行为测试覆盖。


1. 在 `DocumentStore` 增加窄接口 `adjacencyRelations(comparisonIds: string[]): Promise<NodeRelation[]>`。空 ID 列表返回空数组；非空列表返回这些比较的完整关系参与行，不要求传 node、identity 或 group 过滤器。
2. 在 `database.ts` 对本地/远端 `DocumentNodeRelation` 使用 `comparisonId IN (...)` 实现该接口；在 `testing.ts` 从对应内存关系表筛选并返回副本。
3. 为 SQL adapter 和 memory store 增加边界测试：只返回请求的关系，重复/空查询语义确定。保留 `nodeRelations` 的现有选择性查询行为。

## Task 3：发布正文后独立运输已保存关系

- [x] 正文事务与逐边界关系运输分离；补齐已准备、未准备、过期、dry-run 和中途失败用例。


1. 把 `publish.ts` 的正文写入逻辑收敛为一个内部操作，维持原有静态身份校验、外部内容冲突校验、dry-run、批量正文事务及 user document 隔离。
2. 正文事务提交后，读取源文档已保存的 `adjacencies` 与对应 `adjacencyRelations`。只复制数据；禁止调用 `computeRelations`、`matchRevisionNodes`、`preparedAdjacencies`，也不在发布时检查关系完整性/有效性。
3. 在单独的目标文档事务中，按源关系 ID 保留目标关系，删除源端已不存在的派生关系，并用 `putAdjacency` 原子写入每个关系头和完整参与行。目标数据库在关系插入中失败时，让这个关系事务整体回滚。
4. 捕获关系运输事务失败，使正文发布结果仍成功可读；关系恢复只能由以后显式重新发布或手动计算触发。批量发布在所有正文均提交后逐文档运输关系，单篇失败不能回滚其他正文。
5. 不运输或删除用户文章数据；用户文章继续由远端作者手动 `computeRelations`。
6. 在 `publish.test.ts` 覆盖：准备后的静态关系随发布后可读；未准备关系的静态文档发布成功且正文可读、历史明确失败；模拟关系写入失败时正文仍可读且目标不会留下本次运输的半套关系；重试后关系可用；dry-run 不写关系；用户文章在多轮静态发布后保持原样。

## Task 4：验证重建、发布与审核的真实持久化契约

- [x] 添加 PostgreSQL 持久化、并发重新解析、旧审核保留和关系发布用例。
- [ ] 在显式配置的 disposable 数据库执行这些集成用例。


1. 扩展 PostgreSQL 集成测试，在已有静态 CR 和远端作者文章上通过公开 service/store 操作运行关系准备与重复重建；比较持久化后、重开 store 后的历史和 diff 输出。
2. 在真实持久化夹具中保留旧比较和审核，再重新解析同一已发布源修订；断言发布不依赖关系完整性，旧审计证据不变，新内容发布/读取仍成功，旧关系在显式重建前不被读作有效。
3. 验证 `publishDocument` 的源关系 ID、节点 ID、hash 与发布后目标修订一致；加入正文冲突用例确认关系同步没有放宽静态/用户数据所有权检查。
4. 所有集成测试仅连接显式提供的 disposable database URL；不得生成或应用迁移。

## Task 5：完成真实数据性能验收和文档

- [x] 更新中英文架构边界，记录 local-dev 与 remote-dev 基准连接失败。
- [ ] 恢复真实数据库连接，验证历史 `<300ms`、跨版本 diff `<1000ms` 与读取量。
- [ ] 集成和性能验收完成后将 T4 issue 标为 done。


1. 使用没有历史完整响应缓存的 `measure.ts` 与 `measure-compare.ts`，通过现有 `itemHistory` / `compare` 操作测量已准备的远端 CR；记录输入 document、端点版本、语言、发布数、端点/全链节点规模、重复运行耗时、store query 次数、返回/读取节点量。
2. 历史至少测英语和中文代表条目（含复杂谱系），要求每次小于 300ms；跨版本 diff 至少测英语和中文完整链，要求每次小于 1000ms。确认历史/diff 没有调用中间版本 `revision()` 或读取全部中间全文。
3. 将结果追加到 `.scratch/rule-history-performance/findings.md`。若真实数据库或性能目标不可用/不达标，记录错误或超标数字与读取计数，不以预加载对照或缓存命中宣称通过；继续修复可在本票范围内解决的实现问题。
4. 若运输责任边界在现有架构文档中表述不完整，同步更新中英文文档：静态关系由本地显式计算、发布只运输已存在关系、远端文章由作者显式计算、关系缺失不阻止正文发布。
5. 全部验收完成后将 issue `04-rebuild-publish-review-performance.md` 标为 done；不提交、不生成迁移、不运行 lint。

## 验收命令

从仓库根目录运行：

```sh
bun test ./packages/console-api/src/lib/magic/documents/publish.test.ts ./packages/console-api/src/lib/magic/documents/adjacency.test.ts ./packages/console-api/src/lib/magic/documents/adjacency.integration.ts ./packages/console-api/src/lib/magic/documents/database.integration.ts ./packages/console-api/src/lib/magic/documents/comparison.test.ts ./packages/console-api/src/lib/magic/documents/references.test.ts
```

然后在 `packages/console-api` 运行：

```sh
bun run typecheck
```

真实开发库基准按仓库根目录运行：

```sh
bun --env-file=packages/db/.env.remote-dev .scratch/rule-history-performance/measure.ts
bun --env-file=packages/db/.env.remote-dev .scratch/rule-history-performance/measure-compare.ts
```
