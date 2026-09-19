import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/** One locally stored rule version and the file groups present for it. */
export interface LocalRuleVersion {
  date:  string;
  files: { txt: boolean, doc: boolean, pdf: boolean };
}

/** Archive layout per file group: subfolder under the rule root plus accepted extensions. */
const groups = [
  { flag: 'txt' as const, dir: 'txt', exts: ['txt'] },
  { flag: 'doc' as const, dir: 'doc', exts: ['doc', 'docx'] },
  { flag: 'pdf' as const, dir: 'pdf', exts: ['pdf'] },
];

/** Scans the rule root's per-format subfolders for `YYYY-MM-DD` files, newest first. */
export function listLocalRuleVersions(ruleDir: string): LocalRuleVersion[] {
  if (!existsSync(ruleDir)) {
    return [];
  }

  const versions = new Map<string, LocalRuleVersion>();

  for (const group of groups) {
    const dir = join(ruleDir, group.dir);
    if (!existsSync(dir)) {
      continue;
    }

    for (const name of readdirSync(dir)) {
      const date = name.match(/^(\d{4}-\d{2}-\d{2})\./)?.[1];
      const ext = date == null ? null : group.exts.find(candidate => name === `${date}.${candidate}`);
      if (date == null || ext == null) {
        continue;
      }

      const entry = versions.get(date) ?? { date, files: { txt: false, doc: false, pdf: false } };
      entry.files[group.flag] = true;
      versions.set(date, entry);
    }
  }

  return [...versions.values()].sort((a, b) => b.date.localeCompare(a.date));
}
