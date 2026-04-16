import { os } from '../index';

import { z } from 'zod';
import { db } from '#db/db';
import { eq } from 'drizzle-orm';

import {
  DocumentNode,
  DocumentVersion,
  DocumentVersionImport,
} from '#schema/magic/document';

import {
  changeReviewOverridePayload,
  nodeChangeReviewStateCache,
} from '#model/magic/schema/document';
import { locale } from '#model/magic/schema/basic';

import {
  deleteDocumentVersion,
  importDocumentVersion,
  listDocumentVersions,
  rematchDocument,
} from '~~/server/lib/magic/document/importer';
import { getLocalizedContent } from '~~/server/lib/magic/document/content';
import { getDocumentConfig } from '~~/server/lib/magic/document/config';
import {
  batchReview,
  getChangeDetail,
  listChanges,
  submitReview,
} from '~~/server/lib/magic/document/reviewer';
import {
  compareVersions as compareVersionsFn,
  getNodeHistory,
} from '~~/server/lib/magic/document/history';
import type { HonoEnv } from '../hono-env';

interface RuleLinks {
  docx?: string;
  pdf?:  string;
  txt?:  string;
}

/**
 * Extract DOCX, PDF, and TXT links from Wizards HTML
 */
function extractLinks(html: string): RuleLinks {
  const links: RuleLinks = {};
  const hrefRegex = /href="([^"]+\.(docx|pdf|txt))"/gi;
  let match;

  while ((match = hrefRegex.exec(html)) !== null) {
    const url = match[1]!;
    const ext = match[2]!.toLowerCase();
    const fullUrl = url.startsWith('http') ? url : `https://magic.wizards.com${url}`;

    if (ext === 'docx') links.docx = fullUrl;
    else if (ext === 'pdf') links.pdf = fullUrl;
    else if (ext === 'txt') links.txt = fullUrl;
  }

  return links;
}

