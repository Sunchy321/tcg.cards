# console 桌面端 Nuxt 迁移实施计划

> 稳定的运行时边界、能力分层和数据归属规则以 [../../docs/project-architecture.zh-CN.md](../../docs/project-architecture.zh-CN.md) 为准。本文只记录本需求的实施计划；若有冲突，以主架构文档为准。

## TODO List

- [x] 为桌面端 Nuxt 迁移建立 proposal、review 与 plan
- [x] 在 `app-console-desktop` 中建立 Nuxt SPA 壳与基础配置
- [x] 将主界面壳迁移为 Nuxt layout，并保留现有登录窗口分流
- [x] 直接让 Nuxt 以 `srcDir: 'src'` 接管现有 `src/pages`
- [x] 调整 Tauri 前端构建与 dev server 接线到 Nuxt 输出
- [x] 验证已迁移页面在 Nuxt 下仍可加载
- [ ] 第二阶段再评估 `site-console` 与桌面端的共同 Nuxt 壳层收敛

## 实施步骤

### 1. Nuxt 壳层脚手架

在 `apps/app-console-desktop` 中新增：

- `nuxt.config.ts`
- `src/app.vue`
- `src/layouts/default.vue`

并直接复用现有 `src/*` 目录作为第一阶段页面与组件来源。

### 2. 登录窗口与主窗口分流

在根入口中根据 Tauri window label：

- `login` 直接渲染登录界面
- `main` 渲染 Nuxt layout 与现有 `src/pages`

### 3. 旧页面接管

将 Nuxt 配置为 `srcDir: 'src'`，让其直接接管现有 `src/pages`。

### 4. Tauri 构建切换

更新：

- `package.json` scripts
- `src-tauri/tauri.conf.json`

让桌面端从 Vite 改为消费 Nuxt 的开发服务和静态构建输出。

### 5. 迁移后验证

完成最小范围验证：

- 登录窗口可启动
- 主窗口可进入
- 现有关键页面可在 Nuxt 下加载
