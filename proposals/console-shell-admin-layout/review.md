# console-shell 统一 admin 布局设计评审

## 评审结论

接受该设计方向，按“共享后台壳进入 `console-shell`，宿主仅保留运行时适配”推进。

## 评审要点

### 1. 为什么不能继续保留两套 `admin` 语义

因为当前 `site-console` 的 `admin` 是真实后台壳，而 `desktop` 的 `admin` 只是包装 `default`。这种语义分裂会持续制造误判，后续任何布局改动都要先判断“当前宿主的 `admin` 到底是不是后台壳本体”。

### 2. 为什么共享层应该放在 `console-shell`

因为两个宿主已经都扩展了 `@tcg-cards/console-shell`，并且 `console-shell` 已经承载了共享后台页面。后台壳与这些页面属于同一层级的共享前端结构，继续留在宿主内部只会形成反向依赖。

### 3. 为什么不应把后台壳控制面塞进 `console-platform`

`console-platform` 是通用平台能力接口，后台壳只是它的一个消费方。若把 session 恢复、初始路由修正、登录窗口切换等后台壳细节直接纳入 `console-platform`，会让本来通用的层被后台布局反向绑死。

### 4. 为什么 desktop 需要显式回到 `layout: 'admin'`

因为当前真正的后台壳放在 `default.vue` 中，本质上是一个历史性放置错误。只有让后台页面重新显式绑定 `admin`，布局名才重新具备可读性和稳定性。

## 需要注意的问题

- 共享布局中不得直接引用 `@tauri-apps/api` 或网页端私有 auth composable
- 宿主适配接口应只暴露后台壳所需状态与动作，不要泄漏业务页面数据
- desktop 迁移时要优先验证 session 失效与窗口切换路径，避免出现空白主窗口
- site-console 迁移后仍应保持当前 SSR 与 hydration 的稳定性
