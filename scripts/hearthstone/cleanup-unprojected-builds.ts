#!/usr/bin/env bun

/**
 * Removes builds belonging to not_started source versions from all projection
 * table version arrays. Rows whose version becomes empty are deleted.
 *
 * Usage:
 *   bun --env-file=scripts/.env run scripts/hearthstone/cleanup-unprojected-builds.ts
 *   bun --env-file=scripts/.env run scripts/hearthstone/cleanup-unprojected-builds.ts --write
 */

import { eq, sql } from 'drizzle-orm';

import { Entity, EntityLocalization } from '@tcg-cards/db/schema/shared/hearthstone/entity';
import { EntityRelation } from '@tcg-cards/db/schema/shared/hearthstone/entity-relation';
import { SourceVersion } from '@tcg-cards/db/schema/local/hearthstone';

import { getDb } from '../lib/db';

const write = process.argv.includes('--write');

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

// ── run ──────────────────────────────────────────────────────────────────

const db = getDb();

const unprojectedBuilds = await db
  .select({ build: SourceVersion.build })
  .from(SourceVersion)
  .where(eq(SourceVersion.projectionStatus, 'not_started'));

const builds = [
  ...new Set(unprojectedBuilds.map(r => r.build).filter((b): b is number => b != null)),
].sort((a, b) => a - b);

if (builds.length === 0) {
  console.log('No unprojected builds found.');
  process.exit(0);
}

console.log(`Unprojected source versions: ${unprojectedBuilds.length}`);
console.log(`Unique builds to remove:     ${builds.length}`);
console.log(`Builds: ${builds.join(', ')}`);
console.log('');
console.log(`Mode: ${write ? 'WRITE' : 'DRY-RUN'}`);
console.log('');

const buildArr = sql`array[${sql.join(builds.map(b => sql`${b}`), sql`, `)}]::int[]`;
const removeExpr = sql`array(select unnest(version) except select unnest(${buildArr}))`;

const targets = [
  { name: 'entities',             table: Entity },
  { name: 'entity_localizations', table: EntityLocalization },
  { name: 'entity_relations',     table: EntityRelation },
] as const;

// Affected counts
let totalUpdate = 0;
let totalDelete = 0;

for (const t of targets) {
  const overlap = await db
    .select({ c: sql`count(*)` })
    .from(t.table)
    .where(sql`${t.table.version} && ${buildArr}`);

  const wouldDelete = await db
    .select({ c: sql`count(*)` })
    .from(t.table)
    .where(sql`cardinality(${removeExpr}) = 0 and ${t.table.version} && ${buildArr}`);

  const del = Number(wouldDelete[0]?.c ?? 0);
  const overlapCount = Number(overlap[0]?.c ?? 0);
  const upd = overlapCount - del;

  totalUpdate += upd;
  totalDelete += del;

  console.log(`  ${t.name.padEnd(24)} overlap ${formatCount(overlapCount).padStart(6)}  update ${formatCount(upd).padStart(6)}  delete ${formatCount(del).padStart(6)}`);

  // Samples
  if (overlapCount > 0) {
    const samples = await db
      .select({ version: t.table.version })
      .from(t.table)
      .where(sql`${t.table.version} && ${buildArr}`)
      .limit(3);

    for (const r of samples) {
      const overlapVals = r.version.filter(v => builds.includes(v));
      const remaining = r.version.filter(v => !builds.includes(v));
      console.log(`         → sample: [${r.version.join(',')}]`);
      console.log(`           removed: [${overlapVals.join(',')}]`);
      console.log(`           kept:    [${remaining.join(',')}] → ${remaining.length === 0 ? 'DELETE' : 'update'}`);
    }
  }
}

console.log('');
console.log(`  total: update ${formatCount(totalUpdate)}, delete ${formatCount(totalDelete)}`);

if (!write) {
  console.log('');
  console.log('DRY-RUN complete. Add --write to execute.');
  process.exit(0);
}

// ── write ────────────────────────────────────────────────────────────────
console.log('');
console.log('Executing...');

for (const t of targets) {
  const del = await db.execute(sql`
    delete from ${sql.raw(`hearthstone.${t.name}`)}
    where cardinality(${removeExpr}) = 0 and version && ${buildArr}
  `);
  const upd = await db.execute(sql`
    update ${sql.raw(`hearthstone.${t.name}`)}
    set version = ${removeExpr}, is_latest = false
    where version && ${buildArr}
  `);
  console.log(`  ${t.name}: deleted ${del.rowCount ?? 0}, updated ${upd.rowCount ?? 0}`);
}

console.log('');
console.log('Done.');
