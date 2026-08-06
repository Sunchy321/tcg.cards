# 游戏王第一版卡牌数据导入复核

## 复核范围

- 固定点：`ef7ba4b3f04676154c5583adaffa8b5e0e33a488`
- 标准轴：仓库 `AGENTS.md` 中的代码注释、架构边界、数据库迁移和交付规则。
- 规格轴：本包 `design.md` 与 `plan.md`。
- 排除：用户在 `apps/site-yugioh` 中已有的未提交改动。

## 标准轴结果

发现并修复一项低严重度硬规则问题：CRC 注释使用了仓库禁止的 “used to” 元措辞。复核后，新增函数和类型均有简短英文用途注释，schema 依赖方向正确，迁移保持为 Drizzle 生成结果。

## 规格轴结果

复核发现并关闭以下问题：

1. 发布前增加 remote ledger、目标指纹、基线 manifest 和实时领域 manifest 的联合漂移检查。
2. 恢复发布时，`pending` 行只允许处于基线值或计划值；`applied`/`skipped` 行必须严格等于计划值。
3. 失败块保持 `pending`，同时在逐行错误中记录失败原因，并在批次错误中记录明确 card ID。
4. 快照重复检查独立于其他字段校验，无效记录中的合法 cid 或卡密也不能绕过整批重复保护。
5. 补充软删除字段复制、sequence 校准状态、失败恢复和最终 manifest/行数一致性测试。
6. 根据实施验证修订 ZIP 设计：Bun 归档 API 当前没有该 ZIP 的读取接口，改用受限、内存内、带 CRC 与大小校验的 ZIP 解析器。

最终标准轴和规格轴复核均未留下高置信范围内问题。

## 验证结果

- `apps/service-desktop-runtime`：51 项测试通过。
- `packages/db`：TypeScript typecheck 通过；local/remote Drizzle check 通过，检查时 `DATABASE_URL` 为空。
- `apps/app-console-desktop/src-tauri`：`cargo check --lib` 通过。
- 真实百鸽 `cards.zip`：14,251 条有效记录、0 条解析失败；青眼白龙为 `cid=4007`、卡密 `89631139`。
- runtime 全量 TypeScript typecheck 仍被既有 Hearthstone/console-api 类型错误阻断；输出中没有游戏王相关诊断，本任务未越界修复这些既有错误。
- 按工作限制未启动项目、未连接数据库，因此 local 两次真实导入和测试 remote 发布留给环境验收命令执行；未连接或修改 production。
