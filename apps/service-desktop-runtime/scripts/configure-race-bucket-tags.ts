#!/usr/bin/env bun

/**
 * One-time migration for Hearthstone raceBucket:
 *
 * 1. Configure the BACON_SUBSET_* tags so projections populate
 *    entities.raceBucket as an array (a card can belong to several
 *    Battlegrounds race buckets, e.g. heroes and magic items). Also fixes each
 *    tag's raw_name / raw_names to the real tag name.
 * 2. Reset the projection state of every snapshot that carries a BACON_SUBSET
 *    tag to not_projected, and reset the corresponding patch_states rows to
 *    projection_status = not_started, so the normal projection task re-projects
 *    them and raceBucket is backfilled across all of a card's versions. The
 *    caller runs the projection task afterwards.
 *
 * The tag config mirrors the dual-race tags: bool_from_int + append_string_array
 * + projectConfig.value. enumId → race slug comes from
 * references/hearthstone/raw/tag/map/race-bucket.yml.
 *
 * Precondition: the race_bucket DB column must be `text[]` (apply the generated
 * Drizzle migration first); projections write array values into it.
 *
 * Usage:
 *   DESKTOP_LOCAL_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/local \
 *     bun run apps/service-desktop-runtime/scripts/configure-race-bucket-tags.ts [--dry-run] [--config-only]
 *
 *   --dry-run      preview both phases without writing anything
 *   --config-only  only configure the tags, skip the marking phase
 */

import { createHash } from 'node:crypto';

import { and, eq, inArray } from 'drizzle-orm';

import { FieldWinner, Tag, ExtractedCard, ExtractedCardTag, PatchState } from '@tcg-cards/db/schema/local/hearthstone';
import {
  applyTagCommit,
  buildClientMutationId,
  buildFallbackBaseRevision,
  saveTagEdit,
  toTagEntityKey,
  toTagFieldPath,
  type TagRow,
} from '@tcg-cards/console-api/lib/hearthstone/tag-commit';
import type { TagUpdateInput } from '@tcg-cards/model/hearthstone/schema/tag';

import { getLocalDb } from '../src/lib/hearthstone/hsdata-local-db';
import { readEditorIdentity } from '../src/runtime-config';

process.env.DESKTOP_LOCAL_DATABASE_URL ??= 'postgresql://postgres:postgres@localhost:5432/local';

interface RaceBucketSpec {
  enumId:  number;
  race:    string;
  rawName: string;
}

// BACON_SUBSET_* tags that assign a Battlegrounds race bucket to a card.
const RACE_BUCKET_TAGS: RaceBucketSpec[] = [
  { enumId: 1591, race: 'dragon',    rawName: 'BACON_SUBSET_DRAGON' },
  { enumId: 1592, race: 'murloc',    rawName: 'BACON_SUBSET_MURLOC' },
  { enumId: 1593, race: 'demon',     rawName: 'BACON_SUBSET_DEMON' },
  { enumId: 1594, race: 'beast',     rawName: 'BACON_SUBSET_BEAST' },
  { enumId: 1595, race: 'mech',      rawName: 'BACON_SUBSET_MECH' },
  { enumId: 1596, race: 'pirate',    rawName: 'BACON_SUBSET_PIRATE' },
  { enumId: 1688, race: 'elemental', rawName: 'BACON_SUBSET_ELEMENTALS' },
  { enumId: 1845, race: 'quilboar',  rawName: 'BACON_SUBSET_QUILLBOAR' },
  { enumId: 2272, race: 'naga',      rawName: 'BACON_SUBSET_NAGA' },
  { enumId: 2347, race: 'undead',    rawName: 'BACON_SUBSET_UNDEAD' },
];

const dryRun = process.argv.includes('--dry-run');
const configOnly = process.argv.includes('--config-only');

const db = getLocalDb();

const options = {
  syncStatus:     'pending_push',
  editorRuntime:  'desktop',
  editorIdentity: readEditorIdentity(),
  editorSource:   'manual',
  conflictTarget: { processingSide: 'local', processingStage: 'apply' },
} satisfies Parameters<typeof saveTagEdit>[2];

// ── row_create bookkeeping helpers (mirror tag-commit internals) ─────────

