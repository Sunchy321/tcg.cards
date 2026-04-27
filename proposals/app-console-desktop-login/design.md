# app-console-desktop 登录功能设计

## 背景

当前 `apps/app-console-desktop` 仍是 Tauri 初始化模板，尚未具备任何正式业务能力。

仓库内现有管理登录能力主要存在于：

- `site-console`：网页端登录页与管理壳层
- `service-internal`：当前统一承载 Better Auth 登录服务

本次需求是让 `app-console-desktop` 具备独立登录能力，并明确以 `service-internal` 作为登录后端。

## 目标

1. 为 `app-console-desktop` 提供独立登录窗口
2. 通过 `service-internal` 完成用户名密码登录
3. 登录成功后打开主界面窗口
4. 主界面默认以最大化状态打开
5. 桌面端可在登录后读取当前 session 并展示基础用户信息
6. 提供退出登录能力
7. 桌面端界面风格与现有 `site-*` 产品保持一致

## 非目标

1. 本次不迁移完整管理路由与管理布局
2. 本次不接入 ORPC 管理接口
3. 本次不实现跨应用共享 session
4. 本次不实现跨设备共享登录态

## 方案

### 1. Rust 侧持有认证会话

桌面端不直接依赖 WebView 的浏览器 cookie 行为。

改为在 `src-tauri` 内通过 `reqwest::Client` + cookie store 管理登录态：

- 登录时由 Rust 命令请求 `service-internal`
- Better Auth 返回的 session cookie 存入 `reqwest` 的 cookie jar
- 后续 `getSession` 与 `signOut` 继续复用同一 client

这样可以避免：

- WebView 跨域 cookie 不稳定
- 桌面端 origin 与网页端 origin 不一致导致的 cookie 限制
- 前端直接管理认证 cookie 的复杂度

### 2. 持久化当前登录 cookie

为了避免每次重启应用都重新登录，桌面端在 Rust 侧额外持久化当前认证 cookie：

- 登录成功后，从当前 `reqwest` cookie jar 中提取对 `service-internal` 生效的请求 cookie
- 将 `baseURL` 与 cookie 字符串写入本地应用数据目录
- 应用下次启动时，先从本地文件恢复 cookie，再调用 `getSession` 校验
- 若服务端 session 仍有效，则直接进入主窗口
- 若服务端 session 已失效或恢复失败，则清理本地文件并回到登录窗口

这样可以保持认证模型仍然由 Better Auth session 驱动，而不是额外引入桌面端私有 token。

### 3. 提供三组 Tauri command

新增命令：

- `auth_sign_in`
- `auth_get_session`
- `auth_sign_out`

命令职责：

- `auth_sign_in`：用户名密码登录，并在成功后返回当前 session
- `auth_get_session`：返回当前内存中的登录态对应的服务端 session
- `auth_sign_out`：调用 Better Auth 退出登录接口，并清理本地 client

### 4. 配置内部服务地址

桌面端通过前端环境变量指定认证服务地址，例如：

- `VITE_INTERNAL_AUTH_URL=http://localhost:2998`

默认本地开发回退到 `http://localhost:2998`。

### 5. 双窗口壳层

桌面端改为两个窗口角色：

- `login`：应用启动时默认打开，仅承载登录流程
- `main`：登录成功后再创建，用于承载主界面

窗口流转规则：

- 应用启动后只显示 `login`
- `login` 启动时先调用 `auth_get_session`
- 若当前运行期内已有有效 session，则直接打开 `main` 并关闭 `login`
- 登录成功后创建 `main` 窗口，再关闭 `login`
- 退出登录后重新打开 `login`，并关闭 `main`

### 6. 主窗口默认最大化

`main` 窗口创建时显式设置 `maximized: true`，避免依赖用户手动调整窗口尺寸。

### 7. 前端分窗体渲染

继续使用单套 Vue 前端入口，但根据当前 Tauri 窗口 label 渲染不同界面：

- `login` 窗口：显示登录表单与登录态校验提示
- `main` 窗口：显示已登录用户信息和退出登录操作

这样可以避免额外引入路由层或多入口打包配置，同时保持窗口职责清晰。

### 8. 视觉风格对齐 `site-*`

桌面端界面不再使用独立的霓虹实验风格，改为对齐现有 `site-console` 一致的后台产品语言：

- 中性浅色背景 + 靛蓝主题色
- 清晰的卡片、边框、分栏与头部层级
- 低噪声、可读性优先的信息排布
- 登录窗口与主窗口共享同一套视觉 token

实现上不引入 Nuxt 运行时，仅在现有 Vue + Vite 前端内接入 Tailwind CSS，并手写适配桌面端的组件壳层。

## 风险与约束

### 1. 仍依赖 `service-internal` 的可达性

桌面端无法脱离 `service-internal` 独立认证。

### 2. 本地持久化数据仍需受操作系统保护

本次仅持久化 Better Auth cookie，不额外引入系统钥匙串集成，因此主要依赖应用数据目录权限隔离。

### 3. 权限判断只做基础校验

本次只需确认用户已登录，并展示角色信息；后续页面级能力控制应在完整管理壳层阶段继续建设。

### 4. 仅对齐视觉语言，不复刻完整网页组件系统

桌面端不会直接引入 `Nuxt UI`，而是只复用 `site-*` 的设计方向与样式原则。

## 验收标准

1. `app-console-desktop` 启动后先显示独立登录窗口，而不是模板页
2. 输入用户名密码后可通过 `service-internal` 登录
3. 登录成功后关闭登录窗口并打开主界面
4. 主界面首次打开时默认处于最大化状态
5. 主界面可展示当前用户与角色信息
6. 点击退出登录后可关闭主界面并重新回到登录窗口
7. 关闭并重新打开应用后，未过期 session 可直接恢复
8. 登录窗口与主窗口整体观感和 `site-console` 风格一致
9. 前后端代码通过基础类型检查或构建验证
