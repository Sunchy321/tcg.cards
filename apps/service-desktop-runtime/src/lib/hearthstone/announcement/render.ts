import type { ImageRequirementRequest } from '@tcg-cards/model/src/hearthstone/schema/data/image';
import type { RenderModel } from '@tcg-cards/model/src/hearthstone/schema/entity';
import { CardImageAsset } from '@tcg-cards/db/schema/shared/hearthstone/card-image';
import { Entity, EntityLocalization } from '@tcg-cards/db/schema/local/hearthstone';
import { Set as HearthstoneSet } from '@tcg-cards/db/schema/local/hearthstone';
import { and, eq, sql } from 'drizzle-orm';
import { createHash } from 'crypto';
import canonicalize from 'canonicalize';
import { getLocalDb } from '../hsdata-local-db';
import { requireHearthstoneImageBucketDir, requireHearthstoneImageRendererBaseUrl } from '../image-config';
import { importCardImageFilesToLocalBucket } from '@tcg-cards/console-api/lib/hearthstone/card-image-local-import';
import { buildCardImageRequestId, buildCardImagePngFileName, buildImageRequestRenderModel } from '@tcg-cards/console-api/lib/hearthstone/card-image';
import type { GlowEntry } from '@tcg-cards/model/src/hearthstone/schema/announcement';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Locale } from '#model/hearthstone/schema/basic';

// ----- Types -----

export interface RenderSideInput {
  cardId:      string;
  buildNumber: number;
  lang:        Locale;
  format:      string | null;
  delta?:      Partial<RenderModel>;
  glow?:       GlowEntry[] | null;
}

export interface RenderResult {
  side:       string;
  lang:       string;
  cardId:     string;
  renderHash: string;
  category:   'base' | 'glow';
  skipped:    boolean;
  fileName:   string;
  error?:     string;
}

// ----- Queries -----

interface ResolvedSide {
  renderModel:      RenderModel;
  renderHash:       string;
  revisionHash:     string;
  localizationHash: string;
  version:          number[];
  setDbfId:         number;
}

async function resolveSideRenderModel(
  cardId: string,
  buildNumber: number,
  lang: Locale,
): Promise<ResolvedSide | null> {
  const db = getLocalDb();

  const rows = await db.select({
    renderModel:      EntityLocalization.renderModel,
    renderHash:       EntityLocalization.renderHash,
    revisionHash:     Entity.revisionHash,
    localizationHash: EntityLocalization.localizationHash,
    version:          Entity.version,
    setDbfId:         HearthstoneSet.dbfId,
  })
    .from(Entity)
    .innerJoin(EntityLocalization, and(
      eq(Entity.cardId, EntityLocalization.cardId),
      eq(Entity.revisionHash, EntityLocalization.revisionHash),
      sql`${Entity.version} && ${EntityLocalization.version}`,
    ))
    .leftJoin(HearthstoneSet, eq(Entity.set, HearthstoneSet.setId))
    .where(and(
      eq(Entity.cardId, cardId),
      eq(EntityLocalization.lang, lang),
      sql`${buildNumber} = ANY(${Entity.version})`,
    ))
    .limit(1);

  const row = rows[0];
  if (!row?.renderModel) return null;

  return {
    renderModel:      row.renderModel as RenderModel,
    renderHash:       row.renderHash!,
    revisionHash:     row.revisionHash,
    localizationHash: row.localizationHash,
    version:          row.version,
    setDbfId:         row.setDbfId ?? 0,
  };
}

// ----- Render model assembly -----

function mergeDeltaOnto(model: RenderModel, delta?: Partial<RenderModel>): RenderModel {
  if (!delta) return model;
  return { ...model, ...delta };
}

function applyGlow(model: RenderModel, glow?: GlowEntry[] | null): RenderModel {
  if (!glow || glow.length === 0) return model;
  return { ...model, glow };
}

function resolveTemplate(format: string | null): string {
  return format === 'battlegrounds' ? 'battlegrounds' : 'normal';
}

function buildRenderHash(model: RenderModel): string {
  return createHash('sha256').update(canonicalize(model)!).digest('hex');
}

// ----- Request builder -----

function buildRenderRequest(
  cardId: string,
  lang: Locale,
  resolved: ResolvedSide,
  renderModel: RenderModel,
  renderHash: string,
  template: string,
  category: 'base' | 'glow',
  r2Bucket: string,
): ImageRequirementRequest {
  const variantDef = {
    zone:     'hand' as const,
    template: template as 'normal' | 'battlegrounds',
    premium:  'normal' as const,
    category,
  };

  const requestId = buildCardImageRequestId(renderHash, variantDef);
  const fileName = buildCardImagePngFileName(requestId);

  return {
    requestId,
    card: {
      cardId,
      lang,
      version:          resolved.version,
      revisionHash:     resolved.revisionHash,
      localizationHash: resolved.localizationHash,
      renderHash,
    },
    variant: {
      zone:     'hand' as const,
      template: template as 'normal' | 'battlegrounds',
      premium:  'normal' as const,
      category,
    },
    renderMode: 'full-set',
    style:      {
      styleKey:              `hand_${template}_normal_default`,
      category,
      zone:                  'hand' as const,
      template:              template as 'normal' | 'battlegrounds',
      premium:               'normal' as const,
      layout:                'default',
      width:                 512,
      height:                768,
      transparentBackground: true,
    },
    output: {
      fileName,
      format:                'png',
      width:                 512,
      height:                768,
      transparentBackground: true,
    },
    target: {
      r2Bucket,
      r2Key:       `hearthstone/card/${category}/hand/${template}/normal/${renderHash.slice(0, 2)}/${renderHash}.webp`,
      contentType: 'image/webp',
    },
    renderModel: buildImageRequestRenderModel(renderModel, resolved.setDbfId),
  };
}

