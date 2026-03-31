import { os } from '../index';
// import { os } from '@orpc/server';
import { z } from 'zod';
import { db } from '#db/db';
import { and, desc, eq } from 'drizzle-orm';
import { RuleSource, RuleEntity, RuleNode, RuleChange } from '#schema/magic/rule';
import { parseAndCompressRuleFile } from '#server/lib/magic/rule';
import { importRuleVersion } from '~~/server/lib/magic/rule/importer';
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

/**
 * Extract version date from rule text content
 * Parses "These rules are effective as of February 27, 2026." format
 */
function extractVersionDateFromContent(content: string): string | null {
  const match = content.match(/effective as of ([A-Za-z]+ \d{1,2}, \d{4})/i);
  if (!match) return null;

  const dateStr = match[1]!;
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return null;

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}${month}${day}`;
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
    r2Status:      z.enum(['imported', 'pending', 'missing']), // Import status
    r2Key:         z.string().nullable(), // R2 file path
  }).array())
  .handler(async ({ context }) => {
    const env = context.env as HonoEnv['Bindings'];

    // 1. Get imported versions from database
    const dbVersions = await db
      .select({
        id:            RuleSource.id,
        effectiveDate: RuleSource.effectiveDate,
        publishedAt:   RuleSource.publishedAt,
        totalRules:    RuleSource.totalRules,
        status:        RuleSource.status,
        importedAt:    RuleSource.importedAt,
      })
      .from(RuleSource)
      .orderBy(desc(RuleSource.effectiveDate));

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

    // 3. Merge results
    const dbVersionMap = new Map(dbVersions.map(v => [v.id, v]));
    const result: Array<{
      id:            string;
      effectiveDate: string | null;
      publishedAt:   string | null;
      totalRules:    number | null;
      status:        string;
      importedAt:    Date | null;
      r2Status:      'imported' | 'pending' | 'missing';
      r2Key:         string | null;
    }> = [];

    // Collect all version IDs from both DB and R2
    const allVersionIds = new Set([...dbVersions.map(v => v.id), ...r2Files.map(f => f.versionId)]);

    for (const versionId of allVersionIds) {
      const dbVersion = dbVersionMap.get(versionId);
      const r2File = r2Files.find(f => f.versionId === versionId);

      if (dbVersion) {
        // Already imported to database
        result.push({
          ...dbVersion,
          r2Status: r2File ? 'imported' : 'missing',
          r2Key:    r2File?.key || null,
        });
      } else if (r2File) {
        // In R2 but not imported yet
        result.push({
          id:            versionId,
          effectiveDate: null,
          publishedAt:   null,
          totalRules:    null,
          status:        'pending',
          importedAt:    null,
          r2Status:      'pending',
          r2Key:         r2File.key,
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
      .select()
      .from(RuleSource)
      .where(eq(RuleSource.id, input.id))
      .limit(1);

    if (!result[0]) {
      throw new Error('Rule version not found');
    }

    return result[0];
  });

const getChanges = os
  .route({
    method:      'GET',
    description: 'Get changes between versions',
    tags:        ['Magic', 'Rule'],
  })
  .input(z.object({
    fromSourceId: z.string(),
    toSourceId:   z.string(),
  }))
  .output(z.strictObject({
    id:           z.string(),
    fromSourceId: z.string(),
    toSourceId:   z.string(),
    entityId:     z.string(),
    fromNodeId:   z.string().nullable(),
    toNodeId:     z.string().nullable(),
    type:         z.string(),
    details:      z.string(),
    createdAt:    z.date(),
  }).array())
  .handler(async ({ input }) => {
    return await db
      .select()
      .from(RuleChange)
      .where(and(
        eq(RuleChange.fromSourceId, input.fromSourceId),
        eq(RuleChange.toSourceId, input.toSourceId)),
      )
      .orderBy(desc(RuleChange.createdAt));
  });

const getEntityHistory = os
  .route({
    method:      'GET',
    description: 'Get entity revision history',
    tags:        ['Magic', 'Rule'],
  })
  .input(z.object({
    entityId: z.string(),
  }))
  .output(z.strictObject({
    entity: z.strictObject({
      id:              z.string(),
      currentNodeId:   z.string().nullable(),
      currentRuleId:   z.string().nullable(),
      currentSourceId: z.string().nullable(),
      totalRevisions:  z.number(),
      createdAt:       z.date(),
    }),
    revisions: z.strictObject({
      sourceId:   z.string(),
      ruleId:     z.string(),
      title:      z.string().nullable(),
      changeType: z.string().nullable(),
    }).array(),
  }))
  .handler(async ({ input }) => {
    const entity = await db
      .select()
      .from(RuleEntity)
      .where(eq(RuleEntity.id, input.entityId))
      .limit(1)
      .then(rows => rows[0]);

    if (!entity) {
      throw new Error('Entity not found');
    }

    const nodes = await db
      .select({
        sourceId: RuleNode.sourceId,
        ruleId:   RuleNode.ruleId,
        title:    RuleNode.title,
      })
      .from(RuleNode)
      .where(eq(RuleNode.entityId, input.entityId))
      .orderBy(RuleNode.sourceId);

    const changes = await db
      .select({
        entityId:   RuleChange.entityId,
        type:       RuleChange.type,
        toSourceId: RuleChange.toSourceId,
      })
      .from(RuleChange)
      .where(eq(RuleChange.entityId, input.entityId));

    const changeMap = new Map(changes.map(c => [c.toSourceId, c.type]));

    const revisions = nodes.map(node => ({
      sourceId:   node.sourceId,
      ruleId:     node.ruleId,
      title:      node.title,
      changeType: changeMap.get(node.sourceId) || null,
    }));

    return {
      entity,
      revisions,
    };
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
    await db.transaction(async tx => {
      // Delete changes referencing this version
      await tx.delete(RuleChange)
        .where(eq(RuleChange.fromSourceId, input.id));
      await tx.delete(RuleChange)
        .where(eq(RuleChange.toSourceId, input.id));

      // Delete nodes
      await tx.delete(RuleNode)
        .where(eq(RuleNode.sourceId, input.id));

      // Delete source
      await tx.delete(RuleSource)
        .where(eq(RuleSource.id, input.id));
    });
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

    // Step 2: Download TXT file to extract version from content
    console.log('[SyncLatest] Downloading TXT file...');
    const txtResponse = await fetch(links.txt, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.0.36',
      },
    });

    if (!txtResponse.ok) {
      throw new Error(`Failed to download TXT file: HTTP ${txtResponse.status}`);
    }

    const txtContent = await txtResponse.text();

    // Extract version date from content
    const versionDate = extractVersionDateFromContent(txtContent);
    if (!versionDate) {
      throw new Error('Could not extract version date from TXT content');
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

    // Step 4: Download all formats and upload to R2
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

    const [txtData, docxData, pdfData] = await Promise.all([
      Promise.resolve({ content: new TextEncoder().encode(txtContent).buffer as ArrayBuffer, contentType: 'text/plain' }),
      downloadFile(links.docx),
      downloadFile(links.pdf),
    ]);

    const uploadToAsset = async (key: string, data: { content: ArrayBuffer, contentType: string }, originalUrl: string) => {
      await env.R2_ASSET.put(key, data.content, {
        httpMetadata:   { contentType: data.contentType },
        customMetadata: { source: 'wizards', version: versionDate, originalUrl },
      });
      console.log(`[SyncLatest] Uploaded to asset bucket: ${key}`);
    };

    await Promise.all([
      !existingTxt && uploadToAsset(assetTxtKey, txtData, links.txt),
      !existingDocx && docxData && links.docx && uploadToAsset(assetDocxKey!, docxData, links.docx),
      !existingPdf && pdfData && links.pdf && uploadToAsset(assetPdfKey!, pdfData, links.pdf),
    ].filter(Boolean));

    if (!existingData) {
      const normalized = normalizeRuleText(txtContent);
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

    // 3. Check if already imported
    const existing = await db
      .select({ id: RuleSource.id })
      .from(RuleSource)
      .where(eq(RuleSource.id, versionId))
      .limit(1);

    if (existing.length > 0) {
      throw new Error(`Version ${versionId} already imported to database`);
    }

    // 4. Parse rule file
    console.log('[LoadFromData] Parsing rule file...');
    const { source, contents } = await parseAndCompressRuleFile(versionId, txtContent);

    // Set effective date
    source.effectiveDate = `${versionId.slice(0, 4)}-${versionId.slice(4, 6)}-${versionId.slice(6, 8)}`;
    source.publishedAt = new Date().toISOString().split('T')[0]!;

    // 5. Clear all existing rule data before import
    console.log('[LoadFromData] Clearing existing rule data...');
    await db.transaction(async tx => {
      // Delete all change records
      await tx.delete(RuleChange);
      // Delete all rule nodes
      await tx.delete(RuleNode);
      // Delete all rule entities
      await tx.delete(RuleEntity);
      // Delete all rule sources
      await tx.delete(RuleSource);
    });
    console.log('[LoadFromData] Existing rule data cleared');

    // 6. Build R2 URL
    const r2Url = `https://${env.R2_DATA_BUCKET}.r2.cloudflarestorage.com/${r2Key}`;

    // 7. Execute import
    const result = await importRuleVersion(source, contents, {
      txtUrl:      r2Url,
      publishedAt: source.publishedAt,
    });

    console.log(`[LoadFromData] Import completed: ${result.totalNodes} nodes`);

    return {
      success: true,
      ...result,
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
    versionDate: z.string().regex(/^\d{8}$/, 'Version date must be YYYYMMDD format').optional(),
  }))
  .output(z.strictObject({
    success:  z.boolean(),
    sourceId: z.string(),
    r2Key:    z.string(),
  }))
  .handler(async ({ input, context }) => {
    const env = context.env as HonoEnv['Bindings'];

    let versionDate: string;
    if (input.versionDate) {
      versionDate = input.versionDate;
    } else if (input.fileType === 'txt') {
      const normalized = normalizeRuleText(input.content);
      const extracted = extractVersionDateFromContent(normalized);
      if (!extracted) {
        throw new Error('Could not extract version date from TXT content');
      }
      versionDate = extracted;
    } else {
      throw new Error('versionDate is required for non-TXT files');
    }

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
        let versionDate = file.versionDate;

        // For TXT files, try to extract version from content if not provided
        if (file.fileType === 'txt' && !versionDate) {
          const normalized = normalizeRuleText(file.content);
          versionDate = extractVersionDateFromContent(normalized) || undefined;
        }

        if (!versionDate) {
          results.push({ name: file.name, status: 'error', error: 'Could not extract version date' });
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

export const ruleTrpc = {
  list,
  get,
  loadFromData,
  uploadToR2,
  uploadArchive,
  getChanges,
  getEntityHistory,
  syncLatest,
  delete: deleteVersion,
};
