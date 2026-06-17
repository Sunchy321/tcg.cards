# 游戏领域数据本地/远端同步系统设计

> 稳定的运行时边界、数据归属和同步规则以 [../../docs/project-architecture.zh-CN.md](../../docs/project-architecture.zh-CN.md) 为准。本文描述游戏领域数据的本地/远端同步设计；若有冲突，以主架构文档为准。

## 背景

当前项目已经明确以下稳定前提：

- desktop 是游戏领域数据重型工作流的执行权威端
- 本地 PostgreSQL 是构建、导入和发布准备的权威层
- remote 是 serving 层、受限管理层和必要协同状态承载层
- 游戏领域数据同步不能退化为通用整行双向 last-write-wins

但“游戏领域数据同步”本身并不是单一问题，而是至少包含两类完全不同的工作流：

- 某些数据只允许自动化提交，不允许远端回写
- 某些数据允许人工编辑，并且需要远端拉取、冲突合并、审计、审核、撤销和后续修复

如果把这两类工作流强行塞进同一套“全量 commit 历史”或“全量当前态合并”模型，会分别遇到以下问题：

- 全量 commit 化会让高频自动化数据产生不可接受的历史体积和写放大
- 只保留当前态会让人工编辑的审计、审核、部分接受、撤销和字段级冲突处理变得不可解释

因此，本设计将同步系统收敛为一套由字段 policy 驱动的双轨模型。

## 目标

- 支持游戏领域数据在 local 与 remote 之间同步
- 保持 desktop 作为重型自动化和冲突消化的主要执行面
- 保持 remote 具备独立的远端管理和人工编辑能力
- 让只允许自动化的对象继续使用轻量发布模型
- 让允许人工编辑的字段具备 commit、审核、冲突处理、接受、拒绝、撤销和修复能力
- 让字段级规则能够表达：
  - 是否允许人工编辑
  - 接受哪些自动来源
  - 哪些自动来源可以自动接受
  - 哪些字段需要审核后才能生效
  - 人工覆盖是否允许未来自动来源重新覆盖

## 非目标

- 不把全部游戏领域数据统一迁入一套高频 commit 历史
- 不把 remote 重新设计成重型自动化导入和全量集成中心
- 不引入通用自由分支操作、历史重写或 Git 等价物
- 不在本轮改写已有 publish-owned 发布链路的核心事实模型

## 核心结论

### 1. 同步系统按字段 policy 分成两条轨道

同步系统不按“整个游戏”只选一种模型，而是按字段 policy 将数据分流到两条轨道。

#### 1.1 `publish-owned` 轨道

适用于整表、整对象或整字段组只允许自动化提交的数据。

这一轨道保持轻量模型：

- desktop 本地负责导入、重算、发布准备和高频自动化变更消化
- 本地维护行级已发布基线、增量候选和相关发布控制事实
- remote 只接收整理后的发布结果
- remote 不接收原始高频自动化 commit 历史

这一轨道延续现有 publish / diff / gate 方向，不引入协作 commit 历史。

#### 1.2 `collaborative` 轨道

适用于允许人工编辑、需要字段级冲突处理，或需要按来源决定是否自动接受的字段。

这一轨道使用 Git-like 但受控简化的协作模型：

- 所有修改先形成 commit
- commit 下挂 field entry
- 审核、冲突处理、接受和拒绝都以 field entry 为最小单位
- accepted 的 field entry 立即写入结果表
- rejected 的 field entry 保留历史，但不影响当前结果

这一轨道不暴露自由 branch 操作，但保留受控的本地/远端历史语义。

### 2. 字段 policy 是两条轨道的分流器

同步系统必须提供字段级 policy，因为同一张表的不同列可能需要不同规则。

字段 policy 至少需要表达：

- 当前字段属于 `publish-owned` 还是 `collaborative`
- 是否允许人工编辑
- 允许哪些自动来源提交候选变更
- 哪些自动来源可以直接自动接受
- 哪些自动来源之间允许自动合并或自动覆盖
- 当前字段是否要求审核后才能进入 accepted 状态
- 人工覆盖模式是 `manual_sticky` 还是 `manual_until_source_change`

其中：

- `manual_sticky`
  - 人工接受后，自动来源不能直接重新覆盖
- `manual_until_source_change`
  - 人工接受后，自动来源只有在来源版本或等价来源指纹发生变化后，才允许重新参与自动接受

### 3. `collaborative` 轨道以 `commit + field entry` 为基础模型

#### 3.1 `commit` 表达一次操作容器

`commit` 表达一次提交操作，而不是单字段决策本身。

它至少承载以下语义：

- `kind`
- 来源运行时，例如 `desktop`、`site`、`system`
- 来源模型和来源 actor
- 操作对象定位
- base revision 或等价父提交关系
- 作者、原因、批次信息和时间

首轮固定 `commit.kind` 只保留以下最小集合：

- `change`
  - 普通变更提交
  - 人工编辑、自动来源候选变更和一般修正默认都使用这个 kind
- `merge`
  - 合并或冲突解决产物提交
  - 用于明确标记“这条提交不是简单编辑，而是对既有历史的整合结果”
- `revert`
  - 撤销提交
  - 用于通过追加新提交的方式撤销某条旧结果，而不是重写旧历史
- `bootstrap`
  - 初始化导入提交
  - 用于把既有状态正式纳入协作历史起点

首轮不把来源类型、运行时或审核结果编码进 `commit.kind`。

这些信息分别由以下结构表达：

- 来源是谁：`runtime`、`sourceModel`、`sourceActor`
- 是否已被接受：`field entry.status`
- 是否需要审核：字段 policy

`commit` 允许聚合显示状态，例如：

- `pending`
- `partial`
- `accepted`
- `rejected`

但这些状态只是聚合视图，不是最终生效判断的最小单位。

#### 3.2 `field entry` 是实际审核和冲突处理单元

每个字段变更都必须落为独立的 `field entry`。

`field entry` 至少需要支持以下状态语义：

- `pending`
- `accepted`
- `rejected`
- `conflict`
- `superseded`

部分接受只发生在 `field entry` 级别，不发生在 `commit` 整体级别。

因此：

- 一条 commit 可以被部分接受
- 同一条 commit 中，不同字段可以进入不同结果
- 结果表只受 accepted 的 field entry 影响

### 4. 接受后的当前结果表直接生效

`collaborative` 轨道不要求单独等待异步 projector 才让用户看到生效结果。

固定规则为：

- field entry 被 `accepted` 时，直接写入当前结果表
- 当前结果表记录当前字段值来自哪条 accepted field entry
- field entry 被 `rejected` 时，不修改当前结果表

这意味着当前结果表是 accepted history 的持久化投影，而不是独立真相源。

### 5. `winner` 保留，但只作为自动接受决策状态

