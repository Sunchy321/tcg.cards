import { jsonb, text } from 'drizzle-orm/pg-core';
import { nanoid } from 'nanoid';

import { schema } from './schema';

import type { DeckCard } from '#model/magic/schema/deck';

export const StaticDeck = schema.table('decks', {
  deckId:      text('deck_id').primaryKey().$defaultFn(() => nanoid()),
  name:        text('name').notNull(),
  description: text('description'),
  format:      text('format').notNull(),

  cards: jsonb('cards').$type<DeckCard[]>().notNull(),

  tags: text('tags').array().notNull().default([]),
});
