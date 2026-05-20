# Hearthstone 字段同步管理页面设计

> 稳定的运行时边界、数据归属和同步规则以 [../../docs/project-architecture.zh-CN.md](../../docs/project-architecture.zh-CN.md) 为准。本文只讨论本轮 commit / conflict 管理页面，不重写已有字段同步模型。

## 1. 背景

当前 `hearthstone tag` 的字段同步核心链路已经落地：

- 本地 `field_commits`
- 本地 / 远端 `field_conflicts`
- 本地 / 远端 `field_winners`
- desktop 的 `push / pull / replay`
- `base_drift`、`winner_clear`、`conflict_resolution`

但控制台还缺少管理入口。现状是：

- site 没有可视化查看远端 commit / conflict 的页面
- desktop 没有可视化查看本地 commit / conflict 的页面
- desktop 也无法在同一套界面骨架下切换查看本地与远端状态

这会直接影响后续运维：

- 无法检查某个字段最近有哪些 commit
- 无法快速定位冲突发生在哪一端
- 无法在 UI 中执行冲突解决动作

## 2. 目标

本轮页面建设目标固定为：

1. 为 commit 和 conflict 各自提供独立管理页面
2. `site-console` 与 `app-console-desktop` 共用同一套页面骨架
3. desktop 在相同页面中支持切换：
   - 本地
   - 远端
4. 首轮只接入 `hearthstone tag` 的字段同步对象
5. 页面优先服务运维与排障，不追求复杂可视化

## 3. 非目标

本轮不做：

- `magic.cards` 的 commit / conflict 页面
- 通用到任意对象的完整抽象 UI
- 批量冲突处理
- commit diff 高亮编辑器
- 多对象混合筛选
- 自动刷新、实时订阅、WebSocket

## 4. 路由与导航

首轮新增两个页面：

- `/hearthstone/commit`
- `/hearthstone/conflict`

导航层只在 `hearthstone` 下新增：

- `提交`
- `冲突`

原因：

- 当前只有 hearthstone tag 已接入完整字段同步链路
- 把页面挂到 `magic` 或通用根层会制造“所有游戏都可用”的错误预期

## 5. 共享页面骨架

### 5.1 页面放置位置

页面骨架统一放在：

- `packages/console-shell/app/pages/hearthstone/commit/index.vue`
- `packages/console-shell/app/pages/hearthstone/conflict/index.vue`

原因：

- `site-console` 和 `app-console-desktop` 都已经 `extends: ['@tcg-cards/console-shell']`
- 当前 tag 页面已经证明 `console-shell` 是共享后台页面的正确承载层

### 5.2 页面结构

两页都遵循同一结构：

1. 顶部说明卡片
2. 数据来源切换区
3. 筛选区
4. 左侧列表
5. 右侧详情
6. 冲突页额外提供解决动作区

首轮骨架要求统一，但不强制两个页面抽成同一个大组件。更合适的方式是抽共享子组件：

- `FieldSyncSourceSwitch`
- `FieldSyncListPanel`
- `FieldSyncDetailPanel`
- `FieldSyncEmptyState`

这样可以：

- 保持 commit 页与 conflict 页的字段布局独立
- 共享桌面端多来源切换骨架
- 避免过早把两页强塞成一份巨型配置驱动组件

## 6. 数据来源切换模型

### 6.1 统一概念

页面层引入一个显式来源概念：

- `remote`
- `local`

其语义固定为：

- `remote`
  - 读取共享远端仓库的 commit / conflict
- `local`
  - 读取当前 desktop 本地仓库的 commit / conflict

### 6.2 site 行为

site 只支持：

- `remote`

因此 site 页面：

- 不显示来源切换按钮
- 默认直接使用 `remote`

### 6.3 desktop 行为

desktop 同时支持：

- `local`
- `remote`

因此 desktop 页面在顶部多一组来源切换按钮：

- `本地`
- `远端`

切换后：

- 保持同一页面骨架
- 仅更换数据提供端
- 筛选条件尽量保留
- 当前列表和详情重新加载

但 `local` 来源不是无条件暴露。实际行为应为：

- 当 desktop runtime 已拿到可用的本地数据库连接时，显示：
  - `local`
  - `remote`
- 当本地数据库连接尚未配置时，只显示：
  - `remote`

这样可以避免页面把用户切到一个实际不可用的本地来源。

## 7. 页面与运行时解耦方式

### 7.1 不直接在共享页面中写死 runtime 分支

共享页面不应直接判断：

- 当前是不是 desktop
- 当前是不是 site
- 当前该调用哪个 client

否则页面会逐渐积累大量运行时分支。

### 7.2 新增字段同步页面 host

建议在 `console-shell` 增加一层注入式 host，例如：

- `ConsoleFieldSyncHost`

其职责不是处理业务逻辑，而是回答两类问题：

1. 当前运行时支持哪些来源
2. 每个来源应该如何读取 / 处理数据

建议最小接口形状如下：

```ts
interface ConsoleFieldSyncHost {
  getAvailableSources(): Array<'local' | 'remote'>;
  listTagCommits(input: FieldCommitListInput & { source: 'local' | 'remote' }): Promise<FieldCommitListResult>;
  getTagCommit(input: FieldCommitGetInput & { source: 'local' | 'remote' }): Promise<FieldCommitProfile>;
  listTagConflicts(input: TagConflictListInput & { source: 'local' | 'remote' }): Promise<TagConflictListResult>;
  getTagConflict(input: TagConflictGetInput & { source: 'local' | 'remote' }): Promise<TagConflictProfile>;
  resolveTagConflict(input: TagConflictResolveInput & { source: 'local' | 'remote' }): Promise<TagConflictProfile>;
}
```

### 7.3 site host

site host 直接把所有请求转给远端 API：