系统保留 `winner`，但它不能成为第二套当前值真相。

`winner` 的职责固定为：

- 服务后续自动接受判断
- 记录当前自动裁决锚点
- 记录人工覆盖模式对未来自动来源的影响

`winner` 可以持久化保存，但必须满足两个条件：

- 它是 auto-accept 的正式输入
- 它必须能从 accepted history 与字段 policy 重建

因此系统真相顺序固定为：

1. accepted history 是根真相
2. 当前结果表是业务投影
3. `winner` 是面向自动接受决策的持久化派生状态

### 6. 修复通过新 commit 完成，不直接改历史业务值

当已接受的人工或自动变更被证明有误时，业务值修复应通过新的 commit 完成，而不是直接修改旧 field entry 的业务值。

这样可以保持：

- 原始历史不可变
- 审计关系清晰
- 冲突处理、审核、撤销和修复继续复用同一套模型

允许保留极少量 metadata 级修补能力，例如 reviewer 备注、关联标识或审核注记修复，但业务值修复不走就地改历史。

## 当前设计结构

### 1. 总体结构

系统按字段 policy 分成两条同步轨道，但共享同一套对象边界、来源定义和最终结果表。

- `publish-owned track`
  - 面向整表或整字段组仅允许自动化提交的数据
  - desktop 本地是执行权威
  - 本地维护行级发布基线、增量候选和发布计划事实
  - remote 只接收整理后的发布结果

- `collaborative track`
  - 面向允许人工编辑或需要多来源裁决的字段
  - 所有修改都先形成 commit
  - commit 下挂 field entry
  - 每个 field entry 独立进入自动审核或人工审核
  - accepted 的 field entry 立即写入结果表

- `policy registry`
  - 决定字段属于哪条轨道
  - 决定字段的自动来源接收规则、审核要求和人工覆盖模式

- `authority split`
  - desktop 负责重型导入、高频自动化提交消化、复杂冲突分析、批量重算、对账和修复
  - remote 必须能独立完成远端编辑闭环，但不替代 desktop 的重型本地集成

### 2. 数据模型与受控 refs

协作轨的最小模型固定成 `refs + commit + field entry + projection + winner`。

- `refs`
  - 至少保留以下两类受控引用：
  - `local`
    - desktop 本地 commit 历史
    - 承载本地已知的提交历史，包括待处理、已接受、已拒绝和已覆盖的字段变更
  - `remote`
    - 远端 commit 历史
    - 承载远端已知的提交历史，包括待处理、已接受、已拒绝和已覆盖的字段变更

- `commit`
  - 表示一次操作容器
  - 自身只显示聚合状态，不承担字段级最终裁决
  - 是否进入当前结果表，不由 ref 决定，而由其中各条 `field entry` 的状态决定

- `field entry`
  - 是字段级审核、冲突处理和接受/拒绝的最小单元

- `projection`
  - 当前结果表
  - 接受时直接更新，并记录当前值来自哪条 accepted field entry

- `winner`
  - 持久化自动接受决策状态
  - 不能和结果表形成两套当前值真相

### 3. 提交流程、审核/冲突处理与接受写入规则

协作轨固定采用“所有变更先提交，再按字段 entry 独立裁决”的流程。

#### 3.1 `submit`

只要某个修改进入 `collaborative` 轨道，就必须先形成 `commit`。

固定规则为：

- 不管修改来自 `desktop`、`site` 还是自动来源，都先写成 `commit`
- 每条 `commit` 下生成一个或多个 `field entry`
- 每个 `field entry` 都携带字段 policy、来源信息、base revision 和必要的来源版本锚点

#### 3.2 `classify`

系统先按字段 policy 对每条 `field entry` 分类。

第一轮至少需要区分：

- 可以直接进入 auto-review
- 必须进入人工 review
- 已与当前 accepted 历史或待处理变更形成显式 conflict

这个判断固定在 `field entry` 级别完成，而不是在 `commit` 整体级别完成。

#### 3.3 `review / resolve`

`field entry` 的审核与冲突解决也固定在字段级完成。

- `auto-review`
  - 满足字段 policy 的 entry 可直接进入接受判断
- `manual review`
  - 审核者逐字段接受或拒绝
- `conflict resolve`
  - 冲突解决的产物仍然是字段级裁决，而不是整条 commit 的单一结论

因此：

- 同一条 commit 中，一部分字段可以被接受
- 另一部分字段可以被拒绝
- 还有一部分字段可以继续保持待处理或被后续结果覆盖

#### 3.4 `accept`

当某条 `field entry` 被接受时，系统必须同步完成三件事：

1. 把 entry 状态改为 `accepted`
2. 直接把该字段写入当前结果表
3. 更新 `winner`

这三步必须被视为同一原子处理单元，不能把结果表和 `winner` 维护成彼此独立的异步真相。

当前结果表必须记录：

- 当前字段值来自哪条 accepted field entry
- 当前投影版本基于哪次接受动作产生

#### 3.5 `reject`

当某条 `field entry` 被拒绝时：

- 只更新 entry 状态和审核历史
- 不修改当前结果表
- 不允许用 rejected entry 改写 `winner`

#### 3.6 `supersede / repair`

如果后续发现某条已接受变更不再合适，业务值修复不通过直接改旧记录完成，而是通过新的 commit 覆盖旧结果完成。

因此：

- 修复先形成新的 commit
- 新 commit 生成新的 field entry
- 新 field entry 被接受后覆盖当前结果表中的旧值
- 被覆盖的旧 entry 继续保留历史，并可被标记为 `superseded` 或被新的结果记录引用为上次生效来源

如果修复的意图是显式撤销某条旧结果，而不只是普通修正，则新 commit 应使用 `commit.kind = revert`。

### 4. `winner`、自动接受与人工覆盖模式

这一节固定 `winner` 的职责边界，避免它演化成第二套不可解释的当前值模型。

#### 4.1 `winner` 不是当前值真相

系统固定以下顺序：

- accepted history 是根真相
- 当前结果表是业务投影
- `winner` 是面向后续自动接受判断的持久化决策状态

因此：

- 当前字段值来自最后生效的 accepted field entry
- `winner` 不能独立改写当前结果表
- `winner` 不能和结果表各自维护不同的当前值结论

#### 4.2 `winner` 的最小职责

`winner` 至少承载以下语义：

- 当前字段允许哪些自动来源参与裁决
- 当前自动裁决锚点是什么
- 当前人工覆盖模式是什么
- 当前自动接受决策建立在哪条 accepted field entry 之上
- 必要时记录来源版本、来源指纹或等价来源变化锚点

这些信息用于后续判断：

- 某条新自动 entry 是否可以直接 auto-accept
- 某条人工 entry 是否会阻止自动来源继续覆盖
- 某条自动来源是否已经发生了足以重新参与裁决的来源变化

