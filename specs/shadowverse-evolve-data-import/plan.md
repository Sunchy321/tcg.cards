# 影之诗 Evolve 卡牌数据导入实施计划

## Todo

- [x] 1. `packages/db`：新增 `schema/shared/shadowverse/` 下 evolve 表（`evolve_card_sets`、`evolve_cards`、`evolve_card_localizations`、`evolve_card_questions`）
- [x] 2. `packages/db`：新增 `schema/local/shadowverse/` 下 evolve 表（`evolve_import_batches`、`evolve_import_failures`、`evolve_import_states`、`evolve_image_assets`）
- [x] 3. `packages/model`：新增 `src/shadowverse/schema/data/evolve-card-list.ts`（SVE Helper 响应 zod 模型 + 解析结果类型）
- [x] 4. `service-desktop-runtime`：新增 `lib/shadowverse-evolve/ja-official-source.ts`（cardsearch 列表 + 详情页 cheerio 解析）
- [x] 5. `service-desktop-runtime`：新增 `lib/shadowverse-evolve/en-official-source.ts`（按卡包列表 + 详情页解析，EN 卡号映射）
- [x] 6. `service-desktop-runtime`：新增 `lib/shadowverse-evolve/svehelper-source.ts`（公开接口客户端，分页全量）
- [x] 7. `service-desktop-runtime`：新增 `lib/shadowverse-evolve/cards-import.ts`（三源按卡号合并 → 幂等 upsert + 软删除 + 记账）
- [x] 8. `service-desktop-runtime`：新增 `lib/shadowverse-evolve/image-source.ts` 与 `images-import.ts`（日/英卡图下载，存在性增量）
- [x] 9. `service-desktop-runtime`：定义并注册 `shadowverse_evolve_cards_import`、`shadowverse_evolve_images_import` 任务
- [x] 10. `orpc/shadowverse.ts`：新增 Evolve 任务触发路由
- [x] 11. `app-console-desktop`：设置页 Shadowverse 页面新增 Evolve 区块（两个任务卡片 + 报告）
- [x] 12. 本地实跑验证：单卡包小样本导入 → 全量导入 → 五字段抽查 → 幂等重跑（任务框架端到端有界验证：目录枚举三源完成、127 张卡真实入库含 Q&A、护符类详情页解析修复、取消语义正常；全量导入由 desktop 触发执行）
- [x] 13. 提交前生成迁移（`20260830123440_flowery_silk_fever`，drizzle-kit 生成，每配置一个迁移）

## 实施顺序与依赖

1 → 2 → 3 → 4/5/6（可并行）→ 7 → 8 → 9 → 10 → 11 → 12 → 13。

- 三源合并策略：日文官方为主数据（卡号主键），英文按卡号映射（`{日文卡号}EN`）补英文本地化，简中按卡号直连补中文本地化；缺失置空不阻塞
- 迁移（步骤 13）按仓库规则在提交前统一生成

## 实施约束（遵循仓库既有规则）

- HTML 解析使用 cheerio（runtime 现有依赖）；请求串行 + 数百毫秒间隔 + 退避重试，对齐 Beyond 源客户端
- 删除一律软删除；导入记账全部落 `{game}_data`
- 简中来源字段缺失不阻塞日/英导入；英文来源失败同样隔离记录
- 每完成一项 todo 立即勾选
