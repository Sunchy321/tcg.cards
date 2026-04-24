# Hearthstone Set 管理页实施计划

## TODO List

- [x] 整理并迁移设计到 `specs/`
- [x] 扩展 `set` 后台管理 schema
- [x] 实现 Hearthstone `set` ORPC 接口
- [x] 实现控制台 `set` 管理页面
- [x] 接入导航并验证关键流程

## 实施步骤

1. 将已确认设计从 `proposals/` 转入 `specs/`
2. 在 `packages/model/src/hearthstone/schema/set.ts` 中补充 list / get / update 所需 schema
3. 新增 `apps/site-console/server/orpc/hearthstone/set.ts`，实现列表、详情、更新接口
4. 新增 `apps/site-console/app/pages/hearthstone/set/index.vue`，复用现有管理页交互模式实现列表与编辑
5. 在 `apps/site-console/server/orpc/hearthstone/index.ts` 与 `apps/site-console/app/layouts/admin.vue` 中接入入口
6. 运行与变更直接相关的测试或最小验证，确认页面与接口可用