#### 4.3 自动接受的基本判断顺序

对每条进入 `collaborative` 轨道的自动来源 entry，系统按以下顺序判断是否允许直接自动接受：

1. 字段 policy 是否允许该自动来源参与
2. 当前字段是否处于人工覆盖状态
3. 如果不处于人工覆盖状态，按来源优先级、来源兼容规则或等价裁决规则判断是否可以 auto-accept
4. 如果处于人工覆盖状态，再按人工覆盖模式判断自动来源是否可重新参与

#### 4.4 人工覆盖模式

字段 policy 首轮固定支持两种人工覆盖模式：

- `manual_sticky`
  - 某条人工 field entry 被接受后，自动来源不能直接重新覆盖当前结果
- `manual_until_source_change`
  - 某条人工 field entry 被接受后，自动来源只有在来源版本、来源指纹或等价来源变化锚点发生变化后，才允许重新参与自动接受

`manual_until_source_change` 的目标是表达以下业务语义：

- 当前自动数据有误，先由人工修正
- 未来上游自动来源真正修复该问题后，允许自动结果重新接管

它不允许旧自动值或重复自动提交反复覆盖人工结果。

#### 4.5 来源变化只作为底层判定手段

`manual_until_source_change` 需要底层判定“自动来源是否真的变了”，但该判定不应成为对外主要设计概念。

因此设计上固定为：

- 对外规则由字段 policy 表达
- `source revision`、`source fingerprint`、`source lineage` 或等价锚点只作为底层实现手段
- `winner` 或 accepted history 里需要保留足够的锚点，供系统判断未来自动来源是否符合重新 auto-accept 的条件

#### 4.6 `winner` 必须允许重建

虽然 `winner` 是持久化决策状态，但它必须允许从 accepted history 与字段 policy 重建。

这意味着：

- `winner` 可以作为正式 auto-accept 输入
- `winner` 丢失或被怀疑不一致时，系统必须可以按 accepted history 和字段 policy 重放恢复
- `winner` 不能依赖只能人工偷偷改写、又无法从历史推出的隐藏状态

## 待继续收敛的设计主题

### 5. `local` / `remote` 双历史的协同边界

协作轨只保留 `local` 和 `remote` 两条 commit 历史。

待处理、已接受、已拒绝和已覆盖状态不再通过独立 proposal ref 区分，而统一由 `field entry` 状态表达。

#### 5.1 两条历史的职责

- `local`
  - desktop 本地 commit 历史
  - 承载本地自动化提交、本地人工提交，以及本地拉取后已知的相关协作历史
- `remote`
  - 远端 commit 历史
  - 承载远端人工提交、远端接收的同步结果，以及远端审核流中待处理和已处理的协作历史

#### 5.2 为什么不再单独保留 proposal ref

审核、冲突解决、接受和拒绝的最小单位已经固定在 `field entry` 上。

在这个前提下，单独再保留 proposal ref 会重复表达同一件事：

- ref 说一条 commit 还在 proposal
- entry 状态又说其中哪些字段待处理、哪些字段已接受、哪些字段已拒绝

这会增加额外的引用流转复杂度，但不会提供新的业务表达能力。

因此：

- proposal 作为工作流语义保留
- proposal 不再作为独立 ref 保留
- 待审核列表、冲突列表和已接受列表都从同一条 commit 历史中按 `field entry` 状态过滤得到

#### 5.3 历史与结果表的边界

两端都只保留一条 commit 历史，但这不意味着所有 commit 都会影响当前结果表。

固定规则为：

- commit 是否存在于 `local` 或 `remote`，只表示它已进入该端历史
- 某条 field entry 是否影响当前结果表，只取决于它是否被 `accepted`
- `pending`、`rejected`、`conflict` 和 `superseded` 的 field entry 只保留历史或工作流意义，不直接改写结果表

#### 5.4 desktop 集成 remote 管理能力不改变双历史边界

desktop 可以集成 remote 管理能力，但这不意味着 local 与 remote 会混成同一条历史。

这意味着：

- desktop 可以查看 remote 历史中的待审核和冲突条目
- desktop 可以通过 remote 管理能力操作这些条目
- 这些条目仍属于 `remote` 历史，而不是自动并入 `local`

#### 5.5 pull / push 的默认对象

跨端同步默认围绕两端的 commit 历史和 accepted 结果边界展开：

- desktop 从 remote 拉取时，默认拉取 remote 历史中需要参与本地协作判断的提交
- desktop 推送到 remote 时，默认推送本地整理后的协作结果提交
- 两端结果表是否变化，仍由被同步过来的 field entry 状态决定，而不是由 pull / push 本身直接决定

### 6. 双历史如何同步，以及 remote 为什么只接收整理后的结果

简化成 `local + remote` 双历史后，核心问题不再是 proposal ref 如何流转，而是哪些提交值得跨端传播，哪些提交应只留在本地消化。

#### 6.1 两层传播边界

同步边界固定拆成两层：

- `history ingestion`
  - 两端都保留协作 commit 历史语义
  - 但不是所有本地自动化原始 commit 都必须跨端传播
- `accepted effect`
  - 真正影响两端结果表的，不是 commit 是否到达，而是其中哪些 field entry 已被 `accepted`

这意味着跨端同步至少需要传递两类事实：

- 协作提交本身
- 协作提交中各字段 entry 的处理状态

#### 6.2 为什么 remote 不应接收本地自动化洪水

自动化工具会产生大量原始 commit，其中很多只是：

- 暂时错误值
- 重复扫描结果
- 局部修正中间态
- 仍待人工兜底的候选值

如果把这些原始自动化 commit 全部推到 remote，会带来以下问题：

- 远端历史和索引体积明显膨胀
- 远端审核视图被高频噪声淹没
- remote 被迫承担本地本该完成的重型冲突消化和批量整理职责

因此，remote 不应被设计成原始自动化提交的汇聚地。

#### 6.3 local 的主要职责

local 是本地重型处理面，主要负责：

- 接收自动化高频原始 commit
- 在本地完成字段级 auto-review、冲突分析、人工修复和批量处理
- 把值得进入远端协作历史的结果整理成可传播提交

换句话说，很多自动化原始提交可以只存在于 local 历史中，不必原样进入 remote。

#### 6.4 remote 的主要职责

remote 是远端协作历史和远端结果表承载层，主要负责：

- 接收远端人工编辑形成的协作提交
- 接收从 local 推送过来的整理后协作结果提交
- 维护远端待审核、已接受、已拒绝和已覆盖的字段历史
- 基于 accepted field entry 更新远端结果表

remote 具备远端独立编辑和审核能力，但不是本地自动化洪水的默认落点。

#### 6.5 push 的推荐语义

push 不应被定义为“镜像 local 全历史到 remote”，而应定义为：

