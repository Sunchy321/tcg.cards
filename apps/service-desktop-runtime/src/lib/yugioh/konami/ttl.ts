/**
 * Adaptive cache-window decision shared by the Konami crawlers, mirroring the
 * magic gatherer semantics: stable rows escalate 7→30→60→180→365 days, changed
 * rows reset to 7, and a negative (no-data) row is cached long-term so repeated
 * runs do not re-request cards the source genuinely does not have.
 */

/** TTL escalation ladder in days. */
export const CACHE_LEVELS = [7, 30, 60, 180, 365];

/** Crawl granularity: which rows to process this run. */
export type CrawlLevel = 'fill' | 'refresh' | 'refresh_all' | 'force';
export const CRAWL_LEVELS: CrawlLevel[] = ['fill', 'refresh', 'refresh_all', 'force'];

/**
 * Per-cid crawl outcome, fed into the live progress breakdown.
 *
 * Network-result outcomes (the task actually requested the cid this run):
 * - `fetched`   — got card data.
 * - `notFound`  — the source has no entry for the cid.
 * - `error`     — the request failed.
 *
 * Database-entry outcomes (the cache is used as-is, no request):
 * - `fresh`        — valid cached data.
 * - `localMissing` — a cached "no entry" row.
 */
export type CrawlOutcome = 'fresh' | 'localMissing' | 'fetched' | 'notFound' | 'error';

/** Lightweight cache state loaded in bulk for the per-cid skip decision. */
export interface CachedRowState {
  hasData:     boolean;
  expiresAt:   Date;
  cacheDays:   number;
  contentHash: string | null;
}

/**
 * Outcome for an already-cached row under the given level, or null when the row
 * should be re-fetched. A cached no-entry row that the level never re-checks is
 * `localMissing` (fresh or expired); a valid row still within its cache window
 * is `fresh`. `notFound` only ever comes from a source miss requested this run.
 */
export function cachedOutcome(row: CachedRowState, level: CrawlLevel, now: Date): CrawlOutcome | null {
  if (level === 'force') return null; // refetch regardless
  // Cached no-entry rows the level never re-checks are "locally missing", fresh or expired.
  if (!row.hasData) {
    if (level === 'refresh' || level === 'fill') return 'localMissing';
    if (row.expiresAt > now) return 'localMissing'; // refresh_all skips fresh rows
    return null; // refresh_all re-checks expired no-entry rows
  }
  // Valid rows:
  if (row.expiresAt > now) return 'fresh'; // still within the cache window
  if (level === 'fill') return 'fresh'; // fill keeps existing rows regardless of expiry
  return null; // expired valid → refetch
}

/** Next TTL step on the escalation ladder, clamped to the last level. */
export function nextLevel(currentDays: number): number {
  const idx = CACHE_LEVELS.indexOf(currentDays);
  return CACHE_LEVELS[Math.min(idx + 1, CACHE_LEVELS.length - 1)] ?? 365;
}

/** Empty per-run counter bag in report order. */
export function emptyCrawlReport(): CrawlReport {
  return { fresh: 0, localMissing: 0, fetched: 0, notFound: 0, errors: 0 };
}

/** Per-run outcome counters in report order. */
export interface CrawlReport {
  fresh:        number;
  localMissing: number;
  fetched:      number;
  notFound:     number;
  errors:       number;
}

/** Sums two reports cell by cell. */
export function addCrawlReports(a: CrawlReport, b: CrawlReport): CrawlReport {
  return {
    fresh:        a.fresh + b.fresh,
    localMissing: a.localMissing + b.localMissing,
    fetched:      a.fetched + b.fetched,
    notFound:     a.notFound + b.notFound,
    errors:       a.errors + b.errors,
  };
}

/** Total number of processed rows in a report; drives checkpoint advancement. */
export function countCrawlReport(report: CrawlReport): number {
  return report.fresh + report.localMissing + report.fetched + report.notFound + report.errors;
}