- `orpc.hearthstone.tag.*`

并固定：

- `getAvailableSources() = ['remote']`

### 7.4 desktop host

desktop host 同时封装两条数据通路：

- `remote`
  - 仍走现有远端 API client
- `local`
  - 走 `service-desktop-runtime`

desktop 页面无需知道：

- runtime URL
- local DB URL
- 哪些接口来自 runtime

它只消费 host。

desktop host 还需要负责两件事：

- 启动时探测 runtime 是否已经配置本地数据库
- 将 desktop 已保存的数据库连接同步给 runtime

本地数据库连接的优先级固定为：

1. desktop 用户配置
2. `DESKTOP_LOCAL_DATABASE_URL` 环境变量 fallback

## 8. API 需求

### 8.1 conflict

当前 conflict 已具备：

- `listConflicts`
- `getConflict`
- `resolveConflict`

因此页面层首轮只需要接 UI。

### 8.2 commit

当前还缺 commit 管理接口，因此本轮需要补一组只读接口。

首轮最小接口：

- `listCommits`
- `getCommit`

首轮 commit 页不提供编辑动作，不提供撤销动作，不提供审核动作。

commit 读取模型应直接复用通用结构：

- `FieldCommitListInput`
- `FieldCommitListResult`
- `FieldCommitGetInput`
- `FieldCommitProfile`

不再单独定义 `tagCommitProfile`、`tagCommitListResult` 这类 tag 专用读取模型；tag 页所需的 `enumId` 过滤通过 `entityKey.enumId` 处理。

### 8.3 desktop runtime

desktop runtime 需要补本地 commit 只读接口，并复用已有本地 conflict 接口风格：

- `tag.listCommits`
- `tag.getCommit`

这样 desktop 在 `local` 模式下才能共用相同页面骨架。

## 9. commit 页面设计

### 9.1 列表区

列表至少展示：

- `sequence`
- `fieldPath`
- `commitKind`
- `reviewStatus`
- `syncStatus`
- `editorRuntime`
- `createdAt`

支持的首轮筛选：

- `fieldPath`
- `commitKind`
- `reviewStatus`
- `syncStatus`
- `entity enumId`

### 9.2 详情区

详情至少展示：

- `entityType`
- `entityKey`
- `fieldPath`
- `value`
- `operation`
- `commitKind`
- `clientMutationId`
- `expectedRowRevision`
- `expectedWinnerRevision`
- `baseRevision`
- `reviewStatus`
- `syncStatus`
- `editorRuntime`
- `editorIdentity`
- `createdAt`
- `projectedAt`

### 9.3 desktop 特殊提示

在 desktop 页面中，详情区应明确标注当前来源：

- 本地 commit
- 远端 commit

避免用户误以为当前看到的是另一端的数据。

## 10. conflict 页面设计

### 10.1 列表区

列表至少展示：

- `conflictKind`
- `processingSide`
- `processingStage`
- `fieldPath`
- `status`
- `createdAt`

支持的首轮筛选：

- `status`
- `processingSide`
- `processingStage`
- `conflictKind`
- `entity enumId`

### 10.2 详情区

详情至少展示：

- `sourceSummary`
- `candidateBaseValue`
- `localValue`
- `incomingValue`
- `effectiveValue`
- `winnerValue`
- `baseRevision`
- `reason`
- `resolution`
- `createdAt`
- `resolvedAt`

### 10.3 解决动作区

当冲突状态为 `open` 时，提供动作按钮：

- `accept_incoming`
- `keep_current_winner`
- `require_followup_commit`
- `winner_clear`

页面规则：

- 不是所有冲突都强制显示全部动作
- `winner_clear` 只在支持的 tag auto-base 字段上展示
- `resolved` / `dismissed` 的冲突只读显示，不再允许重复提交解决动作

## 11. 状态与权限

### 11.1 状态记忆

对 desktop，页面应记住最近一次选择的来源：

- commit 页单独记忆
- conflict 页单独记忆

避免用户每次进入页面都重新切换到本地或远端。

### 11.2 权限

首轮不新增独立权限模型，沿用当前控制台访问权限。

但页面内仍应保持基本防护：

- site 不暴露 `local` 按钮
- 未提供 field sync host 时页面直接报错并给出空态提示

## 12. 实施步骤

### 12.1 先补读接口

先补：

- 远端 tag commit 只读接口
- desktop runtime 本地 tag commit 只读接口

### 12.2 再补 host 注入层

在 `console-shell` 定义字段同步 host 接口，并分别由：

- `site-console`
- `app-console-desktop`

注入实现。

### 12.3 最后补共享页面

在 `console-shell` 新增：

- commit 管理页
- conflict 管理页

并更新导航。

## 13. 风险

### 13.1 过早抽象成完全通用对象页

如果一开始就把页面做成“任意对象通用字段同步后台”，会显著增加：

- 类型复杂度
- 过滤器复杂度
- 详情布局复杂度

首轮应维持：

- 路由是 hearthstone 专用
- 数据对象先固定为 tag

### 13.2 desktop 双来源分支污染页面

如果在页面里直接写：

- `if desktop then runtime else remote`

后续 commit 页、conflict 页、详情区、动作区都会复制同样分支。

因此必须把来源差异收敛到 host。

## 14. 结论

本轮推荐方案是：

- 在 `console-shell` 中新增 `/hearthstone/commit` 与 `/hearthstone/conflict`
- 页面骨架完全共享
- 通过注入式 field sync host 解耦运行时差异
- site 只支持远端
- desktop 支持本地 / 远端切换
- 首轮只接入 `hearthstone tag`

这样可以在不复制整页的前提下，同时满足：

- 两端共用页面骨架
- desktop 管理本地与远端
- 后续可继续扩展到其他对象
