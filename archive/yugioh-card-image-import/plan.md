# 游戏王第一版主卡图导入实施计划

## Todo

- [x] 新增主卡图领域字段、local 图片导入状态表并生成 local/remote Drizzle migration。
- [x] 先编写 metadata、WebP、下载校验和本地 bucket 写入测试，再实现来源模块。
- [x] 先编写幂等、恢复、软删除和单条失败测试，再实现图片导入模块。
- [x] 扩展方案 A 卡牌发布 manifest/upsert，并补充图片事实发布测试。
- [x] 接入 runtime 配置、进度状态和游戏王 oRPC 路由。
- [x] 接入 desktop 图片 bucket 设置与游戏王设置页工作台。
- [x] 运行相关测试、DB typecheck、Drizzle check、Rust check、真实 metadata 与青眼白龙单图验证。
- [x] 按设计与仓库规范复核，修复问题并归档设计包。

## 实施原则

- 只使用百鸽公开 `ygopro` metadata 和 WebP；禁止 HTML 解析。
- desktop 是下载与本地构建执行端；网站启动和普通部署不写数据库或抓图。
- 图片二进制只写用户配置的本地 asset bucket，不写 PostgreSQL 或 Git。
- R2 同步维持现有独立执行模式；本次不保存或读取 R2 access key。
- 第一版只处理一张主图，不实现异画、多语言、缩略图和对象垃圾回收。
- 不修改排除应用，不重构 Hearthstone 卡图模块，不运行 lint，不连接 production。

## 第一步：数据库 schema 与迁移

1. 在 shared `yugioh.cards` 增加成组的 `primary_image_*` 字段、格式检查、正数检查和唯一 R2 key。
2. 在 local `yugioh_data` 增加图片导入批次、来源映射、失败和状态表。
3. 更新 local schema 出口；remote 通过 shared card 自动获得同一领域字段。
4. 使用 `drizzle-kit generate` 生成 local/remote migration，不手改 snapshot 或生成 SQL。

验证：DB typecheck、Drizzle check、生成 SQL 的依赖方向与约束检查。

## 第二步：来源与本地 bucket

1. 用 fixture 覆盖合法 metadata、CRLF、尾空行、坏行、重复 ID、越界大小和 HTML。
2. 用最小 WebP fixture 覆盖 `VP8X`、`VP8L`、`VP8 ` 和损坏容器。
3. 实现 metadata 下载和稳定 hash；映射 ID 与卡密使用无前导零十进制值，下载保留 metadata 原始文件名。
4. 实现单图下载、大小/MD5/WebP/尺寸/SHA-256 校验。
5. 实现内容寻址 R2 key 和原子本地写入；同 hash 跳过、不同内容冲突。

验证：来源单测、临时目录 bucket 测试、真实 metadata 解析和青眼白龙单图下载。

## 第三步：幂等图片导入

1. 提取可纯测的身份匹配和 added/updated/skipped 决策。
2. 创建图片批次并中断遗留 running 批次。
3. 读取卡牌与来源映射，统计无卡密卡牌和未关联 metadata。
4. 使用有界并发逐图下载；每张成功后事务更新领域图片事实和映射。
5. 单条错误写 failure 并继续，原 active 图片事实不被坏响应覆盖。
6. 完整遍历后退休消失映射，并通过 `primary_image_deleted_at` 软删除。
7. 更新 import state 和批次统计。

验证：连续两次导入不重复下载、缺失文件恢复、来源变化更新、坏图隔离和软删除测试。

## 第四步：卡牌发布扩展

1. 把全部 `primary_image_*` 字段加入卡牌 canonical manifest。
2. 显式复制到 remote upsert values 和 conflict update。
3. 保持本地 card ID、ledger、漂移和恢复逻辑不变。

验证：图片字段变化产生 card update，remote values 完整保留 key/hash/尺寸/软删除时间。

## 第五步：runtime 与 desktop

1. 增加游戏王图片 bucket runtime override 和显式配置检查。
2. 增加图片导入状态、最近批次和执行 oRPC；与卡牌导入/发布共用互斥 job 状态。
3. 在 Tauri 配置中保存 `games.yugioh.image.bucketDir`，增加 get/set 命令并同步到 runtime。
4. 游戏王设置页增加 bucket 选择、预计 1.90 GiB 提示、显式导入按钮、进度和统计。

验证：TypeScript/Rust 静态检查，确认 onMounted 只读且完整下载只能由按钮触发。

## 第六步：交付验证

1. 运行新增测试、runtime 全量测试、DB typecheck、Drizzle check 和 Rust check；不运行 lint。
2. 解析真实 metadata，确认当前格式、覆盖率和总字节数。
3. 下载并校验青眼白龙单图，但不执行约 1.90 GiB 的完整导入。
4. 复核 git diff，确认没有图片、缓存、数据库、`.env` 或排除目录改动。
5. 使用双轴 review 检查仓库标准与 spec，修复范围内发现。
6. 完成后移动到 `archive/yugioh-card-image-import` 并添加 `summary.md`。
7. 给出建议的单行 Conventional Commit 消息，不创建 commit，等待用户确认。
