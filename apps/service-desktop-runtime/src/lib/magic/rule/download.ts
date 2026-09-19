import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { resolvePath } from '../../game-paths';
import { extractVersionDateFromFilename, fetchRuleFile, fetchRuleLinks } from './source';

/** Outcome of one latest-rules download pass against the local rule archive. */
export interface RuleDownloadResult {
  version:    string;
  downloaded: boolean;
  files:      string[];
}

/** Resolves the local rule directory, creating the derived leaf folder when a parent resolves. */
export function ensureRuleDir(): string {
  const resolved = resolvePath('magic.image.rule')
    ?? withChild(resolvePath('magic.image'), 'rule')
    ?? withChild(resolvePath('asset'), join('magic', 'rule'));

  if (resolved == null) {
    throw new Error('magic.image.rule path is not configured');
  }

  mkdirSync(resolved, { recursive: true });
  return resolved;
}

/** Joins one resolved parent directory with a child segment, or propagates a missing parent. */
function withChild(parent: string | null, child: string): string | null {
  return parent != null ? join(parent, child) : null;
}

/** Whether the doc slot for a version is already filled by a legacy `.doc` or a `.docx` file. */
function hasDocFile(ruleDir: string, version: string): boolean {
  return ['.docx', '.doc'].some(ext => existsSync(join(ruleDir, 'doc', `${version}${ext}`)));
}

/**
 * Downloads the latest Comprehensive Rules into the archive layout:
 * `txt/{date}.txt`, `doc/{date}.docx`, `pdf/{date}.pdf` with dashed dates.
 * Files already present for the version are kept, so repeated runs are idempotent.
 */
export async function downloadLatestRules(): Promise<RuleDownloadResult> {
  const links = await fetchRuleLinks();
  if (!links.txt) {
    throw new Error('No TXT link found on the rules page');
  }

  const compact = extractVersionDateFromFilename(links.txt);
  if (!compact) {
    throw new Error('Could not extract version date from the TXT filename');
  }

  const version = toDashedDate(compact);
  const ruleDir = ensureRuleDir();

  const targets = [
    { path: join(ruleDir, 'txt', `${version}.txt`), url: links.txt, required: true, present: existsSync(join(ruleDir, 'txt', `${version}.txt`)) },
    { path: join(ruleDir, 'doc', `${version}.docx`), url: links.docx, required: false, present: hasDocFile(ruleDir, version) },
    { path: join(ruleDir, 'pdf', `${version}.pdf`), url: links.pdf, required: false, present: existsSync(join(ruleDir, 'pdf', `${version}.pdf`)) },
  ];

  const saved = (await Promise.all(targets
    .filter(target => !target.present && target.url != null)
    .map(async target => {
      const content = await fetchRuleFile(target.url!);
      if (content == null) {
        // Only the txt is required; the doc/pdf mirrors are best-effort, matching remote sync behavior.
        if (target.required) {
          throw new Error('Failed to download the TXT file');
        }
        return null;
      }

      mkdirSync(dirname(target.path), { recursive: true });
      writeFileSync(target.path, target.path.endsWith('.txt') ? normalizeRuleText(content) : Buffer.from(content));
      return target.path;
    }))).filter(name => name != null);

  return {
    version,
    downloaded: saved.length > 0,
    files:      presentArchiveFiles(ruleDir, version),
  };
}

/** Lists the archive files actually on disk for one version, reporting legacy `.doc` as-is. */
function presentArchiveFiles(ruleDir: string, version: string): string[] {
  const names: string[] = [];

  if (existsSync(join(ruleDir, 'txt', `${version}.txt`))) {
    names.push(`txt/${version}.txt`);
  }

  const docExt = ['.docx', '.doc'].find(ext => existsSync(join(ruleDir, 'doc', `${version}${ext}`)));
  if (docExt) {
    names.push(`doc/${version}${docExt}`);
  }

  if (existsSync(join(ruleDir, 'pdf', `${version}.pdf`))) {
    names.push(`pdf/${version}.pdf`);
  }

  return names;
}

/** Converts a compact YYYYMMDD date from Wizards filenames to the archive's dashed form. */
export function toDashedDate(compact: string): string {
  return `${compact.slice(0, 4)}-${compact.slice(4, 6)}-${compact.slice(6, 8)}`;
}

/** Normalizes rule text line endings to match the copy stored in the remote data bucket. */
function normalizeRuleText(content: ArrayBuffer): string {
  return new TextDecoder().decode(content)
    .replace(/^\uFEFF/, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .trimEnd() + '\n';
}
