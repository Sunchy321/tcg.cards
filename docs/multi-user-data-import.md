# 多用户数据导入与同步设计

> 本文是游戏领域数据在多个运行时（desktop / site / mobile）下的导入、同步、审批与协作设计的权威文档。它取代并整合了此前分散的「数据导入」「字段覆盖同步」「本地权威构建层」等设计，并补充了多自动源维护者协调、角色权限层级与公开 edit request 等此前未收敛的部分。运行时边界与数据归属维度的总体框架以 [docs/project-architecture.md](./project-architecture.md) 为准；若有冲突，以主架构文档为准。

## 1. 背景与目标

### 1.1 问题

游戏领域数据存在两类性质完全不同的变更来源：

- **自动源**：大批量、粗粒度，来自单一事实源（炉石数据来自游戏本体拆包、其他游戏来自爬虫或官方 API）。一次导入可能改写整块数据。
- **手动源**：细粒度、小剂量，可能由多人并发编辑（管理员修正单个字段、公告、tag 调整）。

这两类来源如果被强行塞进同一套「全量 commit 历史」或「全量当前态合并」模型，会分别遇到：

- 全量 commit 化会让高频自动数据产生不可接受的历史体积和写放大。
- 只保留当前态会让人工编辑的审计、审核、部分接受、撤销和字段级冲突处理变得不可解释。

此外，数据写入存在硬性约束：

- 远程计算（Cloudflare Workers）受执行时长限制，无法承载重型导入、投影与大数据写入。
- 数据库写入量极大，无法通过 Workers 完成。
- 某些自动源（游戏本体拆包、本地 git repo、本地文件）本质上只能在本地执行。

### 1.2 目标

- 让自动源与手动源分层共存，互不污染各自的同步机制。
- 让多个可信维护者在同一批数据上协作，且彼此能感知对方的修改。
- 让大写入问题与多用户协调问题解耦。
- 保持 desktop 作为重型自动化的执行权威，site / mobile 具备远端人工编辑能力。
- 为未来的公开 edit request 保留入口。

### 1.3 非目标

- 不把全部游戏领域数据统一迁入一套高频 commit 历史。
- 不把 remote 重新设计成重型自动化导入和全量集成中心。
- 不引入通用自由分支操作、历史重写或 Git 等价物。
- 不引入持续双向实时同步；同步采用显式 pull / push 流程。
- 第一版不追求自动解决所有冲突；冲突以标记与人工处理为主。

### 1.4 战略定位：数据上游

本平台的核心价值是作为**整合多个上游数据源并标准化的数据上游**：外部卡查站 / 应用可以本平台为单一可信源，通过定期下载全量 / 增量数据（见第 8 节 bulk export）建立自己的数据体系，而无需自行对接多个原始源。

## 2. 运行时边界与数据归属

### 2.1 运行时角色

- **desktop（app-console-desktop）**：本地权威构建层。拥有本地 PostgreSQL、本地 git repo、本地文件。是唯一可信的重型导入与投影执行端。
- **service-desktop-runtime（本地 Bun service）**：desktop 的本地执行引擎，承载导入、投影、发布准备等重型计算。以 sidecar 形式随 desktop 打包。
- **remote（serverless PostgreSQL）**：正式 serving 层 + 必要的协同状态承载层。公开站点只读它。
- **Workers**：远程轻量计算。承载 site / mobile 的 API、轻量同步接收、以及可容纳于单次调用预算内的自动源（如轻量爬虫）。
- **site / mobile**：受限的人工编辑端与公开消费端。

### 2.2 数据库分层

- **本地构建层（desktop local PostgreSQL）**：导入中间态、来源缓存、候选变更、发布准备、构建事实。
- **远端 serving 层（remote PostgreSQL）**：正式领域表、面向公开站点的视图、知识索引、远端协同状态（field_commits、field_conflicts、发布 ledger）。
- 公开站点不直接读取本地数据库。

### 2.3 本地权威化的范围

适合迁入本地权威构建层的对象（服务导入流水线、可本地重建、不要求公开站点直读）：

- 各游戏的 `*_data.import_*`
- `source_versions`
- `raw_entity_snapshots`
- 导入中间态、候选结果、发布批次快照

应保留远端 serving 角色的对象：

- `*_data.knowledge_*`（远端在线检索与向量索引）
- 正式领域表与 serving 视图
- 远端资产注册表

**自动源的本地可见性约束（设计原则）**：自动源的原始表与导入中间态（raw 快照、来源缓存、候选结果、发布批次）**仅保留在维护者本地，不发布到远端**。其他维护者 / 用户对这些表无可见性。因此，由自动源数据产生的冲突（base 换代、源数据矛盾、候选收敛失败）**只有该自动源维护者具备完整的解决上下文**，只能由他自己解决，不能转交其他维护者处理。远端协作方只能基于已发布的 base（有效值）与 collaborative field_commits 交互，无法也无需介入自动源内部状态。

