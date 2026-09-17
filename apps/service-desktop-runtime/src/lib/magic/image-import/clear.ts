import { and, eq, inArray, isNotNull, isNull } from 'drizzle-orm';
import { existsSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';

import { runWithDb } from '@tcg-cards/db';
import { Print } from '@tcg-cards/db/schema/shared/magic/print';

import type { LocalDb } from '../../hearthstone/hsdata-local-db';
import { cardImageRoot, printImageDir, removeSameStemJpg } from './common';

export const imageClearResult = z.strictObject({
  cleared: z.number(),
  files:   z.number(),
});

export type ImageClearResult = z.infer<typeof imageClearResult>;

/**
 * Clears the imported images of one scope: every print inside set × languages ×
 * numbers loses its image_info and its library files are removed. Numbers left
 * out means the whole set. Idempotent — prints without image data stay untouched
 * and language folders left empty by an earlier pass are still swept.
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
    lang:   Print.lang,
    number: Print.number,
  }).from(Print).where(scope));

  const prints = new Map<string, { lang: string, number: string }>();
  for (const row of rows) prints.set(`${row.lang}/${row.number}`, { lang: row.lang, number: row.number });

  let files = 0;
  if (prints.size > 0) {
    await runWithDb(db, () => db.update(Print).set({ imageInfo: null }).where(scope));

    for (const print of prints.values()) {
      const dir = printImageDir(input.set, print.lang);
      const safe = print.number.replaceAll('/', '_');
      for (const name of [`${safe}.webp`, `${safe}⁑.webp`]) {
        const file = join(dir, name);
        if (!existsSync(file)) continue;
        rmSync(file);
        files += 1;
      }
      files += removeSameStemJpg(input.set, print.lang, print.number);
    }
  }

  // A language folder left empty by the sweep has no reason to stay on disk.
  // Built by hand — printImageDir would recreate a cleared folder.
  const root = join(cardImageRoot(), 'large', input.set);
  for (const lang of input.langs) {
    const dir = join(root, lang);
    if (existsSync(dir) && readdirSync(dir).length === 0) rmSync(dir, { recursive: true });
  }

  return { cleared: prints.size, files };
}
