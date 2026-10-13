import type { ImageRequirementRequest, ImageRequestOverride } from '@tcg-cards/model/hearthstone/schema/data/image';
import type { RenderModel } from '@tcg-cards/model/hearthstone/schema/entity';
import { CardImageAsset } from '@tcg-cards/db/schema/shared/hearthstone/card-image';
import { Entity, EntityLocalization } from '@tcg-cards/db/schema/local/hearthstone';
import { Set as HearthstoneSet } from '@tcg-cards/db/schema/local/hearthstone';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { getLocalDb } from '../hsdata-local-db';
import { requireHearthstoneImageBucketDir, requireHearthstoneImageRendererBaseUrl } from '../image-config';
import { importCardImageFilesToLocalBucket } from '@tcg-cards/console-api/lib/hearthstone/card-image-local-import';
import { buildRequest, type ImageCandidateRow } from '@tcg-cards/console-api/lib/hearthstone/card-image';
import type { GlowEntry } from '@tcg-cards/model/hearthstone/schema/announcement';
import { computeRenderHash } from '@tcg-cards/shared/hearthstone/render-hash';
import { sortGlow } from '@tcg-cards/shared/hearthstone/glow';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { locale, type Locale } from '#model/hearthstone/schema/basic';

// ----- Types -----

/** Per-side render-model correction; `override` is routed to the render request, not the render model. */
export type RenderSideDelta = Partial<RenderModel> & { override?: ImageRequestOverride };

/** Per-side render corrections for one announcement item. */
export interface RenderItemDelta {
  prev?: RenderSideDelta;
  curr?: RenderSideDelta;
}

export interface RenderSideInput {
  itemKey:     string;
  side:        'base' | 'prev' | 'curr';
  cardId:      string;
  buildNumber: number;
  lang:        Locale;
  format:      string | null;
  delta?:      RenderSideDelta;
  glow?:       GlowEntry[] | null;
}

export interface RenderResult {
  itemKey:    string;
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
  mechanics:        Record<string, boolean | number>;
}

/** Couples one derived announcement side with its standard image request. */
export interface PreparedRender {
  itemKey:  string;
  side:     'base' | 'prev' | 'curr';
  lang:     Locale;
  cardId:   string;
  request?: ImageRequirementRequest;
  error?:   string;
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
    mechanics:        Entity.mechanics,
  })
    .from(Entity)
    .innerJoin(EntityLocalization, and(
      eq(Entity.cardId, EntityLocalization.cardId),
      eq(Entity.revisionHash, EntityLocalization.revisionHash),
      sql`${Entity.version} && ${EntityLocalization.version}`,
      sql`${buildNumber} = ANY(${EntityLocalization.version})`,
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
    mechanics:        row.mechanics as Record<string, boolean | number>,
  };
}

/** One entity+localization row fetched for batched render-model lookups. */
interface SideRenderModelRow {
  cardId:              string;
  lang:                string;
  entityVersion:       number[];
  localizationVersion: number[];
  renderModel:         RenderModel | null;
  renderHash:          string | null;
  revisionHash:        string;
  localizationHash:    string;
  setDbfId:            number | null;
  mechanics:           Record<string, boolean | number> | null;
}

/** Fetches render-model rows for many (cardId, lang) pairs in a single query. */
async function fetchSideRenderModelRows(cardIds: string[], langs: Locale[]): Promise<SideRenderModelRow[]> {
  if (cardIds.length === 0 || langs.length === 0) return [];
  const db = getLocalDb();
  return db.select({
    cardId:              Entity.cardId,
    lang:                EntityLocalization.lang,
    entityVersion:       Entity.version,
    localizationVersion: EntityLocalization.version,
    renderModel:         EntityLocalization.renderModel,
    renderHash:          EntityLocalization.renderHash,
    revisionHash:        Entity.revisionHash,
    localizationHash:    EntityLocalization.localizationHash,
    setDbfId:            HearthstoneSet.dbfId,
    mechanics:           Entity.mechanics,
  })
    .from(Entity)
    .innerJoin(EntityLocalization, and(
      eq(Entity.cardId, EntityLocalization.cardId),
      eq(Entity.revisionHash, EntityLocalization.revisionHash),
      sql`${Entity.version} && ${EntityLocalization.version}`,
    ))
    .leftJoin(HearthstoneSet, eq(Entity.set, HearthstoneSet.setId))
    .where(and(
      inArray(Entity.cardId, cardIds),
      inArray(EntityLocalization.lang, langs),
    ));
}

