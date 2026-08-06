# 游戏王第一版主卡图导入设计

## 背景与目标

游戏王第一版卡牌基础事实已经由 desktop 从百鸽 `cards.zip` 幂等导入 local PostgreSQL，并可按方案 A 保留本地卡牌 ID 发布到测试 remote。本需求补充每张卡的一张 `ygopro` 主卡图，使 desktop 能从百鸽主动提供的机器清单下载、校验并构建与现有 Cloudflare R2 asset bucket 兼容的本地目录。

第一版目标：

1. 只使用百鸽公开说明的 `ygopro` metadata 和 WebP CDN，不解析 HTML。
2. 以八位卡密关联卡牌，不使用卡名或 cid 猜测图片。
3. desktop 下载到本地 R2-layout bucket，数据库不保存图片二进制。
4. 重复运行幂等，只下载新增、变化或本地缺失/损坏的图片。
5. 单张下载、格式或校验错误不会静默破坏整批。
6. 当前主图事实随现有 `yugioh.cards` 和方案 A 发布器同步到 remote。
7. R2 文件同步沿用 Hearthstone 的独立执行模式，不让网站启动或普通部署自动抓取图片。

不包含：

- 简中、日文、英文等多语言卡面选择。
- 异画、一张卡多图或图片历史浏览。
- 裁切、缩略图生成和图片编辑。
- 自动清理 R2 或本地 bucket 中不再引用的旧内容寻址对象。
- 卡包、禁限和其他卡牌来源。

## 已确认来源

- metadata：`https://cdn.233.momobako.com/ygoimg/ygopro/metadata`
- WebP：`https://cdn.233.momobako.com/ygoimg/ygopro/{cardid}.webp`
- 来源说明：`https://ygocdb.com/api`
- 来源标识：`ygocdb_ygopro`
- R2 逻辑 bucket：沿用现有默认值 `asset`

百鸽说明 metadata 每行包含文件名、字节数、修改时间和 MD5。2026-08-06 的只读检查结果为 14,950 行、全部符合格式、总字节数约 1.90 GiB；其中包含一条不对应领域卡牌的特殊记录 `0.webp`，该记录只计入未关联来源。本地 14,206 张有卡密卡牌全部能通过去除左侧补零后的卡密命中 metadata；45 张无卡密卡牌不参与下载。

metadata 示例：

```text
7894706.webp:162982,1785484410,802f71b77d2f267c636ba9ff4631c915
```

文件名使用十进制卡密，不保证保留八位前导零。领域表仍保存规范化八位卡密；映射用来源记录 ID 使用 `String(Number(password))` 生成，但下载 URL 必须保留 metadata 中的原始文件名。特殊来源记录 `0` 不映射卡牌。任何映射都不得使用卡名。

## 现有 Hearthstone 模式与复用范围

现有 Hearthstone 卡图流程提供两个有价值的 seam：

1. desktop 将最终 WebP 按确定性 R2 key 写入用户配置的本地 bucket 目录。
2. R2 上传通过现有 `R2_ASSET` 能力独立执行，并在数据库中记录 bucket、key、SHA-256、尺寸和状态。

游戏王复用这两个职责和路径约定，不复用 Hearthstone 的需求导出、PNG 渲染、`cwebp` 转换、卡面模板或 premium 变体实现。百鸽已经提供 WebP，游戏王 importer 直接校验并保存来源文件。

## 运行时与数据流

```text
百鸽 ygopro metadata
        ↓
desktop 解析完整机器清单
        ↓
按非空卡密关联 local yugioh.cards
        ↓
比较来源 MD5、大小、映射和本地文件
        ↓
并发下载需要新增/更新/恢复的 WebP
        ↓
校验大小、MD5、RIFF/WEBP、尺寸并计算 SHA-256
        ↓
写入本地 asset bucket 的确定性 R2 key
        ↓
逐条事务更新 yugioh.cards 图片事实与 yugioh_data 来源状态
        ↓
现有独立 R2 同步
        ↓
现有方案 A 卡牌发布器把图片事实发布到测试 remote
```

desktop 是下载和本地构建权威。remote 不运行 metadata 解析器，不自行从百鸽下载同一批图片，也不创建同一批卡牌事实。

## 表分类与 schema 依赖

### `yugioh`

第一版每张卡最多一张主图，因此不新增独立图片领域表，而是在 `yugioh.cards` 增加以下可导出事实：

- `primary_image_r2_bucket TEXT NULL`
- `primary_image_r2_key TEXT NULL`
- `primary_image_content_type TEXT NULL`
- `primary_image_byte_size INTEGER NULL`
- `primary_image_width INTEGER NULL`
- `primary_image_height INTEGER NULL`
- `primary_image_sha256 VARCHAR(64) NULL`
- `primary_image_deleted_at TIMESTAMPTZ NULL`