### 2.4 术语

导入 / 发布链路固定使用以下术语，避免混用：

- `import`：写入原始层与中间态。
- `build`：从 raw/import 层生成本地候选结果。
- `materialize`：将候选结果落到本地结果表、临时发布表或发布批次快照。
- `review`：审核候选结果。
- `approve`：批准候选结果进入发布批次。
- `finalize`：冻结批次、校验输入、创建远端任务。
- `apply`：将批次内容写入远端正式表。
- `refresh`：刷新远端派生结构、索引、serving copy。

历史实现若仍使用 `projection` 表示远端 apply 之后的派生刷新，可视为兼容遗留命名；新设计语义以上述术语为准。

## 3. 核心数据模型：base + overlay 双层

### 3.1 问题：自动源与手动源的「裂隙」

自动源是整块大批量数据，手动源是小剂量稀疏覆盖。两类来源的写入量级与同步粒度差异过大，如果共用同一套「逐行当前态」或「逐行 commit 历史」机制，会自动互相阻塞：自动源的大写入会产生不可接受的历史体积，手动源的细粒度编辑又会被自动源的批量覆盖吞掉。

### 3.2 模型：事实表保存有效值，base 与 overlay 是两个概念来源

**事实表（serving 表）保存当前有效值**。`base` 和 `overlay` 不是两张表，而是「事实表当前值」的两个概念来源：

- **base（自动层）**：`project` 的输出——从 raw 表 + 规则算出的投影值。它**不单独落表**，而是直接作为事实表的当前值（当该字段没有手动覆盖时）。每次 `project` 都会重算出完整 base，供对外 serving 与换代对比。base 按「代」（generation）整体推进，不做逐行同步。
- **overlay（手动层）**：手动编辑以字段级 **field entry** 存在（写入 `field_commits`）。它**在 `accepted` 时物化进事实表**，覆盖对应字段，并更新 `field_winners`（当前 winner 记为 `manual:...`）。未接受（`pending` / `rejected` / `conflict`）的 entry 不碰事实表。
- **`field_winners`**：溯源表，记录每个字段当前 winner 来源（`auto:xxx` 还是 `manual:...`），是区分「当前值来自自动还是手动」的依据，也是换代冲突对比的锚点。

因此，事实表的值总是「最后生效的来源」：字段 winner 是自动来源时，事实表值等于 base；winner 是手动来源时，等于该手动 entry 的值。`base + overlay` 是**概念上的两层输入**，最终被物化进事实表，而不是两张物理表。

> 需要说明：base + overlay 模型适用于 **collaborative 轨道**（字段 policy 允许人工编辑的字段）。**publish-owned 轨道**的字段（如 hsdata 的 entities 等事实表）是纯 base，由 manifest / 行级发布整体替换，默认不叠加手动 overlay；只有当某字段被字段 policy 标记为 collaborative 时，才允许 overlay 并受 winner / 人工覆盖模式保护。

同步机制按来源天然分开：

- base 按 generation 同步（换代、manifest 交换），不逐行记日志。
- overlay 按 commit 日志同步（小、稀疏、可审计、可回滚）。

数据流对应关系（与第 2.4 节术语一致）：

```text
import    → raw 表（自动源固化）
project   → 计算完整 base；写事实表时尊重当前 winner：
            · auto-winner 字段 → 写 base 值
            · manual-winner 字段（已接受 overlay）→ 不覆盖，保留手动值，
              并对比新 base 判定漂移
手动编辑  → field entry（pending，不碰事实表）
accepted  → 物化进事实表 + 更新 field_winners
换代 / 重 project → 重算新 base，与事实表当前值 + winner 对比 → 冲突 / A类提醒 / B类冗余（见第 9 节）
```

**关键约束：`project` 与 `edit / accept` 不存在绝对先后顺序。** `project` 每次执行必须感知当前已 `accepted` 的手动编辑（通过 `field_winners`），而不是无脑写 base：

- 字段 winner 是 `manual`（已有已接受 overlay）时，`project` **不得覆盖**该字段的事实表值；它仍要算出新 base 供对比（判定漂移 / 冲突 / 冗余）。
- 字段 winner 是 `auto` 时，`project` 才把新 base 值写入事实表。

这样无论 project 发生在 accept 之前还是之后，事实表始终等于「最后生效的来源」。

### 3.3 多自动源的融合发生在管道内，不在运行时

