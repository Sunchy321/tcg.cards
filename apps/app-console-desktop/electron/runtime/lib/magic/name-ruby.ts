import { and, eq, isNull } from 'drizzle-orm';

import type { createDb } from '@tcg-cards/db';
import { NameRuby } from '@tcg-cards/db/schema/local/magic';
import { nameRubyKey, type NameRubyLookup } from '@tcg-cards/model/magic/name-ruby';

export type { NameRubyLookup };

/** Database client shape used by assembly (created by the caller). */
export type NameRubyDb = ReturnType<typeof createDb>;

/**
 * Load the ruby authority's reviewed rows into the in-memory lookup that
 * projection and the console write path resolve against. Draft rows stay out:
 * an unreviewed reading never reaches the result tables.
 */
export async function loadNameRubyLookup(database: NameRubyDb): Promise<NameRubyLookup> {
  const rows = await database
    .select({
      lang:       NameRuby.lang,
      kind:       NameRuby.kind,
      name:       NameRuby.name,
      rubyName:   NameRuby.rubyName,
      exceptions: NameRuby.exceptions,
    })
    .from(NameRuby)
    .where(and(eq(NameRuby.status, 'reviewed'), isNull(NameRuby.deletedAt)));

  const lookup: NameRubyLookup = new Map();
  for (const row of rows) {
    lookup.set(nameRubyKey(row.lang, row.kind, row.name), {
      rubyName:   row.rubyName,
      exceptions: row.exceptions ?? null,
    });
  }
  return lookup;
}
