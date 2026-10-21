import { parseArgs } from 'node:util';
import { z } from 'zod';

import { createDb } from '@tcg-cards/db/db';
import { createDocumentStore } from '@tcg-cards/console-api/lib/magic/documents/database';
import { memoryStore } from '@tcg-cards/console-api/lib/magic/documents/testing';
import { DocumentImportRun } from '@tcg-cards/db/schema/local/magic/document-imports';
import { eq } from 'drizzle-orm';

import { importExistingRules } from '../../src/lib/magic/rule/existing';
import { crParserVersion } from '@tcg-cards/console-api/lib/magic/documents/parser';

const { values } = parseArgs({ options: {
  apply:   { type: 'boolean', default: false },
  offline: { type: 'boolean', default: false },
  version: { type: 'string', multiple: true },
}, strict: true });
const root = z.string().min(1).parse(process.env.RULE_ARCHIVE_DIR);
const reportPath = z.string().min(1).parse(process.env.RULE_IMPORT_REPORT);
if (values.apply && values.offline) throw new Error('Offline verification cannot apply changes');
const database = values.offline ? undefined : createDb(z.string().min(1).parse(process.env.RULE_IMPORT_DATABASE_URL));

try {
  const report = await importExistingRules({
    root,
    research: process.env.RULE_RESEARCH_DIR,
    versions: values.version,
    store:    database ? createDocumentStore(database, 'local') : memoryStore(),
    dryRun:   !values.apply,
    /** Records local import attempts after content transactions finish; preflight records nothing. */
    async recordImport(attempt) {
      if (database == null) return;
      if (attempt.status === 'processing') {
        await database.insert(DocumentImportRun).values({
          id:            attempt.id,
          documentId:    'magic-cr',
          sourceHash:    attempt.sourceHash,
          parserVersion: crParserVersion,
          status:        attempt.status,
        });
      } else {
        await database.update(DocumentImportRun).set({
          status:      attempt.status,
          revisionId:  attempt.revisionId,
          error:       attempt.error,
          completedAt: attempt.completedAt,
        }).where(eq(DocumentImportRun.id, attempt.id));
      }
    },
  });
  await Bun.write(reportPath, JSON.stringify({ ...report, verification: values.offline ? 'offline-files-only' : 'local-database' }, null, 2));
  console.log(JSON.stringify({ mode: report.mode, verification: values.offline ? 'offline-files-only' : 'local-database', ...report.summary }));
  if (report.summary.failed > 0) process.exitCode = 1;
} catch {
  // Driver exceptions can include credentials and query parameters; expose only a safe action.
  console.error('Rule import failed; verify input reports, archive access and the local database schema.');
  process.exitCode = 1;
} finally {
  await database?.$client.end({ timeout: 3 });
}
