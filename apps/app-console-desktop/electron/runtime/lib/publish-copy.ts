import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

import type { createDb } from '@tcg-cards/db';

/** Database interface exposing the underlying PostgreSQL client. */
type PublishDb = ReturnType<typeof createDb>;

/** A transaction-bound client keeps COPY and its temporary table on the same connection. */
export type PublishTransaction = Parameters<Parameters<PublishDb['$client']['begin']>[1]>[0];

/** Streams PostgreSQL-encoded rows and keys into the remote transaction for set-based writes. */
export async function applyPublishCopy(
  tx: PublishTransaction,
  config: { schema: string, table: string, columns: string[], keys: string[], timestamps?: boolean },
  rows: string[],
  deletes: string[],
): Promise<void> {
  const { columns, keys } = config;
  const table = tx`${tx(config.schema)}.${tx(config.table)}`;
  const updatedAt = new Date().toISOString();
  const updates = columns.filter(name => !keys.includes(name) && name !== 'updated_at')
    .map(name => tx`${tx(name)} = excluded.${tx(name)}`);
  if (config.timestamps !== false) {
    updates.push(tx`updated_at = ${updatedAt}::timestamp`);
  }

  await tx`CREATE TEMP TABLE publish_stage (is_delete boolean, payload jsonb) ON COMMIT DROP`;
  const stream = await tx`COPY pg_temp.publish_stage FROM STDIN WITH (FORMAT csv)`.writable();
  await pipeline(Readable.from([
    ...rows.map(row => `false,"${row.replaceAll('"', '""')}"\n`),
    ...deletes.map(row => `true,"${row.replaceAll('"', '""')}"\n`),
  ]), stream);

  if (rows.length > 0) {
    await tx`
      INSERT INTO ${table} (${tx(columns)})
      SELECT ${tx(columns)} FROM pg_temp.publish_stage
      CROSS JOIN LATERAL jsonb_populate_record(NULL::${table}, payload) AS incoming
      WHERE NOT is_delete
      ON CONFLICT (${tx(keys)}) DO UPDATE SET ${updates.reduce((left, right) => tx`${left}, ${right}`)}
    `;
  }

  if (deletes.length > 0) {
    const matches = keys.map(key => tx`target.${tx(key)} = incoming.${tx(key)}`)
      .reduce((left, right) => tx`${left} AND ${right}`);
    const staged = tx`pg_temp.publish_stage
      CROSS JOIN LATERAL jsonb_populate_record(NULL::${table}, payload) AS incoming`;
    if (config.timestamps === false) {
      await tx`DELETE FROM ${table} AS target USING ${staged} WHERE is_delete AND ${matches}`;
    } else {
      await tx`
        UPDATE ${table} AS target SET deleted_at = ${updatedAt}::timestamp
        FROM ${staged}
        WHERE is_delete AND ${matches} AND target.deleted_at IS NULL
      `;
    }
  }

  await tx`DROP TABLE pg_temp.publish_stage`;
}
