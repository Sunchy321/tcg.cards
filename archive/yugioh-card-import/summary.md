# 游戏王第一版卡牌数据导入总结

未来查阅请先阅读本文件。仅在需要详细设计理由、复核历史或实施步骤时，再打开 `design.md`、`review.md` 或 `plan.md`。

## 已完成内容

- 在 `yugioh` 中新增可独立查询和导出的卡牌事实表，内部主键为自增长 BIGINT，cid 与八位卡密可空且非空唯一，删除使用 `deleted_at`。
- 在 local `yugioh_data` 中新增来源映射、导入批次、失败、状态、发布计划和 baseline；remote 只增加 desktop 写入的发布 ledger。
- desktop runtime 固定下载百鸽 `cards.zip`，在内存中进行受限 ZIP/JSON 校验、字段规范化、逐条错误隔离、幂等导入和软删除恢复。
- 测试 remote 发布采用方案 A：显式保留 local card ID，预检目标指纹、ledger、唯一身份和 manifest 漂移，支持分块恢复，完成后校准 identity sequence。
- 游戏王 desktop 设置页提供显式导入、统计、测试目标安全保存、连接测试和发布操作；启动和普通前端部署不会自动写库。

## 已完成的静态与数据源验证

- runtime 全量测试：51 项通过。
- DB TypeScript typecheck、local/remote Drizzle check、Rust `cargo check --lib` 均通过。
- 真实百鸽 ZIP：14,251 条有效记录、0 条解析失败；青眼白龙为 `cid=4007`、卡密 `89631139`。
- runtime 全量 TypeScript typecheck 被本任务前已存在的 Hearthstone/console-api 类型错误阻断，输出中没有游戏王相关诊断。
- 未启动项目、未连接数据库、未修改 production；真实 local 两次导入与测试 remote 发布需要在目标环境按下列步骤验收。

## 自助执行命令

只使用开发/测试环境文件，不要运行 remote production 脚本：

```powershell
Push-Location packages/db
bun run db:migrate:local:dev
bun run db:migrate:remote:dev
bun run typecheck
bun run db:check:local
bun run db:check:remote
Pop-Location

Push-Location apps/service-desktop-runtime
bun test
Pop-Location

Push-Location apps/app-console-desktop/src-tauri
cargo check --lib
Pop-Location
```

迁移后，在 desktop 的“设置 → 游戏 → 游戏王”中：

1. 连续执行两次“下载并导入”。
2. 保存环境固定为 `test` 的目标，执行连接测试。
3. 执行发布；如果中断，重新执行发布以恢复同一未完成批次。
4. 分别连接 local 和测试 remote，执行下面的 SQL。

## local 验收 SQL

```sql
select id, cid, password, sc_name, deleted_at
from yugioh.cards
where cid = 4007 or password = '89631139'
order by id;

select cid, count(*)
from yugioh.cards
where cid is not null
group by cid
having count(*) > 1;

select password, count(*)
from yugioh.cards
where password is not null
group by password
having count(*) > 1;

select id, cid, sc_name
from yugioh.cards
where password is null
order by id
limit 20;

select count(*) as total_count,
       count(*) filter (where deleted_at is null) as active_count
from yugioh.cards;

select id, status, source_record_count,
       added_count, updated_count, skipped_count, failed_count, soft_deleted_count,
       archive_hash, started_at, completed_at
from yugioh_data.import_batches
order by started_at desc
limit 2;

select batch_id, source_record_id, stage, code, message
from yugioh_data.import_failures
order by created_at desc
limit 50;

select publish_target_id, environment, target_fingerprint,
       manifest_hash, total_row_count, batch_id, published_at
from yugioh_data.publish_baselines;
```

预期：青眼白龙的两个条件命中同一行；两项重复查询均返回零行；无卡密查询能返回带内部 ID 的记录；第二次相同来源导入不增加总数，通常表现为 `added_count=0`、`updated_count=0` 且有效记录进入 `skipped_count`。

## 测试 remote 验收 SQL

```sql
select id, cid, password, sc_name, deleted_at
from yugioh.cards
where cid = 4007 or password = '89631139'
order by id;

select count(*) as total_count,
       count(*) filter (where deleted_at is null) as active_count,
       min(id) as min_id,
       max(id) as max_id
from yugioh.cards;

select publish_target_id, environment, target_fingerprint,
       manifest_hash, total_row_count, batch_id, published_at
from yugioh_data.publish_ledgers;

select last_value, is_called
from yugioh.yugioh_cards_id_seq;
```

将 remote ledger 与 local baseline 的 `publish_target_id`、`environment`、`target_fingerprint`、`manifest_hash`、`total_row_count` 和 `batch_id` 逐项比较，必须完全一致。remote 的领域总数和 ID 边界也必须与 local 一致；非空表的 sequence `last_value` 应等于 `max(id)` 且 `is_called=true`。
