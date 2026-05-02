# console 桌面端 Nuxt 迁移设计

## 背景

当前 `apps/app-console-desktop` 仍然使用 `Vite + Vue Router + Tauri`。

虽然前一阶段通过 `console-core`、`console-platform`、`console-ui` 已经显著减少了页面逻辑重复，但桌面端仍然保留了：

- 独立的路由壳
- 独立的页面入口文件
- 独立的布局组织方式
- 与 `site-console` 不同的页面与宿主组织模型

这使得共享页面虽然已经能复用“页面实现”，但仍然会在桌面端保留一层本地路由与页面入口壳。

当前新的目标不是继续强化平台无关抽象，而是优先减少：

- 过多的薄 wrapper
- 过多的 `shared` 包心智负担
- Web 和 Desktop 在页面壳层上的结构分叉

## 目标

1. 将 `apps/app-console-desktop` 的前端壳从 `Vite + Vue Router` 迁移为 `Nuxt SPA`
2. 保持 `Tauri` 作为桌面宿主，不迁移 Rust 侧窗口、认证与命令能力
3. 在第一阶段尽量复用现有 `src/pages`、`src/components`、`src/auth` 与 `src/windows`
4. 用最少的新增页面入口完成 Nuxt 接管，而不是重新生成一批新的薄页面文件
5. 为后续 Web/Desktop 共享同一个 Nuxt 壳层或 Nuxt layer 预留路径

## 非目标

1. 本次不改动 `site-console` 的 SSR / BFF 结构
2. 本次不迁移 `service-internal`
3. 本次不立即删除 `console-core`、`console-platform`、`console-ui`
4. 本次不一次性重写所有桌面端页面实现
5. 本次不处理 `app-console-mobile`

## 方案

### 1. 桌面端切换为 Nuxt SPA

`apps/app-console-desktop` 改为使用：

- `nuxt`
- `@nuxt/ui`
- `@nuxt/icon`
- `ssr: false`

桌面端继续由 Tauri 启动，但前端开发与构建入口改为：

- 开发：`nuxt dev`
- 构建：`nuxt generate`

Tauri 的 `devUrl` 继续使用 `http://localhost:1420`，生产静态资源改为指向 Nuxt 输出目录。

### 2. 保留 Tauri 双窗口模型

桌面端当前已经依赖：

- `login` 窗口
- `main` 窗口
- Rust 命令维护的认证状态

这些能力不应因为前端壳切换到 Nuxt 而重写。

因此：

- `app.vue` 继续根据当前 Tauri window label 分流
- `login` 窗口继续直接渲染登录界面
- `main` 窗口改为渲染 Nuxt 布局与页面

### 3. 第一阶段直接复用现有 `src/pages`

桌面端当前已经有一套完整的 `src/pages` 文件结构。

因此第一阶段不再额外创建新的 `app/pages` 或 catch-all page，而是直接将 Nuxt 配置为：

- `srcDir: 'src'`

让 Nuxt 原生接管现有：

- `src/pages`
- `src/components`
- `src/composables`

这样可以减少额外目录层级，也更符合当前仓库的既有结构。

### 4. 将主界面壳迁移为 `src/layouts/default.vue`

当前 `MainWindow.vue` 实际承担：

- 会话恢复
- 游戏切换
- 侧边栏导航
- 用户页、设置页与游戏页容器

这些职责更接近 Nuxt layout，而不是页面组件。

因此第一阶段将其迁移为 Nuxt 默认 layout：

- 保留原有认证恢复逻辑
- 保留原有 localStorage 路由恢复逻辑
- 将原来的 `RouterView` 改为 layout slot

### 5. 保留现有业务页面实现

第一阶段不重写已有页面实现，也不额外复制一套 Nuxt 页面文件。

继续复用：

- 现有共享页组件
- 现有桌面端本地页面组件
- 现有 `auth` / `windows` / `useApiClient` 等桌面逻辑

迁移重点放在：

- 前端运行时切换
- 路由壳切换
- 页面加载方式切换

### 6. 后续第二阶段再评估共享 Nuxt 壳层

当桌面端已经稳定运行在 Nuxt SPA 上之后，再评估是否执行下一步：

- 将 `site-console` 和 `app-console-desktop` 收敛到共同的 Nuxt layer
- 减少 `console-ui` 中“整页组件 + 宿主入口壳”的存在感

也就是说：

- 第一阶段先解决桌面端壳层不一致
- 第二阶段再解决 Web/Desktop 的 Nuxt 壳层复用

## 风险与约束

### 1. 第一阶段不会立即减少所有共享包

虽然 Nuxt 能减少页面入口壳，但 `console-core`、`console-platform`、`console-ui` 仍会在一段时间内继续存在。

### 2. 旧页面目录会暂时同时承担历史与当前职责

第一阶段虽然减少了新增 wrapper，但 `src/pages` 会在一段时间内同时承载：

- 既有桌面端页面实现
- Nuxt 当前页面目录

因此后续仍需继续清理旧的 Vite 心智负担和无用入口文件。

### 3. Tauri 能力边界不会消失

迁移到 Nuxt 不能消除：

- `invoke`
- 多窗口
- 本地凭据
- 本地文件/Git/工具调用
- 桌面认证桥接

这些能力仍然保留在桌面宿主层。

### 4. `site-console` 仍然不是可直接复用的完整 Nuxt 壳

当前 `site-console` 同时包含：

- 页面壳
- SSR / BFF
- Nitro / Cloudflare 配置
- 服务端 alias

因此第一阶段不能把 `site-console` 直接变成桌面端壳模板。

## 验收标准

1. `app-console-desktop` 前端开发入口切换到 Nuxt
2. Tauri 仍能分别打开 `login` 与 `main` 窗口
3. `main` 窗口能在 Nuxt 下加载现有桌面端页面
4. 已迁移页面与当前登录态恢复逻辑保持可用
5. 桌面端不再依赖 `src/main.ts` 与自建 `src/router.ts` 作为主入口
6. 后续可以在此基础上继续把 Web/Desktop 壳层向同一个 Nuxt 结构收敛