约束：

- 非空 `primary_image_r2_key` 唯一。
- SHA-256 必须是 64 位小写十六进制。
- byte size、width、height 必须为正数。
- 图片事实必须成组存在：有 key 时 bucket、content type、大小、尺寸和 SHA-256 均非空；没有 key 时这些字段均为空。
- 图片来源消失时保留原事实并设置 `primary_image_deleted_at`，不清空 key，不删除对象。

该选择符合第一版“不处理异画”的范围，并让现有卡牌 manifest 和方案 A 发布器直接覆盖图片事实。以后引入异画时，再通过单独设计把这些字段迁移为一对多图片实体。

### local `yugioh_data`

新增：

#### `image_import_batches`

- UUID 主键。
- 来源、metadata URL、metadata SHA-256、HTTP `etag`/`last_modified`。
- metadata 记录数、可关联卡牌数、无卡密卡牌数、未关联来源数。
- `added_count`、`updated_count`、`skipped_count`、`missing_count`、`failed_count`、`soft_deleted_count`、下载字节数。
- `running`、`completed`、`completed_with_errors`、`failed`、`interrupted` 状态、错误与时间。

#### `card_image_sources`

- 复合主键 `(source, source_record_id)`。
- `card_id` 外键指向 `yugioh.cards`；同一来源下一张卡最多一个 active 映射。
- 来源 URL、MD5、字节数、修改时间、最终 SHA-256 与 R2 key。
- 首次/最后看到批次、`retired_at` 与审计时间。

#### `image_import_failures`

- 以 `(batch_id, source_record_id)` 定位单条失败。
- 记录 `download`、`validation`、`write` 阶段、错误代码、消息和不含图片二进制的公开摘要。

#### `image_import_states`

- 以 source 为主键，记录最后成功批次、metadata hash、HTTP 元数据和更新时间。

所有外键方向均为 `yugioh_data → yugioh`；`yugioh` 不依赖 `yugioh_data`。

### remote `yugioh_data`

不新增卡图导入状态。remote 继续只接收现有卡牌发布 ledger；主图事实属于 `yugioh.cards` manifest 的一部分。

## R2 key 与本地文件

R2 key 使用内容寻址，避免覆盖已有缓存：

```text
yugioh/card/v1/primary/{sha256前两位}/{sha256}.webp
```

本地路径固定为 `join(bucketDir, ...r2Key.split('/'))`。key 完全由 importer 生成，不能包含来源路径或用户输入，因此不会发生目录穿越。

写入流程：

1. 在目标目录内写临时文件。
2. 校验写入字节数。
3. 原子 rename 到最终 key。
4. 如果最终文件已存在且 SHA-256 相同则复用；不同则报告冲突，不覆盖。

旧 hash 对象暂不删除；领域行只指向当前 key。这样失败恢复安全，也避免删除仍可能被 remote 或缓存引用的对象。

## metadata 解析

1. 响应必须成功，拒绝 HTML。
2. UTF-8 文本按 LF/CRLF 分行，忽略最后一个空行。
3. 每行必须严格匹配：`^([0-9]+)\.webp:([1-9][0-9]*),([0-9]+),([a-f0-9]{32})$`。
4. 来源记录 ID 必须是无前导符号的十进制整数文本；规范化时去除多余前导零。来源当前提供的特殊记录 `0` 可解析但永不参与卡牌映射，只计入 unmatched source。
5. size 必须在正整数和单图上限内；修改时间必须能转换为有效时间；MD5 转成小写。
6. 重复规范化来源记录 ID 属于快照级危险错误，整批失败。
7. 对规范化后的完整清单计算稳定 SHA-256。

## WebP 校验

每张下载图片必须：

- HTTP 成功且不是 HTML。
- 实际字节数与 metadata 完全一致。
- MD5 与 metadata 完全一致。
- 具有合法 `RIFF`/`WEBP` 容器和受支持的 `VP8 `、`VP8L` 或 `VP8X` 尺寸信息。
- 宽高均为正数并在合理上限内。
- 计算本项目使用的 SHA-256。

响应的 `Content-Type` 只作为提示，因为该 CDN 可以返回 `application/octet-stream`；文件签名是最终格式依据。

## 幂等导入算法

1. 用户在 desktop 显式点击导入；启动时不自动执行。
2. 把遗留的 `running` 图片批次标为 `interrupted`，创建新批次。
3. 下载并完整解析 metadata。网络、根格式、重复记录等结构错误发生在图片或领域写入前，整批标为 `failed`。
4. 读取全部 local 卡牌：
   - 非空卡密转成无前导零来源 ID并匹配 metadata。
   - 无卡密卡牌计入 unavailable，不创建失败。
   - metadata 中没有 local 卡牌的记录计入 unmatched source，不创建卡牌。
