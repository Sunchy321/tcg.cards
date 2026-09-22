import { and, eq, inArray, isNotNull, isNull } from 'drizzle-orm';
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
 * out means the whole set. Idempotent — prints without image data stay untouched
 * and language folders left empty by an earlier pass are still swept.
 *
 * The column snapshot is rebuilt while clearing, so no stale status survives:
 * every print falls back to what scryfall currently reports. A print scryfall
 * itself holds in the placeholder state therefore lands back in that state,
 * which shows the placeholder badge on the site and blocks remote re-imports.
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
    // Rows without image data have nothing to clear; re-running a finished
    // scope then reports zero instead of counting prints a second time.
    isNotNull(Print.imageInfo),
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
      const status = (row.scryfallStatus ?? row.printStatus) as typeof Print.$inferInsert['imageStatus'];
      if (row.scryfallStatus === 'placeholder') marked += 1;
      await runWithDb(db, () => db.update(Print)
        .set({ imageInfo: null, imageStatus: status })
        .where(printKeyCondition({ cardId: row.cardId, version: row.version, set: input.set, number: row.number, lang: row.lang, source: row.source })));
    }

    for (const print of prints.values()) {
      files += removePrintImageFiles(input.set, print.lang, print.number).files;
    }

    // The ledger mirrors the files: every key whose file the sweep removed
    // loses its row. Faces 0 and 1 are the only faces a print stores.
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
