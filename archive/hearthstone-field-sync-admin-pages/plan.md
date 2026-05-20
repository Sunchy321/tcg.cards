# Hearthstone 字段同步管理页面实施计划

> 稳定的运行时边界、数据归属和同步规则以 [../../docs/project-architecture.zh-CN.md](../../docs/project-architecture.zh-CN.md) 为准。本文只记录本需求的实施计划；若有冲突，以主架构文档为准。

## TODO List

- [x] 固定首轮页面范围与共享边界
- [x] 补齐远端 tag commit 只读接口
- [x] 补齐 desktop runtime 本地 tag commit 只读接口
- [x] 设计并接入字段同步页面 host
- [x] 在 `console-core` 中补齐导航入口
- [x] 实现共享 commit 管理页面骨架
- [x] 实现共享 conflict 管理页面骨架
- [x] 为 desktop 接入本地 / 远端切换
- [x] 完成基础验证并更新文档口径

## 目标

在不复制页面实现的前提下，为 `hearthstone tag` 的字段同步链路补齐两类管理入口：

- commit 管理页面
- conflict 管理页面

并满足：

- `site-console` 与 `app-console-desktop` 共用同一套页面骨架
- desktop 支持在同一页面中切换查看本地与远端数据
- 首轮只接入 `hearthstone tag`

## 实施原则

- 页面骨架统一放在 `packages/console-shell`
- 运行时差异通过 host 注入处理，不在页面里写大量 desktop / site 分支
- 首轮 commit 页面只读
- 首轮 conflict 页面优先提供查看和解决动作闭环
- 首轮只接入 `hearthstone tag`

## 阶段计划

| 阶段 | 目标 | 核心任务 | 输出物 | 依赖 | 验收标准 |
|------|------|----------|--------|------|----------|
| P0 范围冻结 | 固定页面范围与共享方式 | 冻结页面只服务 `hearthstone tag`；冻结 commit/conflict 双页结构；冻结 `console-shell + host` 共享边界 | 最终范围清单 | design / review | 不再把 `magic` 或通用对象页混入首轮 |
| P1 读接口补齐 | 为页面补足最小数据接口 | 增加远端 tag commit `list/get`；增加 desktop runtime 本地 tag commit `list/get`；复核 conflict 接口最小字段 | 页面可用数据接口 | P0 | 页面所需的 commit/conflict 数据可分别从远端与本地读取 |
| P2 host 接入 | 建立共享页面的数据宿主层 | 在 `console-shell` 增加字段同步 host；由 site 注入远端实现；由 desktop 注入本地/远端双来源实现 | 页面宿主接口 | P1 | 页面不直接区分 site / desktop 也能读取正确数据 |
| P3 导航与骨架 | 建立共享页面入口 | 更新 `console-core` 导航；在 `console-shell` 新增 commit/conflict 页面骨架与共享子组件 | 可访问页面骨架 | P0, P2 | site 与 desktop 都能进入两页 |
| P4 commit 页面 | 落地 commit 管理页 | 实现列表、筛选、详情；接入来源切换；保持 commit 页只读 | commit 页面 | P3 | site 可看远端 commit，desktop 可切本地/远端 commit |
| P5 conflict 页面 | 落地 conflict 管理页 | 实现列表、筛选、详情、解决动作；接入来源切换；桌面端可分别管理本地和远端冲突 | conflict 页面 | P3, P2 | site 可处理远端冲突，desktop 可处理本地/远端冲突 |
| P6 验证与收口 | 验证行为与文档一致 | 运行类型检查；验证页面路由、来源切换、只读 commit、conflict 动作；更新 proposal 文档口径 | 验证结果 | P1-P5 | 设计、实现和文档口径一致 |

## 实施步骤

### 1. 固定首轮范围与共享边界

- 页面只新增：
  - `/hearthstone/commit`
  - `/hearthstone/conflict`
- 只接入：
  - `hearthstone tag`
- 页面骨架固定放在：
  - `packages/console-shell`
- 运行时差异固定通过：
  - `ConsoleFieldSyncHost`

### 2. 补齐远端 tag commit 只读接口

至少补齐：

- `listCommits`
- `getCommit`

最小字段至少覆盖：

- `sequence`
- `entityType`
- `entityKey`
- `fieldPath`
- `value`
- `operation`
- `commitKind`
- `reviewStatus`
- `syncStatus`
- `editorRuntime`
- `editorIdentity`
- `createdAt`
- `projectedAt`

