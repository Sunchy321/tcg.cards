import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

import { runWithDb } from '@tcg-cards/db';
import { projectHsdata } from '../src/lib/hearthstone/hsdata-project';
import { getLocalDb } from '../src/lib/hearthstone/hsdata-local-db';
import { setLocalDatabaseUrlOverride } from '../src/runtime-config';

const sourceTag = Number(process.argv[2]);
const dryRun = !process.argv.includes('--write');
const force = process.argv.includes('--force');
const save = process.argv.includes('--save');
const reset = process.argv.includes('--reset');

if (Number.isNaN(sourceTag) || sourceTag <= 0) {
  console.error('Usage: bun run scripts/profile-project.ts <sourceTag> [--write] [--force] [--skip-latest] [--save]');
  process.exit(1);
}

const connectionString = process.env.DATABASE_URL ?? '';
if (connectionString.trim().length === 0) {
  console.error('Missing DATABASE_URL (use --env-file=packages/db/.env.local-dev)');
  process.exit(1);
}
setLocalDatabaseUrlOverride(connectionString);

// ── reset logic ────────────────────────────────────────────────────
async function resetProjectedRows(build: number) {
  const db = getLocalDb();
  const { sql } = await import('drizzle-orm');

  const tables = ['entity_relations', 'entity_localizations', 'entities'] as const;
  const resetStart = Date.now();
  let displayLines = 0;
  let currentTable = tables[0];
  let currentOp = 'update';

  function drawReset() {
    if (displayLines > 0) process.stdout.write(`\x1b[${displayLines}A\x1b[0J`);
    const rows: string[] = [];
    const elapsed = formatDuration(Date.now() - resetStart);

    rows.push(`── Reset build ${build}   ${elapsed} ──`);
    rows.push('');

    for (const t of tables) {
      const tblIdx = tables.indexOf(t);
      const curIdx = tables.indexOf(currentTable);
      const done = tblIdx < curIdx || (tblIdx === curIdx && currentOp === 'delete');

      let status: string;
      if (done) {
        status = '\x1b[32m✔\x1b[0m';
      } else if (t === currentTable) {
        status = '\x1b[33m●\x1b[0m';
      } else {
        status = '○';
      }

      const op = done ? 'done' : t === currentTable ? currentOp : 'pending';
      rows.push(`  ${status} ${t.padEnd(30)} ${op}`);
    }

    rows.push('');
    displayLines = rows.length;
    process.stdout.write(rows.join('\n') + '\n');
  }

  const resetInterval = setInterval(drawReset, 120);

  for (const table of tables) {
    currentTable = table;
    currentOp = 'update';
    drawReset();

    await db.execute(sql`
      update ${sql.raw(`hearthstone.${table}`)}
      set version = array_remove(version, ${build})
      where ${build} = any(version)
    `);

    currentOp = 'delete';
    drawReset();

    await db.execute(sql`
      delete from ${sql.raw(`hearthstone.${table}`)}
      where version = '{}'
    `);
  }

  clearInterval(resetInterval);
  if (displayLines > 0) process.stdout.write(`\x1b[${displayLines}A\x1b[0J`);
}

// ── types ──────────────────────────────────────────────────────────
interface StepRecord { step: string, elapsedMs: number, totalMs: number }

interface ProfileResult {
  timestamp: string; sourceTag: number; dryRun: boolean; force: boolean;
  totalMs: number; snapshotCount: number;
  insertedEntities: number; updatedEntities: number;
  insertedLocalizations: number; updatedLocalizations: number;
  insertedRelations: number; updatedRelations: number; steps: StepRecord[];
}

type PhaseName = 'loading_snapshots' | 'loading_tags' | 'projecting_snapshots' | 'summarizing_changes' | 'writing_rows';

interface PhaseState {
  label:     string;
  completed: number;
  total:     number;
  active:    boolean;
}

