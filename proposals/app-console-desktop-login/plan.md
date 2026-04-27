# app-console-desktop 登录功能实施计划

## TODO List

- [x] 为桌面端登录新增专用 proposal
- [x] 在 Tauri Rust 侧实现登录、获取 session、退出登录命令
- [x] 在前端实现登录表单与已登录视图
- [x] 增加内部服务地址配置
- [x] 调整 Tauri 初始窗口与 capability，改为登录窗口启动
- [x] 在前端实现登录窗口与主窗口的切换逻辑
- [x] 在 Rust 侧增加登录 cookie 本地持久化与恢复
- [x] 以 `site-*` 为参考重做桌面端视觉样式
- [x] 验证桌面端前后端类型检查或构建

## 实施步骤

### 1. Rust 认证命令

在 `src-tauri` 中新增认证状态与请求逻辑，使用 `reqwest` 的 cookie store 维护 Better Auth 会话。

### 2. 窗口模型调整

调整 Tauri 初始窗口为 `login`，并补齐 `login` 与 `main` 的 capability 覆盖范围。

### 3. 前端分窗体流转

在前端根据窗口 label 区分登录界面与主界面，并在登录成功、登录失效、退出登录时完成窗口切换。

### 4. 登录持久化

在 Rust 侧持久化 Better Auth cookie，并在 `auth_get_session` 时优先尝试从本地恢复会话。

### 5. 配置与验证

保留 `VITE_INTERNAL_AUTH_URL` 配置，并执行桌面端最小范围验证。

### 6. 视觉改版

对齐 `site-console` 的后台风格，重做登录窗口和主窗口的布局、主题和细节样式。
