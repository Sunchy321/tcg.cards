import { os as create } from '@orpc/server';
import { z } from 'zod';
import { eq } from 'drizzle-orm';

import { db } from '@tcg-cards/db/db';
import {
  DocumentNode,
  DocumentVersion,
} from '@tcg-cards/db/schema/shared/magic';
import { DocumentVersionImport } from '@tcg-cards/db/schema/local/magic/document';

import { locale } from '@tcg-cards/model/src/magic/schema/basic';

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
      docx: z.boolean(),
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

    const r2Files: Array<{ key: string, versionId: string }> = [];
    try {
      const listResult = await env.R2_DATA.list({ prefix: 'magic/rule/' });
      for (const obj of listResult.objects ?? []) {
        const key = obj.key;
        const match = key.match(/magic\/rule\/(\d{8})\.txt$/);
        if (match) {
          r2Files.push({ key, versionId: match[1]! });
        }
      }
    } catch (err) {
      console.error('[List] Failed to list R2 files:', err);
    }

    const assetFiles = new Map<string, { txt: boolean, docx: boolean, pdf: boolean }>();
    try {
      const [txtList, docxList, pdfList] = await Promise.all([
        env.R2_ASSET.list({ prefix: 'magic/rule/txt/' }),
        env.R2_ASSET.list({ prefix: 'magic/rule/docx/' }),
        env.R2_ASSET.list({ prefix: 'magic/rule/pdf/' }),
      ]);

      for (const obj of txtList.objects ?? []) {
        const match = obj.key.match(/(\d{8})\.txt$/);
        if (match) {
          const entry = assetFiles.get(match[1]!) ?? { txt: false, docx: false, pdf: false };
          entry.txt = true;
          assetFiles.set(match[1]!, entry);
        }
      }
      for (const obj of docxList.objects ?? []) {
        const match = obj.key.match(/(\d{8})\.docx$/);
        if (match) {
          const entry = assetFiles.get(match[1]!) ?? { txt: false, docx: false, pdf: false };
          entry.docx = true;
          assetFiles.set(match[1]!, entry);
        }
      }
      for (const obj of pdfList.objects ?? []) {
        const match = obj.key.match(/(\d{8})\.pdf$/);
        if (match) {
          const entry = assetFiles.get(match[1]!) ?? { txt: false, docx: false, pdf: false };
          entry.pdf = true;
          assetFiles.set(match[1]!, entry);
        }
      }
    } catch (err) {
      console.error('[List] Failed to list R2 asset files:', err);
    }

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
      assetStatus:   { txt: boolean, docx: boolean, pdf: boolean };
    }> = [];

    const allVersionIds = new Set([...dbVersions.map(v => v.id), ...r2Files.map(f => f.versionId)]);

    for (const versionId of allVersionIds) {
      const dbVersion = dbVersionMap.get(versionId);
      const r2File = r2Files.find(f => f.versionId === versionId);
      const assets = assetFiles.get(versionId) ?? { txt: false, docx: false, pdf: false };

      if (dbVersion) {
        result.push({
          id:            dbVersion.id,
          effectiveDate: dbVersion.effectiveDate,
          publishedAt:   dbVersion.publishedAt,
          totalRules:    dbVersion.totalRules,
          status:        dbVersion.lifecycleStatus,
          importedAt:    dbVersion.importedAt,
          dataStatus:    r2File ? 'imported' : 'missing',
          r2Key:         r2File?.key ?? null,
          assetStatus:   assets,
        });
      } else if (r2File) {
        result.push({
          id:            versionId,
          effectiveDate: null,
          publishedAt:   null,
          totalRules:    null,
          status:        'pending',
          importedAt:    null,
          dataStatus:    'pending',
          r2Key:         r2File.key,
          assetStatus:   assets,
        });
      }
    }

    return result.sort((a, b) => b.id.localeCompare(a.id));
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
