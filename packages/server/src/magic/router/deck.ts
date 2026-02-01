import { ORPCError } from '@orpc/server';
import { os } from '@/orpc';

import { z } from 'zod';
import { and, count, desc, eq, inArray, or, sql } from 'drizzle-orm';

import { db } from '@/drizzle';
import { Deck, DeckLike, DeckFavorite } from '../schema/deck';
import { Card } from '../schema/card';
import { Format } from '../schema/format';
import { users } from '@/auth/schema';

import { deckCard, DeckView, deckVisibility, deckView } from '@model/magic/schema/deck';

// Create a new deck
const create = os
    .input(z.object({
        name:        z.string().min(1).max(200),
        description: z.string().max(2000).optional(),
        format:      z.string(),
        cards:       z.array(deckCard),
        visibility:  deckVisibility.default('private'),
        tags:        z.array(z.string()).default([]),
    }))
    .output(z.object({ deckId: z.string() }))
    .handler(async ({ input, context }) => {
        const { user } = context;

        if (user == null) {
            throw new ORPCError('UNAUTHORIZED', { message: 'You must be logged in to create a deck' });
        }

        // Validate format exists
        const format = await db.select().from(Format).where(eq(Format.formatId, input.format)).then(rows => rows[0]);
        if (!format) {
            throw new ORPCError('NOT_FOUND', { message: 'Format not found' });
        }

        // Validate cards exist
        const cardIds = [...new Set(input.cards.map(c => c.cardId))];
        const cards = await db.select({ cardId: Card.cardId }).from(Card).where(inArray(Card.cardId, cardIds));
        if (cards.length !== cardIds.length) {
            throw new ORPCError('NOT_FOUND', { message: 'Some cards not found' });
        }

        const [deck] = await db.insert(Deck).values({
            userId:      user.id,
            name:        input.name,
            description: input.description,
            format:      input.format,
            cards:       input.cards,
            visibility:  input.visibility,
            tags:        input.tags,
        }).returning({ deckId: Deck.deckId });

        return { deckId: deck.deckId };
    });

// Update a deck
const update = os
    .input(z.object({
        deckId:      z.string(),
        name:        z.string().min(1).max(200).optional(),
        description: z.string().max(2000).optional(),
        format:      z.string().optional(),
        cards:       z.array(deckCard).optional(),
        visibility:  deckVisibility.optional(),
        tags:        z.array(z.string()).optional(),
    }))
    .output(z.object({ success: z.boolean() }))
    .handler(async ({ input, context }) => {
        const { user } = context;

        if (!user) {
            throw new ORPCError('UNAUTHORIZED', { message: 'You must be logged in to update a deck' });
        }

        const deck = await db.select().from(Deck).where(eq(Deck.deckId, input.deckId)).then(rows => rows[0]);

        if (!deck) {
            throw new ORPCError('NOT_FOUND', { message: 'Deck not found' });
        }

        if (deck.userId !== user.id) {
            throw new ORPCError('FORBIDDEN', { message: 'You can only update your own decks' });
        }

        const updates: any = { updatedAt: new Date() };

        if (input.name !== undefined) updates.name = input.name;
        if (input.description !== undefined) updates.description = input.description;
        if (input.format !== undefined) {
            const format = await db.select().from(Format).where(eq(Format.formatId, input.format)).then(rows => rows[0]);
            if (!format) {
                throw new ORPCError('NOT_FOUND', { message: 'Format not found' });
            }
            updates.format = input.format;
        }
        if (input.cards !== undefined) {
            const cardIds = [...new Set(input.cards.map(c => c.cardId))];
            const cards = await db.select({ cardId: Card.cardId }).from(Card).where(inArray(Card.cardId, cardIds));
            if (cards.length !== cardIds.length) {
                throw new ORPCError('NOT_FOUND', { message: 'Some cards not found' });
            }
            updates.cards = input.cards;
        }
        if (input.visibility !== undefined) updates.visibility = input.visibility;
        if (input.tags !== undefined) updates.tags = input.tags;

        await db.update(Deck).set(updates).where(eq(Deck.deckId, input.deckId));

        return { success: true };
    });

// Delete a deck
const deleteDeck = os
    .route({
        method:      'DELETE',
        description: 'Delete a deck',
        tags:        ['Magic', 'Deck'],
    })
    .input(z.object({ deckId: z.string() }))
    .output(z.object({ success: z.boolean() }))
    .handler(async ({ input, context }) => {
        const user = (context as any).user;

        if (!user) {
            throw new ORPCError('UNAUTHORIZED', { message: 'You must be logged in to delete a deck' });
        }

        const deck = await db.select().from(Deck).where(eq(Deck.deckId, input.deckId)).then(rows => rows[0]);

        if (!deck) {
            throw new ORPCError('NOT_FOUND', { message: 'Deck not found' });
        }

        if (deck.userId !== user.id) {
            throw new ORPCError('FORBIDDEN', { message: 'You can only delete your own decks' });
        }

        await db.delete(Deck).where(eq(Deck.deckId, input.deckId));

        return { success: true };
    });