多个自动源（拆包、爬虫、官方 API）对同一实体的字段竞争，在**自动管道内部**按字段优先级融合，输出一个统一的 `resolved base`。运行时只看到事实表（有效值）与 `field_winners`，不维护逐源 provenance。

> 融合规则在管道内以字段级配置表达（见第 6 节字段 policy 与第 7 节导入管线）。管道合并时若多个自动源对同一字段给出矛盾候选且规则无法收敛，必须记录矛盾日志供维护者抽查，且不得静默写主表。

### 3.4 单元格级粒度

覆盖 / 优先级规则统一为**单元格级**（row × column）机制，列级只是作用域的一种默认形态，不是独立概念：

- 列级规则 = `rowKey` 为空，作用于整列。
- 单元格级规则 = `rowKey` 有值，作用于特定格。
- 求值规则：最具体的作用域胜出（单元格 > 列）。

手动覆盖永远是单元格级。自动源字段优先级既可以是列级（常见），也可以是单元格级（例外）。

## 4. 自动源与 base 的 generation 协调

### 4.1 多个自动源维护者

可能存在多个独立维护者，各自维护自己的自动源、各自拥有本地数据库。协调必须避免两种极端：

- 保留完整 base 在远端做逐行同步 → 写入与冲突规模过大。
- 假设多个自动源的输出「等同」→ 掩盖真实分歧。

### 4.2 按代协调 + 确定性假设

把 base 看作**原子、可替换的代**，由三样东西唯一标识：

```
generation = (source版本, 管道版本, manifest哈希)
```

- **确定性假设**（比「等同」弱得多，且可验证）：同一管道 + 同一 source 版本 = 同一 manifest 哈希。
- **协调单位是代，不是行**：远端只保留「当前 live 的代」（一个 ledger 条目：manifest、fingerprint、source 版本），不保留每个维护者的完整 base。
- **推进方式**：维护者上线新数据 → 整体替换当前代（新代数据写好后原子切换 manifest）。推进必须由源拥有者批准后才可执行（见 4.6）。
- **并发控制**：manifest compare-and-swap（推进时携带的 `previousManifestHash` 必须匹配远端当前代）。

### 4.3 分歧处理

分歧分两类，机制不同：

- **类型一：source 版本不同**。源版本前进本身是合法推进方向，但仍须由源拥有者批准后才可执行（见 4.6）；批准后基于当前 live 推新代，CAS 接受；并发推进时后到者被拒，拉最新 ledger 重来。
- **类型二：同一 source、同一管道版本，但 manifest 不一致**。确定性假设失效（管道 bug、非确定性源或管道版本不同）。进入 **pending generation review**：
  - 远端记录分歧代（含 manifest 哈希、管道版本、分歧原因）。
  - 由源所有者（最高权限）裁决：接受为 live，或拒绝并说明原因。
  - 被裁决方不被全局锁死，仍可维护自己拥有的源、做手动编辑；只有「这个分歧代」的发布停在 pending。

### 4.4 非确定性源（爬虫）

每次爬取结果略不同——它不是「同一 source」，而是「每次爬取 = 一个新的 source 快照」。按快照（时间戳 / crawl id）版本化，每次爬取都算合法的代推进（类型一），走 CAS，不进 pending。

### 4.5 发布一致性

- 同一 generation、同一 sourceTag 范围下，本地重算结果与远端摘要不同时，普通 publish 直接拒绝；同 lineage 分叉只能进入显式 `repair` / `rollback` / 等价受控入口。
- generation 不允许静默倒退；`sourceTagMax` 不得倒退（显式 rollback 除外）。
- 时间只做提示，不做 accept / reject 的硬条件。
- `PublishStreamRegistration` 登记受控 stream（`publishTarget + environment + publishType` + `targetFingerprint`），普通 publish 不得任意创建新 stream。

### 4.6 换代许可权：执行权与许可权分离

改变 live base 不是维护者单方面可自行完成的动作，而是**执行权**与**许可权**分离：

- **执行权（维护者）**：本地投影、生成换代计划、比较与生成 overlay，由维护者自己完成。
- **许可权（源拥有者）**：**无论是换代（source 版本前进）还是同代冲突（同一 generation / sourceTag 范围下 manifest 不一致）**，凡是要改变 live base 的动作，都须由源拥有者（最高权限）批准后才可执行。维护者可以准备计划，但**不能自行授权** live base 的变更。

原因：base 的变更**可能无法撤销**（最坏情况需要数据库快照级回滚），因此必须谨慎，由最高权限逐次把关，而不是让维护者凭预先许可自行推进。

因此，「自动源相关冲突只能由维护者解决」指的是**数据层**（base 漂移、overlay 冲突、候选收敛）——维护者有本地上下文；而 **live base 的变更许可**属于控制面，统一由最高层级批准，维护者不能自行授权。

