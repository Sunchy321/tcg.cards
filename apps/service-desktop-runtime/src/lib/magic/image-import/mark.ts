import { and, eq, inArray, isNull } from 'drizzle-orm';
import { z } from 'zod';

import { runWithDb } from '@tcg-cards/db';
import { ScryfallCard } from '@tcg-cards/db/schema/local/magic';
import { Print } from '@tcg-cards/db/schema/shared/magic/print';

import type { LocalDb } from '../../hearthstone/hsdata-local-db';
import { printKeyCondition } from './common';

export const imageMarkResult = z.strictObject({
  marked:       z.number(),
  skippedImage: z.number(),
  ignored:      z.number(),
});

export type ImageMarkResult = z.infer<typeof imageMarkResult>;

/**
 * Confirms the imageless prints of one scope (set × languages × numbers) carry
 * no real image at all: a print with no local image data whose scryfall card
 * is in the placeholder state gets the placeholder mark, which shows the
 * placeholder badge with the English fallback on the site and blocks remote
 * re-imports. Prints carrying a local image are never touched — removing an
 * image is the clear action's job, and the clear marks the prints it empties.
 * Prints scryfall has a real image for are ignored. Idempotent.
 */
export async function markPlaceholderImages(
  db: LocalDb,
  input: { set: string, langs: string[], numbers?: string[] },
): Promise<ImageMarkResult> {
  const rows = await runWithDb(db, () => db.select({
    cardId:         Print.cardId,
    version:        Print.version,
    source:         Print.source,
    lang:           Print.lang,
    number:         Print.number,
    imageInfo:      Print.imageInfo,
    scryfallStatus: ScryfallCard.imageStatus,
  }).from(Print)
    .leftJoin(ScryfallCard, eq(Print.scryfallCardId, ScryfallCard.cardId))
    .where(and(
      eq(Print.set, input.set),
      inArray(Print.lang, input.langs as typeof Print.$inferSelect.lang[]),
      input.numbers?.length ? inArray(Print.number, input.numbers) : undefined,
      isNull(Print.deletedAt),
    )));

  const hasImage = (info: typeof Print.$inferSelect.imageInfo) => (info ?? []).some(face => face != null);
  const eligible = rows.filter(row => row.scryfallStatus === 'placeholder' && !hasImage(row.imageInfo));
  const skippedImage = rows.filter(row => row.scryfallStatus === 'placeholder' && hasImage(row.imageInfo)).length;
  const ignored = rows.length - eligible.length - skippedImage;

  for (const row of eligible) {
    await runWithDb(db, () => db.update(Print)
      .set({ imageStatus: 'placeholder' })
      .where(printKeyCondition({ cardId: row.cardId, version: row.version, set: input.set, number: row.number, lang: row.lang, source: row.source })));
  }

  return { marked: eligible.length, skippedImage, ignored };
}
