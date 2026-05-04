import { os as create } from '@orpc/server';
import { z } from 'zod';

import {
  deleteDocumentVersion,
  importDocumentVersion,
  rematchDocument,
} from '../../lib/magic/document/importer';

interface RuleR2DataBucket {
  get(key: string): Promise<{ text(): Promise<string> } | null>;
  head(key: string): Promise<unknown>;
  put(key: string, value: string | ArrayBuffer | Uint8Array, options?: unknown): Promise<unknown>;
}

interface RuleR2AssetBucket {
  head(key: string): Promise<unknown>;
  put(key: string, value: string | ArrayBuffer | Uint8Array, options?: unknown): Promise<unknown>;
}

interface RuleEnv {
  R2_DATA:  RuleR2DataBucket;
  R2_ASSET: RuleR2AssetBucket;
}

const os = create.$context<{ env: RuleEnv }>();

interface RuleLinks {
  docx?: string;
  pdf?:  string;
  txt?:  string;
}

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

export const deleteVersion = os
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

export const syncLatest = os
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
    const env = context.env;

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

    const versionDate = extractVersionDateFromFilename(links.txt);
    if (!versionDate) {
      throw new Error('Could not extract version date from TXT filename');
    }

    console.log(`[SyncLatest] Found version: ${versionDate}, TXT: ${links.txt}`);

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

    console.log('[SyncLatest] Downloading all file formats...');

    const downloadFile = async (url: string | undefined): Promise<{ content: ArrayBuffer, contentType: string } | null> => {
      if (!url) return null;
      const resp = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.0.36' },
      });
      if (!resp.ok) return null;
      const contentType = resp.headers.get('content-type') ?? 'application/octet-stream';
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
      const normalized = normalizeRuleText(new TextDecoder().decode(txtData.content));
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

export const loadFromData = os
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
    const env = context.env;
    const { versionId } = input;

    const r2Key = `magic/rule/${versionId}.txt`;
    console.log(`[LoadFromData] Checking R2 for ${r2Key}`);

    const object = await env.R2_DATA.get(r2Key);
    if (!object) {
      throw new Error(`File not found in R2: ${r2Key}`);
    }

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

export const uploadToR2 = os
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
    const env = context.env;
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
      await env.R2_DATA.put(r2Key, normalized, {
        httpMetadata:   { contentType },
        customMetadata: { source: 'manual', version: versionDate },
      });
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

export const uploadArchive = os
  .route({
    method:      'POST',
    description: 'Upload multiple files from an extracted archive',
    tags:        ['Magic', 'Rule'],
  })
  .input(z.object({
    files: z.strictObject({
      name:        z.string(),
      content:     z.string(),
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
    const env = context.env;

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

export const rematch = os
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