### 4.7 多远程发布与协作模型

一个本地数据库可以向多个远程数据库发布。每个 `(publishTarget, environment, publishType)` 是一个**完全独立的 stream**，拥有独立的远端注册、ledger、lease、本地基线、权限与审计。发布时**显式选择目标 stream**，不做跨 remote 的原子 fan-out（一次发布只落一个 stream，逐个独立发布、独立失败、独立审计）。

主要场景是**同一数据发布到多个环境**（dev / staging / prod）。多 stream 模型同时容忍「不同游戏发到不同 remote」「同一数据发到多个消费方」等其他形态。

**按环境分级的审批**：每个 stream 的审批要求由远端配置决定（`PublishStreamRegistration` 或环境级配置），desktop 发布前读取该配置：

- **staging / dev**：自授权（stream 许可预开），维护者持发布密钥即可发布。
- **prod**：live base 变更需 Level 1 批准（见 4.6）；批准 = 远端翻转该 stream 的许可状态。

### 4.8 发布认证（去耦合用户系统）

发布认证验证「**是不是被授权向这个远端发布的那个发布者**」，不耦合任何用户系统——不同远端可能属于不同用户系统，不能套用全局用户账号。

**模型：单一发布者密钥 + 远端记录公钥 + 远端许可状态**

- **身份 = 一把本地私钥**（存 keyring）。发布者对所有远端使用同一把密钥。
- **授权 = 每个远端各自记录该发布者的公钥**（绑定 stream + targetFingerprint）——「这个发布者的公钥被授权发布到我的 stream」。
- **发布 = 本地用私钥签名请求，远端 gate 用记录的公钥验签**（对照 stream + fingerprint）。
- **许可 = 每个 stream 的许可状态**（如 `normalPublishEnabled` 或等价 live 变更许可），由拥有者控制：
  - staging / dev：许可预开 → 发布者持密钥即可发布。
  - prod：许可默认关 → 拥有者批准（翻转许可）→ 发布者持密钥在许可开启期间发布。
- **不同远端 = 不同用户**：每个远端的拥有者独立决定是否记录某个发布者的公钥。
- 发布审计记录哪个公钥（发布者）在何时发布了什么。

## 5. 手动 overlay 与字段级同步

### 5.1 同步模型：双端 field_commits

手动编辑统一表达为**字段级 commit**，在本地与远端各保留一份 commit 历史。

- **local field_commits**：desktop 本地提交历史，承载本地自动化收敛结果与本地人工提交。
- **remote field_commits**：远端提交历史，承载远端人工提交与从本地推送来的整理后结果。
- **field_sync_cursors**：本地记录 pull / push 的同步位置。
- **field_conflicts**：任一端导入外来 commit 时发现的冲突。

### 5.2 push / pull 语义

- **push** 不是镜像全历史，而是把本地整理后、值得进入远端协作历史的提交推上去。
- **pull** 默认围绕 remote 历史展开：拉取远端协作提交，本地按 field entry 状态决定如何更新结果表、winner 与后续处理。
- site 侧产生的远端人工提交直接进入 remote；desktop 通过 cursor pull 拉回并在本地重放。

### 5.3 commit 与 field entry

- **commit** 表达一次操作容器（`change` / `merge` / `revert` / `bootstrap`），只承担聚合显示状态（`pending` / `partial` / `accepted` / `rejected`）。
- **field entry** 是审核、冲突处理和接受 / 拒绝的最小单元。
- 一条 commit 可以被部分接受：同一条 commit 中不同字段可以进入不同结果。
- 只有 `accepted` 的 field entry 会影响当前结果表。

### 5.4 结果表与 winner（collaborative 字段）

对 collaborative 字段：

- **当前结果表**是 accepted history 的持久化投影，不是独立真相源。field entry 被接受时直接写入结果表，并记录当前值来自哪条 accepted entry。
- **winner** 保留，但只作为自动接受决策状态。它必须能从 accepted history 与字段 policy 重建，不能成为第二套当前值真相。
- 真相顺序固定为：accepted history（根真相）→ 当前结果表（业务投影）→ winner（自动接受决策派生状态）。

对 publish-owned 字段，真相顺序不同：**投影管道（确定性）是根真相**，结果表直接等于 base，winner 仅用于换代对比（见第 4、6 节）。

### 5.5 修复与撤销

- 业务值修复通过**新的 commit** 完成，不直接改旧 field entry 的业务值。
- `revert`（撤销已生效结果）通过追加 `commit.kind = revert` 完成，不重写历史。
- `reject`（拒绝尚未生效的候选）不进入结果表，保留历史。
- `superseded`（已被更新覆盖的已接受 entry）保留历史地位，不单独改写结果表。
- overlay 移除 / 清除（`winner_clear`，或冲突处理中「接受新 base」）时，事实表该字段**回退到当前 base 值**；该值在决策点由 overlay-aware 的 `project` 已算出（用于对比），可直接取用，无需再触发一次完整投影。