// Get deck details
const get = os
    .route({
        method:      'GET',
        description: 'Get deck details',
        tags:        ['Magic', 'Deck'],
    })
    .input(z.object({ deckId: z.string() }))
    .output(deckView)
    .handler(async ({ input, context }) => {
        const { user } = context;

        const result = await db.select({
            deck:     Deck,
            userName: users.name,
        })
            .from(Deck)
            .innerJoin(users, eq(Deck.userId, users.id))
            .where(eq(Deck.deckId, input.deckId))
            .then(rows => rows[0]);

        if (!result) {
            throw new ORPCError('NOT_FOUND', { message: 'Deck not found' });
        }

        const { deck, userName } = result;

        // Check access permission
        if (deck.visibility === 'private' && (!user || deck.userId !== user.id)) {
            throw new ORPCError('FORBIDDEN', { message: 'This deck is private' });
        }

        // Increment view count (when viewed by non-author)
        if (!user || deck.userId !== user.id) {
            await db.update(Deck).set({ views: sql`${Deck.views} + 1` }).where(eq(Deck.deckId, input.deckId));
        }

        const deckView: DeckView = {
            ...deck,
            userName,
            isLiked:    false,
            isFavorite: false,
        };

        // Check if user has liked/favorited this deck
        if (user) {
            const [liked] = await db.select().from(DeckLike)
                .where(and(eq(DeckLike.userId, user.id), eq(DeckLike.deckId, input.deckId)));

            const [favorite] = await db.select().from(DeckFavorite)
                .where(and(eq(DeckFavorite.userId, user.id), eq(DeckFavorite.deckId, input.deckId)));

            deckView.isLiked = liked != null;
            deckView.isFavorite = favorite != null;
        }

        return deckView;
    });

// List decks
const list = os
    .route({
        method:      'GET',
        description: 'List decks',
        tags:        ['Magic', 'Deck'],
    })
    .input(z.object({
        userId:     z.string().optional(),
        format:     z.string().optional(),
        visibility: deckVisibility.optional(),
        tags:       z.array(z.string()).optional(),
        page:       z.number().int().min(1).default(1),
        pageSize:   z.number().int().min(1).max(100).default(20),
        sortBy:     z.enum(['createdAt', 'updatedAt', 'views', 'likes', 'favorites']).default('updatedAt'),
        sortOrder:  z.enum(['asc', 'desc']).default('desc'),
    }))
    .output(z.object({
        decks: z.array(z.object({
            deckId:     z.string(),
            userId:     z.string(),
            name:       z.string(),
            format:     z.string(),
            visibility: deckVisibility,
            tags:       z.array(z.string()),
            createdAt:  z.date(),
            updatedAt:  z.date(),
            views:      z.number(),
            likes:      z.number(),
            favorites:  z.number(),
        })),
        total:    z.number(),
        page:     z.number(),
        pageSize: z.number(),
    }))
    .handler(async ({ input, context }) => {
        const user = (context as any).user;

        const conditions = [];

        // Can only see public, unlisted decks, or own decks
        if (input.userId) {
            if (user && user.id === input.userId) {
                conditions.push(eq(Deck.userId, input.userId));
            } else {
                conditions.push(
                    and(
                        eq(Deck.userId, input.userId),
                        or(eq(Deck.visibility, 'public'), eq(Deck.visibility, 'unlisted')),
                    ),
                );
            }
        } else if (user) {
            conditions.push(
                or(
                    eq(Deck.userId, user.id),
                    eq(Deck.visibility, 'public'),
                ),
            );
        } else {
            conditions.push(eq(Deck.visibility, 'public'));
        }

        if (input.format) {
            conditions.push(eq(Deck.format, input.format));
        }

        if (input.visibility && user) {
            conditions.push(eq(Deck.visibility, input.visibility));
        }

        if (input.tags && input.tags.length > 0) {
            conditions.push(sql`${Deck.tags} @> ${input.tags}`);
        }

        const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

        const [totalResult] = await db.select({ count: count() }).from(Deck).where(whereClause);
        const total = totalResult.count;

        const orderByColumn = Deck[input.sortBy];
        const orderBy = input.sortOrder === 'desc' ? desc(orderByColumn) : orderByColumn;

        const decks = await db.select({
            deckId:     Deck.deckId,
            userId:     Deck.userId,
            name:       Deck.name,
            format:     Deck.format,
            visibility: Deck.visibility,
            tags:       Deck.tags,
            createdAt:  Deck.createdAt,
            updatedAt:  Deck.updatedAt,
            views:      Deck.views,
            likes:      Deck.likes,
            favorites:  Deck.favorites,
        })
            .from(Deck)
            .where(whereClause)
            .orderBy(orderBy)
            .limit(input.pageSize)
            .offset((input.page - 1) * input.pageSize);

        return {
            decks,
            total,
            page:     input.page,
            pageSize: input.pageSize,
        };
    });

