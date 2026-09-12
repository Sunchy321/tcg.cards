import { and, eq, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';

import { runWithDb } from '@tcg-cards/db';
import { Gatherer, ScryfallCard } from '@tcg-cards/db/schema/local/magic';
import { Print } from '@tcg-cards/db/schema/shared/magic/print';
import { imageStatus } from '@tcg-cards/model/magic/schema/print';

import type { LocalDb } from '../../hearthstone/hsdata-local-db';
import { assessQuality, encodeWebp, faceIndexOf } from './common';
import { fetchImageBuffer } from './fetch';
import { gathererRowUrls, scryfallRowUrls } from './source';

/** One compared source of one face. */
export const imageCompareSide = z.discriminatedUnion('status', [
  z.strictObject({
    status:       z.literal('ok'),
    source:       z.enum(['scryfall', 'gatherer']),
    width:        z.number(),
    height:       z.number(),
    byteSize:     z.number(),
    qualityScore: z.number().nullable(),
    tier:         imageStatus,
    /** Encoded q50 webp of the source image, shown side by side. */
    preview:      z.string(),
  }),
  z.strictObject({
    status: z.literal('unavailable'),
    source: z.enum(['scryfall', 'gatherer']),
    reason: z.string(),
  }),
]);

export const imageCompareResult = z.strictObject({
  faces: z.array(z.strictObject({
    faceIndex: z.number(),
    scryfall:  imageCompareSide,
    gatherer:  imageCompareSide,
    verdict:   z.enum(['scryfall', 'gatherer', 'equal', 'inconclusive']),
  })),
});

export type ImageCompareSide = z.infer<typeof imageCompareSide>;
export type ImageCompareResult = z.infer<typeof imageCompareResult>;

/** Score gap below which the two sides count as equivalent rather than ranked. */
const equalScoreGap = 0.05;

const rowColumns = {
  layout:              Print.layout,
  scryfallCardId:      Print.scryfallCardId,
  scryfallFace:        Print.scryfallFace,
  scryfallImageStatus: ScryfallCard.imageStatus,
  scryfallImageUris:   ScryfallCard.imageUris,
  scryfallCardFaces:   ScryfallCard.cardFaces,
  multiverseId:        Print.multiverseId,
  gathererData:        Gatherer.data,
};

/** Reads the print row that the comparison runs on. */
function queryRow(db: LocalDb, set: string, lang: string, number: string) {
  return db.select(rowColumns).from(Print)
    .leftJoin(ScryfallCard, eq(Print.scryfallCardId, ScryfallCard.cardId))
    .leftJoin(Gatherer, sql`${Gatherer.multiverseId} = ${Print.multiverseId}[1]`)
    .where(and(
      eq(Print.set, set),
      eq(Print.lang, lang as typeof Print.$inferSelect.lang),
      eq(Print.number, number),
      isNull(Print.deletedAt),
    ));
}

/** Downloads, encodes and evaluates one side; `blocked` short-circuits to a reason. */
async function resolveSide(source: 'scryfall' | 'gatherer', url: string | null, blocked: string | null): Promise<ImageCompareSide> {
  if (blocked != null) return { status: 'unavailable', source, reason: blocked };
  if (url == null) return { status: 'unavailable', source, reason: '该面没有可用的图源' };

  const bytes = await fetchImageBuffer(url);
  if (!bytes) return { status: 'unavailable', source, reason: '取图失败' };

  const encoded = await encodeWebp(bytes);
  if (!encoded) return { status: 'unavailable', source, reason: '图片无法解码' };

  const tier = await assessQuality(encoded, bytes);
  return {
    status:       'ok',
    source,
    width:        encoded.width,
    height:       encoded.height,
    byteSize:     encoded.byteSize,
    qualityScore: tier.score,
    tier:         tier.status,
    preview:      `data:image/webp;base64,${encoded.data.toString('base64')}`,
  };
}

/** Ranks two sides by the production rule: size tier first, then detail-loss score. */
function verdictOf(scryfall: ImageCompareSide, gatherer: ImageCompareSide): ImageCompareResult['faces'][number]['verdict'] {
  if (scryfall.status !== 'ok' || gatherer.status !== 'ok') return 'inconclusive';

  const rank = (tier: string) => (tier === 'highres_scan' ? 1 : 0);
  if (rank(scryfall.tier) !== rank(gatherer.tier)) {
    return rank(scryfall.tier) > rank(gatherer.tier) ? 'scryfall' : 'gatherer';
  }

  if (scryfall.qualityScore == null || gatherer.qualityScore == null) return 'inconclusive';
  if (Math.abs(scryfall.qualityScore - gatherer.qualityScore) < equalScoreGap) return 'equal';
  return scryfall.qualityScore > gatherer.qualityScore ? 'scryfall' : 'gatherer';
}

/**
 * Compares the scryfall and gatherer image of one print face by face. Read-only:
 * both sides are downloaded, encoded and scored on the fly, never written.
 * Returns null when the print does not exist.
 */
export async function compareImageSources(
  db: LocalDb,
  input: { set: string, lang: string, number: string },
): Promise<ImageCompareResult | null> {
  const rows = await runWithDb(db, () => queryRow(db, input.set, input.lang, input.number));
  const row = rows[0];
  if (!row) return null;

  // Same url rule as the import, so the comparison shows what an import writes.
  const scryfallUrls = scryfallRowUrls(row);
  const gathererUrls = gathererRowUrls(row);
  const faceCount = Math.max(scryfallUrls.length, gathererUrls.length);

  // Rows pinned to one face of their scryfall card only carry that face.
  const pinned = faceIndexOf(row.scryfallFace);
  const indices = pinned != null
    ? [pinned]
    : Array.from({ length: faceCount }, (_, i) => i);

  const scryfallBlocked = row.scryfallCardId == null
    ? 'Scryfall 无该印张的图源信息'
    : row.scryfallImageStatus === 'placeholder' ? 'Scryfall 为占位图' : null;
  const gathererBlocked = (row.multiverseId ?? []).length === 0 ? 'Gatherer 无对应印张' : null;

  const faces: ImageCompareResult['faces'] = [];
  for (const faceIndex of indices) {
    const scryfall = await resolveSide('scryfall', scryfallUrls[faceIndex] ?? null, scryfallBlocked);
    const gatherer = await resolveSide('gatherer', gathererUrls[faceIndex] ?? null, gathererBlocked);
    faces.push({ faceIndex, scryfall, gatherer, verdict: verdictOf(scryfall, gatherer) });
  }

  return { faces };
}