## 6. 字段 policy 与双轨模型

### 6.1 双轨分流

同步系统按字段 policy 将数据分流到两条轨道：

- **publish-owned 轨道**：只允许自动化提交的整表 / 整字段组。沿用轻量发布模型（行级增量发布 + manifest / CAS gate），不引入协作 commit 历史。
- **collaborative 轨道**：允许人工编辑、需要字段级冲突处理、或需要按来源决定是否自动接受的字段。使用 commit + field entry 协作模型。

两条轨道按**字段**划分：同一张发布表可以同时包含两类字段。publish-owned 字段由 manifest / 行级发布整体替换；collaborative 字段允许人工 overlay，并在发布时受 winner / 人工覆盖模式保护，不被自动覆盖。

### 6.2 字段 policy 至少表达

- 当前字段属于 `publish-owned` 还是 `collaborative`。
- 是否允许人工编辑。
- 允许哪些自动来源提交候选变更。
- 哪些自动来源可以直接自动接受。
- 哪些自动来源之间允许自动合并或自动覆盖。
- 当前字段是否要求审核后才能进入 accepted 状态。
- 人工覆盖模式是 `manual_sticky` 还是 `manual_until_source_change`：
  - `manual_sticky`：人工接受后，自动来源不能直接重新覆盖。
  - `manual_until_source_change`：人工接受后，自动来源只有在来源版本或等价来源指纹发生变化后，才允许重新参与自动接受。

### 6.3 多来源基础值决策层

`resolved base` 是「多来源规则决策后的当前基础值」，不是某个单一来源原值。决策单位是 `sourceId + entityType + fieldPath`。

- 候选值通过资格判定（来源启用、规则集已发布、字段规则存在且 enabled、coverage 支持、strategy 非 ignore 等）后才进入竞争。
- 能收敛为唯一 `resolved base` → 可继续进入 merge / winner。
- 不能收敛 → 进入 `batch_review` / `manual_review`，不得静默写主表。
- 每个字段的 `resolved base revision` 由（基础值、来源、决议模式、决议指纹）生成稳定指纹，用于判断 base 漂移。

> 复用现有的 `import_sources` / `import_rule_sets` / `import_field_rules` 作为来源规则输入，不新建一套平行的 source_rules / priority_rules。

### 6.4 自动接受的判断顺序

1. 字段 policy 是否允许该自动来源参与。
2. 当前字段是否处于人工覆盖状态。
3. 若不处于，按来源优先级 / 兼容规则判断是否可 auto-accept。
4. 若处于，按人工覆盖模式判断自动来源是否可重新参与。

## 7. 导入与审批管线

### 7.1 链路

```text
数据源适配器
  -> 原始载荷入库
  -> 标准化记录
  -> 实体匹配
  -> 字段级 diff
  -> 规则评估 / 基础值决策
  -> 生成变更集与执行模式
  -> 自动应用 / 批量审批 / 人工审批
  -> 应用服务写入主表
  -> 应用日志与回滚链路
```

- 数据源只提供事实候选，不直接改主表。
- 所有更新先落留痕记录，再决定执行路径。
- 主领域表只能由自动应用服务或审批后应用服务写入。

### 7.2 执行模式

- `auto_apply`：低风险变更，先留痕再自动应用，必须可回滚。
- `batch_review`：中风险变更，进入批量审批队列，按来源 / 字段 / 规则分组。
- `manual_review`：高风险变更，必须逐条人工审批。

字段策略（系统建议动作）与执行模式（走哪条执行路径）解耦。

### 7.3 发布流水线（后半段异步分片）

从构建层写入远端正式表采用异步分片模型：

- `finalize`：校验构建输入完整性，冻结发布版本，创建远端任务。
- `apply`：按分片把规范化数据写入正式表。
- `refresh`：按分片或依赖顺序刷新派生结果。

远程服务负责 job / partition / lease / heartbeat / retry 状态，持久化在远端轻量同步任务表。桌面端负责触发、认领、执行和上报每个分片；每个分片独立事务、独立提交、独立重试。

### 7.4 hsdata 发布基于 manifest

对 hsdata 这类 `publish-owned` 链路，发布不与远端正式结果表做逐行 diff，而是：

- 本地生成投影结果。
- 生成轻量 manifest（按 `cardId` 聚合）。
- 与「上次成功发布 manifest」做 diff，只发新增 / 变更 / 删除的卡。
- 发布成功后把本次 manifest 记为新的发布基线。