// ----- Render model assembly -----

function mergeDeltaOnto(model: RenderModel, delta?: RenderSideDelta): RenderModel {
  if (!delta) return model;
  const { override: _override, ...rest } = delta;
  return { ...model, ...rest };
}

function applyGlow(model: RenderModel, glow?: GlowEntry[] | null): RenderModel {
  if (!glow || glow.length === 0) return model;
  return { ...model, glow: sortGlow(glow) };
}

function resolveTemplate(format: string | null): string {
  return format === 'battlegrounds' ? 'battlegrounds' : 'normal';
}

// ----- Request builder -----

/** The mechanic tag marking a card as premium (has a golden version). */
const PREMIUM_MECHANIC = '12';

function buildRenderRequest(
  cardId: string,
  lang: Locale,
  resolved: ResolvedSide,
  renderModel: RenderModel,
  renderHash: string,
  template: string,
  category: 'base' | 'glow',
  r2Bucket: string,
  override?: ImageRequestOverride,
): ImageRequirementRequest {
  const mechanics = resolved.mechanics ?? {};
  const variant = {
    zone:     'hand' as const,
    template: template as 'normal' | 'battlegrounds',
    premium:  mechanics[PREMIUM_MECHANIC] ? 'golden' as const : 'normal' as const,
    category,
  };
  const candidate: ImageCandidateRow = {
    cardId,
    lang,
    version:          resolved.version,
    revisionHash:     resolved.revisionHash,
    localizationHash: resolved.localizationHash,
    renderHash,
    renderModel,
    type:             renderModel.type,
    set:              String(renderModel.set),
    setDbfId:         resolved.setDbfId,
    techLevel:        renderModel.techLevel ?? null,
    mechanics,
  };

  return buildRequest(candidate, variant, r2Bucket, override);
}

/** Resolves one announcement side and builds the same request used by the image workflow. */
export async function prepareSingleSide(input: RenderSideInput): Promise<PreparedRender> {
  const resolved = await resolveSideRenderModel(input.cardId, input.buildNumber, input.lang);
  if (!resolved) {
    return {
      itemKey: input.itemKey, side:    input.side, lang:    input.lang, cardId:  input.cardId,
      error:   `版本 ${input.buildNumber} 的卡牌 ${input.cardId} (${input.lang}) 数据未导入`,
    };
  }

  const isCurr = input.side === 'curr';
  const category = isCurr && input.glow && input.glow.length > 0 ? 'glow' : 'base';
  // The side stays on `input.cardId`; a delta.cardId override is ignored.
  const merged = { ...mergeDeltaOnto(resolved.renderModel, input.delta), cardId: input.cardId };
  const renderModel = isCurr ? applyGlow(merged, input.glow) : merged;
  const renderHash = computeRenderHash(renderModel);
  const request = buildRenderRequest(
    input.cardId,
    input.lang,
    resolved,
    renderModel,
    renderHash,
    resolveTemplate(input.format),
    category,
    'hearthstone-card-images',
    input.delta?.override,
  );

  return { itemKey: input.itemKey, side: input.side, lang: input.lang, cardId: input.cardId, request };
}

// ----- Render pipeline -----