// Like a deck
const like = os
    .route({
        method:      'POST',
        description: 'Like a deck',
        tags:        ['Magic', 'Deck'],
    })
    .input(z.object({ deckId: z.string() }))
    .output(z.object({ success: z.boolean() }))
    .handler(async ({ input, context }) => {
        const user = (context as any).user;

        if (!user) {
            throw new ORPCError('UNAUTHORIZED', { message: 'You must be logged in to like a deck' });
        }

        const deck = await db.select().from(Deck).where(eq(Deck.deckId, input.deckId)).then(rows => rows[0]);

        if (!deck) {
            throw new ORPCError('NOT_FOUND', { message: 'Deck not found' });
        }

        // Check if already liked
        const [existing] = await db.select().from(DeckLike)
            .where(and(eq(DeckLike.userId, user.id), eq(DeckLike.deckId, input.deckId)));

        if (existing) {
            // Unlike
            await db.delete(DeckLike)
                .where(and(eq(DeckLike.userId, user.id), eq(DeckLike.deckId, input.deckId)));
            await db.update(Deck).set({ likes: sql`${Deck.likes} - 1` }).where(eq(Deck.deckId, input.deckId));
        } else {
            // Like
            await db.insert(DeckLike).values({ userId: user.id, deckId: input.deckId });
            await db.update(Deck).set({ likes: sql`${Deck.likes} + 1` }).where(eq(Deck.deckId, input.deckId));
        }

        return { success: true };
    });

// Favorite a deck
const favorite = os
    .route({
        method:      'POST',
        description: 'Favorite a deck',
        tags:        ['Magic', 'Deck'],
    })
    .input(z.object({ deckId: z.string() }))
    .output(z.object({ success: z.boolean() }))
    .handler(async ({ input, context }) => {
        const user = (context as any).user;

        if (!user) {
            throw new ORPCError('UNAUTHORIZED', { message: 'You must be logged in to favorite a deck' });
        }

        const deck = await db.select().from(Deck).where(eq(Deck.deckId, input.deckId)).then(rows => rows[0]);

        if (!deck) {
            throw new ORPCError('NOT_FOUND', { message: 'Deck not found' });
        }

        // Check if already favorited
        const [existing] = await db.select().from(DeckFavorite)
            .where(and(eq(DeckFavorite.userId, user.id), eq(DeckFavorite.deckId, input.deckId)));

        if (existing) {
            // Unfavorite
            await db.delete(DeckFavorite)
                .where(and(eq(DeckFavorite.userId, user.id), eq(DeckFavorite.deckId, input.deckId)));
            await db.update(Deck).set({ favorites: sql`${Deck.favorites} - 1` }).where(eq(Deck.deckId, input.deckId));
        } else {
            // Favorite
            await db.insert(DeckFavorite).values({ userId: user.id, deckId: input.deckId });
            await db.update(Deck).set({ favorites: sql`${Deck.favorites} + 1` }).where(eq(Deck.deckId, input.deckId));
        }

        return { success: true };
    });

// Get user's favorited decks
const favorites = os
    .route({
        method:      'GET',
        description: 'Get user favorite decks',
        tags:        ['Magic', 'Deck'],
    })
    .input(z.object({
        page:     z.number().int().min(1).default(1),
        pageSize: z.number().int().min(1).max(100).default(20),
    }))
    .output(z.object({
        decks: z.array(z.object({
            deckId:     z.string(),
            userId:     z.string(),
            name:       z.string(),
            format:     z.string(),
            visibility: deckVisibility,
            tags:       z.array(z.string()),
            createdAt:  z.date(),
            updatedAt:  z.date(),
            views:      z.number(),
            likes:      z.number(),
            favorites:  z.number(),
        })),
        total:    z.number(),
        page:     z.number(),
        pageSize: z.number(),
    }))
    .handler(async ({ input, context }) => {
        const user = (context as any).user;

        if (!user) {
            throw new ORPCError('UNAUTHORIZED', { message: 'You must be logged in to view favorites' });
        }

        const [totalResult] = await db.select({ count: count() })
            .from(DeckFavorite)
            .where(eq(DeckFavorite.userId, user.id));
        const total = totalResult.count;

        const decks = await db.select({
            deckId:     Deck.deckId,
            userId:     Deck.userId,
            name:       Deck.name,
            format:     Deck.format,
            visibility: Deck.visibility,
            tags:       Deck.tags,
            createdAt:  Deck.createdAt,
            updatedAt:  Deck.updatedAt,
            views:      Deck.views,
            likes:      Deck.likes,
            favorites:  Deck.favorites,
        })
            .from(DeckFavorite)
            .innerJoin(Deck, eq(DeckFavorite.deckId, Deck.deckId))
            .where(eq(DeckFavorite.userId, user.id))
            .orderBy(desc(DeckFavorite.createdAt))
            .limit(input.pageSize)
            .offset((input.page - 1) * input.pageSize);

        return {
            decks,
            total,
            page:     input.page,
            pageSize: input.pageSize,
        };
    });

export const deckTrpc = {
    create,
    update,
    delete: deleteDeck,
    get,
    list,
    like,
    favorite,
    favorites,
};

export const deckApi = {
};
