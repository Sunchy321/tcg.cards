# Todo

- [x] 定义 console-shell 后台壳宿主接口
- [x] 在 console-shell 中新增统一 admin 布局实现
- [x] 迁移 site-console 使用共享 admin 布局
- [x] 保持 console-shell 不直接依赖 packages/ui
- [x] 移除 site-console 对 packages/ui 的剩余依赖
- [x] 迁移 desktop 使用共享 admin 布局
- [x] 统一 desktop 后台页面显式声明 admin 布局
- [ ] 验证两端的导航、设置、登出与 session 失效流程
- [ ] 验证 site-console 脱离 packages/ui 后的默认布局与 i18n 行为

# console-shell 统一 admin 布局实施计划

> 稳定的运行时边界、能力分层和数据归属规则以 [../../docs/project-architecture.zh-CN.md](../../docs/project-architecture.zh-CN.md) 为准。本文只记录本需求的实施计划；若有冲突，以主架构文档为准。

## 步骤 1：定义后台壳宿主接口

- 在 `console-shell` 中新增后台壳专用的注入接口
- 明确共享布局只依赖后台壳控制面，不直接依赖宿主私有实现
- 保持 `console-platform` 继续只承载通用平台能力

## 步骤 2：抽取共享后台壳

- 将侧栏、顶部栏、设置入口、标题区和基础内容容器收敛到 `console-shell`
- 由 `console-shell` 中的 `admin` 布局直接承载共享后台壳实现
- 明确 `console-shell` 不直接依赖 `packages/ui`，避免把 public-site 的默认布局、i18n 和 routeRules 语义传递给 desktop
- 保留必要的插槽与宿主状态渲染点

## 步骤 3：迁移网页端宿主

- 移除 `site-console` 本地 `admin.vue` 的壳实现
- 通过宿主适配把现有 session、角色和跳转行为接入共享布局
- 保持现有 SSR 与 hydration 约束不变

## 步骤 4：收拢 site-console 对 packages/ui 的剩余依赖

- 将 `site-console` 当前从 `packages/ui` 继承的 i18n 模块与 locale 配置迁回应用自身
- 为 `site-console` 提供最小的默认布局兜底，或让不需要默认布局的页面显式声明其布局行为
- 清理仅因继承 `packages/ui` 而获得、但对 console 后台不再必要的默认插件或布局依赖

## 步骤 5：迁移桌面端宿主

- 将 `default.vue` 中的后台壳逻辑迁到 desktop 宿主适配
- 保留 session 恢复、最近路由恢复与登录窗口切换
- 让 `admin` 成为 desktop 后台壳唯一入口

## 步骤 6：统一页面布局声明

- 为 desktop 后台页面补齐 `layout: 'admin'`
- 清理仅用于包装 `default` 的历史兼容层
- 确保共享页面和宿主页面在布局语义上保持一致

## 步骤 7：验证与收口

- 验证两端的游戏切换、用户导航、标题展示和设置入口
- 验证 desktop 的登出、session 失效和窗口切换路径
- 验证 `site-console` 移除 `packages/ui` 后的默认布局兜底、首页跳转页和 i18n 配置行为
- 验证 `settings`、`hsdata` 等最近改动页面在迁移后仍能正常工作
