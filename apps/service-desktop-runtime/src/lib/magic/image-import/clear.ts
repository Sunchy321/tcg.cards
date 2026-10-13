import { and, eq, inArray, isNotNull, isNull, or, sql } from 'drizzle-orm';
import { existsSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';

import { runWithDb } from '@tcg-cards/db';
import { AssetImage, ScryfallCard } from '@tcg-cards/db/schema/local/magic';
import { Print } from '@tcg-cards/db/schema/shared/magic/print';
import { printImageKey } from '@tcg-cards/shared/magic/print-image';

import type { LocalDb } from '../../hearthstone/hsdata-local-db';
import { cardImageRoot, printKeyCondition, removePrintImageFiles } from './common';

export const imageClearResult = z.strictObject({
  cleared: z.number(),
  files:   z.number(),
  marked:  z.number(),
});

export type ImageClearResult = z.infer<typeof imageClearResult>;

/**
 * Clears the imported images of one scope: every print inside set × languages ×
 * numbers loses its image_info and its library files are removed. Numbers left
 * out means the whole set.
 *
 * The scope reaches every print the ledger still pins: one carrying image facts
 * as well as one reduced to a ledger row — a stale real row the fact edit missed
 * or a no-image tombstone — so an explicit reset lifts every kind of pin in its
 * range. Idempotent — prints with neither facts nor a ledger row stay untouched,
 * and language folders left empty by an earlier pass are still swept.
 *
 * The column snapshot is rebuilt while clearing, so no stale status survives:
 * every print falls back to what scryfall currently reports, with one override —
 * a print never lands back in the placeholder state. Clearing is a reset, not a
 * no-image mark, so a cleared print ends in the `missing` state and an ordinary
 * import pass may fetch its images again; the source-side placeholder checks
 * keep genuine stand-ins out of the sweeps either way.
 */
export async function clearImages(
  db: LocalDb,
  input: { set: string, langs: string[], numbers?: string[] },
): Promise<ImageClearResult> {
  const scope = and(
    eq(Print.set, input.set),
    inArray(Print.lang, input.langs as typeof Print.$inferSelect.lang[]),
    input.numbers?.length ? inArray(Print.number, input.numbers) : undefined,
    isNull(Print.deletedAt),
    // The reset covers prints that still carry image facts and prints the
    // ledger still pins (a real row from an old import or a no-image
    // tombstone) — both must go, or the pin keeps the import skipping.
    or(
      isNotNull(Print.imageInfo),
      sql`exists (select 1 from ${AssetImage} a where a.key in (
        'large/' || ${Print.set} || '/' || ${Print.lang} || '/' || replace(${Print.number}, '/', '_') || '.webp',
        'large/' || ${Print.set} || '/' || ${Print.lang} || '/' || replace(${Print.number}, '/', '_') || chr(8251) || '.webp'
      ))`,
    ),
  )!;

  const rows = await runWithDb(db, () => db.select({
    cardId:         Print.cardId,
    version:        Print.version,
    source:         Print.source,
    lang:           Print.lang,
    number:         Print.number,
    printStatus:    Print.imageStatus,
    scryfallStatus: ScryfallCard.imageStatus,
  }).from(Print)
    .leftJoin(ScryfallCard, eq(Print.scryfallCardId, ScryfallCard.cardId))
    .where(scope));

  const prints = new Map<string, { lang: string, number: string }>();
  for (const row of rows) prints.set(`${row.lang}/${row.number}`, { lang: row.lang, number: row.number });

  let files = 0;
  let marked = 0;
  if (prints.size > 0) {
    for (const row of rows) {
      // The scryfall column is plain text, so the fallback needs the enum cast.
      // The placeholder fallback becomes `missing`: clearing never pins the
      // blocked state, whatever the source reports.
      const fallback = row.scryfallStatus ?? row.printStatus;
      const status = (fallback === 'placeholder' ? 'missing' : fallback) as typeof Print.$inferInsert['imageStatus'];
      if (row.scryfallStatus === 'placeholder') marked += 1;
      await runWithDb(db, () => db.update(Print)
        .set({ imageInfo: null, imageStatus: status })
        .where(printKeyCondition({ cardId: row.cardId, version: row.version, set: input.set, number: row.number, lang: row.lang, source: row.source })));
    }

    for (const print of prints.values()) {
      files += removePrintImageFiles(input.set, print.lang, print.number).files;
    }

    // The ledger mirrors the files: every key whose file the sweep removed
    // loses its row. Faces 0 and 1 are the only faces a print stores. No
    // tombstone replaces them — the missing fact is the reset's only memory,
    // and a later projection rebuild derives the same state from the source.
    const keys: string[] = [];
    for (const print of prints.values()) {
      keys.push(
        printImageKey(input.set, print.lang, print.number),
        printImageKey(input.set, print.lang, print.number, 1),
      );
    }
    for (let i = 0; i < keys.length; i += 10_000) {
      const chunk = keys.slice(i, i + 10_000);
      await runWithDb(db, () => db.delete(AssetImage).where(inArray(AssetImage.key, chunk)));
    }
  }

  // A language folder left empty by the sweep has no reason to stay on disk.
  // Built by hand — printImageDir would recreate a cleared folder.
  const root = join(cardImageRoot(), 'large', input.set);
  for (const lang of input.langs) {
    const dir = join(root, lang);
    if (existsSync(dir) && readdirSync(dir).length === 0) rmSync(dir, { recursive: true });
  }

  return { cleared: prints.size, files, marked };
}