// ── display ────────────────────────────────────────────────────────
let displayLines = 0;
let startTime = Date.now();
const steps: StepRecord[] = [];
const phaseOrder: PhaseName[] = [
  'loading_snapshots', 'loading_tags', 'projecting_snapshots', 'summarizing_changes', 'writing_rows',
];
const phases: Record<PhaseName, PhaseState> = {
  loading_snapshots:    { label: 'Load snapshots', completed: 0, total: 0, active: true },
  loading_tags:         { label: 'Load tags', completed: 0, total: 0, active: false },
  projecting_snapshots: { label: 'Project', completed: 0, total: 0, active: false },
  summarizing_changes:  { label: 'Reconcile', completed: 0, total: 0, active: false },
  writing_rows:         { label: 'Write', completed: 0, total: 0, active: false },
};

function formatDuration(ms: number) {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m${Math.round((ms % 60000) / 1000)}s`;
}

function formatCount(n: number | undefined | null): string {
  if (n == null || n === 0) return '';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

function bar(completed: number, total: number, width = 28, indeterminate = false) {
  if (indeterminate) {
    const t = Math.floor((Date.now() / 120) % (width * 2));
    const pos = t < width ? t : width * 2 - t - 1;
    return '░'.repeat(pos) + '█' + '░'.repeat(width - pos - 1);
  }
  if (total <= 0) return '░'.repeat(width);
  const pct = Math.min(1, completed / total);
  const filled = Math.round(pct * width);
  return '█'.repeat(filled) + '░'.repeat(width - filled);
}

function drawScreen() {
  if (displayLines > 0) {
    process.stdout.write(`\x1b[${displayLines}A\x1b[0J`);
  }

  const elapsed = Date.now() - startTime;
  const rows: string[] = [];

  rows.push(`─`.repeat(72));
  rows.push(`sourceTag ${sourceTag}${dryRun ? ' dry' : ' write'}  ${formatDuration(elapsed)}`);
  rows.push(`─`.repeat(72));

  for (const key of phaseOrder) {
    const phase = phases[key];
    const indeterminate = phase.active && phase.total === 0;
    const b = bar(phase.completed, phase.total, 28, indeterminate);
    let count = '';
    if (phase.total > 0) {
      count = `${formatCount(phase.completed)} / ${formatCount(phase.total)}`;
    } else if (phase.active) {
      count = 'loading...';
    } else {
      count = 'pending';
    }

    const status = phase.active ? '\x1b[33m●\x1b[0m' : phase.total > 0 && phase.completed >= phase.total ? '\x1b[32m✔\x1b[0m' : '○';
    rows.push(`  ${status} ${phase.label.padEnd(16)} ${b}  ${count}`);
  }

  rows.push(`─`.repeat(72));

  displayLines = rows.length;
  process.stdout.write(rows.join('\n') + '\n');
}

function renderLoop() {
  drawScreen();
  return setInterval(drawScreen, 120);
}

// ── profile save ───────────────────────────────────────────────────
function saveProfile(result: ProfileResult) {
  const dir = resolve(import.meta.dirname, '../profiles');
  const ts = result.timestamp.replace(/[:.]/g, '-');
  const filename = `project-${result.sourceTag}-${ts}.json`;
  const path = resolve(dir, filename);
  try { mkdirSync(dir, { recursive: true }); } catch {}
  writeFileSync(path, JSON.stringify(result, null, 2));
  console.log(`\nSaved: profiles/${filename}`);
}

// ── run ────────────────────────────────────────────────────────────
let currentPhase: PhaseName = 'loading_snapshots';

try {
  if (reset) {
    await resetProjectedRows(sourceTag);
  }

  startTime = Date.now();
  const interval = renderLoop();

  const report = await runWithDb(getLocalDb(), () => projectHsdata({
    sourceTag,
    dryRun,
    force,
    onProfileMark({ step, elapsedMs, totalMs }) {
      steps.push({ step, elapsedMs, totalMs });
    },
    onProgress(progress) {
      // Mark previous phases as complete when moving to a new phase
      if (progress.phase !== currentPhase && progress.phase in phases) {
        // Complete previous phases up to the new one
        const newIdx = phaseOrder.indexOf(progress.phase as PhaseName);
        for (let i = 0; i <= newIdx; i++) {
          const key = phaseOrder[i];
          phases[key].active = (key === progress.phase);
          if (i < newIdx) {
            // Mark as complete
            if (phases[key].total === 0) phases[key].total = 1;
            phases[key].completed = phases[key].total;
          }
        }
        currentPhase = progress.phase as PhaseName;
      }

      // Update current phase progress using work counters (primary) or snapshot counters (fallback)
      const phase = phases[progress.phase as PhaseName] ?? phases[currentPhase];
      if (!phase) return;

      // Use work counters when available (most phases use these for progress)
      if (progress.totalWorkCount != null) {
        phase.total = progress.totalWorkCount;
        if (progress.completedWorkCount != null) {
          phase.completed = progress.completedWorkCount;
        }
      }
      // Fall back to snapshot counters for phases that only set those
      else if (progress.totalSnapshotCount != null) {
        phase.total = progress.totalSnapshotCount;
        if (progress.completedSnapshotCount != null) {
          phase.completed = progress.completedSnapshotCount;
        }
      }

      // Write phase: use writeBreakdown if available for more accurate progress
      if (progress.phase === 'writing_rows' && progress.writeBreakdown) {
        const wb = progress.writeBreakdown;
        phase.completed = wb.entity.completedRowCount
          + wb.localization.completedRowCount
          + wb.latest.completedRowCount
          + wb.relation.completedRowCount;
        phase.total = wb.entity.totalRowCount
          + wb.localization.totalRowCount
          + wb.latest.totalRowCount
          + wb.relation.totalRowCount;
      }
    },
  }));

  clearInterval(interval);

  // Clear display area
  if (displayLines > 0) {
    process.stdout.write(`\x1b[${displayLines}A\x1b[0J`);
  }

  const totalMs = Date.now() - startTime;
  const timestamp = new Date().toISOString();

  console.log(`\n${'─'.repeat(80)}`);
  console.log(`sourceTag: ${sourceTag}  |  snapshots: ${report.snapshotCount}  |  total: ${formatDuration(totalMs)}`);
  console.log(`dryRun: ${dryRun}`);
  if (!dryRun) {
    console.log(`entities: +${report.insertedEntities} ~${report.updatedEntities}  |  localizations: +${report.insertedLocalizations} ~${report.updatedLocalizations}  |  relations: +${report.insertedRelations} ~${report.updatedRelations}`);
  }

  console.log(`\nPhase breakdown:`);
  for (const step of steps) {
    const pct = step.totalMs > 0 ? ((step.elapsedMs / step.totalMs) * 100).toFixed(1) : '0.0';
    const bars = '█'.repeat(Math.min(40, Math.round(step.elapsedMs / Math.max(1, totalMs) * 40)));
    console.log(`  ${step.step.padEnd(46)} ${String(step.elapsedMs).padStart(6)}ms (${String(pct).padStart(5)}%) ${bars}`);
  }

  console.log(`\nTop 10:`);
  for (const [i, step] of [...steps].sort((a, b) => b.elapsedMs - a.elapsedMs).entries()) {
    if (i >= 10) break;
    const pct = ((step.elapsedMs / totalMs) * 100).toFixed(1);
    console.log(`  ${String(i + 1).padStart(2)}. ${step.step.padEnd(46)} ${formatDuration(step.elapsedMs).padStart(7)} (${String(pct).padStart(5)}%)`);
  }

  if (save) {
    saveProfile({
      timestamp, sourceTag, dryRun, force, totalMs,
      snapshotCount:         report.snapshotCount,
      insertedEntities:      report.insertedEntities,
      updatedEntities:       report.updatedEntities,
      insertedLocalizations: report.insertedLocalizations,
      updatedLocalizations:  report.updatedLocalizations,
      insertedRelations:     report.insertedRelations,
      updatedRelations:      report.updatedRelations,
      steps,
    });
  }

  // Close the local db connection so Bun can exit
  await getLocalDb().$client.end({ timeout: 1 });
} catch (error) {
  if (displayLines > 0) {
    process.stdout.write(`\x1b[${displayLines}A\x1b[0J`);
  }
  console.error('Projection failed:', error instanceof Error ? error.message : String(error));
  await getLocalDb().$client.end({ timeout: 1 }).catch(() => {});
  process.exit(1);
}