> 该前提要求远端正式结果表不接受带外人工修改。允许远端修改的游戏必须采用不同的发布一致性策略（发布前 live drift check / 冲突阻断）。

## 8. 数据 bulk export（全量 + diff）

### 8.1 定位：数据上游

本平台的核心定位是**整合多个上游数据源 + 标准化 + 提供一致 API 的数据上游**。外部方（例如想自建卡查网站的个人 / 团队）可以以本平台为源：定期下载全量或增量数据，导入自己的系统，无需自行对接多个原始源。bulk export 就是这条交付路径。

### 8.2 导出内容：有效数据

导出的是**有效数据**（base + overlay 合并后的最终值），不是纯 base——外部消费方需要的是最终结果（含手动修正）。

- **全量 export**：指定范围的有效数据快照。
- **diff export**：两个版本之间的有效数据增量。

**粒度按表**：每张表独立导出（如 `entities`、`entity_localizations`、`entity_relations`），消费方按需选择要拉取的表。

### 8.3 数据级 diff

diff export 采用**数据级**对比（而非从 generation + overlay 推导）：

- **新增 / 更新**：依据事实表的 `createdAt` / `updatedAt`（>= 上次导出基线时间），并用内容 hash 复核。
- **删除**：`updatedAt` 检测不了删除，且 remote 表可能没有 `deletedAt`。删除检测有两种候选方案，**暂不决选，两者均可接受**：

| 方案 | 机制 | 依赖 |
|---|---|---|
| **(a) 导出侧自持基线 manifest** | 导出服务为每个版本保存 `row-key → 内容hash` 清单；删除 = 基线有、当前无 | 不依赖 remote 是否有 deletedAt；每版本存一份清单（hearthstone 量级约几 MB）|
| **(b) remote 表软删（deletedAt）** | 保留软删行直到导出之后，导出用 deletedAt 检测删除 | remote 表需保留 `deletedAt`；**purge 从 publish 之后移到导出之后** |

> 取舍要点：方案 (a) 自包含、不依赖 remote schema；方案 (b) 更简单，但要求调整 purge 时机（删除行保留到导出完成后再清理）并让 remote 表保留 `deletedAt`。两者均不排除，后续实现时再定。

### 8.4 版本与基线

- 每次发布（换代 / 手动编辑生效）都可能产生新的导出版本。
- 导出服务为每个版本保留基线（至少 row-key 清单），供后续 diff 计算。
- 外部消费方按版本号拉取：全量（首次 / 换基线）或 diff（增量更新）。

### 8.5 与 generation 的关系

- base 换代是导出版本前进的主要驱动力（大批量）。
- 手动 overlay（accepted）也会推进导出版本（小剂量）。
- **有效数据 ≠ 任一纯 generation**（叠加了 overlay），因此导出版本不以 generation 为唯一标识，而以「有效内容」为准。

### 8.6 粒度与格式

- **粒度按表**：每张表独立导出，消费方按需选择。
- **格式 = JSONL（JSON Lines）/ 表**：每张表一个 `.jsonl(.gz)` 文件。JSONL 每行一条独立记录，可流式解析、可断点续传、天然支持增量。
  - **配套 schema**：每表一个 schema 文件（`{table}.schema.json`，声明字段路径 + 类型），随导出一起发布并写入 manifest——JSONL 无内嵌 schema，必须配套。
- **每版本双发**：
  - **整表文件**（`{table}.jsonl.gz`）：当前版本全量数据，消费方可直接整体替换。
  - **delta 文件**（`{table}.delta.jsonl.gz`）：增量变更，每行 `{ op: insert|update|delete, rowKey, value? }`，消费方逐行应用。
- 未来可选格式（按消费方需求）：Parquet（列式分析）、卡片级层次 JSON、SQL dump。

### 8.7 交付方式：R2（原点）+ CDN（分发）

- **R2 对象存储作为原点**（零出口流量费，大文件下载不产生成本），**Cloudflare CDN 作为边缘分发**（全球就近缓存）。
- 通过一个 Worker 将 R2 文件流式提供给 CDN 缓存，消费方以稳定 URL 直接下载。
- **版本化 URL 天然不可变** → CDN 永久缓存，无失效问题：

```text
data.tcg.cards/manifest.json                     ← 可变，指向当前版本（短缓存 / 失效）
data.tcg.cards/v{n}/{table}.jsonl.gz            ← 不可变，整表文件（长缓存 / 永不失效）
data.tcg.cards/v{n}/{table}.delta.jsonl.gz      ← 不可变，delta 文件
```

- `manifest.json` 列出各表版本 + 内容 hash + 文件 URL + schema 引用；消费方拉 manifest → 对比本地版本 → 按表拉整表或 delta。