- 把经过本地整理后、值得进入远端协作历史的提交推到 remote

这些提交通常已经满足以下条件之一：

- 已通过本地自动接受判断
- 已通过本地人工处理
- 已从原始自动化洪水中提纯成远端需要协作感知的结果

因此 remote 接收的是本地整理后的协作结果，而不是所有原始自动化输入。

#### 6.6 pull 的推荐语义

pull 默认围绕 remote 历史展开：

- desktop 从 remote 拉取远端协作提交
- 本地再根据这些提交及其 field entry 状态，决定如何更新本地结果表、winner 和本地后续处理

site 侧产生的远端人工提交直接进入 remote。

这些提交拉回 local 之后，本地仍然可以继续做：

- 冲突分析
- 批量修复
- 本地自动化结果对齐
- 后续整理后再次推回 remote

### 7. policy 按字段直接配置

首轮不引入额外的 policy 继承层、默认层或多级覆盖层。

固定规则为：

- `collaborative` 轨道中的同步 policy 直接按字段配置
- policy 数量预期可控，不需要为了减少配置数量而先引入额外抽象
- 当某张表中的不同列需要不同规则时，直接在字段级表达差异

字段 policy 至少需要覆盖以下内容：

- 是否属于 `publish-owned` 或 `collaborative`
- 是否允许人工编辑
- 允许哪些自动来源参与
- 哪些自动来源可以自动接受
- 哪些自动来源之间允许自动合并或自动覆盖
- 当前字段是否要求审核
- 当前字段使用 `manual_sticky` 还是 `manual_until_source_change`

如果后续实践证明字段 policy 的数量和重复度明显上升，再考虑引入默认继承机制；首轮不把这种复杂度前置。

### 7A. `publish-owned` 的通用实现前提

`publish-owned` 轨道首轮不采用对象级 manifest 作为通用实现骨架，而采用行级增量发布模型。

#### 7A.1 发布与 apply 以行级变更为单位

首轮固定为：

- `publish-owned` 的发布计划以行级变更为单位
- 远端 apply 也以行级 `insert / update / delete` 为单位
- “同一 `publishType` 的关联表最终整体同步”是目标一致性语义，而不是对象级 publish 单位

这意味着：

- 某次发布可以只发送发生变化的行
- 不要求因为少量行变化而整对象重写
- 关联表之间的一致性通过同一轮 publish plan 和同一组发布门禁共同保证

领域特定但仍需保留的发布切片说明，不再留在独立设计文档中，而收束到对应的 variant 文件。

当前已定义的首轮实例为：

- `hearthstone-card`
  - 见 [variants/hearthstone-card.md](./variants/hearthstone-card.md)

#### 7A.2 本地基线按行保存已发布状态

为了支持“只发变更行”，本地必须保存行级已发布基线。

首轮固定为：

- 对每条 publish stream
- 对每张受该 `publishType` 管理的发布表
- 对每一行已发布记录

系统都要保存上次成功发布时的最小状态摘要。

这份基线绑定的是“某一行在某一条 publish stream 上已经发布到什么状态”，而不是这行的全局当前状态。

因此首轮固定为：

- 行级 baseline 的作用域是 publish stream
- publish stream 继续由 `publishTarget + environment + publishType` 共同确定
- 首轮实现可以直接用这组三元组作为唯一键组成部分
- 首轮不强制额外引入单独的 `publishStreamId` 列，但语义上必须按 publish stream 区分基线

这条行级基线至少需要支持判断：

- 这行是新增
- 这行是更新
- 这行已经删除

首轮不采用只保存整表摘要的基线模型，因为那无法稳定支持最小行级增量发布。

#### 7A.2.1 行级 baseline 的最小结构

由于 `publish-owned` 的更新按整行发送，行级 baseline 不需要保存整行值快照来支持列级 patch。

首轮最小结构收敛为：

- `rowKey`
  - 唯一标识发布表中的一行
- `rowHash`
  - 标识该行上次成功发布时的稳定内容摘要
- `publishTarget + environment + publishType`
  - 标识这条基线属于哪条 publish stream
- 少量审计字段
  - 例如最近成功批次、最近成功时间或等价发布记录引用

这组字段至少需要支持以下判断：

- 这行从未发布过，需要新增
- 这行已经发布过，但当前 `rowHash` 改变，需要整行更新
- 这行在基线中存在，但当前结果中已不存在，需要删除

#### 7A.3 `updatedAt` 只用于候选筛选

`updatedAt` 可以用于缩小日常增量候选集，但不承担完整正确性证明。

首轮固定为：

- 正常增量发布可以使用 `updatedAt` 等变化标记筛选候选行
- generation 变化不要求系统自动精确推导全部受影响行
- generation 变化通常通过手动重新投影、重建候选或等价运维动作处理

因此，`updatedAt` 是增量优化手段，而不是 generation 变化下的完整正确性依据。

#### 7A.4 删除检测不依赖单纯的 `updatedAt`

删除行不会再更新 `updatedAt`，因此删除检测不能只依赖 `updatedAt`。

首轮固定为：

- 行级变更检测由数据库 trigger 统一记录
- trigger 记录 `insert / update / delete`
- 变更日志不携带 `publishTarget / environment / publishType`

这意味着：

- 删除检测与 publish stream 归属必须分离
- 变更事实由数据库层稳定产出，而不是依赖事后全表扫描
- 行级 baseline 继续保存“上次发布过什么”，publish 动作由“变更日志 + 当前状态 + baseline”共同判定

#### 7A.5 统一变更日志与 publish stream 归属分离

首轮固定把行级变更检测拆成两层：

- 变更日志层
  - 由数据库 trigger 写入 stream-agnostic 变更日志
  - 只表达本地行发生过 `insert / update / delete`
  - 不表达 stream 归属
- publish 归属层
  - publish plan 构建时按具体 stream 的 `PublishRowBaseline` 和当前状态解释最终动作
  - trigger 记录的事件类型只是候选事实，不直接等价于最终 publish 动作

这样可以满足：

- 同一份变更日志可供多个 stream 复用
- trigger 不需要了解 publish stream 配置
- publish 不需要扫当前结果全表

首轮不引入 cursor、顺序号或额外 stream 级中间表。

#### 7A.5.1 统一变更日志的最小结构

首轮将删除专用日志进一步收敛为统一的 `PublishRowChangeLog`。

该表固定保存：

- `tableName`
- `rowKey`
- `operation`
  - `insert`
  - `update`
  - `delete`
- `changedAt`
- `sourceBuild`
- `sourceTag`
- `sourceRunId`
- 基本审计字段

这张表的职责固定为：

- 承载本地结果表的统一行级变更事实
- 为 publish 提供上次发布之后的候选 row key 集合
- 不承担 stream 当前态存储
- 不直接承担最终 publish 动作判定

