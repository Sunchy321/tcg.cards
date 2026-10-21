import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { z } from 'zod';

import type { SourceFile } from '@tcg-cards/model/magic/schema/document-content';

const digest = z.string().regex(/^[a-f0-9]{64}$/);

const candidate = z.object({
  path:            z.string(),
  version:         z.string().nullable(),
  format:          z.string(),
  sha256:          digest,
  bytes:           z.number().int().nonnegative(),
  url:             z.string().default(''),
  source:          z.string().optional(),
  effective_dates: z.array(z.string()).default([]),
  date_basis:      z.string().optional(),
});
const request = z.object({
  path:          z.string().nullish(),
  url:           z.string(),
  effective_url: z.string().optional(),
  valid:         z.boolean(),
  http:          z.union([z.string(), z.number()]),
  sha256:        digest.nullish(),
  bytes:         z.number().int().nonnegative(),
});

const replacement = z.object({
  version:       z.string(),
  format:        z.string(),
  target:        z.string(),
  source:        z.string(),
  url:           z.string(),
  effective_url: z.string(),
  old_sha256:    digest,
  new_sha256:    digest,
});

const fill = z.object({
  copies: z.array(z.object({
    target:    z.string(),
    version:   z.string(),
    format:    z.string(),
    sha256:    digest,
    bytes:     z.number(),
    downloads: candidate.array(),
  })).default([]),
});

const urlIndex = z.object({
  urls: z.object({
    url:            z.string(),
    effective_date: z.string().nullish(),
    data_files:     z.array(z.string()).default([]),
  }).array().default([]),
});

/** Collects historical evidence without interpreting it as a new source check. */
export interface RuleEvidence {
  candidates:   z.infer<typeof candidate>[];
  requests:     z.infer<typeof request>[];
  replacements: z.infer<typeof replacement>[];
  copies:       z.infer<typeof fill>['copies'];
  /** Historical official release addresses per version and format, independent of actual download provenance. */
  official:     { version: string, format: SourceFile['format'], url: string }[];
}

/** Maps URL-index rows to a version and format without retaining any local data path. */
function officialEntries(urls: z.infer<typeof urlIndex>['urls']): RuleEvidence['official'] {
  return urls.flatMap(row => {
    let format: SourceFile['format'] | null = null;
    try {
      const name = basename(new URL(row.url).pathname);
      const extension = name.slice(name.lastIndexOf('.') + 1).toLowerCase();
      format = ['txt', 'pdf', 'doc', 'docx', 'rtf'].includes(extension) ? extension as SourceFile['format'] : null;
    } catch { /* A malformed URL cannot describe a file format. */ }
    if (format == null) return [];
    // The index names a version by its confirmed body date and by the local file it was matched to; both must agree.
    const dates = [row.effective_date, ...row.data_files.map(path => basename(path).replace(/\.[^.]*$/, ''))]
      .filter(date => date != null && z.iso.date().safeParse(date).success);
    const version = [...new Set(dates)];
    return version.length === 1 ? [{ version: version[0]!, format, url: row.url }] : [];
  });
}

/** Describes missing or conflicting provenance independently of usable original bytes. */
export interface UncertainFile {
  format: SourceFile['format'];
  reason: 'source_unconfirmed' | 'effective_url_unconfirmed' | 'conflicting_sources' | 'overwrite_mismatch' | 'copy_mismatch';
}

/** Reads only named evidence files; absent historical materials leave provenance unknown. */
export async function readRuleEvidence(root?: string): Promise<RuleEvidence> {
  if (root == null) return { candidates: [], requests: [], replacements: [], copies: [], official: [] };
  /** Treats a missing report as unknown evidence while rejecting corrupt supplied reports. */
  async function read(name: string): Promise<unknown | undefined> {
    try {
      return JSON.parse(await readFile(`${root}/${name}`, 'utf8'));
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return undefined;
      throw new Error(`Cannot read rule evidence: ${name}`, { cause: error });
    }
  }
  const inventory = z.object({ candidates: candidate.array().default([]) }).parse(await read('inventory.json') ?? {});
  const copies = fill.parse(await read('asset-fill-result.json') ?? {}).copies;
  return {
    candidates:   [...inventory.candidates, ...copies.flatMap(row => row.downloads)],
    requests:     request.array().parse(await read('requests.json') ?? []),
    replacements: z.object({ files: replacement.array().default([]) }).parse(await read('official-overwrite-result.json') ?? {}).files,
    copies,
    official:     officialEntries(urlIndex.parse(await read('url-index-data-mapping.json') ?? {}).urls),
  };
}

/** Allows public source addresses without persisting local paths or credentials. */
function publicUrl(value?: string): string | null {
  try {
    const url = new URL(value ?? '');
    return ['http:', 'https:'].includes(url.protocol) && url.username === '' && url.password === '' ? url.href : null;
  } catch { return null; }
}

/** Extracts only unambiguous ISO or year-first compact dates from an original filename. */
function filenameDate(name: string): string | null {
  const match = name.match(/(?:^|\D)((?:19|20)\d{2})-?(\d{2})-?(\d{2})(?!\d)/);
  if (match == null) return null;
  const result = z.iso.date().safeParse(`${match[1]}-${match[2]}-${match[3]}`);
  return result.success ? result.data : null;
}