function extractVersionDateFromFilename(url: string): string | null {
  try {
    const pathname = new URL(url).pathname;
    const filename = decodeURIComponent(pathname.split('/').at(-1) ?? '');
    const match = filename.match(/(\d{8})/);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

/**
 * Normalize rule text for consistent processing
 * - Remove BOM
 * - Normalize line endings to LF
 * - Ensure trailing newline
 */
function normalizeRuleText(content: string): string {
  return content
    .replace(/^\uFEFF/, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .trimEnd() + '\n';
}

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

const list = os
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
    const env = context.env as HonoEnv['Bindings'];

    // 1. Get imported versions from database
    const dbVersions = (await listDocumentVersions('magic-cr')).map(version => ({
      id:              version.versionTag,
      effectiveDate:   version.effectiveDate,
      publishedAt:     version.publishedAt,
      totalRules:      version.totalNodes,
      lifecycleStatus: version.lifecycleStatus,
      importedAt:      version.importedAt,
    }));

    // 2. Scan files in R2_DATA bucket
    const r2Files: Array<{ key: string, versionId: string }> = [];
    try {
      const listResult = await env.R2_DATA.list({ prefix: 'magic/rule/' });
      for (const obj of listResult.objects || []) {
        const key = obj.key;
        // Match format: magic/rule/YYYYMMDD.txt
        const match = key.match(/magic\/rule\/(\d{8})\.txt$/);
        if (match) {
          r2Files.push({ key, versionId: match[1]! });
        }
      }
    } catch (err) {
      console.error('[List] Failed to list R2 files:', err);
    }

    // 3. Scan files in R2_ASSET bucket for txt/docx/pdf
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

    // 4. Merge results
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

    // Collect all version IDs from both DB and R2
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

    // Sort by ID descending (newest first)
    return result.sort((a, b) => b.id.localeCompare(a.id));
  });

const get = os
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

const getNodes = os
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

const deleteVersion = os
  .route({
    method:      'DELETE',
    description: 'Delete a rule version',
    tags:        ['Magic', 'Rule'],
  })
  .input(z.object({
    id: z.string(),
  }))
  .output(z.void())
  .handler(async ({ input }) => {
    await deleteDocumentVersion(toDocumentVersionId(input.id));
  });

const syncLatest = os
  .route({
    method:      'POST',
    description: 'Sync latest rules from Wizards website',
    tags:        ['Magic', 'Rule'],
  })
  .input(z.void())
  .output(z.strictObject({
    success:    z.boolean(),
    sourceId:   z.string(),
    message:    z.string(),
    downloaded: z.boolean(),
  }))
  .handler(async ({ context }) => {
    const env = context.env as HonoEnv['Bindings'];

    // Step 1: Fetch rules page and extract links
    console.log('[SyncLatest] Fetching Wizards rules page...');
    const response = await fetch('https://magic.wizards.com/en/rules', {
      headers: {
        'User-Agent':      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.0.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.0.36',
        'Accept':          'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      redirect: 'follow',
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch rules page: HTTP ${response.status}`);
    }

    const html = await response.text();
    const links = extractLinks(html);

    if (!links.txt) {
      throw new Error('No TXT link found on rules page');
    }

    // Step 2: Extract version from TXT filename
    const versionDate = extractVersionDateFromFilename(links.txt);
    if (!versionDate) {
      throw new Error('Could not extract version date from TXT filename');
    }

    console.log(`[SyncLatest] Found version: ${versionDate}, TXT: ${links.txt}`);

    // Step 3: Check if files already exist in R2
    const dataR2Key = `magic/rule/${versionDate}.txt`;
    const assetTxtKey = `magic/rule/txt/${versionDate}.txt`;
    const assetDocxKey = links.docx ? `magic/rule/docx/${versionDate}.docx` : null;
    const assetPdfKey = links.pdf ? `magic/rule/pdf/${versionDate}.pdf` : null;

    console.log('[SyncLatest] Checking if files exist in R2...');
    const [existingData, existingTxt, existingDocx, existingPdf] = await Promise.all([
      env.R2_DATA.head(dataR2Key),
      env.R2_ASSET.head(assetTxtKey),
      assetDocxKey ? env.R2_ASSET.head(assetDocxKey) : Promise.resolve(null),
      assetPdfKey ? env.R2_ASSET.head(assetPdfKey) : Promise.resolve(null),
    ]);

    if (existingData && existingTxt && (!assetDocxKey || existingDocx) && (!assetPdfKey || existingPdf)) {
      console.log('[SyncLatest] Files already exist in R2, skipping download');
      return {
        success:    true,
        sourceId:   versionDate,
        message:    'Files already exist in R2',
        downloaded: false,
      };
    }

    // Step 4: Download missing files and upload to R2
    console.log('[SyncLatest] Downloading all file formats...');

    const downloadFile = async (url: string | undefined): Promise<{ content: ArrayBuffer, contentType: string } | null> => {
      if (!url) return null;
      const resp = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.0.36' },
      });
      if (!resp.ok) return null;
      const contentType = resp.headers.get('content-type') || 'application/octet-stream';
      return { content: await resp.arrayBuffer(), contentType };
    };

    const needsTxtDownload = !existingTxt || !existingData;

    const [txtData, docxData, pdfData] = await Promise.all([
      needsTxtDownload ? downloadFile(links.txt) : Promise.resolve(null),
      !existingDocx ? downloadFile(links.docx) : Promise.resolve(null),
      !existingPdf ? downloadFile(links.pdf) : Promise.resolve(null),
    ]);

    if (needsTxtDownload && !txtData) {
      throw new Error('Failed to download TXT file');
    }

    const uploadToAsset = async (key: string, data: { content: ArrayBuffer, contentType: string }, originalUrl: string) => {
      await env.R2_ASSET.put(key, data.content, {
        httpMetadata:   { contentType: data.contentType },
        customMetadata: { source: 'wizards', version: versionDate, originalUrl },
      });
      console.log(`[SyncLatest] Uploaded to asset bucket: ${key}`);
    };

    await Promise.all([
      !existingTxt && txtData && uploadToAsset(assetTxtKey, txtData, links.txt),
      !existingDocx && docxData && links.docx && uploadToAsset(assetDocxKey!, docxData, links.docx),
      !existingPdf && pdfData && links.pdf && uploadToAsset(assetPdfKey!, pdfData, links.pdf),
    ].filter(Boolean));

    if (!existingData && txtData) {
      const normalized = normalizeRuleText(Buffer.from(txtData.content).toString('utf8'));
      await env.R2_DATA.put(dataR2Key, normalized, {
        httpMetadata:   { contentType: 'text/plain' },
        customMetadata: { source: 'wizards', version: versionDate, originalUrl: links.txt },
      });
      console.log(`[SyncLatest] Uploaded to data bucket: ${dataR2Key}`);
    }

    return {
      success:    true,
      sourceId:   versionDate,
      message:    'Successfully downloaded latest rules to R2',
      downloaded: true,
    };
  });

const loadFromData = os
  .route({
    method:      'POST',
    description: 'Load rule version from Data bucket',
    tags:        ['Magic', 'Rule'],
  })
  .input(z.object({
    versionId: z.string().regex(/^\d{8}$/, 'Version ID must be YYYYMMDD format'),
  }))
  .output(z.strictObject({
    success:          z.boolean(),
    sourceId:         z.string(),
    totalNodes:       z.number(),
    newEntities:      z.number(),
    existingEntities: z.number(),
    changes:          z.strictObject({
      added:    z.number(),
      removed:  z.number(),
      modified: z.number(),
      renamed:  z.number(),
      moved:    z.number(),
      split:    z.number(),
      merged:   z.number(),
    }),
  }))
  .handler(async ({ input, context }) => {
    const env = context.env as HonoEnv['Bindings'];
    const { versionId } = input;

    // 1. Check if file exists in R2
    const r2Key = `magic/rule/${versionId}.txt`;
    console.log(`[LoadFromData] Checking R2 for ${r2Key}`);

    const object = await env.R2_DATA.get(r2Key);
    if (!object) {
      throw new Error(`File not found in R2: ${r2Key}`);
    }

    // 2. Read file content
    const txtContent = await object.text();
    console.log(`[LoadFromData] File size: ${txtContent.length} bytes`);

    const result = await importDocumentVersion({
      documentId: 'magic-cr',
      content:    txtContent,
      versionTag: versionId,
    });

    console.log(`[LoadFromData] Import completed: ${result.totalNodes} nodes`);

    return {
      success:          true,
      sourceId:         versionId,
      totalNodes:       result.totalNodes,
      newEntities:      0,
      existingEntities: 0,
      changes:          {
        added:    0,
        removed:  0,
        modified: 0,
        renamed:  0,
        moved:    0,
        split:    0,
        merged:   0,
      },
    };
  });

const uploadToR2 = os
  .route({
    method:      'POST',
    description: 'Upload a rule file to R2 bucket',
    tags:        ['Magic', 'Rule'],
  })
  .input(z.object({
    content:     z.string(),
    fileType:    z.enum(['txt', 'pdf', 'docx']).default('txt'),
    versionDate: z.string().regex(/^\d{8}$/, 'Version date must be YYYYMMDD format'),
  }))
  .output(z.strictObject({
    success:  z.boolean(),
    sourceId: z.string(),
    r2Key:    z.string(),
  }))
  .handler(async ({ input, context }) => {
    const env = context.env as HonoEnv['Bindings'];
    const versionDate = input.versionDate;

    const ext = input.fileType;
    const r2Key = ext === 'txt'
      ? `magic/rule/${versionDate}.txt`
      : `magic/rule/${ext}/${versionDate}.${ext}`;

    const contentType = {
      txt:  'text/plain',
      pdf:  'application/pdf',
      docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    }[input.fileType];

    if (input.fileType === 'txt') {
      const normalized = normalizeRuleText(input.content);
      // Upload normalized to DATA bucket for processing
      await env.R2_DATA.put(r2Key, normalized, {
        httpMetadata:   { contentType },
        customMetadata: { source: 'manual', version: versionDate },
      });
      // Upload original to ASSET bucket as archive
      const assetR2Key = `magic/rule/txt/${versionDate}.txt`;
      await env.R2_ASSET.put(assetR2Key, input.content, {
        httpMetadata:   { contentType },
        customMetadata: { source: 'manual', version: versionDate },
      });
    } else {
      const binaryString = atob(input.content);
      const binary = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        binary[i] = binaryString.charCodeAt(i);
      }
      await env.R2_ASSET.put(r2Key, binary, {
        httpMetadata:   { contentType },
        customMetadata: { source: 'manual', version: versionDate },
      });
    }

    console.log(`[UploadToR2] Uploaded ${r2Key}`);

    return {
      success:  true,
      sourceId: versionDate,
      r2Key,
    };
  });

const uploadArchive = os
  .route({
    method:      'POST',
    description: 'Upload multiple files from an extracted archive',
    tags:        ['Magic', 'Rule'],
  })
  .input(z.object({
    files: z.strictObject({
      name:        z.string(),
      content:     z.string(), // base64 for binary files, text for txt
      fileType:    z.enum(['txt', 'pdf', 'docx']),
      versionDate: z.string().optional(),
    }).array(),
  }))
  .output(z.strictObject({
    success:  z.boolean(),
    uploaded: z.number(),
    failed:   z.number(),
    details:  z.strictObject({
      name:   z.string(),
      status: z.enum(['success', 'error']),
      r2Key:  z.string().optional(),
      error:  z.string().optional(),
    }).array(),
  }))
  .handler(async ({ input, context }) => {
    const env = context.env as HonoEnv['Bindings'];

    const results: Array<{ name: string, status: 'success' | 'error', r2Key?: string, error?: string }> = [];
    let uploaded = 0;
    let failed = 0;

    for (const file of input.files) {
      try {
        const versionDate = file.versionDate;

        if (!versionDate) {
          results.push({ name: file.name, status: 'error', error: 'Could not extract version date from filename' });
          failed++;
          continue;
        }

        if (file.fileType === 'txt') {
          const normalized = normalizeRuleText(file.content);
          await env.R2_DATA.put(`magic/rule/${versionDate}.txt`, normalized, {
            httpMetadata:   { contentType: 'text/plain' },
            customMetadata: { source: 'archive', version: versionDate },
          });
          await env.R2_ASSET.put(`magic/rule/txt/${versionDate}.txt`, file.content, {
            httpMetadata:   { contentType: 'text/plain' },
            customMetadata: { source: 'archive', version: versionDate },
          });
          results.push({ name: file.name, status: 'success', r2Key: `magic/rule/${versionDate}.txt` });
          uploaded++;
        } else {
          const contentType = file.fileType === 'pdf'
            ? 'application/pdf'
            : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
          const r2Key = `magic/rule/${file.fileType}/${versionDate}.${file.fileType}`;

          // Decode base64 for binary files
          const binaryString = atob(file.content);
          const binary = new Uint8Array(binaryString.length);
          for (let i = 0; i < binaryString.length; i++) {
            binary[i] = binaryString.charCodeAt(i);
          }

          await env.R2_ASSET.put(r2Key, binary, {
            httpMetadata:   { contentType },
            customMetadata: { source: 'archive', version: versionDate },
          });
          results.push({ name: file.name, status: 'success', r2Key });
          uploaded++;
        }
      } catch (error) {
        results.push({
          name:   file.name,
          status: 'error',
          error:  error instanceof Error ? error.message : 'Upload failed',
        });
        failed++;
      }
    }

    return {
      success: failed === 0,
      uploaded,
      failed,
      details: results,
    };
  });

const rematch = os
  .route({
    method:      'POST',
    description: 'Re-run entity matching and change detection for all versions of a document',
    tags:        ['Magic', 'Rule'],
  })
  .input(z.object({
    documentId: z.string(),
  }))
  .output(z.void())
  .handler(async ({ input }) => {
    await rematchDocument(input.documentId);
  });

const changes = os
  .route({
    method:      'GET',
    description: 'List changes between two versions with optional review status filter',
    tags:        ['Magic', 'Rule'],
  })
  .input(z.object({
    documentId:    z.string(),
    fromVersionId: z.string(),
    toVersionId:   z.string(),
    status:        nodeChangeReviewStateCache.array().optional(),
    page:          z.number().int().positive().optional(),
    pageSize:      z.number().int().positive().max(200).optional(),
  }))
  .handler(async ({ input }) => {
    return listChanges(input);
  });

const change = os
  .route({
    method:      'GET',
    description: 'Get a single change with its relations and review history',
    tags:        ['Magic', 'Rule'],
  })
  .input(z.object({
    changeId: z.string().uuid(),
  }))
  .handler(async ({ input }) => {
    return getChangeDetail(input.changeId);
  });

const review = os
  .route({
    method:      'POST',
    description: 'Submit a review for a change (confirm, reject, or override)',
    tags:        ['Magic', 'Rule'],
  })
  .input(z.object({
    changeId:        z.string().uuid(),
    status:          z.enum(['confirmed', 'rejected', 'override']),
    reason:          z.string().optional(),
    overridePayload: changeReviewOverridePayload.optional(),
  }))
  .handler(async ({ input }) => {
    return submitReview(input);
  });

const reviewBatch = os
  .route({
    method:      'POST',
    description: 'Batch review multiple changes with the same status',
    tags:        ['Magic', 'Rule'],
  })
  .input(z.object({
    changeIds: z.string().uuid().array().min(1).max(100),
    status:    z.enum(['confirmed', 'rejected']),
    reason:    z.string().optional(),
  }))
  .handler(async ({ input }) => {
    return batchReview(input);
  });

const nodeHistory = os
  .route({
    method:      'GET',
    description: 'Get the history timeline of a node entity across all versions',
    tags:        ['Magic', 'Rule'],
  })
  .input(z.object({
    documentId: z.string(),
    entityId:   z.string(),
  }))
  .handler(async ({ input }) => {
    return getNodeHistory(input);
  });

const compareVersions = os
  .route({
    method:      'GET',
    description: 'Compare two versions of a document, returning changes and diff mode',
    tags:        ['Magic', 'Rule'],
  })
  .input(z.object({
    documentId:    z.string(),
    fromVersionId: z.string(),
    toVersionId:   z.string(),
  }))
  .handler(async ({ input }) => {
    return compareVersionsFn(input);
  });

export const ruleTrpc = {
  list,
  get,
  getNodes,
  loadFromData,
  uploadToR2,
  uploadArchive,
  syncLatest,
  delete: deleteVersion,
  rematch,
  changes,
  change,
  review,
  reviewBatch,
  nodeHistory,
  compareVersions,
};
