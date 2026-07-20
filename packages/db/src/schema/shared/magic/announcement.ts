import { index, integer, jsonb, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { schema } from './schema';

export const Announcement = schema.table('announcements', {
  id: uuid('id').primaryKey().defaultRandom(),

  source: text('source').notNull(),
  date:   text('date').notNull(),
  name:   text('name').notNull(),

  effectiveDate:         text('effective_date'),
  effectiveDateTabletop: text('effective_date_tabletop'),
  effectiveDateOnline:   text('effective_date_online'),
  effectiveDateArena:    text('effective_date_arena'),

  nextDate: text('next_date'),

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
  order:          integer('order').notNull().default(0),

  effectiveDate: text('effective_date'),
  format:        text('format'),
  status:        text('status'),
  score:         integer('score'),
  group:         text('group'),

  delta: jsonb('delta').$type<unknown>(),
  glow:  jsonb('glow').$type<{ part: string, type: 'buff' | 'nerf' }[]>(),

  cardId:       text('card_id'),
  setId:        text('set_id'),
  ruleId:       text('rule_id'),
  relatedCards: text('related_cards').array().notNull().default([]),

  resolved_formats: text('resolved_formats').array().notNull().default([]),
  resolved_cards:   text('resolved_cards').array().notNull().default([]),

  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at')
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
}, table => [
  index('idx_announcement_items_resolved_formats').using('gin', table.resolved_formats),
  index('idx_announcement_items_resolved_cards').using('gin', table.resolved_cards),
  index('idx_announcement_items_announcement_id').on(table.announcementId),
]);
