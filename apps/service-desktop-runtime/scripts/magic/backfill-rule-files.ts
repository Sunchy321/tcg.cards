import { isDeepStrictEqual } from 'node:util';
import { and, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';

import { createDb } from '@tcg-cards/db/db';
import { DocumentRelease as LocalRelease } from '@tcg-cards/db/schema/local/magic/documents';
import { DocumentRelease as RemoteRelease } from '@tcg-cards/db/schema/remote/magic/documents';
import { sourceFile } from '@tcg-cards/model/magic/schema/document-content';
import { listLocalRuleFiles } from '../../src/lib/magic/rule/list';

const targets = z.array(z.object({ name: z.string(), track: z.enum(['local', 'remote']), connection: z.string().min(1) }))
  .min(1).parse(JSON.parse(process.env.RULE_BACKFILL_DATABASES ?? '[]'));
const root = z.string().min(1).parse(process.env.RULE_ARCHIVE_DIR);
const reportPath = z.string().min(1).parse(process.env.RULE_BACKFILL_REPORT);
const apply = process.argv.includes('--apply');
const report = { mode: apply ? 'apply' : 'preflight', targets: [] as Array<Record<string, unknown>> };

for (const target of targets) {
  const database = createDb(target.connection);
  const table = target.track === 'local' ? LocalRelease : RemoteRelease;
  try {
    const before = await database.select().from(table)
      .where(and(eq(table.documentId, 'magic-cr'), isNull(table.deletedAt))).orderBy(table.id);
    const planned = before.map(release => {
      const compact = release.versionTag.replaceAll('-', '');
      const date = `${compact.slice(0, 4)}-${compact.slice(4, 6)}-${compact.slice(6, 8)}`;
      const originals = listLocalRuleFiles(root, date);
      if (originals.length === 0) throw new Error(`${target.name}: ${release.versionTag} has no retained original files`);
      const files = new Map(release.files.map(file => [`${file.language}:${file.format}:${file.translationId ?? ''}`, file]));
      for (const file of originals) {
        const key = `${file.language}:${file.format}:${file.translationId ?? ''}`;
        files.set(key, sourceFile.parse({ ...files.get(key), ...file }));
      }
      return { ...release, files: [...files.values()] };
    });
    const changed = planned.filter((release, index) => !isDeepStrictEqual(release, before[index]));
    const entry = { name: target.name, track: target.track, releases: before.length, changed: changed.length, verified: false, before, after: planned };
    report.targets.push(entry);
    // Persist the exact old descriptors before making any changes; credentials never enter the report.
    await Bun.write(reportPath, JSON.stringify(report, null, 2));
    if (apply) {
      await database.transaction(async tx => {
        for (const release of changed) {
          const previous = before.find(row => row.id === release.id)!;
          const updated = await tx.update(table).set({ files: release.files })
            .where(and(eq(table.id, release.id), eq(table.documentId, 'magic-cr'), isNull(table.deletedAt), eq(table.files, previous.files)))
            .returning({ id: table.id });
          if (updated.length !== 1) throw new Error(`${target.name}: ${release.versionTag} changed during backfill`);
        }
        const after = await tx.select().from(table)
          .where(and(eq(table.documentId, 'magic-cr'), isNull(table.deletedAt))).orderBy(table.id);
        if (!isDeepStrictEqual(after, planned)) throw new Error(`${target.name}: backfill verification failed`);
      });
      entry.verified = true;
      await Bun.write(reportPath, JSON.stringify(report, null, 2));
    }
    console.log(JSON.stringify({ name: entry.name, track: entry.track, releases: entry.releases, changed: entry.changed, verified: entry.verified }));
  } catch (error) {
    // Database drivers can include credentials in nested errors; keep the console limited to the task context.
    console.error(`${target.name}: ${error instanceof Error && !('cause' in error) ? error.message.replaceAll(target.connection, '[database]') : 'Database backfill failed'}`);
    process.exitCode = 1;
    break;
  } finally {
    await database.$client.end({ timeout: 3 });
  }
}
