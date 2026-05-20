# Hearthstone 字段同步管理页面设计评审

> 稳定的运行时边界、数据归属和同步规则以 [../../docs/project-architecture.zh-CN.md](../../docs/project-architecture.zh-CN.md) 为准。本文只记录本需求的评审结论；若有冲突，以主架构文档为准。

## 评审结论

建议通过。

这份设计抓住了本轮页面需求里最重要的两个边界：

- 页面骨架必须放在共享层，而不是在 desktop 和 site 各写一份
- desktop 的本地 / 远端差异必须收敛到注入层，而不是散落在页面内部

如果按这个方向实施，后续再扩 commit 页面、conflict 页面和更多对象时，复杂度会明显低于“双端各写一套页面”的路线。

## 阻塞问题

无。

## 主要判断

### 1. 页面落在 `console-shell` 是正确承载层

当前：

- `site-console`
- `app-console-desktop`

都已经通过 `extends` 复用 `@tcg-cards/console-shell`。

在这个前提下，把：

- `/hearthstone/commit`
- `/hearthstone/conflict`

直接落在 `console-shell`，比放在 app 侧各自维护要合理得多。

这样可以保持：

- 路由结构一致
- 布局一致
- 页面骨架一致

也符合当前 tag 页面已经证明过的共享方式。

### 2. 用 host 吸收运行时差异，是比页面内部分支更稳的方案

这份设计最关键的判断是：

- 共享页面不直接判断当前是 site 还是 desktop
- 共享页面不直接决定调用远端 API 还是本地 runtime

这是对的。

如果把这些判断直接写进页面，后续每增加一个：

- 列表请求
- 详情请求
- 冲突动作
- 来源切换

都要复制一次运行时分支，页面会很快失控。

把这些差异收敛到：

- `ConsoleFieldSyncHost`

能够明显降低页面复杂度，也更符合当前 `console-shell` 的注入式宿主模式。

### 3. desktop 的本地 / 远端切换应该是“同构骨架下的数据源切换”

用户要求 desktop 能同时管理：

- 本地
- 远端

但这不等于 desktop 需要一套独立页面。

设计把它处理成：

- 共用页面骨架
- 顶部多一个来源切换区
- 切换后只更换数据提供端

这是正确的。

这样做的优势是：

- desktop 和 site 仍然共用同一页面结构
- desktop 只在功能上多一个切换能力
- 不会把“desktop 特殊性”扩散成整页分叉

需要补充的一点是：

- `local` 来源是否可见，不能只由“当前是 desktop”决定
- 还必须取决于 runtime 是否已经拿到可用的本地数据库配置

否则页面会暴露一个注定失败的来源入口。

### 4. 首轮继续限定在 `hearthstone tag` 是必要收敛

当前真正已经打通字段同步链路的对象只有：

- `hearthstone tag`

因此把页面首轮范围限定为：

- 只接 `hearthstone tag`

是合理的。

如果现在就试图做成：

- 任意游戏
- 任意对象
- 任意字段同步对象

页面抽象会立刻膨胀，反而延迟可用版本落地。

## 非阻塞建议

### 1. `ConsoleFieldSyncHost` 不要直接长成第二套通用 API client

当前设计提出 host 是对的，但实现时需要继续约束：

- host 只暴露页面真正需要的最小能力
- 不要把整个远端 ORPC client 和 runtime client 原样再包一层

否则很容易出现：

- host 接口越来越大
- 页面层抽象收益下降
- 实际只是把 API client 重命名了一次

本轮建议坚持：

- commit 页只拿 commit 页所需接口
- conflict 页只拿 conflict 页所需接口

已经落地后的更稳形态是：

- commit 读取统一复用通用 `fieldCommit*` 模型
- tag 领域只保留冲突模型与 tag 专属筛选语义

这样后续扩到其他对象时，不需要再复制一套 `xxxCommitProfile`。

### 2. commit 页首轮只读是合理的，不要顺手加入审核或撤销

当前 commit 页首轮定位为只读，这是合理取舍。

原因不是 commit 不重要，而是：

- 当前真正需要闭环的是冲突查看与冲突解决
- commit 管理更多是审计与排障视图

如果首轮把：

- 审核
- 撤销
- 重放控制

都塞进 commit 页，页面会迅速演变成新的控制中心，超出本轮目标。

### 3. 来源切换状态需要持久化，但不要跨页强绑定

设计里提到 desktop 要记住最近一次来源选择，这点是对的。

但建议保持：

- commit 页独立记忆
- conflict 页独立记忆

不要强行做成全局共享来源状态。

因为用户很可能会出现这种使用方式：

- commit 页常看远端
- conflict 页常看本地

把两页绑死成一个全局来源值，反而会增加切换成本。

另外，desktop 的本地数据库连接来源应采用：

1. 用户在 desktop 设置中保存的连接串
2. 环境变量 fallback

不应把 env 作为唯一来源，否则运行时配置无法在应用内即时生效。

## 通过条件

- 页面骨架继续放在 `console-shell`
- desktop 的本地 / 远端差异通过 host 注入处理
- 首轮只接 `hearthstone tag`
- commit 页保持只读
- conflict 页优先完成查看与解决动作闭环
