# magic 卡图导入整合实施计划

**日期**：2026-09-09
**设计**：[design.md](./design.md)
**状态**：待执行

## 待办列表

- [x] 1. 抽出 runtime 共享管线模块（`fetch.ts` / `source.ts` / `ingest.ts` / 批次骨架）
- [x] 2. 新建 `magic_image_import_remote` 任务定义
- [x] 3. 新建 `magic_image_import_local` 任务定义
- [x] 4. 新建 `magic_image_import_single` 任务定义
- [x] 5. 注册三个新定义，删除三个旧定义
- [x] 6. 改造 `orpc/magic.ts`：三个 createTask procedure + `analyze` 改名
- [x] 7. 新增 `magic.images.compare` 比对查询
- [x] 8. 前端：`TaskResultCard` 增加 `labels` prop
- [x] 9. 前端：合并页面 `pages/magic/image-import/index.vue`
- [x] 10. 前端：比对卡片组件 `ImageCompareCard.vue`
- [x] 11. 删除三个旧页面目录
- [x] 12. 导航：删除「卡图导入」分组，在「数据管线」内新增叶子项
- [x] 13. 验证：类型检查 + 相关单测

## 实施步骤

### 1. runtime 共享管线模块

在 `apps/service-desktop-runtime/src/lib/magic/image-import/` 下新增：

- `fetch.ts`：`fetchImageBuffer(url)`，60s 超时、`user-agent: tcg-cards/desktop`、空响应返回 null。
- `source.ts`：图源描述表。每个图源提供面 URL 取法（scryfall `png ?? large`、gatherer `default ?? medium`）与期望面数 SQL；比对查询复用同一份取法。
- `ingest.ts`：`ingestFace(...)` 完成「编码 → 质量评估 → 落盘 → 合并 `image_info` → 按面更新 `image_status` → 可选清理 jpg」，并导出覆盖判定 `mayOverwrite` / `applySkipRules`。
- `batch.ts`：chunked 阶段的批次推进与计数累加 helper。

`common.ts` 的底层能力保持不变。

### 2–4. 三个新任务定义

`task/image-import-remote/`、`task/image-import-local/`、`task/image-import-single/`，各自只保留队列构造逻辑：

- remote：按 scope/lang 查印张 + 图源面 URL，chunked（批次 24、并发 4）。
- local：解析压缩包（平面命名 / 目录结构两种模式）+ 匹配印张，chunked（批次 10、串行）。
- single：定位一个印张，按来源决定面，simple stage。

三者输入输出按设计文档 5.2 / 3.5 落地；`force` 默认 `false`。

### 5. 注册与清理

`lib/task/task-definitions.ts` 注册三个新定义，移除三个旧定义；删除三个旧任务目录。

### 6–7. oRPC

- `createTask` 收敛为 `imageImportRemote` / `imageImportLocal` / `imageImportSingle`。
- `analyze.manualImportZip` 改名为 `analyze.imageArchive`。
- 新增 `images.compare`：输入 `{ set, lang, number }`，输出按设计文档第 6 节；复用 `source.ts` 与 `common.ts`，逐侧降级。

### 8–11. 前端

- `TaskResultCard.vue`：新增可选 `labels` prop，传入时按键名映射中文标签。
- `pages/magic/image-import/index.vue`：页头 + 导入区（来源 / 范围 / 系列 / 语言 / force / 清理 JPG / 压缩包 / 编号 / 面序号 / 文件）+ 报告卡片 + 折叠的比对卡片。
- `ImageCompareCard.vue`：读取页面表单的系列 / 语言 / 编号，调用 `images.compare`，并排展示两侧数据与结论。
- 删除 `pages/magic/image-import/{scryfall,gatherer,manual}/`。

### 12. 导航

`packages/console-core/src/layout.ts`：删除 magic 分支的「卡图导入」父分组，在「数据管线」组内 MTGCH 之后、投影之前插入 `{ label: '卡图导入', icon: 'i-lucide-image', to: '/${game}/image-import' }`。

### 13. 验证

- 对改动包跑类型检查。
- 跑 `image-import` 相关单测（`parse.test.ts`）。
- 手动核对三条旧路由已无引用。

## 风险与回滚

- 任务类型改名导致旧 `task_runs` 行不可重试——设计已接受，无历史 UI。
- 前端表单持久化键更换，用户首次进入需重选系列与语言。
- 若实现中发现共享管线无法同时满足远程与本地批量的差异（例如覆盖判定位置），回到设计文档 5.1 重新划边界，不要在两处各写一套。
