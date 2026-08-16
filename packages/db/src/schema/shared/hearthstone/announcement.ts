import { index, integer, jsonb, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import type { ChangeStatus, GameChangeType, GlowEntry, Group } from '@tcg-cards/model/src/hearthstone/schema/announcement';
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

  type:           text('type').$type<GameChangeType>().notNull(),
  announcementId: uuid('announcement_id').notNull(),
  order:          integer('order').notNull().default(0),

  effectiveDate: text('effective_date'),
  format:        text('format'),
  status:        text('status').$type<ChangeStatus>(),
  score:         integer('score'),
  group:         text('group').$type<Group>(),

  version:     integer('version'),
  lastVersion: integer('last_version'),

  delta: jsonb('delta').$type<unknown>(),
  glow:  jsonb('glow').$type<GlowEntry[]>(),

  cardId:       text('card_id'),
  setId:        text('set_id'),
  ruleId:       text('rule_id'),
  relatedCards: text('related_cards').array().notNull().default([]),

  projection: jsonb('projection').$type<{ formats: string[], cards: string[] }>().notNull().default({ formats: [], cards: [] }),

  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at')
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
}, table => [
  index('idx_announcement_items_announcement_id').on(table.announcementId),
]);