与 `PublishRowBaseline` 的分工固定为：

- `PublishRowChangeLog` 表示“本地哪些 row key 在某个时间窗口内发生过变化”
- `PublishRowBaseline` 表示“某条 publish stream 当前已经发布过哪些 row key 以及对应 row hash”

#### 7A.5.2 baseline 不能被统一变更日志替代

即使已经能通过 trigger 直接跟踪行级 `insert / update / delete`，也不能直接移除 `PublishRowBaseline`。

原因固定为：

- 变更日志只回答“本地发生过什么事件”
- baseline 才回答“某条 publish stream 当前已发布的状态是什么”

因此：

- `changedAt >= baseline.publishedAt` 只用于筛选候选变更
- 最终 `insert / update / delete` 必须由“当前状态 + baseline”判定
- trigger 记录到的 `insert / update / delete` 不能直接作为最终 publish 动作使用

#### 7A.6 publish plan 允许两类生成路径

首轮 `publish-owned` 的 publish plan 不强制只有一种生成方式。

固定支持两类路径：

- 日常增量路径
  - 先按各关联表分别产出候选行
  - 再把这些表级候选行合并成同一轮 publish plan
- 重投影 / 重建路径
  - 由一次受控 service API 操作直接产出整轮 publish plan
  - 适用于手动重投影、重建候选或等价运维动作

这样可以同时满足：

- 日常运行时尽量利用增量候选缩小发布范围
- 手动重投影或重建时不必伪装成很多分散的表级增量事件

#### 7A.6.1 日常增量路径

日常增量路径的处理顺序固定为：

1. 数据库 trigger 将本地结果表的 `insert / update / delete` 写入统一的 `PublishRowChangeLog`
2. publish 读取 `changedAt >= baseline.publishedAt` 的变更日志
3. 按 `tableName + rowKey` 去重，得到候选 row key 集合
4. 按候选 row key 回查当前仍然存在的本地行，并计算当前 row hash
5. 将候选当前状态与当前 stream 的行级 baseline 比较，判定最终行级变更：
   - 当前有、baseline 无 => `insert`
   - 当前有、baseline 有且 hash 不同 => `update`
   - 当前无、baseline 有 => `delete`
   - 当前有、baseline 有且 hash 相同 => `unchanged`
6. 各表产出的最终行级变更合并为同一轮 publish plan

这条路径的目标是最小化正常增量发布成本。

#### 7A.6.2 重投影 / 重建路径

重投影 / 重建路径不要求先拆成很多零散的表级候选。

固定为：

- 由受控 service API 触发一次显式重投影、重建候选或等价运维动作
- 该入口可以直接产出整轮 publish plan
- 生成的 publish plan 仍然以行级变更为最终 apply 单位

这条路径主要用于：

- generation 变化后的手动重投影
- 大范围重建后的发布
- 需要跳过日常候选筛选路径的显式运维动作

#### 7A.6.3 普通增量与 bootstrap / rebuild 必须显式区分

首轮不允许把 bootstrap / rebuild 伪装成普通增量发布。

固定规则为：

- 首次启用某条 `publish-owned` 发布流时，必须走显式 bootstrap
- 大范围重投影或重建时，必须走显式 rebuild 或等价运维入口
- bootstrap / rebuild 可以直接产出整轮 publish plan，但仍以行级变更作为最终 apply 单位

这样可以避免：

- 把“首次建基线”错误混同为“普通增量”
- 把“大范围重建”伪装成大量零散候选事件

#### 7A.6.3.A 多个 remote 的首轮处理方式

当同一游戏需要向多个 remote 发布时，首轮固定采用“多个独立 publish stream”而不是“单轮 fan-out publish”的处理方式。

固定规则为：

- 不同 remote 若代表不同环境面，则分别落在不同 `environment`
- 每个 remote 继续拥有独立的 baseline、ledger、gate 和发布历史
- 桌面端通过显式切换当前 publish stream 来选择发布目标
- 首轮不把多个 remote 视为同一次 publish 的多个物理落点

这意味着首轮重点是：

- 让 stream 切换明确可见
- 让每条 stream 独立发布、独立失败、独立审计
- 不引入跨 remote 的原子 fan-out 语义

#### 7A.6.4 bootstrap / rebuild 的通用收敛规则

总文档首轮只固定 bootstrap / rebuild 的通用原则，不引入 `hsdata` 特化的对象级重建算法。

固定规则为：

- bootstrap / rebuild 必须以明确输入边界重建当前可发布状态
- bootstrap / rebuild 后，必须重新建立该 publish stream 的本地已发布判断基础
- bootstrap / rebuild 产物必须带出校验摘要，至少包括：
  - 本轮涉及的发布表范围
  - 各表行数摘要
  - 结果摘要或等价发布摘要
  - 与当前已知远端 baseline 的对比信息

如果某条 publish stream 尚无远端 baseline，则：

- 允许在本地建立完整当前态
- 但首轮对空远端和非空远端必须走不同入口
- 非空远端不允许被普通 bootstrap 静默接管，必须进入显式 repair / reset / approval 流程

#### 7A.6.5 bootstrap / rebuild 必须可重入

bootstrap / rebuild 首轮必须支持失败后重跑。

固定规则为：

- 每次重建尝试都应有独立的执行记录或批次标识
- 失败轮次不得与成功轮次混用
- 后续重跑必须能够重新生成 publish plan 与校验摘要，而不是依赖残缺中间态继续推进

#### 7A.7 远端 gate 以 publish stream 为主，不保存逐行远端状态

首轮 `publish-owned` 的远端 gate 不建立在逐行远端状态之上。

固定前提为：

- 远端不保留每一行的具体发布状态
- 远端主要保留 publish stream 级的 ledger、baseline 和必要摘要
- 逐行已发布基线主要保留在本地

#### 7A.7.1 远端强校验固定在 publish stream 级

远端 acceptance gate 首轮固定在 publish stream 级执行。

至少需要校验：

- `publishTarget + environment + publishType`
- `targetFingerprint`
- 当前 remote baseline 的 compare-and-swap 锚点
- `generationFingerprint + generationOrder`

这意味着：

- 远端主要回答“这轮 publish plan 是否可以推进这条 publish stream”
- 远端不需要知道每条行级变更此前是否已经逐行发布过
- 行级增量正确性主要由本地 baseline 与本地 publish plan 负责

#### 7A.7.1.A 远端必须阻止普通 publish 任意创建新 stream

首轮必须明确禁止“调用方随意填写一个新的 `publishTarget`，然后让普通 publish 自动在远端落出一条新 stream”。

固定规则为：

- 普通 publish 只能推进远端已经登记的 `publish stream`
- `publish stream` 的受控身份至少包括：
  - `publishTarget + environment + publishType`
