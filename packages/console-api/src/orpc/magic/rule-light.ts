import { os as create } from '@orpc/server';
import { z } from 'zod';
import { eq } from 'drizzle-orm';

import { db } from '@tcg-cards/db/db';
import {
  DocumentNode,
  DocumentVersion,
} from '@tcg-cards/db/schema/shared/magic';
import { DocumentVersionImport } from '@tcg-cards/db/schema/local/magic/document';

import { locale } from '@tcg-cards/model/magic/schema/basic';

import { listDocumentVersions } from '../../lib/magic/document/importer';
import { getDocumentConfig } from '../../lib/magic/document/config';
import { getLocalizedContent } from '../../lib/magic/document/content';

interface RuleR2DataBucket {
  list(input: { prefix: string }): Promise<{ objects?: Array<{ key: string }> }>;
}

interface RuleR2AssetBucket {
  list(input: { prefix: string }): Promise<{ objects?: Array<{ key: string }> }>;
}

interface RuleEnv {
  R2_DATA:  RuleR2DataBucket;
  R2_ASSET: RuleR2AssetBucket;
}

const os = create.$context<{ env: RuleEnv }>();

function toDocumentVersionId(versionId: string): string {
  if (versionId.includes(':')) {
    return versionId;
  }

  return `magic-cr:${versionId}`;
}

function toVersionTag(versionId: string): string {
  return versionId.includes(':')
    ? versionId.split(':').at(-1) ?? versionId
    : versionId;
}

/** R2 file presence for one rule version: data-bucket txt key plus archive file groups. */
interface RuleBucketFiles {
  dataKey: string | null;
  files:   { txt: boolean, doc: boolean, pdf: boolean };
}

/** Normalizes a compact YYYYMMDD date from a bucket key to the archive's dashed form. */
function toDashedVersionDate(value: string): string {
  return /^\d{8}$/.test(value)
    ? `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`
    : value;
}

/** Scans both rule buckets for archive-layout version files without touching the database. */
async function scanRuleBucketFiles(env: RuleEnv): Promise<Map<string, RuleBucketFiles>> {
  const versions = new Map<string, RuleBucketFiles>();
  const entry = (versionId: string) => versions.get(versionId)
    ?? { dataKey: null, files: { txt: false, doc: false, pdf: false } };

  try {
    const dataResult = await env.R2_DATA.list({ prefix: 'magic/rule/' });
    for (const obj of dataResult.objects ?? []) {
      const match = obj.key.match(/magic\/rule\/(\d{4}-\d{2}-\d{2}|\d{8})\.txt$/);
      if (match) {
        const versionId = toDashedVersionDate(match[1]!);
        const files = entry(versionId);
        files.dataKey = obj.key;
        versions.set(versionId, files);
      }
    }
  } catch (err) {
    console.error('[Rule] Failed to list R2 data files:', err);
  }

  try {
    const [txtList, docList, pdfList] = await Promise.all([
      env.R2_ASSET.list({ prefix: 'magic/rule/txt/' }),
      env.R2_ASSET.list({ prefix: 'magic/rule/doc/' }),
      env.R2_ASSET.list({ prefix: 'magic/rule/pdf/' }),
    ]);

    const markAsset = (list: { objects?: Array<{ key: string }> }, flag: 'txt' | 'doc' | 'pdf', exts: string[]) => {
      const pattern = new RegExp(`magic\\/rule\\/\\w+\\/(\\d{4}-\\d{2}-\\d{2}|\\d{8})\\.(${exts.join('|')})$`);
      for (const obj of list.objects ?? []) {
        const match = obj.key.match(pattern);
        if (match) {
          const versionId = toDashedVersionDate(match[1]!);
          const files = entry(versionId);
          files.files[flag] = true;
          versions.set(versionId, files);
        }
      }
    };

    markAsset(txtList, 'txt', ['txt']);
    markAsset(docList, 'doc', ['doc', 'docx']);
    markAsset(pdfList, 'pdf', ['pdf']);
  } catch (err) {
    console.error('[Rule] Failed to list R2 asset files:', err);
  }

  return versions;
}

