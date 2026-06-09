# Hearthstone 字段同步管理页面归档摘要

> 查询这项提案时，应优先阅读本文。只有当需要查看设计推导、评审意见或逐步实施历史时，才继续翻阅 `design.md`、`review.md` 和 `plan.md`。

## 结论

这项工作已经完成。

`hearthstone tag` 的字段同步后台现在已经有两类独立管理入口：

- `提交`
- `冲突`

并且 `site-console` 与 `app-console-desktop` 共享同一套页面骨架。

## 最终边界

- 页面骨架统一放在 `packages/console-shell`
- 运行时差异统一收敛到 `ConsoleFieldSyncHost`
- commit 读取统一使用通用 `fieldCommit*` 模型
- conflict 仍保留 tag 领域模型与解决动作
- desktop 可在同页切换 `local / remote`
- site 只暴露 `remote`

## 已完成范围

- 远端 tag commit 只读接口：
  - `listCommits`
  - `getCommit`
- desktop runtime 本地 tag commit 只读接口：
  - `tag.listCommits`
  - `tag.getCommit`
- 共享字段同步 host：
  - site 注入远端实现
  - desktop 注入本地 / 远端实现
- Hearthstone 导航新增分组入口：
  - `提交`
  - `冲突`
- 共享 commit 管理页：
  - 来源切换
  - 筛选
  - 列表
  - 详情
- 共享 conflict 管理页：
  - 来源切换
  - 筛选
  - 列表
  - 详情
  - 统一解决动作区
- desktop 来源记忆：
  - commit 页独立记忆
  - conflict 页独立记忆
- desktop 本地数据库配置收口：
  - 用户配置优先
  - `DESKTOP_LOCAL_DATABASE_URL` 仅作 fallback

## 当前验收状态

- `packages/model` 类型检查通过
- `packages/console-api` 类型检查通过
- `packages/console-core` 类型检查通过
- `apps/service-desktop-runtime` 类型检查通过
- `apps/app-console-desktop` 的共享页面 `vue-tsc` 检查通过
- `apps/site-console` 的共享页面 `vue-tsc` 检查通过

## 已知取舍

- 首轮范围只覆盖 `hearthstone tag`
- commit 页保持只读，不提供审核、撤销或重放控制
- conflict 页支持单条处理，不支持批量处理
- `local` 来源只有在 desktop runtime 已拿到本地数据库配置时才暴露

## 查阅指引

- 先读本文，快速了解最终边界、完成范围和验收状态
- 需要看设计约束和页面 / host 关系时，再读 `design.md`
- 需要看通过理由和取舍判断时，再读 `review.md`
- 需要看实施顺序与验证清单时，再读 `plan.md`
