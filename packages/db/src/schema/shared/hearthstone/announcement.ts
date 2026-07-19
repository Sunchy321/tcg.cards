import { index, integer, jsonb, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import type { GlowEntry } from '@tcg-cards/model/src/hearthstone/schema/announcement';
import { schema } from './schema';

export const Announcement = schema.table('announcements', {
  id: uuid('id').primaryKey().defaultRandom(),

  source: text('source').notNull(),
  date:   text('date').notNull(),
  name:   text('name').notNull(),

  version:     integer('version').notNull(),
  lastVersion: integer('last_version'),

  effectiveDate: text('effective_date'),

  link: jsonb('link').$type<{ url: string, label?: string }[]>().notNull().default([]),

  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at')
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

export const AnnouncementItem = schema.table('announcement_items', {
  id: uuid('id').primaryKey().defaultRandom(),

  type:           text('type').notNull(),
  announcementId: uuid('announcement_id').notNull(),

  effectiveDate: text('effective_date'),
  format:        text('format'),
  status:        text('status'),
  score:         integer('score'),
  group:         text('group'),

  version:     integer('version'),
  lastVersion: integer('last_version'),

  delta: jsonb('delta').$type<unknown>(),
  glow:  jsonb('glow').$type<GlowEntry[]>(),

  cardId:       text('card_id'),
  setId:        text('set_id'),
  ruleId:       text('rule_id'),
  relatedCards: text('related_cards').array().notNull().default([]),

  resolvedFormats: text('resolved_formats').array().notNull().default([]),
  resolvedCards:   text('resolved_cards').array().notNull().default([]),

  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at')
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
}, table => [
  index('idx_announcement_items_resolved_formats').using('gin', table.resolvedFormats),
  index('idx_announcement_items_resolved_cards').using('gin', table.resolvedCards),
  index('idx_announcement_items_announcement_id').on(table.announcementId),
]);