export async function renderSingleSide(input: RenderSideInput): Promise<RenderResult> {
  const db = getLocalDb();
  const prepared = await prepareSingleSide(input);

  if (!prepared.request) {
    return {
      side:       input.side,
      itemKey:    input.itemKey,
      lang:       input.lang,
      cardId:     input.cardId,
      renderHash: '',
      category:   'base',
      skipped:    false,
      fileName:   '',
      error:      prepared.error,
    };
  }
  const request = prepared.request;
  const renderHash = request.card.renderHash;
  const category = request.variant.category;
  const template = request.variant.template;
  const isCurr = input.side === 'curr';
  const side = input.side;

  // Render
  const rendererBaseUrl = requireHearthstoneImageRendererBaseUrl();
  const bucketDir = requireHearthstoneImageBucketDir();
  const r2Bucket = request.target.r2Bucket;

  const fileName = request.output.fileName;

  try {
    const response = await fetch(`${rendererBaseUrl}/render`, {
      method:  'POST',
      headers: { 'content-type': 'application/json' },
      body:    JSON.stringify(request),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      return { itemKey: input.itemKey, side, lang: input.lang, cardId: input.cardId, renderHash, category, skipped: false, fileName, error: body.trim().slice(0, 200) || `HTTP ${response.status}` };
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
      // "写入存储" must overwrite existing files whose bytes differ (e.g. after
      // a renderer change) instead of silently ignoring them.
      force:           true,
      dryRun:          false,
    });

    // Upsert CardImageAsset
    await db.insert(CardImageAsset).values({
      renderHash,
      category,
      lang:           input.lang,
      zone:           'hand',
      template,
      premium:        request.variant.premium,
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

    return { itemKey: input.itemKey, side, lang: input.lang, cardId: input.cardId, renderHash, category, skipped: false, fileName };
  } catch (error) {
    console.error('[announcement render] failed', { side: isCurr ? 'curr' : 'base', cardId: input.cardId, lang: input.lang }, error);
    return {
      itemKey: input.itemKey, side, lang:    input.lang, cardId:  input.cardId, renderHash, category, skipped: false, fileName,
      error:   error instanceof Error ? error.message : String(error),
    };
  }
}

// ----- Public API -----

/** Announcement item shape that drives per-side card rendering. */
export interface RenderItemLike {
  itemKey:      string;
  type:         string;
  cardId:       string | null;
  format:       string | null;
  version?:     number | null;
  lastVersion?: number | null;
  delta?:       RenderItemDelta | null;
  glow?:        GlowEntry[] | null;
}

/** Builds the per-side render inputs for announcement items, without rendering. */
export function buildRenderSideInputs(
  items: RenderItemLike[],
  announcement: { version: number, lastVersion?: number | null },
  langs: Locale[],
): RenderSideInput[] {
  const inputs: RenderSideInput[] = [];
  const resolveVersion = (itemV?: number | null, fallback?: number | null, root?: number) =>
    itemV ?? fallback ?? root!;

  for (const item of items) {
    if (!item.cardId) continue;

    if (item.type === 'card_change') {
      const version = resolveVersion(item.version, undefined, announcement.version);
      for (const lang of langs) {
        inputs.push({
          itemKey:     item.itemKey, side:        'base', cardId:      item.cardId, buildNumber: version, lang,
          format:      item.format, delta:       item.delta?.curr,
        });
      }
    }

    if (item.type === 'card_update') {
      const version = resolveVersion(item.version, undefined, announcement.version);
      const lastVersion = resolveVersion(item.lastVersion, announcement.lastVersion, announcement.version);
      for (const lang of langs) {
        // prev (no glow); a delta.prev.cardId overrides the "before" card.
        inputs.push({
          itemKey:     item.itemKey, side:        'prev', cardId:      item.delta?.prev?.cardId ?? item.cardId, buildNumber: lastVersion, lang,
          format:      item.format, delta:       item.delta?.prev,
        });
        // curr (with glow)
        inputs.push({
          itemKey:     item.itemKey, side:        'curr', cardId:      item.cardId, buildNumber: version, lang,
          format:      item.format, delta:       item.delta?.curr, glow:        item.glow,
        });
      }
    }
  }

  return inputs;
}

/** Renders all applicable sides for one announcement item. */
export async function renderItem(
  item: RenderItemLike,
  announcement: { version: number, lastVersion?: number | null },
  langs: Locale[],
): Promise<RenderResult[]> {
  const results: RenderResult[] = [];
  for (const input of buildRenderSideInputs([item], announcement, langs)) {
    results.push(await renderSingleSide(input));
  }
  return results;
}

/** Builds standard image requests for every applicable side without rendering or writing files. */
export async function prepareItemRequests(
  item: {
    itemKey:      string;
    type:         string;
    cardId:       string | null;
    format:       string | null;
    version?:     number | null;
    lastVersion?: number | null;
    delta?:       RenderItemDelta | null;
    glow?:        GlowEntry[] | null;
  },
  announcement: { version: number, lastVersion?: number | null },
  langs: Locale[],
): Promise<PreparedRender[]> {
  if (!item.cardId) return [];

  const prepared: PreparedRender[] = [];
  const version = item.version ?? announcement.version;

  if (item.type === 'card_change') {
    for (const lang of langs) {
      prepared.push(await prepareSingleSide({
        itemKey:     item.itemKey, side:        'base', cardId:      item.cardId!, buildNumber: version, lang,
        format:      item.format, delta:       item.delta?.curr,
      }));
    }
  }

  if (item.type === 'card_update') {
    const lastVersion = item.lastVersion ?? announcement.lastVersion ?? announcement.version;
    for (const lang of langs) {
      prepared.push(await prepareSingleSide({
        itemKey:     item.itemKey, side:        'prev', cardId:      item.delta?.prev?.cardId ?? item.cardId!, buildNumber: lastVersion, lang,
        format:      item.format, delta:       item.delta?.prev,
      }));
      prepared.push(await prepareSingleSide({
        itemKey:     item.itemKey, side:        'curr', cardId:      item.cardId!, buildNumber: version, lang,
        format:      item.format, delta:       item.delta?.curr, glow:        item.glow,
      }));
    }
  }

  return prepared;
}

/** Sends one prepared request to the renderer and returns its PNG bytes without persistence. */
export async function renderPreparedRequest(prepared: PreparedRender): Promise<Uint8Array> {
  if (!prepared.request) throw new Error(prepared.error ?? '无法构建渲染请求');
  const rendererBaseUrl = requireHearthstoneImageRendererBaseUrl();
  const response = await fetch(`${rendererBaseUrl}/render`, {
    method:  'POST',
    headers: { 'content-type': 'application/json' },
    body:    JSON.stringify(prepared.request),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(body.trim().slice(0, 200) || `HTTP ${response.status}`);
  }
  return new Uint8Array(await response.arrayBuffer());
}

/** Returns existing image hashes for announcement items without triggering rendering. */
export async function checkItemImages(
  items: Array<{
    itemKey:      string;
    type:         string;
    cardId:       string | null;
    format:       string | null;
    version?:     number | null;
    lastVersion?: number | null;
    delta?:       RenderItemDelta | null;
    glow?:        GlowEntry[] | null;
  }>,
  announcement: { version: number, lastVersion?: number | null },
  langs: Locale[],
): Promise<Array<{ itemKey: string, cardId: string, side: string, lang: string, hash: string, category: string, template: string, error?: string }>> {
  const results: Array<{ itemKey: string, cardId: string, side: string, lang: string, hash: string, category: string, template: string, error?: string }> = [];

  const resolveVersion = (itemV?: number | null, fallback?: number | null, root?: number) =>
    itemV ?? fallback ?? root!;

  const langsOrDefault = langs.length > 0 ? langs : locale.options;

  // Resolve every needed render model in ONE query, then filter by build number
  // in memory. The old per-side queries made large announcements very slow.
  // The prev side may compare against a different card via delta.prev.cardId,
  // so include that card's rows too.
  const distinctCardIds = [...new Set(
    items.flatMap(item => [item.cardId, item.delta?.prev?.cardId]).filter((id): id is string => !!id),
  )];
  const rows = await fetchSideRenderModelRows(distinctCardIds, [...new Set(langsOrDefault)]);

  const rowsByCardLang = new Map<string, SideRenderModelRow[]>();
  for (const row of rows) {
    const key = `${row.cardId}\0${row.lang}`;
    const list = rowsByCardLang.get(key);
    if (list) list.push(row);
    else rowsByCardLang.set(key, [row]);
  }

  const resolveCached = (cardId: string, buildNumber: number, lang: Locale): ResolvedSide | null => {
    const candidates = rowsByCardLang.get(`${cardId}\0${lang}`) ?? [];
    const row = candidates.find(r =>
      r.entityVersion.includes(buildNumber) && r.localizationVersion.includes(buildNumber),
    );
    if (!row || !row.renderModel) return null;
    return {
      renderModel:      row.renderModel,
      renderHash:       row.renderHash!,
      revisionHash:     row.revisionHash,
      localizationHash: row.localizationHash,
      version:          row.entityVersion,
      setDbfId:         row.setDbfId ?? 0,
      mechanics:        row.mechanics ?? {},
    };
  };

  for (const item of items) {
    if (!item.cardId) continue;
    const template = resolveTemplate(item.format);

    if (item.type === 'card_change') {
      const version = resolveVersion(item.version, undefined, announcement.version);
      for (const lang of langsOrDefault) {
        const resolved = resolveCached(item.cardId, version, lang as Locale);
        if (!resolved) continue;
        const merged = mergeDeltaOnto(resolved.renderModel, item.delta?.curr);
        results.push({ itemKey: item.itemKey, cardId: item.cardId, side: 'base', lang, hash: computeRenderHash(merged), category: 'base', template });
      }
    }

    if (item.type === 'card_update') {
      const version = resolveVersion(item.version, undefined, announcement.version);
      const lastVersion = resolveVersion(item.lastVersion, announcement.lastVersion, announcement.version);

      for (const lang of langsOrDefault) {
        // prev; a delta.prev.cardId overrides the "before" card for a different-card comparison.
        const prevCardId = item.delta?.prev?.cardId ?? item.cardId;
        const prevResolved = resolveCached(prevCardId, lastVersion, lang as Locale);
        if (prevResolved) {
          const prevMerged = mergeDeltaOnto(prevResolved.renderModel, item.delta?.prev);
          results.push({ itemKey: item.itemKey, cardId: item.cardId, side: 'prev', lang, hash: computeRenderHash(prevMerged), category: 'base', template });
        }
        // curr
        const currResolved = resolveCached(item.cardId, version, lang as Locale);
        if (currResolved) {
          // A delta.curr.cardId override is ignored; the curr card is item.cardId.
          const currMerged = { ...mergeDeltaOnto(currResolved.renderModel, item.delta?.curr), cardId: item.cardId };
          const currWithGlow = applyGlow(currMerged, item.glow);
          const category = item.glow && item.glow.length > 0 ? 'glow' : 'base';
          results.push({ itemKey: item.itemKey, cardId: item.cardId, side: 'curr', lang, hash: computeRenderHash(currWithGlow), category, template });
        }
      }
    }
  }

  return results;
}

/** Renders all card-level items of an announcement. */
export async function renderAllItems(
  items: Array<{
    itemKey:      string;
    type:         string;
    cardId:       string | null;
    format:       string | null;
    version?:     number | null;
    lastVersion?: number | null;
    delta?:       RenderItemDelta | null;
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
