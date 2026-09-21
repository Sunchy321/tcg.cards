import { jsonb, text, timestamp, unique } from 'drizzle-orm/pg-core';

import { dataSchema } from '../../../shared/magic/schema';
import { locale } from '../../../shared/magic/card';

import type { NameRubyKind, NameRubyStatus } from '#model/magic/name-ruby';

/**
 * Name ruby authority — the phonetic annotations of record, one row per
 * (lang, kind, name), mapping the name currently in use to its annotation
 * string (`名（かな）`, ADR 0013).
 *
 * Ruby does not ride the localization authority: that text of record is
 * scryfall/MTGCH-sourced, while ruby arrives from other sources (the MTGO
 * localization table, salvaged readings), so it keeps a mapping table of its
 * own. It takes effect through projection — one resolution function reads the
 * reviewed rows and fills the `ruby_*` columns beside the names on the result
 * tables — and a ruby write updates this table and the affected result rows
 * together.
 *
 * `exceptions` holds per-print overrides keyed `set:number` for names whose
 * printed reading differs between printings (print rows preserve printing
 * errors, so the variant readings stay representable); the default `rubyName`
 * covers every printing without an exception.
 *
 * `status` gates visibility: only `reviewed` rows take effect on the result
 * tables; `draft` rows wait for review, because a wrong reading is worse than
 * no reading and absence degrades to the plain name.
 */
export const NameRuby = dataSchema.table('name_rubies', {
  lang: locale('lang').notNull(),
  kind: text('kind').$type<NameRubyKind>().notNull(),
  name: text('name').notNull(),

  rubyName:   text('ruby_name').notNull(),
  exceptions: jsonb('exceptions').$type<Record<string, string>>(),

  source: text('source').notNull().default(''),
  status: text('status').$type<NameRubyStatus>().notNull().default('draft'),

  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at')
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
  deletedAt: timestamp('deleted_at'),
}, table => [
  unique('name_rubies_natural_key_uq').on(table.lang, table.kind, table.name),
]);