// ----- Render pipeline -----

async function renderSingleSide(input: RenderSideInput): Promise<RenderResult> {
  const db = getLocalDb();
  const resolved = await resolveSideRenderModel(input.cardId, input.buildNumber, input.lang);

  if (!resolved) {
    return {
      side:       input.glow ? 'curr' : 'base',
      lang:       input.lang,
      cardId:     input.cardId,
      renderHash: '',
      category:   'base',
      skipped:    false,
      fileName:   '',
      error:      `版本 ${input.buildNumber} 的卡牌 ${input.cardId} (${input.lang}) 数据未导入`,
    };
  }

  const isCurr = !!input.glow;
  const category = isCurr ? 'glow' : 'base';
  const template = resolveTemplate(input.format);

  const merged = mergeDeltaOnto(resolved.renderModel, input.delta);
  const finalModel = isCurr ? applyGlow(merged, input.glow) : merged;
  const renderHash = buildRenderHash(finalModel);

  const side = isCurr ? 'curr' : 'base';

  // Render
  const rendererBaseUrl = requireHearthstoneImageRendererBaseUrl();
  const bucketDir = requireHearthstoneImageBucketDir();
  const r2Bucket = 'hearthstone-card-images'; // same as existing card images

  const request = buildRenderRequest(
    input.cardId, input.lang, resolved, finalModel, renderHash,
    template, category, r2Bucket,
  );

  const fileName = request.output.fileName;

  try {
    const response = await fetch(`${rendererBaseUrl}/render`, {
      method:  'POST',
      headers: { 'content-type': 'application/json' },
      body:    JSON.stringify(request),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      return { side, lang: input.lang, cardId: input.cardId, renderHash, category, skipped: false, fileName, error: body.trim().slice(0, 200) || `HTTP ${response.status}` };
    }

    const pngBytes = new Uint8Array(await response.arrayBuffer());

    // Convert PNG → WebP via sharp (bun's built-in or bundled)
    // Write to temp, convert, then import
    const tmpDir = join(tmpdir(), 'announcement-render');
    if (!existsSync(tmpDir)) mkdirSync(tmpDir, { recursive: true });
    const pngPath = join(tmpDir, fileName);
    writeFileSync(pngPath, pngBytes);

    // Use the existing import pipeline (expects PNG bytes)
    const requirementContent = JSON.stringify({
      schema:           'tcg.cards.hearthstone.card-image-requirements.v1',
      exportId:         crypto.randomUUID(),
      imageSpecVersion: 'v1',
      generatedAt:      new Date().toISOString(),
      toolContract:     { inputFormat: 'json', outputArchiveFormat: 'zip', outputImageFormat: 'png', fileNamePolicy: 'exact' },
      limits:           { defaultMaxRequests: 1, hardMaxRequests: 1, maxRequests: 1, requestCount: 1, remainingEstimate: 0 },
      batch:            { index: 1, cursor: null, hasMore: false },
      defaults:         { png: { color: 'rgba', transparentBackground: true }, target: { contentType: 'image/webp', webpPreset: 'q86-m4-fast' } },
      requests:         [request],
    });

    await importCardImageFilesToLocalBucket({
      requirementContent,
      requirementName: `${crypto.randomUUID()}.json`,
      files:           [{ fileName, bytes: pngBytes }],
      bucketDir,
      force:           false,
      dryRun:          false,
    });

    // Upsert CardImageAsset
    await db.insert(CardImageAsset).values({
      renderHash,
      category,
      lang:           input.lang,
      zone:           'hand',
      template,
      premium:        'normal',
      r2Bucket,
      r2Key:          request.target!.r2Key!,
      contentType:    'image/webp',
      width:          512,
      height:         768,
      sourceExportId: '',
      status:         'ready' as const,
      verifiedAt:     new Date(),
    }).onConflictDoUpdate({
      target: [CardImageAsset.renderHash, CardImageAsset.category, CardImageAsset.zone, CardImageAsset.template, CardImageAsset.premium],
      set:    { status: 'ready' as const, verifiedAt: new Date() },
    });

    return { side, lang: input.lang, cardId: input.cardId, renderHash, category, skipped: false, fileName };
  } catch (error) {
    console.error('[announcement render] failed', { side: isCurr ? 'curr' : 'base', cardId: input.cardId, lang: input.lang }, error);
    return {
      side, lang:    input.lang, cardId:  input.cardId, renderHash, category, skipped: false, fileName,
      error:   error instanceof Error ? error.message : String(error),
    };
  }
}

// ----- Public API -----

/** Renders all applicable sides for one announcement item. */
export async function renderItem(
  item: {
    type:         string;
    cardId:       string | null;
    format:       string | null;
    version?:     number | null;
    lastVersion?: number | null;
    delta?:       { prev?: Partial<RenderModel>, curr?: Partial<RenderModel> } | null;
    glow?:        GlowEntry[] | null;
  },
  announcement: { version: number, lastVersion?: number | null },
  langs: Locale[],
): Promise<RenderResult[]> {
  const results: RenderResult[] = [];

  if (!item.cardId) return results;

  const resolveVersion = (itemV?: number | null, fallback?: number | null, root?: number) =>
    itemV ?? fallback ?? root!;

  if (item.type === 'card_change') {
    const version = resolveVersion(item.version, undefined, announcement.version);
    for (const lang of langs) {
      results.push(await renderSingleSide({
        cardId:      item.cardId, buildNumber: version, lang,
        format:      item.format, delta:       item.delta?.curr,
      }));
    }
  }

  if (item.type === 'card_update') {
    const version = resolveVersion(item.version, undefined, announcement.version);
    const lastVersion = resolveVersion(item.lastVersion, announcement.lastVersion, announcement.version);

    for (const lang of langs) {
      // prev (no glow)
      results.push(await renderSingleSide({
        cardId:      item.cardId, buildNumber: lastVersion, lang,
        format:      item.format, delta:       item.delta?.prev,
      }));
      // curr (with glow)
      results.push(await renderSingleSide({
        cardId:      item.cardId, buildNumber: version, lang,
        format:      item.format, delta:       item.delta?.curr, glow:        item.glow,
      }));
    }
  }

  return results;
}

/** Returns existing image hashes for announcement items without triggering rendering. */
export async function checkItemImages(
  items: Array<{
    type:         string;
    cardId:       string | null;
    format:       string | null;
    version?:     number | null;
    lastVersion?: number | null;
    delta?:       { prev?: Partial<RenderModel>, curr?: Partial<RenderModel> } | null;
    glow?:        GlowEntry[] | null;
  }>,
  announcement: { version: number, lastVersion?: number | null },
  langs: Locale[],
): Promise<Array<{ cardId: string, side: string, lang: string, hash: string, category: string, template: string, error?: string }>> {
  const results: Array<{ cardId: string, side: string, lang: string, hash: string, category: string, template: string, error?: string }> = [];

  const resolveVersion = (itemV?: number | null, fallback?: number | null, root?: number) =>
    itemV ?? fallback ?? root!;

  for (const item of items) {
    if (!item.cardId) continue;

    const langsOrDefault = langs.length > 0 ? langs : ['en', 'zhs'] as const;
    const template = resolveTemplate(item.format);

    if (item.type === 'card_change') {
      const version = resolveVersion(item.version, undefined, announcement.version);
      for (const lang of langsOrDefault) {
        const resolved = await resolveSideRenderModel(item.cardId, version, lang as Locale);
        if (!resolved) continue;
        const merged = mergeDeltaOnto(resolved.renderModel, item.delta?.curr);
        const hash = buildRenderHash(merged);
        results.push({ cardId: item.cardId, side: 'base', lang, hash, category: 'base', template });
      }
    }

    if (item.type === 'card_update') {
      const version = resolveVersion(item.version, undefined, announcement.version);
      const lastVersion = resolveVersion(item.lastVersion, announcement.lastVersion, announcement.version);

      for (const lang of langsOrDefault) {
        // prev
        const prevResolved = await resolveSideRenderModel(item.cardId, lastVersion, lang as Locale);
        if (prevResolved) {
          const prevMerged = mergeDeltaOnto(prevResolved.renderModel, item.delta?.prev);
          results.push({ cardId: item.cardId, side: 'prev', lang, hash: buildRenderHash(prevMerged), category: 'base', template });
        }
        // curr
        const currResolved = await resolveSideRenderModel(item.cardId, version, lang as Locale);
        if (currResolved) {
          const currMerged = mergeDeltaOnto(currResolved.renderModel, item.delta?.curr);
          const currWithGlow = applyGlow(currMerged, item.glow);
          results.push({ cardId: item.cardId, side: 'curr', lang, hash: buildRenderHash(currWithGlow), category: 'glow', template });
        }
      }
    }
  }

  return results;
}

/** Renders all card-level items of an announcement. */
export async function renderAllItems(
  items: Array<{
    type:         string;
    cardId:       string | null;
    format:       string | null;
    version?:     number | null;
    lastVersion?: number | null;
    delta?:       { prev?: Partial<RenderModel>, curr?: Partial<RenderModel> } | null;
    glow?:        GlowEntry[] | null;
  }>,
  announcement: { version: number, lastVersion?: number | null },
  langs: Locale[],
): Promise<RenderResult[]> {
  const results: RenderResult[] = [];

  for (const item of items) {
    results.push(...await renderItem(item, announcement, langs));
  }

  return results;
}