- 每条已登记 stream 必须绑定受控的 `targetFingerprint` 约束
- 远端必须先判断该 stream 是否已登记、是否允许普通 publish，再继续 compare-and-swap 与 generation 校验
- 未登记 stream 必须直接拒绝，不能通过“远端当前还没有 baseline”来视为可自动创建

因此首轮语义固定为：

- “远端是否已有 baseline” 与 “该 stream 是否允许存在” 是两个不同问题
- 空 baseline 只表示该 stream 尚未完成首次已接受发布
- 是否允许这条 stream 首次启用，必须由显式 bootstrap / approval 流程决定，而不是由普通 publish 隐式决定

首轮允许的最小实现形态为：

- 远端持有一份受控 stream 注册信息
- 这份注册信息可以是专用表，也可以是等价的受限配置来源
- 但普通 publish 不得把“未注册 stream”自动提升为“已注册 stream”

当前首轮实现采用专用远端表：

- `PublishStreamRegistration`
  - 主键为 `publishTarget + environment + publishType`
  - 保存受控 `targetFingerprint`
  - 保存 `normalPublishEnabled`

普通 publish 的 gate 固定在任何远端行写入前执行：

- 未登记 stream 直接拒绝
- `normalPublishEnabled = false` 直接拒绝
- `targetFingerprint` 不匹配直接拒绝
- 本地绑定的 `previousManifestHash` 与远端当前 ledger 不一致时直接拒绝

如果后续引入专用远端表，最小登记信息至少应覆盖：

- `publishTarget`
- `environment`
- `publishType`
- `allowedTargetFingerprint` 或等价 fingerprint 约束
- stream 当前是否允许普通 publish

这条规则的目标不是把远端变成重型对象级审核中心，而是防止：

- 调用方随意伪造一个新的 `publishTarget`
- 调用方误把本不属于当前部署面的 stream 推到远端
- 普通 publish 静默接管本应走 bootstrap / repair / approval 的首次启用场景

#### 7A.7.2 远端可保留表级摘要，但不做逐行 gate

为了支持诊断、repair 和运维核对，远端可以保留表级摘要。

这类摘要可以包括：

- `tableHash`
- `rowCount`
- `deleteCount`
- 其他与整张发布表当前状态相关的轻量摘要

但首轮固定为：

- 这些摘要不替代 publish stream 级 gate
- 这些摘要不等于逐行远端状态
- 这些摘要主要用于日志、诊断和 repair 辅助，而不是逐行 acceptance 判断

#### 7A.7.3 远端 gate 与旧方案保持同一方向

总文档中的 `publish-owned` 远端 gate 应与现有 publish 文档保持同一方向：

- compare-and-swap 在 publish stream 基线上完成
- generation 不允许静默倒退
- target fingerprint 必须匹配
- 远端不以逐行状态作为首轮权威事实模型

#### 7A.7.3.1 publish stream 身份必须稳定绑定 baseline、ledger 与审计

`publish-owned` 的远端 gate 不能只绑定抽象 target 名称，而必须绑定稳定的 publish stream 身份。

首轮固定为：

- `publishTarget + environment + publishType` 共同确定一条 publish stream
- baseline、ledger、compare-and-swap、lease scope 和审计记录都必须绑定这组三元组
- 首轮实现可以继续直接使用三元组作为唯一键组成部分
- 若跨边界需要单字段传递，可使用确定性字符串投影，但不得改写其三元组语义

这组三元组的职责边界固定为：

- `publishTarget`
  - 表达发布流所属的主业务分区
  - 首轮默认用于区分不同游戏或同级业务面
- `environment`
  - 表达发布流面向的环境边界
  - 用于区分开发、预发、生产或等价环境面
- `publishType`
  - 表达同一主业务分区内的具体发布数据面
  - 用于区分 `card_data`、`image_data` 或其他后续发布小类

因此首轮约束为：

- 不把游戏名和数据面类型压进同一个 `publishType`
- 不把 remote 连接身份本身建模为 `publishTarget`
- 不把本应独立存在的主业务分区折叠成同一 `publishTarget` 下的很多 `publishType`

#### 7A.7.4 compare-and-swap 以当前已发布状态摘要为锚点

首轮 `publish-owned` 的 compare-and-swap 不以整轮 publish plan 自身作为主锚点，而以当前 publish stream 的已发布状态摘要作为主锚点。

固定规则为：

- 本地生成 publish plan 时，必须读取并绑定当前 remote baseline 摘要
- 远端接收 publish plan 时，必须比较“本地认为的 previous baseline”和“远端当前 baseline”是否一致
- 只有一致时，才允许推进该 publish stream

这类 compare-and-swap 锚点可以表现为：

- `previousBaselineHash`
- `previousManifestHash`
- 或等价的当前已发布状态摘要

这条规则的目标是避免：

- 两个客户端基于同一个旧远端状态并发生成计划
- 后到达的旧计划静默覆盖先到达的新计划

#### 7A.7.4.1 同 generation 下不允许 sourceTag 静默倒退

当 incoming publish plan 与 remote 当前 baseline 属于同一 generation 时，sourceTag 范围默认必须单调前进。

首轮至少需要支持以下判断：

- `sourceTagMax` 或等价来源边界不得倒退

可接受情况：

- 范围前进
- 范围相同

默认拒绝情况：

- incoming 来源边界明显落后于 remote 当前 baseline

这类倒退只有在显式 `rollback`、`repair` 或等价高风险入口下才允许。

#### 7A.7.4.2 同 lineage 分叉结果默认拒绝

若 incoming 与 remote 当前 baseline 同时满足：

- generation 相同
- sourceTag 范围相同

则普通 publish 不允许仅凭“本地重算结果不同”静默覆盖远端。

首轮固定为：

- 若 incoming 当前摘要与 remote 当前摘要相同，则允许
- 若摘要不同，则普通 publish 直接拒绝
- 这类分叉只能进入显式 `repair`、`rollback` 或等价受控入口

这条规则的目标是把“同 lineage 但结果不同”的问题从静默覆盖，升级为显式诊断和运维决策。

#### 7A.7.4.3 时间只做提示，不做硬拒绝条件

发布时间、客户端时间或 wall clock 时间不能作为 `publish-owned` 首轮 acceptance gate 的硬规则。

固定为：

- 时间可用于日志、UI 提示、lease 超时判断和风险提醒
- 时间不能单独决定 accept / reject

原因是：

- 时间不等于 generation 更高
- 时间不等于 sourceTag 更新
- 长时间本地构建、重试补发和时钟误差都会让 wall clock 时间失真

#### 7A.7.5 publish plan 自身摘要不作为主 gate

publish plan 本身仍然可以拥有自己的摘要，例如：

- `planHash`

但首轮固定为：

