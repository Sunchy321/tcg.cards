# 游戏王第一版主卡图导入总结

后续查阅请先阅读本文件。只有需要完整设计理由、复核历史或逐步实施记录时，再分别查看 `design.md`、`review.md` 和 `plan.md`。

## 交付结果

desktop 现在可以从百鸽公开的 YGOPRO metadata 下载 WebP 主卡图，在下载前校验清单格式，在单图写入前校验 HTTP、大小、MD5、WebP 容器和尺寸，并以 SHA-256 内容寻址 key 写入用户配置的本地 asset bucket。导入会报告新增、更新、跳过、缺失、失败、软删除和下载字节数；单图错误写入失败表并继续处理。

卡图通过八位卡密去除左侧补零后的来源 ID 关联，不使用卡名。无卡密卡牌继续依靠内部自增长 ID 存在，不产生图片失败。来源特殊记录 `0.webp` 可解析但永不映射，只计入未关联来源。

领域图片事实位于 `yugioh.cards`，来源映射、批次、失败和状态位于 local `yugioh_data`。方案 A 发布器保留本地自增长 ID，并把完整图片事实作为卡牌 manifest/upsert 的一部分发布到 remote；remote 不独立下载或创建同批事实。R2 文件上传仍由现有独立同步流程完成。

## 关键文件

- 数据库：`packages/db/src/schema/shared/yugioh/card.ts`、`packages/db/src/schema/local/yugioh/image-import.ts`。
- local migration：`packages/db/migrations/local/20260805200306_furry_raider/`。
- remote migration：`packages/db/migrations/remote/20260805200306_overjoyed_energizer/`。
- 来源与导入：`apps/service-desktop-runtime/src/lib/yugioh/image-source.ts`、`image-import.ts`。
- desktop：`apps/app-console-desktop/src-tauri/src/desktop_yugioh_image.rs`、`apps/app-console-desktop/src/pages/settings/games/yugioh.vue`。

## 已完成验证

- runtime 测试：63 项通过，0 项失败；隔离 PostgreSQL 集成测试因未提供显式测试数据库 URL 而跳过。
- DB typecheck、local/remote Drizzle check、Rust `cargo check --lib` 通过。
- 真实 metadata：14,950 条、2,041,699,644 字节，严格解析通过。
- 青眼白龙：来源 ID/卡密 `89631139`，真实 WebP 为 94,558 字节、680×986；MD5、SHA-256、本地写入和回读均通过。
- 完整约 1.90 GiB 下载、实际测试 remote 发布和 production 连接均未执行。
- Nuxt typecheck 因当前本地 npm 包解析错误未完成；未运行安装或 lint。

## 自行验证命令

以下命令都从仓库根目录执行，不会自动连接 production。数据库命令使用前应确认 `.env.local-dev` 和 `.env.remote-dev` 只指向预期的 local/test 环境。

```powershell
Push-Location packages/db
bun run typecheck
bun run db:check:local
bun run db:check:remote
bun run db:migrate:local:dev
Pop-Location

Push-Location apps/service-desktop-runtime
bun test
Pop-Location

Push-Location apps/app-console-desktop/src-tauri
cargo check --lib
Pop-Location
```

若要执行会自动创建并删除随机临时数据库的图片集成测试，连接用户必须拥有 `CREATE DATABASE` 权限，且 URL 必须指向专用测试 PostgreSQL 实例：

```powershell
Push-Location apps/service-desktop-runtime
$env:YUGIOH_IMAGE_TEST_DATABASE_URL = 'postgres://TEST_USER:TEST_PASSWORD@127.0.0.1:5432/postgres'
bun test src/lib/yugioh/image-import.integration.test.ts
Remove-Item Env:YUGIOH_IMAGE_TEST_DATABASE_URL
Pop-Location
```

完整卡图导入必须由操作者在 desktop 游戏王设置页先保存“本地卡图目录”，再明确点击“下载并导入卡图”。首次预计下载约 1.90 GiB。

## local 验收 SQL

```sql
-- 领域卡牌与主图覆盖情况。
select
  count(*) as total_cards,
  count(password) as cards_with_password,
  count(*) filter (
    where primary_image_r2_key is not null
      and primary_image_deleted_at is null
  ) as active_primary_images,
  count(*) filter (where password is null) as cards_without_password
from yugioh.cards;

-- 青眼白龙必须由 cid 和卡密定位到同一条内部 ID。
select
  id, cid, password,
  primary_image_r2_bucket,
  primary_image_r2_key,
  primary_image_content_type,
  primary_image_byte_size,
  primary_image_width,
  primary_image_height,
  primary_image_sha256,
  primary_image_deleted_at
from yugioh.cards
where cid = 4007 or password = '89631139'
order by id;

-- 结果应为空：cid 和非空卡密不能重复。
select cid, count(*) from yugioh.cards
where cid is not null group by cid having count(*) > 1;
select password, count(*) from yugioh.cards
where password is not null group by password having count(*) > 1;

-- 结果应为空：同一来源的一张卡不能有多个 active 图片映射。
select source, card_id, count(*)
from yugioh_data.card_image_sources
where retired_at is null
group by source, card_id
having count(*) > 1;

-- 最近图片导入统计；连续相同导入时第二批应主要为 skipped，且领域卡牌总数不增加。
select
  id, status, metadata_record_count, eligible_card_count,
  unavailable_card_count, unmatched_source_count,
  added_count, updated_count, skipped_count, missing_count,
  failed_count, soft_deleted_count, downloaded_byte_count,
  started_at, completed_at
from yugioh_data.image_import_batches
order by started_at desc
limit 5;

-- 单图错误应可审计，且不会静默终止整批。
select batch_id, source_record_id, stage, code, message, created_at
from yugioh_data.image_import_failures
order by created_at desc
limit 50;
```

## test remote 验收 SQL

完成本地 bucket 的独立资源同步并在 desktop 发布到绑定的 test remote 后，分别在 local 和 test remote 执行以下查询。两侧 `total_cards`、`active_primary_images` 和 `domain_hash` 必须一致；不要对 production 执行。

```sql
set timezone = 'UTC';

select
  count(*) as total_cards,
  count(*) filter (
    where primary_image_r2_key is not null
      and primary_image_deleted_at is null
  ) as active_primary_images,
  md5(string_agg(row_to_json(card_row)::text, E'\n' order by id)) as domain_hash
from yugioh.cards as card_row;
```

test remote 还应存在由 desktop 写入的最新发布账本：

```sql
select
  publish_target_id, environment, manifest_hash,
  total_row_count, changed_row_count, published_at
from yugioh_data.publish_ledgers
order by published_at desc
limit 5;
```
