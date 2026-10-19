import { z } from 'zod';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createDb } from '@tcg-cards/db';
import { publishDocument } from '@tcg-cards/console-api/lib/magic/documents/publish';
import { requireMagicPublishTargetByIdentity } from '../lib/magic/magic-publish-target';
import { createHash, randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { sourceFile, textMarker, translationMethod, reviewStatus } from '@tcg-cards/model/magic/schema/document-content';

import { createDocumentService } from '@tcg-cards/console-api/lib/magic/documents/service';
import { createDocumentStore } from '@tcg-cards/console-api/lib/magic/documents/database';
import { DocumentImportRun } from '@tcg-cards/db/schema/local/magic/document-imports';
import { getLocalDb } from '../lib/hearthstone/hsdata-local-db';

import { resolvePath } from '../lib/game-paths';
import { downloadLatestRules } from '../lib/magic/rule/download';
import { listLocalRuleVersions } from '../lib/magic/rule/list';
import { os } from './index';

const localRuleVersion = z.strictObject({
  date:  z.string(),
  files: z.strictObject({
    txt: z.boolean(),
    doc: z.boolean(),
    pdf: z.boolean(),
  }),
});

const listLocal = os
  .input(z.void())
  .output(z.array(localRuleVersion))
  .handler(async () => {
    const ruleDir = resolvePath('magic.image.rule');
    return ruleDir != null ? listLocalRuleVersions(ruleDir) : [];
  });

const downloadLatest = os
  .input(z.void())
  .output(z.strictObject({
    version:    z.string(),
    downloaded: z.boolean(),
    files:      z.array(z.string()),
  }))
  .handler(async () => downloadLatestRules());

/** Imports a previously downloaded source using only the local build database. */
const importVersion = os
  .input(z.object({ version: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), files: sourceFile.array().optional() }))
  .handler(async ({ input }) => {
    const root = resolvePath('magic.image.rule');
    if (!root) throw new Error('Rule directory is not configured');
    const content = await readFile(join(root, 'txt', `${input.version}.txt`), 'utf8');
    const database = getLocalDb();
    const id = randomUUID();
    await database.insert(DocumentImportRun).values({
      id,
      documentId:    'magic-cr',
      sourceHash:    createHash('sha256').update(content).digest('hex'),
      parserVersion: 'magic-cr-txt-v1',
      status:        'processing',
    });
    try {
      const documents = createDocumentService(createDocumentStore(database, 'local'), { track: 'local' });
      const result = await documents.importCr({ content, versionTag: input.version.replaceAll('-', ''), files: input.files });
      await database.update(DocumentImportRun).set({ status: 'completed', revisionId: result.revisionId, completedAt: new Date() }).where(eq(DocumentImportRun.id, id));
      return result;
    } catch (error) {
      await database.update(DocumentImportRun).set({ status: 'failed', error: error instanceof Error ? error.message : String(error), completedAt: new Date() }).where(eq(DocumentImportRun.id, id));
      throw error;
    }
  });

/** Reads imported releases locally without application tables or import-state joins. */
const releases = os.input(z.object({ slug: z.string().default('magic-cr'), versionTag: z.string().optional() }))
  .handler(({ input }) => createDocumentService(createDocumentStore(getLocalDb(), 'local'), { track: 'local' }).read(input));

/** Publishes one static document into the configured remote serving target. */
const publish = os.input(z.object({ documentId: z.string().default('magic-cr'), publishTarget: z.string(), environment: z.string(), dryRun: z.boolean().default(false) }))
  .handler(async ({ input }) => {
    const target = requireMagicPublishTargetByIdentity(input.publishTarget, input.environment);
    const remote = createDb(target.connectionString);
    try {
      return await publishDocument(createDocumentStore(getLocalDb(), 'local'), createDocumentStore(remote, 'remote'), input.documentId, { dryRun: input.dryRun });
    } finally {
      await remote.$client.end({ timeout: 1 });
    }
  });

/** Retires the local edition so the next publication withdraws it without losing content. */
const deleteVersion = os.input(z.object({ releaseId: z.string() }))
  .handler(({ input }) => createDocumentService(createDocumentStore(getLocalDb(), 'local'), { track: 'local' }).retireRelease({ documentId: 'magic-cr', releaseId: input.releaseId }));

/** Stores automatically generated or imported translations against exact source nodes. */
const saveTranslation = os.input(z.object({
  documentId:       z.string(), sourceRevisionId: z.string(), language:         z.string(), title:            z.string().optional(),
  nodes:            z.array(z.object({ sourceNodeId: z.string(), rawText: z.string(), markers: textMarker.array().optional(), translationMethod, reviewStatus: reviewStatus.optional() })),
})).handler(({ input }) => createDocumentService(createDocumentStore(getLocalDb(), 'local'), { track: 'local' }).saveTranslation(input));

/** Selects the translation revision served with an existing official edition. */
const selectTranslation = os.input(z.object({ documentId: z.string(), releaseId: z.string(), revisionId: z.string() }))
  .handler(({ input }) => createDocumentService(createDocumentStore(getLocalDb(), 'local'), { track: 'local' }).selectTranslation(input));

/** Local-only Comprehensive Rules procedures; remote rule procedures keep their own paths. */
export const magicRuleRouter = {
  listLocal,
  importVersion,
  publish,
  deleteVersion,
  saveTranslation,
  selectTranslation,
  releases,
  downloadLatest,
};
