import { bigint, integer, jsonb, primaryKey, text, timestamp } from 'drizzle-orm/pg-core';

import type { CnocgCardData } from '#model/yugioh/schema/data/cnocg';
import type { NeuronCardData } from '#model/yugioh/schema/data/neuron';

import { dataSchema } from '../../shared/yugioh/schema';

/**
 * Raw CNOCG card cache. One row per Konami cid, holding the parsed official
 * simplified-Chinese card data (text + CN print list) from the CNOCG JSON API.
 * A row with `data = null` is a negative cache entry: the card has no CN
 * database entry, cached so repeated runs do not re-request it.
 * `cacheDays` / `contentHash` / `expiresAt` drive the adaptive cache window:
 * stable rows escalate 7→30→60→180→365 days, changed rows reset to 7.
 */
export const CnocgCards = dataSchema.table('cnocg_cards', {
  cid:         bigint('cid', { mode: 'number' }).primaryKey(),
  url:         text('url'),
  data:        jsonb('data').$type<CnocgCardData>(),
  cacheDays:   integer('cache_days').notNull().default(7),
  contentHash: text('content_hash'),
  createdAt:   timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt:   timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
});

/**
 * Raw Neuron card cache. One row per Konami cid per locale, holding the parsed
 * card page (name / text / stats for that language + that region's print
 * list). A row with `data = null` is a negative entry: the card has no page
 * for that locale (a regional database only carries cards released there).
 * That verdict can change when a localization lands, so negative entries use a
 * short window (30 days) and are re-checked by the refreshing crawl levels.
 * `cacheDays` / `contentHash` / `expiresAt` drive the adaptive cache window:
 * stable rows escalate 7→30→60→180→365 days, changed rows reset to 7.
 */
export const NeuronCards = dataSchema.table('neuron_cards', {
  cid:         bigint('cid', { mode: 'number' }).notNull(),
  locale:      text('locale').notNull(),
  url:         text('url'),
  data:        jsonb('data').$type<NeuronCardData>(),
  cacheDays:   integer('cache_days').notNull().default(7),
  contentHash: text('content_hash'),
  createdAt:   timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt:   timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
}, table => [
  primaryKey({ columns: [table.cid, table.locale] }),
]);
