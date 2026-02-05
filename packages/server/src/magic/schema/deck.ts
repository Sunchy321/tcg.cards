import { integer, jsonb, primaryKey, text, timestamp } from 'drizzle-orm/pg-core';
import { nanoid } from 'nanoid';

import { appSchema, schema } from './schema';
import { users } from '@/auth/schema';

import { DeckCard } from '@model/magic/schema/deck';

export const deckVisibility = appSchema.enum('deck_visibility', ['public', 'unlisted', 'private']);

export const StaticDeck = schema.table('decks', {
    deckId:      text('deck_id').primaryKey().$defaultFn(() => nanoid()),
    name:        text('name').notNull(),
    description: text('description'),
    format:      text('format').notNull(),

    cards: jsonb('cards').$type<DeckCard[]>().notNull(),

    tags: text('tags').array().notNull().default([]),
});

export const Deck = appSchema.table('decks', {
    deckId:      text('deck_id').primaryKey().$defaultFn(() => nanoid()),
    userId:      text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    name:        text('name').notNull(),
    description: text('description'),
    format:      text('format').notNull(),

    cards: jsonb('cards').$type<DeckCard[]>().notNull(),

    visibility: deckVisibility('visibility').notNull().default('private'),
    tags:       text('tags').array().notNull().default([]),

    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),

    views:     integer('views').notNull().default(0),
    likes:     integer('likes').notNull().default(0),
    favorites: integer('favorites').notNull().default(0),
});

export const DeckLike = appSchema.table('deck_likes', {
    userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    deckId: text('deck_id').notNull().references(() => Deck.deckId, { onDelete: 'cascade' }),

    createdAt: timestamp('created_at').notNull().defaultNow(),
}, table => [
    primaryKey({ columns: [table.userId, table.deckId] }),
]);

export const DeckFavorite = appSchema.table('deck_favorites', {
    userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    deckId: text('deck_id').notNull().references(() => Deck.deckId, { onDelete: 'cascade' }),

    createdAt: timestamp('created_at').notNull().defaultNow(),
}, table => [
    primaryKey({ columns: [table.userId, table.deckId] }),
]);