export const list = os
  .route({
    method:      'GET',
    description: 'List all rule versions including pending imports from R2',
    tags:        ['Magic', 'Rule'],
  })
  .input(z.void())
  .output(z.strictObject({
    id:            z.string(),
    effectiveDate: z.string().nullable(),
    publishedAt:   z.string().nullable(),
    totalRules:    z.number().nullable(),
    status:        z.string(),
    importedAt:    z.date().nullable(),
    dataStatus:    z.enum(['imported', 'pending', 'missing']),
    r2Key:         z.string().nullable(),
    assetStatus:   z.strictObject({
      txt:  z.boolean(),
      doc:  z.boolean(),
      pdf:  z.boolean(),
    }),
  }).array())
  .handler(async ({ context }) => {
    const env = context.env;

    const dbVersions = (await listDocumentVersions('magic-cr')).map(version => ({
      id:              version.versionTag,
      effectiveDate:   version.effectiveDate,
      publishedAt:     version.publishedAt,
      totalRules:      version.totalNodes,
      lifecycleStatus: version.lifecycleStatus,
      importedAt:      version.importedAt,
    }));

    const bucketFiles = await scanRuleBucketFiles(env);

    const dbVersionMap = new Map(dbVersions.map(v => [v.id, v]));
    const result: Array<{
      id:            string;
      effectiveDate: string | null;
      publishedAt:   string | null;
      totalRules:    number | null;
      status:        string;
      importedAt:    Date | null;
      dataStatus:    'imported' | 'pending' | 'missing';
      r2Key:         string | null;
      assetStatus:   { txt: boolean, doc: boolean, pdf: boolean };
    }> = [];

    const allVersionIds = new Set([...dbVersions.map(v => v.id), ...bucketFiles.keys()]);

    for (const versionId of allVersionIds) {
      const dbVersion = dbVersionMap.get(versionId);
      const bucket = bucketFiles.get(versionId);
      const dataFile = bucket?.dataKey ?? null;
      const assets = bucket?.files ?? { txt: false, doc: false, pdf: false };

      if (dbVersion) {
        result.push({
          id:            dbVersion.id,
          effectiveDate: dbVersion.effectiveDate,
          publishedAt:   dbVersion.publishedAt,
          totalRules:    dbVersion.totalRules,
          status:        dbVersion.lifecycleStatus,
          importedAt:    dbVersion.importedAt,
          dataStatus:    dataFile ? 'imported' : 'missing',
          r2Key:         dataFile,
          assetStatus:   assets,
        });
      } else if (dataFile) {
        result.push({
          id:            versionId,
          effectiveDate: null,
          publishedAt:   null,
          totalRules:    null,
          status:        'pending',
          importedAt:    null,
          dataStatus:    'pending',
          r2Key:         dataFile,
          assetStatus:   assets,
        });
      }
    }

    return result.sort((a, b) => b.id.localeCompare(a.id));
  });

export const listFiles = os
  .route({
    method:      'GET',
    description: 'List rule version files stored in R2 without reading the database',
    tags:        ['Magic', 'Rule'],
  })
  .input(z.void())
  .output(z.strictObject({
    id:       z.string(),
    dataFile: z.boolean(),
    files:    z.strictObject({
      txt:  z.boolean(),
      doc:  z.boolean(),
      pdf:  z.boolean(),
    }),
  }).array())
  .handler(async ({ context }) => {
    const bucketFiles = await scanRuleBucketFiles(context.env);

    return [...bucketFiles.entries()]
      .map(([id, bucket]) => ({
        id,
        dataFile: bucket.dataKey != null,
        files:    bucket.files,
      }))
      .sort((a, b) => b.id.localeCompare(a.id));
  });