## 9. 冲突处理

**冲突解决的上下文归属**：能解决某冲突的人，必须拥有该冲突涉及的上下文。自动源内部状态仅维护者本地可见（见 2.3），因此自动源相关的冲突（换代、base 变化、候选矛盾）只能由该维护者解决；其他维护者只能基于已发布的 base 与自己的 overlay 判断自己手动的部分，无法也不应介入自动源内部。

### 8.1 字段级冲突

`field_conflicts` 记录冲突，`processingSide + processingStage` 区分位置：

- 远端 apply 冲突：`processingSide = remote`、`processingStage = apply`。
- 本地 replay / base_drift 冲突：`processingSide = local`、`processingStage = replay`。

冲突种类：`expected_row_revision_mismatch`、`expected_winner_revision_mismatch`、`source_resolution`、`base_drift`、`history_replay`。

解决结果最终通过新的 `conflict_resolution commit` 回写到 field_commits。

### 8.2 base 换代的三类提醒

当自动源推进新 generation 时，`project` 重算新 base，并与事实表当前值 + `field_winners` 对比。按被影响字段的状态产出三类提醒：

| 提醒类型 | 情形 | 处理 |
|---|---|---|
| **提醒冲突** | 有已接受的手动 overlay，且新 base 值与 overlay 值不同 | 冲突 → 待处理队列；一般由 overlay 作者决定保留 / 接受新 base；但自动源产生的冲突，若作者缺乏对新 base 的判断上下文，可由自动源维护者（Level 1/2）生成新 overlay 覆盖旧 overlay |
| **提醒添加手动覆盖（A 类）** | 无 overlay，但 base 改了该字段 | 可选提醒 → 确认是否要手动调整（可配置，见 9.3）|
| **提醒消除冗余 overlay（B 类）** | 有 overlay，但新 base 值 = overlay 值 | 冗余提醒 → 高权限处理，确认是否清理无效 overlay |

三类提醒的输入都来自 overlay-aware 的 `project`（第 3.2 节）：manual-winner 字段保留手动值、对比新 base；auto-winner 字段按新 base 更新。

### 8.3 A 类与 B 类

- **A 类提醒**：一张独立表（`base_change_review`，含 generation、rowKey、column、oldValue、newValue、status），换代时由 diff 扫描生成。**仅自动源维护者可见可处理**（其他维护者没有 base 全貌，不负这个责）。处理结果：确认调整 → 生成 overlay；确认忽略 → 标记 dismissed。默认不主动推送，由维护者订阅关心的实体 / 字段组合。
- **B 类冗余 overlay**：换代扫描检测到「新 base 值 = overlay 值」时，将 overlay 标记为冗余并附上（oldValue → newValue）佐证，由**高权限（自动源维护者及以上）**统一清理。

### 8.4 原子一致

- 单字段接受必须原子一致：`field entry.status = accepted`、结果表更新、winner 更新三者为同一原子效果。
- 非接受状态（pending / rejected / conflict / superseded）不触发结果表写入。
- 一致性修复必须可重放：对 collaborative 字段，accepted history 是最终校验基准，结果表与 winner 支持按历史重建。

## 10. 角色与权限层级

四层分级，层级累积（高层能做低层的所有事）：

| 层级 | 能力 | 对应机制 |
|---|---|---|
| **1. 源拥有者** | 接受 / 拒收自动源、配置管道字段优先级、裁决 pending 分歧代、批准 live base 变更（换代 / 同代冲突）| 源接受权、pending generation review 裁决、live base 变更批准权 |
| **2. 自动源维护者** | 维护自动源、在拥有者批准后推进 live base 变更、处理 A 类 base 变更提醒 | generation 发布（CAS）、base_change_review |
| **3. 普通维护者** | 只做手动 overlay，编辑即生效（可信）| overlay 字段 commit；base 换代标记的冲突由 overlay 作者自己决定 |
| **4. 普通用户** | 只提 edit request，是否生效由上层裁决 | 待审 overlay，需 Level 3+ 批准 |

「谁裁决」分两类：

- **自动层冲突**（分歧代、源接受）→ Level 1 裁决。
- **手动 overlay 冲突**（换代改了 overlay 字段）→ 一般由 Level 3（overlay 作者）自己决定，不上升；但当冲突由自动源产生、作者缺乏对新 base 的判断上下文时，自动源维护者（Level 1/2）可生成新 overlay 覆盖旧 overlay（新 overlay 成为当前 winner）。
- **B 类冗余 overlay 清理** → Level 1/2（高权限，需要 base 全貌）。

## 11. 公开 edit request（Level 4）

普通用户在公开站点的卡牌查看页提交「建议修改」，走自动化编辑器（与 Level 3 一致的表单 / 编辑能力）。

