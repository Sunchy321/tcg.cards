import { z } from 'zod';
import { ORPCError } from '@orpc/server';
import { publishDocuments } from '../lib/magic/document-publish';
import { eq } from 'drizzle-orm';
import { sourceFile, textMarker, translationMethod, reviewStatus } from '@tcg-cards/model/magic/schema/document-content';

import { createDocumentService } from '@tcg-cards/console-api/lib/magic/documents/service';
import { createDocumentStore } from '@tcg-cards/console-api/lib/magic/documents/database';
import { DocumentImportRun } from '@tcg-cards/db/schema/local/magic/document-imports';
import { getLocalDb } from '../lib/hearthstone/hsdata-local-db';

import { resolvePath } from '../lib/game-paths';
import { downloadLatestRules } from '../lib/magic/rule/download';
import { createRuleOperations } from '../lib/magic/rule/operations';
import { createRuleTranslationOperations } from '../lib/magic/rule/translations';
import { CrTranslationError } from '@tcg-cards/console-api/lib/magic/documents/community';
import { crParserVersion } from '@tcg-cards/console-api/lib/magic/documents/parser';
import { os } from './index';

const localRuleVersion = z.strictObject({
  date:       z.string(),
  imported:   z.boolean(),
  releaseId:  z.string().nullable(),
  totalNodes: z.number().int().nonnegative().nullable(),
  files:      z.strictObject({
    txt: z.boolean(),
    doc: z.boolean(),
    pdf: z.boolean(),
  }),
});

/** Binds rule operations to the current local database and source directory. */
function localRules() {
  const database = getLocalDb();
  return createRuleOperations({
    root:  resolvePath('magic.image.rule'),
    store: createDocumentStore(database, 'local'),
    /** Saves attempt progress without changing the imported article's lifecycle. */
    async recordImport(attempt) {
      if (attempt.status === 'processing') {
        await database.insert(DocumentImportRun).values({
          id:            attempt.id, documentId:    'magic-cr', sourceHash:    attempt.sourceHash,
          parserVersion: crParserVersion, status:        attempt.status,
        });
      } else {
        await database.update(DocumentImportRun).set({
          status:      attempt.status, revisionId:  attempt.revisionId,
          error:       attempt.error, completedAt: attempt.completedAt,
        }).where(eq(DocumentImportRun.id, attempt.id));
      }
    },
  });
}

/** Returns actionable local-rule failures without exposing source paths or database internals. */
function ruleError(error: unknown, fallback: string) {
  if (error instanceof CrTranslationError) {
    return new ORPCError('BAD_REQUEST', { message: error.message, cause: error });
  }
  const messages: Record<string, string> = {
    'Rule directory is not configured':                          '请先配置规则文件目录。',
    'Local desktop database URL is not configured':              '请先配置本地数据库。',
    'Parsed document has no rule nodes':                         '未能从 TXT 文件识别规则正文，请检查文件内容。',
    'CR version does not match its effective date':              '文件中的生效日期与所选版本不一致。',
    'Official release already exists with different content':    '此版本已导入，当前文件内容与已导入内容不同。',
    'Imported source has dependent translations or comparisons': '此版本已有译文或比较记录引用旧规则，请先处理这些关联后重新解析。',
  };
  const missingFile = error instanceof Error && 'code' in error && error.code === 'ENOENT';
  const message = missingFile
    ? '未找到该版本的 TXT 文件，请先下载规则。'
    : error instanceof Error ? messages[error.message] : undefined;
  return new ORPCError(message ? 'BAD_REQUEST' : 'INTERNAL_SERVER_ERROR', {
    message: message ?? fallback, cause: error,
  });
}

const listLocal = os
  .input(z.void())
  .output(z.array(localRuleVersion))
  .handler(async () => {
    try {
      return await localRules().listLocal();
    } catch (error) {
      throw ruleError(error, '无法读取本地规则，请检查本地数据库连接后重试。');
    }
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
  .input(z.object({ version: z.iso.date(), files: sourceFile.array().optional() }))
  .handler(async ({ input }) => {
    try {
      return await localRules().importVersion(input);
    } catch (error) {
      throw ruleError(error, '规则导入失败，请检查本地数据库连接后重试。');
    }
  });

/** Reads imported releases locally without application tables or import-state joins. */
const releases = os.input(z.object({ slug: z.string().default('magic-cr'), versionTag: z.string().optional(), locale: z.string().optional() }))
  .handler(({ input }) => localRules().read(input));

/** Publishes one static document into the configured remote serving target. */
const publish = os.input(z.object({
  documentId:        z.string().default('magic-cr'),
  publishTarget:     z.string(),
  environment:       z.string(),
  targetFingerprint: z.string().optional(),
  dryRun:            z.boolean().default(false),
}))
  .handler(({ input }) => publishDocuments(input, input.documentId));

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

/** Uses the declared data directory and existing static document database for Chinese editions. */
function localTranslations() {
  return createRuleTranslationOperations({
    root:  resolvePath('magic.data.magic-comp-rules-zh-cn'),
    store: createDocumentStore(getLocalDb(), 'local'),
  });
}

/** Lists available Chinese editions together with their saved serving state. */
const listTranslations = os.input(z.void()).output(z.object({
  configured: z.boolean(),
  versions:   z.array(z.object({ date: z.iso.date(), available: z.boolean(), imported: z.boolean() })),
})).handler(async () => {
  try {
    return await localTranslations().list();
  } catch (error) {
    throw ruleError(error, '无法读取中文译本，请检查本地设置后重试。');
  }
});

/** Imports and selects one human translation without changing the official English edition. */
const importTranslation = os.input(z.object({ version: z.iso.date() })).handler(async ({ input }) => {
  try {
    return await localTranslations().importVersion(input);
  } catch (error) {
    throw ruleError(error, '中文译本导入失败，请检查本地设置后重试。');
  }
});

/** Local-only Comprehensive Rules procedures; remote rule procedures keep their own paths. */
export const magicRuleRouter = {
  listLocal,
  importVersion,
  publish,
  deleteVersion,
  saveTranslation,
  selectTranslation,
  listTranslations,
  importTranslation,
  releases,
  downloadLatest,
};