function stableStringify(value: unknown): string {
  if (value == null || typeof value !== 'object') {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map(item => stableStringify(item)).join(',')}]`;
  }

  const entries = Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right));

  return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`).join(',')}}`;
}

function hashRevision(value: unknown): string {
  return `sha256:${createHash('sha256').update(stableStringify(value), 'utf8').digest('hex')}`;
}

function rowToTagWrite(row: TagRow) {
  return {
    slug:              row.slug,
    slugAliases:       row.slugAliases,
    name:              row.name,
    rawName:           row.rawName,
    rawType:           row.rawType,
    rawNames:          row.rawNames,
    normalizeKind:     row.normalizeKind,
    normalizeConfig:   row.normalizeConfig,
    projectTargetType: row.projectTargetType,
    projectTargetPath: row.projectTargetPath,
    projectKind:       row.projectKind,
    projectConfig:     row.projectConfig,
    status:            row.status,
    description:       row.description,
  };
}

function buildRowCreateCommit(enumId: number, row: TagRow) {
  return {
    entityType:             'tag',
    entityKey:              toTagEntityKey(enumId),
    fieldPath:              'tag',
    value:                  rowToTagWrite(row),
    operation:              'set',
    commitKind:             'row_create' as const,
    clientMutationId:       buildClientMutationId(enumId, `tag:row_create:${Date.now()}`),
    editorRuntime:          options.editorRuntime,
    editorIdentity:         options.editorIdentity,
    editorSource:           options.editorSource,
    expectedRowRevision:    '',
    expectedWinnerRevision: null,
    baseRevision:           hashRevision({
      entityType:            'tag',
      entityKey:             toTagEntityKey(enumId),
      fieldPath:             'tag',
      resolvedBaseValue:     rowToTagWrite(row),
      resolvedSource:        'auto:hsdata',
      resolutionMode:        'rule_auto',
      resolutionFingerprint: 'hearthstone-tag-hsdata-discovery:v1',
    }),
    reviewStatus:     'auto_approved',
    reviewedBy:       null,
    reviewedAt:       null,
    reviewReason:     null,
    projectionStatus: 'pending',
    syncStatus:       options.syncStatus,
    createdAt:        new Date(),
    projectedAt:      null,
  };
}

/** Inserts a missing tag row with the target config plus row_create bookkeeping. */
async function createTagRow(spec: RaceBucketSpec, target: TagUpdateInput) {
  await db.transaction(async tx => {
    const inserted = await tx.insert(Tag).values({
      enumId:             spec.enumId,
      slug:               target.slug,
      slugAliases:        target.slugAliases,
      name:               target.name,
      rawName:            target.rawName,
      rawType:            target.rawType,
      rawNames:           target.rawNames,
      normalizeKind:      target.normalizeKind,
      normalizeConfig:    target.normalizeConfig,
      projectTargetType:  target.projectTargetType,
      projectTargetPath:  target.projectTargetPath,
      projectKind:        target.projectKind,
      projectConfig:      target.projectConfig,
      status:             target.status,
      description:        target.description,
      firstSeenSourceTag: null,
      lastSeenSourceTag:  null,
    }).returning().then(rows => rows[0]);

    if (!inserted) {
      throw new Error(`Failed to insert tag ${spec.enumId}`);
    }

    await applyTagCommit(tx, buildRowCreateCommit(spec.enumId, inserted), {
      conflictTarget: options.conflictTarget,
    });

    for (const field of ['normalizeKind', 'status'] as const) {
      await tx.insert(FieldWinner).values({
        entityType:    'tag',
        entityKey:     toTagEntityKey(spec.enumId),
        fieldPath:     toTagFieldPath(field),
        winnerValue:   inserted[field],
        winnerSource:  'auto:hsdata',
        status:        'active',
        sourceRuntime: options.editorRuntime,
        updatedBy:     options.editorIdentity,
        baseRevision:  buildFallbackBaseRevision(inserted, field),
      });
    }
  });
}

/** Target tag configuration for one BACON_SUBSET tag. */
function buildTarget(spec: RaceBucketSpec, existing?: TagRow): TagUpdateInput {
  return {
    enumId:            spec.enumId,
    slug:              `bacon-subset-${spec.race}`,
    slugAliases:       existing?.slugAliases ?? [],
    name:              spec.rawName,
    rawName:           spec.rawName,
    rawType:           existing?.rawType ?? 'Int',
    rawNames:          [spec.rawName],
    normalizeKind:     'bool_from_int',
    normalizeConfig:   {},
    projectTargetType: 'entity',
    projectTargetPath: 'raceBucket',
    projectKind:       'append_string_array',
    projectConfig:     { value: spec.race },
    status:            'configured',
    description:       existing?.description ?? null,
  };
}

function currentSummary(row: TagRow | undefined) {
  if (!row) {
    return '(missing)';
  }
  return `${row.normalizeKind} / ${row.projectKind ?? '-'} → ${row.projectTargetPath ?? '-'} (${row.status})`;
}

// ── Phase 1: tag configuration ────────────────────────────────────────────

async function configureTags() {
  console.log(`[phase 1] configuring ${RACE_BUCKET_TAGS.length} BACON_SUBSET tags${dryRun ? ' (dry-run)' : ''}`);

  for (const spec of RACE_BUCKET_TAGS) {
    const existing = await db.select()
      .from(Tag)
      .where(eq(Tag.enumId, spec.enumId))
      .then(rows => rows[0]);

    const target = buildTarget(spec, existing);

    if (dryRun) {
      const raw = existing && (existing.rawName !== spec.rawName || JSON.stringify(existing.rawNames) !== JSON.stringify([spec.rawName]));
      console.log(`[dry-run] ${spec.enumId} (${spec.rawName}): ${currentSummary(existing)} → bool_from_int / append_string_array → raceBucket+='${spec.race}' (slug ${target.slug}, status configured${raw ? ', raw_name/raw_names → ' + spec.rawName : ''})`);
      continue;
    }

    if (!existing) {
      await createTagRow(spec, target);
      console.log(`[created] ${spec.enumId} (${spec.rawName}): configured → raceBucket+='${spec.race}'`);
      continue;
    }

    const updated = await db.transaction(async tx => await saveTagEdit(tx, target, options));
    console.log(`[configured] ${spec.enumId} (${spec.rawName}): ${currentSummary(existing)} → ${updated.normalizeKind} / ${updated.projectKind ?? '-'} → ${updated.projectTargetPath ?? '-'} (${updated.status})`);
  }
}

// ── Phase 2: mark affected snapshots as not_projected ─────────────────────

/** Resets the projection state of every snapshot that carries a BACON_SUBSET
 *  tag (value 1), so the normal projection task re-projects them and raceBucket
 *  is backfilled across all of a card's versions. */
async function markAffectedSnapshots() {
  const tagIds = RACE_BUCKET_TAGS.map(s => s.enumId);

  const tagged = await db.selectDistinct({ snapshotId: ExtractedCardTag.snapshotId })
    .from(ExtractedCardTag)
    .where(and(inArray(ExtractedCardTag.tagId, tagIds), eq(ExtractedCardTag.tagValue, 1)));
  const snapshotIds = [...new Set(tagged.map(row => row.snapshotId))];
  if (snapshotIds.length === 0) {
    console.log('[phase 2] no snapshots carry a BACON_SUBSET tag');
    return;
  }

  const snapshots = await db.select({
    id:              ExtractedCard.id,
    cardId:          ExtractedCard.cardId,
    buildNumbers:    ExtractedCard.buildNumbers,
    projectionState: ExtractedCard.projectionState,
  }).from(ExtractedCard).where(inArray(ExtractedCard.id, snapshotIds));

  const cards = new Set(snapshots.map(s => s.cardId));
  const byBuild = new Map<number, number>();
  for (const snapshot of snapshots) {
    for (const build of snapshot.buildNumbers) {
      byBuild.set(build, (byBuild.get(build) ?? 0) + 1);
    }
  }
  const alreadyNotProjected = snapshots.filter(s => s.projectionState === 'not_projected').length;

  console.log(`[phase 2] ${snapshots.length} snapshot(s) across ${cards.size} card(s) / ${byBuild.size} build(s)${dryRun ? ' would be marked' : ' marked'} as not_projected (${alreadyNotProjected} already not_projected)`);
  const patchBuilds = [...byBuild.keys()].sort((a, b) => a - b);
  for (const build of patchBuilds) {
    console.log(`  build ${build}: ${byBuild.get(build)} snapshot(s)`);
  }

  if (!dryRun) {
    await db.update(ExtractedCard)
      .set({ projectionState: 'not_projected' })
      .where(inArray(ExtractedCard.id, snapshotIds));

    // Reset the affected patches' projection status so the projection task
    // re-runs them instead of treating them as already completed.
    if (patchBuilds.length > 0) {
      await db.update(PatchState)
        .set({ projectionStatus: 'not_started', projectionError: null, projectedAt: null })
        .where(inArray(PatchState.buildNumber, patchBuilds));
    }
  }

  console.log(`[phase 2] done. Patch projection status reset for ${patchBuilds.length} build(s). Run the projection task for the build(s) above to re-project these snapshots.`);
}

// ── main ─────────────────────────────────────────────────────────────────

console.log(`raceBucket migration (dry-run=${dryRun}, config-only=${configOnly}) on ${process.env.DESKTOP_LOCAL_DATABASE_URL ?? 'local db'}`);

await configureTags();

if (!configOnly) {
  await markAffectedSnapshots();
}

await (db as unknown as { $client: { end(): Promise<void> } }).$client.end();