### 3. 补齐 desktop runtime 本地 tag commit 只读接口

desktop runtime 至少补齐：

- `tag.listCommits`
- `tag.getCommit`

并保持与远端只读接口尽量一致的输出结构，避免页面层为本地 / 远端分别维护两套渲染逻辑。

### 4. 设计并接入字段同步页面 host

在 `console-shell` 中新增 host 注入接口，至少承载：

- 可用来源列表
- tag commit 读取
- tag conflict 读取
- tag conflict 解决

并分别由：

- `site-console`
  - 只注入 `remote`
- `app-console-desktop`
  - 注入 `local + remote`

### 5. 在 `console-core` 中补齐导航入口

仅在 `hearthstone` 导航中新增：

- `提交`
- `冲突`

首轮不在 `magic` 或根层增加对应入口。

### 6. 实现共享 commit 管理页面骨架

commit 页至少包含：

- 顶部说明
- 来源切换区
- 筛选区
- 左侧列表
- 右侧详情

首轮 commit 页能力固定为：

- 只读
- 支持分页 / 筛选 / 详情
- 不支持审核
- 不支持撤销
- 不支持重放控制

### 7. 实现共享 conflict 管理页面骨架

conflict 页至少包含：

- 顶部说明
- 来源切换区
- 筛选区
- 左侧列表
- 右侧详情
- 解决动作区

首轮动作至少支持：

- `accept_incoming`
- `keep_current_winner`
- `require_followup_commit`
- `winner_clear`

### 8. 为 desktop 接入本地 / 远端切换

desktop 页面必须支持：

- `local`
- `remote`

并保证：

- 切换不更换页面骨架
- 切换后重新加载列表和详情
- commit 页与 conflict 页分别记忆上次来源

### 9. 验证与文档收口

至少验证以下场景：

- site 能进入 commit / conflict 页面
- desktop 能进入 commit / conflict 页面
- site 只显示远端来源
- desktop 可切换本地 / 远端来源
- commit 页在两端都能正确显示列表与详情
- conflict 页在两端都能正确显示列表与详情
- conflict 动作执行后页面状态能刷新

并同步更新：

- proposal 中的 design / review / plan

## 验证结果

本轮已完成的基础验证：

- `packages/model`
  - `bun run typecheck`
- `packages/console-api`
  - `bun run typecheck`
- `packages/console-core`
  - `bun x tsc --noEmit`
- `apps/service-desktop-runtime`
  - `bun run typecheck`
- `apps/app-console-desktop`
  - `bun x vue-tsc --noEmit -p tsconfig.json`
- `apps/site-console`
  - `bun x vue-tsc --noEmit -p tsconfig.json`

已对齐的实现口径：

- commit 读取统一使用通用 `fieldCommit*` 模型
- commit / conflict 页面骨架统一放在 `packages/console-shell`
- desktop 和 site 都通过 `ConsoleFieldSyncHost` 注入数据源
- desktop 的 `local` 来源只有在 runtime 已拿到本地数据库配置时才暴露
- desktop 本地数据库连接采用“用户配置优先，env fallback”

## 回退策略

- P1 失败：保留当前无 commit/conflict 页面状态
- P2 失败：不启用共享页面 host，避免页面中途混入运行时分支
- P3 失败：先不暴露导航入口
- P4 失败：可先只保留 conflict 页面
- P5 失败：保留冲突只读视图，不开放解决动作

## 风险与缓解

### 风险 1：host 膨胀成第二套 API 层

- 影响：共享层复杂度失控
- 缓解：只暴露页面所需最小接口，不包装整个客户端

### 风险 2：desktop 本地 / 远端分支污染页面

- 影响：共享页面很快分叉
- 缓解：强制通过 host 处理来源差异，页面只消费统一接口

### 风险 3：首轮范围扩散到 `magic.cards`

- 影响：页面抽象与验证复杂度陡增
- 缓解：导航、路由、接口和页面都先固定为 `hearthstone tag`

## 验收标准

- `site-console` 与 `app-console-desktop` 共享同一套 commit/conflict 页面骨架
- desktop 能在同一页面中切换本地 / 远端来源
- commit 页保持只读并可查看列表与详情
- conflict 页可查看列表、详情并执行首轮解决动作
- 页面不直接耦合 runtime 分支
- 文档、路由、导航和实现口径一致
