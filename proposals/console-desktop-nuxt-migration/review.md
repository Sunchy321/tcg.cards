# console 桌面端 Nuxt 迁移评审

## 评审结论

建议按当前方案进入第一阶段实现。

## 通过理由

1. 当前用户偏好已经从“边界最干净”转向“尽量减少薄 wrapper 和 shared 心智负担”
2. 第一阶段只切换桌面端前端壳，不同时改动 `site-console` SSR / BFF，风险可控
3. 直接让 Nuxt 以 `srcDir: 'src'` 接管现有 `src/pages`，可以避免一开始生成大量 Nuxt page wrapper
4. 保留 Tauri 多窗口、认证桥接和命令层，能减少与 Rust 宿主的联动风险

## 主要风险

### 1. 第一阶段仍然保留旧页面组件目录

壳层切到 Nuxt 后，`src/pages` 仍会先以旧组件目录存在一段时间。

### 2. 旧页面目录会在一段时间内同时承担“历史实现”和“Nuxt 当前实现”

第一阶段虽然减少了新增 wrapper，但 `src/pages` 仍需要一段时间逐步去掉旧的 Vite 心智负担。

### 3. 不能误判为“已经完成 Web/Desktop 壳统一”

第一阶段只完成桌面端 Nuxt 化，不代表 `site-console` 已经能直接共享同一层 Nuxt 页面壳。

## 结论建议

先实施第一阶段：

1. 建立 Nuxt SPA 壳
2. 迁移桌面端主 layout
3. 直接让 Nuxt 接管现有 `src/pages`
4. 完成 Tauri 构建接线

在桌面端稳定后，再继续第二阶段的 Web/Desktop 共同 Nuxt 壳层收敛。