5. 对每张可关联卡牌判断：
   - 映射元数据相同、领域图片 active、目标文件存在且 SHA-256 正确：`skipped`。
   - 没有映射或领域图片：下载成功后 `added`。
   - metadata 变化、领域图片软删除、本地文件缺失或损坏：重新下载后 `updated`。
6. 下载使用有界并发，默认 6；每张图片独立校验和写文件。
7. 单张成功后用数据库事务更新卡牌图片事实和来源映射。单张失败只记录 failure 并继续。
8. 完整遍历后，退休本次 metadata 不再出现或不再能关联当前卡牌的 active 映射，并设置对应卡牌 `primary_image_deleted_at`。不删除本地/R2 文件。
9. 更新 import state 和批次统计。失败数为零时 `completed`，否则 `completed_with_errors`。

连续导入相同 metadata 且本地文件完整时，第二次不发起图片请求，全部有效图片进入 `skipped`。

## 卡牌发布扩展

现有卡牌发布 manifest、remote upsert 和最终一致性检查增加全部 `primary_image_*` 字段：

- local/remote 继续保留相同 `yugioh.cards.id`。
- 图片事实变化是普通 card `update`。
- 图片软删除通过 `primary_image_deleted_at` 发布，不物理删除 card 或对象。
- remote manifest 仍必须与 local 完全一致后才报告成功。

R2 文件同步保持独立执行，和现有 Hearthstone 页面声明的模式一致。发布数据库事实前，操作者应先把本地 asset bucket 同步到现有 `R2_ASSET`；第一版不在 desktop 保存 R2 access key，也不把网站启动变成上传触发器。

## Desktop 配置与交互

在 `games.yugioh.image.bucketDir` 保存本地 asset bucket 根目录。该路径可以与 Hearthstone 指向同一个物理 bucket，但两个游戏配置互不依赖。

游戏王设置页增加：

- 固定 metadata 来源展示。
- 本地 asset bucket 路径选择和保存。
- 预计首次下载约 1.90 GiB 的提示。
- 显式“导入主卡图”按钮。
- 当前进度、最近批次统计和失败摘要。
- 继续保留现有卡牌导入和测试 remote 发布功能。

页面不会展示内部 schema、R2 凭据或实现计划。完整下载必须由用户明确点击触发。

## 错误恢复与安全

- metadata 结构错误：整批失败，领域图片事实不变。
- 单张下载/校验错误：记录失败，原 active 图片事实保持不变。
- 文件已写入但数据库事务失败：留下无害的内容寻址对象；下次导入复用。
- 数据库成功但进程在批次完成前崩溃：下次标记旧批次 interrupted，依靠映射、hash 和文件校验幂等恢复。
- 来源记录消失：软删除图片事实，不删除卡牌和文件。
- 不记录响应图片字节、数据库连接字符串、R2 凭据或密码。
- 不提交本地 bucket、下载缓存、数据库文件或 `.env`。

## 验收方案

1. metadata 真实解析得到全部合法行，且能报告总文件数和总字节数。
2. 本地 14,206 张有卡密卡牌全部能匹配；45 张无卡密卡牌正常保留且无主图。
3. 青眼白龙通过卡密 `89631139` 下载、校验并写入确定性 bucket key。
4. 图片大小、MD5、SHA-256、WebP 尺寸和 R2 key 均落库。
5. 单张坏响应或 hash 错误只增加失败统计，不覆盖原图。
6. 连续导入两次时第二次不新增记录、不下载未变化图片。
7. 删除一个本地文件后重新导入会恢复文件并统计为更新。
8. metadata 中移除已映射记录时设置图片软删除时间，不删除卡牌。
9. 卡牌发布计划能检测图片事实变化，并按方案 A 保留卡牌 ID。
10. 不启动网站、不连接 production、不运行 lint、不提交图片缓存。

由于完整来源约 1.90 GiB，自动验证只下载青眼白龙和测试 fixture；完整首次导入由用户在 desktop 明确确认后执行。

## 预计修改范围

- `packages/db`：游戏王 shared card 图片事实、local 图片导入表和生成迁移。
- `apps/service-desktop-runtime`：metadata/WebP 解析、下载、bucket 写入、导入状态、发布字段和 oRPC。
- `apps/app-console-desktop`：游戏王图片 bucket 配置、Tauri 命令和设置页工作台。
- 不修改任何网站、watcher 或现有 Hearthstone 卡图实现。
