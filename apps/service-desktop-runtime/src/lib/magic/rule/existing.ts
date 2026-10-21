import { isDeepStrictEqual } from 'node:util';

import { calculateStatistics } from '@tcg-cards/console-api/lib/magic/documents/statistics';
import type { DocumentStore } from '@tcg-cards/console-api/lib/magic/documents/store';
import { z } from 'zod';
import type { SourceFile } from '@tcg-cards/model/magic/schema/document-content';

import { readRuleEvidence, ruleFileEvidence } from './evidence';
import type { UncertainFile } from './evidence';
import { readOriginalRuleFiles } from './files';
import { listLocalRuleFiles, listLocalRuleVersions } from './list';
import { createRuleOperations } from './operations';
import type { RuleImportAttempt } from './operations';

/** Supplies retained files and the existing local document persistence boundary. */
export interface ExistingRuleImport {
  root:      string;
  research?: string;
  versions?: string[];
  store:     DocumentStore;
  recordImport(attempt: RuleImportAttempt): Promise<void>;
  dryRun?:   boolean;
}

/** Summarizes adopted metadata and unresolved evidence without copying historical download failures. */
export interface ExistingRuleReport {
  mode:     'preflight' | 'apply';
  summary:  { imported: number, skipped: number, failed: number, uncertain: number };
  versions: { version: string, status: 'imported' | 'skipped' | 'failed', uncertain: UncertainFile[], files: SourceFile[], reason?: string }[];
}

/** Imports static originals through the existing CR service, with per-version rollback and repeatable preflight. */
export async function importExistingRules(input: ExistingRuleImport): Promise<ExistingRuleReport> {
  const { root, store } = input;
  const evidence = await readRuleEvidence(input.research);
  const versions = [...new Set(input.versions ?? listLocalRuleVersions(root).map(row => row.date))].sort();
  const report: ExistingRuleReport = { mode: input.dryRun ? 'preflight' : 'apply', summary: { imported: 0, skipped: 0, failed: 0, uncertain: 0 }, versions: [] };
  let blocked: string | undefined;
  for (const date of versions) {
    const entry: ExistingRuleReport['versions'][number] = { version: date, status: 'failed', uncertain: [], files: [] };
    report.versions.push(entry);
    if (blocked != null) {
      entry.status = 'skipped';
      entry.reason = `Batch stopped: ${blocked}`;
      report.summary.skipped++;
      continue;
    }
    const rollback = new Error('Rule import preflight rollback');
    const attempts: RuleImportAttempt[] = [];
    try {
      const version = z.iso.date().parse(date);
      const retained = listLocalRuleFiles(root, version);
      if (!retained.some(file => file.format === 'txt')) {
        entry.status = 'skipped';
        entry.reason = 'TXT source is unavailable';
        report.summary.skipped++;
        continue;
      }
      await store.transaction('magic-cr', async tx => {
        const releaseId = `magic-cr:${version.replaceAll('-', '')}`;
        const beforeRelease = (await tx.releases('magic-cr')).find(row => row.id === releaseId);
        const beforeRevision = beforeRelease ? await tx.revision(beforeRelease.sourceRevisionId) : undefined;
        const before = await tx.revisions('magic-cr');
        // Provenance already measured against these same bytes can survive missing research files.
        const measured = await readOriginalRuleFiles(root, version, beforeRelease?.files.filter(file => file.sha256 != null));
        const files = measured.filter(file => retained.some(row => row.storageKey === file.storageKey)).map(file => {
          const matched = ruleFileEvidence(version, file, evidence);
          entry.uncertain.push(...matched.uncertain);
          return matched.file;
        });
        const rules = createRuleOperations({
          root,
          store:        tx,
          recordImport: async attempt => {
            attempts.push(attempt);
          },
        });
        const imported = await rules.importVersion({ version, files });
        // An unproven historical date must not make an old edition appear latest at import time.
        if (imported.effectiveDate == null) throw new Error('Cannot verify the official CR effective date');
        // Existing translations retain their nodes and relationships; only derived counts are backfilled.
        for (const revision of await tx.revisions('magic-cr')) {
          if (revision.sourceRevisionId !== imported.revisionId) continue;
          const saved = await tx.revision(revision.id);
          if (saved) await tx.updateRevisionMeta(saved.id, calculateStatistics(saved.nodes, 'magic-cr', saved.meta));
        }
        const afterRelease = (await tx.releases('magic-cr')).find(row => row.id === releaseId);
        // Previously imported editions may retain an old import-time fallback; do not rewrite official dates silently.
        if (afterRelease?.effectiveDate !== imported.effectiveDate) throw new Error('Existing CR release date conflicts with retained source');
        entry.files = afterRelease?.files ?? [];
        entry.status = isDeepStrictEqual(beforeRelease, afterRelease)
          && isDeepStrictEqual(beforeRevision, await tx.revision(imported.revisionId))
          && isDeepStrictEqual(before, await tx.revisions('magic-cr'))
          ? 'skipped'
          : 'imported';
        if (input.dryRun) throw rollback;
      });
    } catch (error) {
      if (error !== rollback) {
        entry.status = 'failed';
        // Reports can be shared; raw filesystem and database exceptions must not escape here.
        const message = error instanceof Error ? error.message : '';
        const known = ['Official release already exists with different content', 'Imported source has dependent translations or comparisons',
          'Existing CR release date conflicts with retained source', 'Cannot verify the official CR effective date', 'Parsed document has no rule nodes', 'CR version does not match its effective date', 'Original file does not match its supplied metadata'];
        blocked = databaseBlock(error);
        entry.reason = blocked ?? (known.includes(message) ? message : 'Cannot import retained rule files; verify archive, evidence and local database schema');
      }
    }
    // Completed attempts reference revisions only after their outer transaction commits.
    if (!input.dryRun) {
      for (const attempt of attempts) {
        try {
          await input.recordImport(attempt.status === 'completed' && entry.status === 'failed'
            ? { ...attempt, status: 'failed', revisionId: undefined, error: entry.reason }
            : attempt);
        } catch {
          entry.reason ??= 'Import attempt could not be recorded';
          break;
        }
      }
    }
    report.summary[entry.status === 'imported' ? 'imported' : entry.status === 'skipped' ? 'skipped' : 'failed']++;
    report.summary.uncertain += entry.uncertain.length;
  }
  return report;
}

/** Stops a batch on database conditions that cannot improve by trying another version. */
function databaseBlock(error: unknown): string | undefined {
  let current = error;
  for (let depth = 0; depth < 5 && current instanceof Error; depth++) {
    const code = 'code' in current ? current.code : undefined;
    if (code === '53100') return 'Local database storage is full';
    if (code === '42P01' || code === '42703') return 'Required local database schema is unavailable';
    if (code === 'ECONNREFUSED' || code === 'EACCES' || code === 'ETIMEDOUT' || code === 'CONNECT_TIMEOUT') return 'Local database connection is unavailable';
    current = current.cause;
  }
  return undefined;
}
