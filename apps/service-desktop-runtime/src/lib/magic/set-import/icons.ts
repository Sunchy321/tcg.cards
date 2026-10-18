import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import type { SourceSeries } from './series';

/**
 * Series types whose catalog and detail pages resolve their icons to the parent
 * series, so no own default icon is written for them.
 */
const inheritedIconTypes = ['promo', 'token', 'memorabilia', 'funny'];

/**
 * mtg-vectors rarity files copied under their canonical asset names. The
 * remaining catalog files (token, timeshifted, 80% variants, …) are curated
 * by hand and stay untouched, and the default icon comes from Scryfall.
 */
const rarityIconFiles: Record<string, string> = { C: 'common', U: 'uncommon', R: 'rare', M: 'mythic' };

/** One icon file to place into the local asset bucket: a local copy or a download. */
export interface IconWork {
  set:     string;
  file:    string;
  target:  string;
  source?: string;
  url?:    string;
}

/** Work items plus the series that ended up without a downloadable default icon. */
export interface IconPlan {
  work:            IconWork[];
  missingDefaults: string[];
}

/**
 * Plans every set icon file of one import: rarity icons from every mtg-vectors
 * set directory of the optimized distribution build (hidden `.alt`/`.extras`
 * catalogs excluded), then Scryfall default icons for all series that do not
 * inherit their parent's icon. Both halves are sorted so repeated runs process
 * files in a stable order.
 */
export function planIconWork(sources: SourceSeries[], vectorsRoot: string | null, iconRoot: string): IconPlan {
  const work: IconWork[] = [];
  const missingDefaults: string[] = [];

  const catalogDir = vectorsRoot == null ? null : join(vectorsRoot, 'svg', 'optimized', 'set');
  if (catalogDir != null && existsSync(catalogDir)) {
    const sets = readdirSync(catalogDir, { withFileTypes: true })
      .filter(entry => entry.isDirectory() && !entry.name.startsWith('.'))
      .map(entry => entry.name)
      .sort();
    for (const set of sets) {
      for (const [code, name] of Object.entries(rarityIconFiles)) {
        const source = join(catalogDir, set, `${code}.svg`);
        if (!existsSync(source)) continue;
        work.push({ set: set.toLowerCase(), file: `${name}.svg`, target: join(iconRoot, 'icon', set.toLowerCase(), `${name}.svg`), source });
      }
    }
  }

  const series = [...sources].sort((a, b) => a.code.localeCompare(b.code));
  for (const s of series) {
    if (inheritedIconTypes.includes(s.set_type)) continue;
    if (!s.icon_svg_uri) {
      missingDefaults.push(s.code.toLowerCase());
      continue;
    }
    work.push({ set: s.code.toLowerCase(), file: 'default.svg', target: join(iconRoot, 'icon', s.code.toLowerCase(), 'default.svg'), url: s.icon_svg_uri });
  }

  return { work, missingDefaults };
}

/** Outcome of placing one icon file: newly written, or skipped because identical bytes are already in place. */
export type IconWriteResult = 'written' | 'unchanged';

/** Failure of one icon file, reported per file so completed placements are kept. */
export interface IconFailure {
  file:    string;
  message: string;
}

/** Running tallies of one icons stage, reported in product language on completion. */
export interface IconReport {
  touched:   Set<string>;
  written:   number;
  unchanged: number;
  failed:    IconFailure[];
}

/** Fresh tally accumulator for one icons stage run. */
export function emptyIconReport(): IconReport {
  return { touched: new Set(), written: 0, unchanged: 0, failed: [] };
}

/** Records one finished placement in the tallies, tracking series with at least one write. */
export function recordIconResult(report: IconReport, work: IconWork, result: IconWriteResult): void {
  if (result === 'written') {
    report.touched.add(work.set);
    report.written += 1;
  } else {
    report.unchanged += 1;
  }
}

/**
 * Places one icon file: existing bytes identical to the source are skipped
 * unless `force` rewrites them, different or missing files are (over)written
 * in place. Failures propagate to the caller, which attributes them to the file.
 */
export async function applyIconWork(work: IconWork, force = false): Promise<IconWriteResult> {
  const bytes = await readIconBytes(work);
  if (!force && existsSync(work.target) && sha256Hex(readFileSync(work.target)) === sha256Hex(bytes)) return 'unchanged';
  mkdirSync(dirname(work.target), { recursive: true });
  writeFileSync(work.target, bytes);
  return 'written';
}

/** Reads one icon's bytes from its local vector source or its remote URL. */
async function readIconBytes(work: IconWork): Promise<Buffer> {
  if (work.source != null) return readFileSync(work.source);
  const response = await fetch(work.url!, {
    headers: { 'User-Agent': 'TCGCards/1.0', 'Accept': 'image/svg+xml' }, signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) throw new Error(`下载失败（${response.status}）`);
  return Buffer.from(await response.arrayBuffer());
}

function sha256Hex(data: Uint8Array | Buffer): string {
  return createHash('sha256').update(data).digest('hex');
}