- `planHash` 不作为远端 acceptance 的主 compare-and-swap 锚点
- `planHash` 主要用于审计、幂等、重试去重或日志诊断
- 真正决定“这轮 publish 是否仍然基于最新远端状态”的，是 previous baseline 摘要

#### 7A.7.6 普通 publish 与高风险 publish 必须区分操作级别

`publish-owned` 的远端 gate 首轮必须区分普通 publish 和高风险运维操作。

至少区分以下操作级别：

- 普通 publish
- repair
- rollback
- baseline repair 或等价修复动作

固定规则为：

- 普通 publish 走默认 gate
- repair / rollback / baseline repair 只能通过显式受控入口执行
- 能绕过普通 gate 的情况，必须被限制在这些高风险操作级别中，而不是悄悄混进普通 publish

#### 7A.7.7 生产环境高风险操作建议绑定短时 lease

总文档在 `publish-owned` 路线下保留与旧方案一致的授权方向：

- 开发环境可以采用较弱授权
- 生产环境的普通 publish 应使用短时授权或等价受控凭证
- 生产环境的 repair / rollback / baseline repair 应使用更严格的短时 lease、额外确认或审批

首轮总文档不强制具体密钥实现，但固定要求：

- 高风险 publish 不能只靠静态本地配置长期放权
- 远端必须能够按 publish stream 和 operation kind 约束操作范围

#### 7A.7.7.A 首轮信任模型与数据库凭据假设

当 desktop 能直接访问 remote PostgreSQL 时，首轮不把“数据库连接凭据绝对保密”当作 publish 系统的核心安全前提。

首轮固定假设为：

- 持有 remote 数据库写凭据的 desktop 终端属于受信任执行面
- 同级可信终端之间共享同一类数据库写权限时，系统主要解决的是工作流约束、误操作控制、并发协调和审计问题
- 不把 `PublishStreamRegistration`、`targetFingerprint`、compare-and-swap 或 lease 设计成针对恶意数据库写入者的强安全边界

因此这些机制在首轮的职责固定为：

- 约束普通 publish 只能沿受控 stream 推进
- 避免误推到错误 remote 目标
- 避免基于过期 baseline 覆盖新结果
- 为后续并发协调、lease 和审计保留稳定锚点

在此前提下，首轮进一步固定为：

- 普通 publish gate 不区分 local 发布者身份
- 当多个 local 被视为等价权威源时，优先通过 stream 级 lease / lock 解决并发重复 publish
- 密钥授权、publisher identity 和更细粒度的 local allowlist 留待更强的 service-side 控制面建立后再引入

首轮 ordinary publish 的 lease 运行时约束进一步固定为：

- lease 状态直接保存在远端 `PublishStreamRegistration` 上
- `leaseHolderId` 首轮直接使用当前 `PublishBatch.id`
- 同一批次重试或断点续跑时，允许继续续租同一条 lease
- 不同批次即使来自同一个 local，也必须互斥
- 首轮 lease TTL 固定为 5 分钟
- 普通 publish 在任何远端行写入前必须先尝试抢占或续租 lease
- publish 每成功完成一个 remote chunk 后，必须立刻续租一次
- publish 成功结束后必须主动释放 lease
- 若进程异常退出，则依赖 TTL 过期回收
- 若开始时无法抢占 lease，或执行过程中续租失败，普通 publish 必须立即中止，并向调用方返回明确冲突错误

#### 7A.7.8 `publish-owned` 需要确定性构建契约

总文档中的 `publish-owned` 首轮不采用对象级 manifest 骨架，但仍然必须保留确定性构建契约。

固定规则为：

- 同一条 publish stream
- 同一个 `generationFingerprint`
- 同一 sourceTag 范围

默认应导出同一组发布摘要与同一组行级变更结果。

这意味着：

- `generationFingerprint` 不能只表达业务规则版本号
- 凡是会影响发布结果稳定性的生成规则、排序规则、归一化规则和序列化规则，都必须被纳入 generation identity 或等价稳定契约
- 若同 lineage 结果发生分叉，系统必须优先暴露确定性问题，而不是长期依赖 repair 兜底

当前首轮实现先采用最小落地：

- `generationFingerprint` 作为 publish batch / baseline / ledger 的显式字段持久化
- `generationOrder` 作为 publish batch / baseline / ledger 的显式字段持久化
- 首轮先写入稳定常量版本串，用于把“生成代次”从 `sourceTag` 中解耦
- 首轮先写入固定正整数顺序值，用于把“代次先后关系”从 `generationFingerprint` 本身中拆出来
- 后续再把它扩展为真正覆盖 projector 规则输入的稳定签名

### 8. 最小状态机与状态语义

首轮状态机保持克制，只保留同步、审核、冲突处理和结果投影真正需要的状态。

#### 8.1 `commit` 聚合状态

`commit` 的状态只用于聚合显示，不用于决定结果表最终值。

首轮固定以下状态：

- `pending`
  - 含义：这条 commit 下至少有一条 field entry 仍未完成处理
  - 对结果表影响：可能部分字段已生效，也可能完全未生效；不能仅凭 commit 状态判断
  - 后续变化：可转为 `partial`、`accepted` 或 `rejected`

- `partial`
  - 含义：这条 commit 下的 field entry 已出现混合结果，例如部分 accepted、部分 rejected、部分 conflict 或部分仍 pending
  - 对结果表影响：只有其中 accepted 的 field entry 已影响结果表
  - 后续变化：在剩余 entry 继续处理后，可继续保持 `partial`，或最终收敛为 `accepted` / `rejected`

- `accepted`
  - 含义：这条 commit 下所有仍有效的 field entry 都已被接受，不再存在待处理或冲突中的 entry
  - 对结果表影响：其中 accepted 的字段已全部写入结果表，或已被后续 accepted 结果覆盖
  - 后续变化：不会因为同一条 commit 再回到 `pending`；但其中字段可以在后续历史中被新的 accepted 结果 `superseded`

- `rejected`
  - 含义：这条 commit 下所有 field entry 都被拒绝，且没有任何字段进入当前结果表
  - 对结果表影响：不影响结果表
  - 后续变化：不会被就地改成 `accepted`，后续修复必须通过新 commit 完成

#### 8.2 `field entry` 工作流状态

`field entry` 是同步系统的实际裁决单元。结果表是否变化，完全由它的状态决定。

首轮固定以下状态：

- `pending`
  - 含义：该字段变更已进入历史，但尚未完成自动接受、人工审核或冲突处理
  - 对结果表影响：不影响结果表
  - 后续变化：可转为 `accepted`、`rejected` 或 `conflict`

- `accepted`
  - 含义：该字段变更已被系统或审核者接受，允许成为当前结果值的一部分
  - 对结果表影响：接受动作发生时，必须同步写入结果表，并记录当前字段值来自这条 accepted field entry
  - 后续变化：可在后续被新的 accepted field entry 覆盖，此时旧 entry 变为 `superseded`