export const get = os
  .route({
    method:      'GET',
    description: 'Get rule version details',
    tags:        ['Magic', 'Rule'],
  })
  .input(z.object({
    id: z.string(),
  }))
  .output(z.strictObject({
    id:            z.string(),
    effectiveDate: z.string().nullable(),
    publishedAt:   z.string().nullable(),
    txtUrl:        z.string().nullable(),
    pdfUrl:        z.string().nullable(),
    docxUrl:       z.string().nullable(),
    totalRules:    z.number().nullable(),
    status:        z.string(),
    importedAt:    z.date().nullable(),
  }))
  .handler(async ({ input }) => {
    const result = await db
      .select({
        id:            DocumentVersion.id,
        effectiveDate: DocumentVersion.effectiveDate,
        publishedAt:   DocumentVersion.publishedAt,
        txtUrl:        DocumentVersion.txtUrl,
        pdfUrl:        DocumentVersion.pdfUrl,
        docxUrl:       DocumentVersion.docxUrl,
        totalNodes:    DocumentVersion.totalNodes,
        status:        DocumentVersion.lifecycleStatus,
        importedAt:    DocumentVersionImport.importedAt,
      })
      .from(DocumentVersion)
      .leftJoin(DocumentVersionImport, eq(DocumentVersionImport.versionId, DocumentVersion.id))
      .where(eq(DocumentVersion.id, toDocumentVersionId(input.id)))
      .limit(1);

    if (!result[0]) {
      throw new Error('Rule version not found');
    }

    return {
      id:            toVersionTag(result[0].id),
      effectiveDate: result[0].effectiveDate,
      publishedAt:   result[0].publishedAt,
      txtUrl:        result[0].txtUrl,
      pdfUrl:        result[0].pdfUrl,
      docxUrl:       result[0].docxUrl,
      totalRules:    result[0].totalNodes,
      status:        result[0].status,
      importedAt:    result[0].importedAt ?? null,
    };
  });

export const getNodes = os
  .route({
    method:      'GET',
    description: 'Get all rule nodes for a version',
    tags:        ['Magic', 'Rule'],
  })
  .input(z.object({
    sourceId: z.string(),
    locale:   locale.optional(),
  }))
  .output(z.array(z.object({
    id:           z.string(),
    sourceId:     z.string(),
    ruleId:       z.string(),
    path:         z.string(),
    level:        z.number(),
    parentId:     z.string().nullable(),
    siblingOrder: z.number(),
    title:        z.string().nullable(),
    contentHash:  z.string(),
    entityId:     z.string(),
    content:      z.string().nullable(),
    isStale:      z.boolean(),
  })))
  .handler(async ({ input }) => {
    const versionId = toDocumentVersionId(input.sourceId);
    const documentId = versionId.split(':')[0]!;
    const config = getDocumentConfig(documentId);
    const sourceLocale = config?.sourceLocale ?? 'en';
    const requestedLocale = input.locale ?? sourceLocale;

    const nodes = await db
      .select({
        id:                 DocumentNode.id,
        nodeId:             DocumentNode.nodeId,
        path:               DocumentNode.path,
        level:              DocumentNode.level,
        parentId:           DocumentNode.parentNodeId,
        siblingOrder:       DocumentNode.siblingOrder,
        sourceContentHash:  DocumentNode.sourceContentHash,
        entityId:           DocumentNode.entityId,
        sourceContentRefId: DocumentNode.sourceContentRefId,
      })
      .from(DocumentNode)
      .where(eq(DocumentNode.versionId, versionId))
      .orderBy(DocumentNode.path);

    const nodeIds = nodes.map(node => node.id);
    const contentResults = await getLocalizedContent({
      nodeIds,
      locale: requestedLocale,
      sourceLocale,
    });

    const titleMap = new Map<string, string>();

    for (const node of nodes) {
      if (!node.nodeId.endsWith('.title') || !node.parentId) {
        continue;
      }

      const result = contentResults.get(node.id);
      if (result) {
        titleMap.set(node.parentId, result.content);
      }
    }

    return nodes
      .filter(node => !node.nodeId.endsWith('.title'))
      .map(node => {
        const result = contentResults.get(node.id);
        return {
          id:           node.id,
          sourceId:     input.sourceId,
          ruleId:       node.nodeId,
          path:         node.path,
          level:        node.level,
          parentId:     node.parentId,
          siblingOrder: node.siblingOrder,
          title:        titleMap.get(node.id) ?? null,
          contentHash:  node.sourceContentHash ?? '',
          entityId:     node.entityId,
          content:      result?.content ?? null,
          isStale:      result?.isStale ?? false,
        };
      });
  });