- 提交内容：`(rowKey, column, 建议值, 理由)`。
- 作为一条手动 overlay 的 field entry 进入待审状态（`pending`），由 Level 3+ 批准（`accepted`）后转为正式 overlay。
- 正式 overlay 标记作者为「用户提交 + 管理员批准」，可审计、可撤销。
- 必须登录才能提交；设置频率限制防滥用。
- 请求与批准全程留痕（`import_review_actions` 或等价动作表）。

## 12. 爬虫与其他自动源的位置

自动源必须在本地执行的情况（游戏拆包、本地 repo）无法改变。对于可从外部抓取的自动源（爬虫）：

- 优先设计为**可续批的增量流水线**：每次 cron 触发只爬一个有界批次，检查点（cursor）持久化到 serverless DB，幂等续爬。这套设计在任何运行时都可行。
- 默认落在 **Workers + cron + DB checkpoint**（无人值守、常驻）。
- 被目标站点屏蔽（Workers 从数据中心 IP 出站）或解析过重时，**下放到桌面 Bun sidecar** 手动/定时跑。
- 爬虫输出按 `(rowKey, column)` 写入自动源数据，进入统一的 base 融合。

## 13. 一致性、审计与撤销

- 对 collaborative 字段，accepted history 是不可变根真相，业务修复不直接改历史；对 publish-owned 字段，投影管道（确定性）是根真相。
- 撤销通过追加新 commit（`kind = revert`）完成；回到旧值也走新历史。
- 每个 commit 携带三层溯源：`editorRuntime`（desktop / site / system）、`editorIdentity`（人 / 机器）、`editorSource`（manual / hsdata / conflict-resolution）。
- 自动应用与审批后应用必须支持按 apply log 回滚。
- 应用日志采用「热索引 + 冷内容 + hash 校验 + 可归档」的分层模型：小值内联，大值（> 32KB）转对象存储（R2 / S3）只保留 hash 与引用。

## 14. 表结构建议

### 13.1 当前态

- 各游戏正式领域表（`hearthstone`、`magic` 等）：保存当前有效值。
- `{game}_data.field_winners`：保存当前 winner projection（`entityType + entityKey + fieldPath`，`status = active | cleared`）。

### 13.2 过程态

- `{game}_data.field_commits`（本地 + 远端）：字段级 commit 历史，含 `reviewStatus` / `projectionStatus` / `syncStatus`。
- `{game}_data.field_sync_cursors`：本地 pull / push 位置。
- `{game}_data.field_conflicts`（本地 + 远端）：字段级冲突。
- `remote PublishStreamRegistration`：受控发布流登记（三元组 + targetFingerprint + normalPublishEnabled + lease）。
- `remote PublishLedger`：每发布流最近成功批次（manifest、generation、buildMin/Max）。

### 13.3 导入与审批

- `import_sources` / `import_rule_sets` / `import_field_rules`：来源与字段规则。
- `import_runs` / `import_raw_records`：导入运行与原始载荷。
- `import_change_sets` / `import_field_changes`：实体级 / 字段级变更。
- `import_apply_logs`：应用留痕与回滚。
- `import_review_actions`（`*_app`）：审批与 override 动作。

### 13.4 换代处理

- `base_change_review`（本地）：A 类 base 变更提醒（由本地 overlay-aware project 的换代 diff 生成，自动源维护者可见）。
- overlay 冗余标记：在 overlay / winner 上记录 `redundant` 状态，附佐证。

## 15. 非目标与风险

### 14.1 非目标

- 不在首轮引入每个对象各自的 `current` 表。
- 不在首轮把所有同步事件做成完整业务审计系统。
- 不在首轮实现复杂自动合并。
- 不引入通用自由分支操作、历史重写或 Git 等价物。
- 不引入持续双向实时同步。

### 14.2 风险

- **多源「假设一致」的静默错误**：自动管道对矛盾候选必须落矛盾日志供抽查，避免完全盲盒。
- **字段路径配置过于自由**：字段路径需可枚举、可校验，后续增加字段路径注册表。
- **默认自动应用范围过大**：`auto_apply` 只允许低风险字段，默认白名单启用，必须优先补齐回滚。
- **变更量过大导致审批堆积**：支持按来源 / 字段 / 策略批量审批。
- **批量审批分组过粗**：批量审批必须按稳定维度分组，高风险字段禁止进入批量审批。
- **留档过细带来存储膨胀**：预留 hash / ref / storage mode 字段，接入对象存储与归档。
- **大写入性能**：自动 base 的大写入归「推进代的人」单写者承担，通过换代 + manifest 而非逐行日志解决；仍受 Bun / 驱动层的 COPY 能力约束，需持续关注。
