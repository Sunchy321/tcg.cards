# 数据库表归属清单（第一版）

## 目的

这份清单用于回答当前 `packages/db` 中每张表应属于哪一条 schema 轨道：

- `shared`
- `local-only`
- `remote-only`

这里的“归属”指结构职责，不指具体实例环境。

后续的 `local schema` 与 `remote schema` 都应以这份归属清单为准继续收口。

## 判定原则

### shared

满足以下条件的表归入 `shared`：

- 本地构建库与远端 serving 库都需要该表
- 两边语义一致
- 两边结构应保持一致

### local-only

满足以下条件的表归入 `local-only`：

- 只服务于导入、构建、中间态、来源缓存或发布前准备
- 远端不需要直接承载这类结构
- 允许通过本地构建结果向远端发布，而不是要求远端持有同构中间态

### remote-only

满足以下条件的表归入 `remote-only`：

- 只服务于远端查询、远端用户态、远端控制面或远端在线索引
- 本地不应成为这类表的权威持有者
- 即使本地需要使用，也应通过拉取、镜像或发布协议协同

## 当前冻结归属

### 1. auth

#### remote-only

- `public.users`
- `public.sessions`
- `public.accounts`
- `public.verifications`
- `public.apikeys`

理由：

- 全部属于远端认证与应用账户体系
- 不应进入本地构建库

### 2. hearthstone 基础领域层

#### shared

- `hearthstone.announcements`
- `hearthstone.announcement_items`
- `hearthstone.cards`
- `hearthstone.card_relations`
- `hearthstone.entities`
- `hearthstone.entity_localizations`
- `hearthstone.entity_view`
- `hearthstone.card_entity_view`
- `hearthstone.entity_relations`
- `hearthstone.formats`
- `hearthstone.card_changes`
- `hearthstone.format_changes`
- `hearthstone.patchs`
- `hearthstone.sets`
- `hearthstone.set_localizations`
- `hearthstone.tags`

理由：

- 这部分仍属于共享的领域结果层
- 本地构建与远端 serving 都需要同构结构

### 3. hearthstone 数据层

#### local-only

- `hearthstone_data.source_versions`
- `hearthstone_data.raw_entity_snapshots`
- `hearthstone_data.raw_entity_snapshot_tags`
- `hearthstone_data.tag_value_view`
- `hearthstone_data.hsdata_import_jobs`
- `hearthstone_data.hsdata_import_job_chunks`
- `hearthstone_data.hsdata_import_job_snapshots`

理由：

- 全部服务于 `hsdata` 导入、原始快照和投影前准备
- 远端不需要承载这套中间态

#### remote-only

- `hearthstone_data.knowledge_sources`
- `hearthstone_data.knowledge_chunks`
- `hearthstone_data.knowledge_embeddings`
- `hearthstone_data.knowledge_index_jobs`
- `hearthstone_data.knowledge_source_links`

理由：

- 当前仍作为远端 serving / 检索层
- 依赖远端在线索引与查询能力

#### 暂定 remote-only

- `hearthstone_data.card_image_assets`
- `hearthstone_data.card_image_exports`
- `hearthstone_data.card_image_imports`

理由：

- 当前更接近远端资产注册与远端结果管理
- 虽然存在批次日志性质，但本轮先不迁入本地

### 4. magic 基础领域层

#### shared

- `magic.announcements`
- `magic.announcement_items`
- `magic.cards`
- `magic.card_relations`
- `magic.cycles`
- `magic.decks`
- `magic.document_definitions`
- `magic.document_versions`
- `magic.document_node_entities`
- `magic.document_nodes`
- `magic.document_node_contents`
- `magic.document_node_changes`
- `magic.document_node_change_relations`
- `magic.formats`
- `magic.card_changes`
- `magic.format_changes`
- `magic.prints`
- `magic.rules`
- `magic.rulings`
- `magic.sets`

理由：

- 这部分仍被视为共享领域层或共享文档主结果层
- 本地构建与远端 serving 仍需要同构结构

### 5. magic 数据层

#### local-only

- `magic_data.gatherer`
- `magic_data.import_sources`
- `magic_data.import_rule_sets`
- `magic_data.import_field_rules`
- `magic_data.import_policy_snapshots`
- `magic_data.import_runs`
- `magic_data.import_raw_records`
- `magic_data.import_change_sets`
- `magic_data.import_field_changes`
- `magic_data.import_apply_logs`
- `magic_data.mtgch`
- `magic_data.scryfall`
- `magic_data.document_version_imports`

理由：

- 服务于导入规则、导入批次、原始记录、候选变更与来源缓存
- 都应属于本地构建库

#### remote-only

- `magic_data.knowledge_sources`
- `magic_data.knowledge_chunks`
- `magic_data.knowledge_embeddings`
- `magic_data.knowledge_index_jobs`
- `magic_data.knowledge_source_links`

理由：

- 当前仍作为远端在线检索与知识索引层

### 6. magic 应用层

#### remote-only

- `magic_app.decks`
- `magic_app.deck_likes`
- `magic_app.deck_favorites`
- `magic_app.document_change_reviews`
- `magic_app.document_change_review_states`
- `magic_app.document_version_pair_revisions`
- `magic_app.import_review_actions`

理由：

- 这部分带有明确用户语义、审核语义或远端应用态
- 按分类规则必须归入 `*_app`
- 本地构建库不应成为这类状态的权威持有者

## 当前代码结构与最终归属的关系

当前 `packages/db` 的轨道导出已经开始按这份清单靠拢，但还不是最终完成态。

### 已经对齐的部分

- `hsdata` 导入与快照表已进入 `local`
- `magic_data.import_*`、`gatherer`、`mtgch`、`scryfall` 已进入 `local`
- `magic.document_*` 已按 `shared / local / remote` 拆开
- `magic` 的 `import` 与 `deck` 混合文件已按归属拆开
- `shared / local / remote` 已统一改为 `{track}/{game}/index.ts` 目录入口
- `auth` 只进入 `remote`

### 当前剩余工作

- 轨道入口已经收口，但 migration 基线还未按新边界重建
- 部分历史 migration 仍反映旧的 mixed ownership 结构
- 后续重点应转向 migration 基线，而不是继续保留兼容入口

## 下一轮拆分重点

### 1. 生成第一版 `local` migration 基线

优先目标：

- 让 `local` 轨道与归属清单完全一致
- 生成第一版本地构建库 migration
- 检查与 `remote` 历史 migration 的边界差异

在当前归属与轨道入口稳定后，下一步应：

1. 继续让 `local` 聚合入口与清单完全对齐
2. 再执行 `db:generate:local`
3. 得到本地构建库第一版正式 migration

## 结论

当前第一版归属清单已经足够支持下一步工作：

- 保持 `local / remote / shared` 轨道与清单一致
- 生成第一版 `local` migration

后续如需变更表归属，应先更新这份清单，再修改聚合入口与 migration 轨道。
