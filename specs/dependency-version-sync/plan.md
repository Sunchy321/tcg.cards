# 工作区显式依赖版本统一实施计划

## TODO List

- [x] 确认本轮统一范围与目标版本
- [x] 更新所有受影响 `package.json` 中的显式依赖版本
- [ ] 执行 `bun install` 同步 `bun.lock`
- [x] 运行依赖分叉检查与工作区类型检查

## 实施步骤

### 1. 确认统一基线

以提案中的目标版本表为准，确认本轮只处理 `dependencies` 与 `devDependencies` 的重复外部依赖分叉，不扩展到 `peerDependencies` 和依赖分类调整。

### 2. 批量更新清单

逐个更新受影响包的 `package.json`：

- 将低版本范围提升到目标版本
- 将 `latest` 替换为明确版本范围
- 将仅写法不同的版本声明统一为同一种写法

### 3. 刷新锁文件

在根目录执行 `bun install`，让锁文件反映新的显式依赖版本基线。

本次按用户要求暂不执行这一步，因此 `bun.lock` 仍未同步。

### 4. 执行验证

完成后执行两类验证：

- 重跑依赖分叉检查，确认纳入范围内不再存在多版本声明
- 运行 `bun run typecheck`，确认工作区没有明显类型回归

本次执行结果：

- 依赖分叉检查已通过，纳入范围的 `dependencies` / `devDependencies` 不再存在多版本声明
- `bun run typecheck` 已执行，但失败于 `packages/console-shell`
- 失败信息为 `sh: vue-tsc: command not found`