- `rejected`
  - 含义：该字段变更已被明确拒绝，不允许进入当前结果表
  - 对结果表影响：不影响结果表
  - 后续变化：不会被就地改写为 accepted；若要采用修正值，必须通过新 commit 产生新的 field entry

- `conflict`
  - 含义：该字段变更当前不能自动决定是否接受，需要人工处理、额外上下文或显式裁决
  - 对结果表影响：在冲突未解决前不影响结果表
  - 后续变化：冲突解决后可转为 `accepted` 或 `rejected`

- `superseded`
  - 含义：该字段变更曾经被接受并生效，但后来已被更新的 accepted field entry 覆盖，不再代表当前结果
  - 对结果表影响：不再决定当前结果值，但保留历史可追溯性
  - 后续变化：作为历史终态保留，不回退为当前生效值；若业务需要回到旧值，也必须通过新 commit 重新接受

#### 8.3 `winner` 不引入独立审批状态

`winner` 不单独引入复杂状态机。

固定语义为：

- `winner` 只是一条当前自动接受决策状态记录
- 它跟随 accepted history 与字段 policy 的变化更新
- 它不承担 `pending`、`conflict`、`rejected` 这类工作流状态

换句话说：

- 工作流状态在 `field entry`
- 当前业务值在结果表
- 自动接受锚点在 `winner`

#### 8.4 结果表不表达审批状态

结果表只表达“当前生效值是什么”，不额外表达审核或冲突状态。

固定规则为：

- 结果表中的当前值来自最后一个当前仍生效的 accepted field entry
- 待审核、已拒绝和冲突中的 field entry 不直接投影到结果表
- 已被覆盖的 accepted field entry 不再决定当前结果，但其历史仍可追溯

#### 8.5 状态机收敛原则

首轮不引入额外的过程状态，例如：

- `reviewing`
- `awaiting_approval`
- `merge_candidate`
- `manual_override_pending`

原因是这些语义要么可以从 `field entry` 当前状态推导，要么会显著增加模型复杂度而没有提供新的核心业务能力。

### 9. 一致性边界

首轮只固定最小必要的一致性约束，不提前引入更大的批量事务框架。

#### 9.1 单字段接受必须原子一致

当某条 `field entry` 被 `accepted` 时，以下三个结果必须属于同一原子效果：

1. `field entry.status = accepted`
2. 当前结果表更新为该 entry 的值
3. `winner` 更新为新的自动接受锚点

这条规则的目标是避免以下坏状态：

- 历史显示某条 entry 已 accepted，但结果表尚未更新
- 结果表已更新，但 `winner` 仍停留在旧裁决锚点
- `winner` 已更新，但 accepted history 中找不到对应的 accepted entry

因此，对同一字段的单次接受动作，history、result table 和 `winner` 必须原子一致。

#### 9.2 批量处理允许按字段原子

系统可以支持一次提交或一次审核动作涉及多个字段，但首轮不要求“整批字段一次性大事务”。

首轮固定为：

- 单字段接受必须原子一致
- 多字段批量处理可以拆成多次字段级原子更新
- 如果一批字段中部分成功、部分失败，系统允许留下部分接受结果，只要每个已接受字段都满足单字段原子一致规则

#### 9.3 非接受状态不触发结果表更新

只有 `accepted` 的 `field entry` 会触发结果表和 `winner` 更新。

因此：

- `pending` 不触发结果表写入
- `rejected` 不触发结果表写入
- `conflict` 不触发结果表写入
- `superseded` 表示历史地位变化，但不单独触发新的结果表写入

#### 9.4 一致性修复必须可重放

如果系统怀疑结果表或 `winner` 与 accepted history 不一致，必须允许按 accepted history 和字段 policy 重放修复。

这意味着：

- accepted history 是最终校验基准
- 当前结果表和 `winner` 都应支持按历史重建
- 一致性修复不通过直接篡改历史完成

### 10. 撤销、回滚与 `superseded`

首轮必须明确区分 `reject`、`revert` 和 `superseded`，避免把“尚未生效的拒绝”和“已经生效后的撤销”混为一谈。

#### 10.1 `reject`

`reject` 作用于尚未进入当前结果表的 `field entry`。

固定语义为：

- 某条 field entry 被明确拒绝
- 它不进入当前结果表
- 它保留历史，但不代表“曾经生效过又被撤销”

因此：

- `reject` 不是回滚
- `reject` 不是撤销已生效结果
- `reject` 只表达“这条候选字段变更未被采用”

#### 10.2 `superseded`

`superseded` 作用于曾经 accepted 并生效过、后来被新 accepted 结果覆盖的 `field entry`。

固定语义为：

- 这条 entry 历史上曾经是当前值来源
- 后来出现了更新的 accepted field entry
- 当前结果表已改认新的来源

因此：

- `superseded` 表达的是“被更新覆盖”
- `superseded` 不等于“这条结果当初就是错的”
- `superseded` 也不需要单独再写一次结果表

#### 10.3 `revert`

`revert` 作用于已经 accepted 并生效过的历史结果。

固定语义为：

- 不允许直接把旧 accepted entry 改回 `pending` 或 `rejected`
- 不允许通过删除旧历史来表达撤销
- 撤销必须通过追加新的 commit 完成

这条新 commit 应满足：

- `commit.kind = revert`
- commit 记录它主要撤销的目标 commit
- 新产生的 field entry 记录它具体撤销的目标 field entry

因此，`revert` 的表达分两层：

- `commit` 级别
  - `kind = revert`
  - 通过 `revertsCommitId` 或等价字段标识主要撤销目标
- `field entry` 级别
  - 通过 `revertsFieldEntryId` 或等价字段标识具体撤销的是哪条旧字段结果

#### 10.4 为什么 `revert` 必须走新 commit

撤销走新 commit 的目标是保持以下性质：

- 审计链连续
- 历史不可重写
- 本地与远端同步继续只处理追加历史，不处理历史篡改
- 当前结果值的变化过程可解释

因此，撤销后的当前结果值来自新的 accepted field entry，而不是来自对旧 entry 的就地修改。

#### 10.5 回到旧值也走新历史

如果业务需要“回到过去某个旧值”，也不直接复活旧 entry。

固定规则为：

- 系统通过新 commit 重新写入该值
- 新 field entry 被接受后成为当前结果来源
- 旧 entry 仍保留其原始历史地位

这样可以避免“历史上同一条 entry 多次死而复生”的语义混乱。

以下主题已确定方向，但还需要在后续章节中补齐具体规则：

- auto-accept 与 manual review 的判定规则
- `manual_until_source_change` 的来源变化判定标准
- 字段级 policy 的最小结构和约束
