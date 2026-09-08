# 影之诗 Beyond 卡牌数据导入实施计划

## Todo

- [x] 1. `packages/base`：`GAMES` 注册 `'shadowverse'`
- [x] 2. `packages/db`：新增 `schema/shared/shadowverse/`，声明 `pgSchema('shadowverse')`，定义领域表（`cards`、`card_sets`、`card_styles`、`card_localizations`、`card_set_localizations`、`card_style_localizations`、`card_relations`）
- [x] 3. `packages/db`：新增 `schema/local/shadowverse/`，声明 `pgSchema('shadowverse_data')`，定义导入状态表（`import_batches`、`import_failures`、`import_states`、`image_import_*`）
- [x] 4. `packages/model`：新增 `src/shadowverse/` zod 模型（cardList 接口 payload 模型 + 领域模型）
- [x] 5. `service-desktop-runtime`：新增 `lib/shadowverse/cards-source.ts`（接口客户端：Lang 头、串行分页、请求间隔、重试）
- [x] 6. `service-desktop-runtime`：新增 `lib/shadowverse/cards-import.ts`（zod 校验 → 以 `card_id` 幂等 upsert 领域表 → 消失卡牌 `deleted_at` 软删除 → 写 `shadowverse_data` 记账表）
- [x] 7. `service-desktop-runtime`：新增 `lib/shadowverse/image-source.ts` 与 `images-import.ts`（五语言取 hash，下载基础图/横幅图/进化图/异画样式图至本地 bucket 目录，按「语言 + kind + hash」增量）
- [x] 8. `service-desktop-runtime`：定义并注册 `shadowverse_cards_import`、`shadowverse_images_import` 任务（`task-definitions.ts`）
- [x] 9. `console-api`：最小影之诗 router（触发导入、读取导入状态与失败明细）—— 实施时确认无需新增：desktop 经 runtime 既有 task oRPC 触发
- [x] 10. `app-console-desktop`：设置页新增「游戏 → 影之诗」入口，复用任务 UI 展示进度
- [x] 11. 本地实跑验证：904 张卡（含 token）、五语言本地化行数、卡图落盘、幂等重跑不产生重复数据
- [ ] 12. 提交前按仓库规则生成迁移（先改 schema，`drizzle-kit generate` 随提交执行，每配置一个迁移）

## 实施顺序与依赖

1 → 2/3 → 4 → 5 → 6 → 7 → 8 → 9 → 10 → 11 → 12 大致串行：

- 步骤 2、3 可并行；4 依赖 2/3 的表结构定稿
- 步骤 5-7 依赖 4 的模型；8 依赖 5-7
- 步骤 9、10 依赖 8；11 依赖 10
- 迁移（步骤 12）按仓库规则在提交前统一生成，不提前

## 实施约束（遵循仓库既有规则）

- 所有 schema 变更先改定义，迁移在提交时用仓库脚本生成，不手写快照
- `{game}` 不得依赖 `{game}_data`；导入记账、失败、断点、图片状态全部落 `{game}_data`
- 读写路径使用 `BaseEntity` / `BaseCard` 等基表，视图 re-export 仅用于读
- 删除一律软删除（`deleted_at`），不硬删除
- 每完成一项 todo 立即勾选；实现遵循 design.md 的边界与 desktop runtime 既有任务框架