/** Attaches the historical official address without touching download provenance. */
function withOfficialUrl(file: SourceFile, officialUrl: string | null): SourceFile {
  return officialUrl == null ? file : { ...file, officialUrl };
}

/** Matches provenance to retained bytes, never to an old inventory or backup alone. */
export function ruleFileEvidence(version: string, file: SourceFile, evidence: RuleEvidence): { file: SourceFile, uncertain: UncertainFile[] } {
  const target = file.storageKey?.replace(/^magic\/rule\//, '');
  const overwritten = evidence.replacements.filter(row => row.target === target && row.version === version && row.format === file.format);
  const copied = evidence.copies.filter(row => row.target === target && row.version === version && row.format === file.format);
  // The official release address describes the version's publication, not the retained bytes' download origin.
  const officialUrls = [...new Set(evidence.official
    .filter(row => row.version === version && row.format === file.format)
    .map(row => publicUrl(row.url))
    .filter(url => url != null))];
  const officialUrl = officialUrls.length === 1 ? officialUrls[0]! : null;
  const uncertain: UncertainFile[] = [];
  if (overwritten.some(row => row.new_sha256 !== file.sha256)) uncertain.push({ format: file.format, reason: 'overwrite_mismatch' });
  if (overwritten.length === 0 && copied.some(row => row.sha256 !== file.sha256 || row.bytes !== file.size)) {
    uncertain.push({ format: file.format, reason: 'copy_mismatch' });
  }
  const current = overwritten.filter(row => row.new_sha256 === file.sha256);
  const candidates = evidence.candidates.filter(row => row.sha256 === file.sha256 && row.bytes === file.size
    && row.version === version && row.format === file.format && publicUrl(row.url) != null
    && (current.length === 0 || current.some(overwrite => overwrite.source === row.path && overwrite.url === row.url)));
  const sources = candidates.map(row => {
    const requests = evidence.requests.filter(attempt => attempt.valid && String(attempt.http) === '200'
      && attempt.path === row.path && attempt.url === row.url && attempt.sha256 === file.sha256 && attempt.bytes === file.size);
    const urls = [...new Set(requests.map(attempt => publicUrl(attempt.effective_url)).filter(url => url != null))];
    const overwrite = current.find(item => item.source === row.path && item.url === row.url);
    // A successful request must support the overwrite's claimed destination as well.
    const effectiveUrl = urls.length === 1 && (overwrite == null || publicUrl(overwrite.effective_url) === urls[0]) ? urls[0]! : null;
    const sourceUrl = publicUrl(row.url)!;
    let originalFilename: string | null = null;
    try {
      originalFilename = decodeURIComponent(basename(new URL(sourceUrl).pathname));
    } catch { /* Malformed escapes do not prove a filename. */ }
    return {
      sourceUrl, effectiveUrl, originalFilename:      originalFilename || null,
      publisher:             row.source === 'official' && new URL(sourceUrl).hostname === 'media.wizards.com' ? 'Wizards of the Coast' : null,
      sourceKind:            row.source ?? null,
      declaredEffectiveDate: row.effective_dates.length === 1 && z.iso.date().safeParse(row.effective_dates[0]).success ? row.effective_dates[0]! : null,
      dateBasis:             row.date_basis === 'document' || row.date_basis === 'filename' ? row.date_basis : null,
      filenameDate:          filenameDate(originalFilename ?? ''),
    };
  });
  // Multiple independently proven mirrors are still ambiguous as the retained file's download origin.
  const distinct = [...new Map(sources.map(row => [JSON.stringify(row), row])).values()];
  if (distinct.length === 0 && uncertain.length === 0 && file.sourceUrl != null) {
    if (file.effectiveUrl == null) uncertain.push({ format: file.format, reason: 'effective_url_unconfirmed' });
    return { file: withOfficialUrl(file, officialUrl), uncertain };
  }
  if (distinct.length !== 1 || uncertain.length > 0) {
    uncertain.push({ format: file.format, reason: distinct.length > 1 ? 'conflicting_sources' : 'source_unconfirmed' });
    return { file: withOfficialUrl(file, officialUrl), uncertain };
  }
  const source = distinct[0]!;
  const sameSource = file.sourceUrl === source.sourceUrl;
  const resolved = {
    ...source,
    // A partial historical bundle does not disprove already verified facts for the same bytes and URL.
    effectiveUrl:          source.effectiveUrl ?? (sameSource ? file.effectiveUrl : null),
    sourceKind:            source.sourceKind ?? (sameSource ? file.sourceKind : null),
    publisher:             source.publisher ?? (sameSource ? file.publisher : null),
    originalFilename:      sameSource ? file.originalFilename ?? source.originalFilename : source.originalFilename,
    declaredEffectiveDate: source.declaredEffectiveDate ?? (sameSource ? file.declaredEffectiveDate : null),
    dateBasis:             source.dateBasis ?? (sameSource ? file.dateBasis : null),
    filenameDate:          source.filenameDate ?? (sameSource ? file.filenameDate : null),
  };
  if (resolved.effectiveUrl == null) uncertain.push({ format: file.format, reason: 'effective_url_unconfirmed' });
  return { file: withOfficialUrl({ ...file, ...resolved, dateBasis: resolved.dateBasis as SourceFile['dateBasis'] }, officialUrl), uncertain };
}
