import { ORPCError } from '@orpc/server';
import { os } from '@/orpc';

import { z } from 'zod';
import { and, count, desc, eq, inArray, or, sql } from 'drizzle-orm';

import { db } from '@/drizzle';
import { Deck, DeckLike, DeckFavorite } from '../schema/deck';
import { Card, CardPart } from '../schema/card';
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

        // Fetch card details for all cards in the deck
        const cardIds = [...new Set(deck.cards.map(c => c.cardId))];
        const cardDetails = await db.select({
            cardId:    Card.cardId,
            name:      Card.name,
            typeline:  Card.typeline,
            manaValue: Card.manaValue,
        })
            .from(Card)
            .where(inArray(Card.cardId, cardIds));

        // Fetch part details for main types and colors
        const partDetails = await db.select({
            cardId:   CardPart.cardId,
            color:    CardPart.color,
            typeMain: CardPart.typeMain,
        })
            .from(CardPart)
            .where(and(
                inArray(CardPart.cardId, cardIds),
                eq(CardPart.partIndex, 0), // Only get first part for simplicity
            ));

        // Create a map for quick lookup
        const cardMap = new Map(cardDetails.map(c => [c.cardId, c]));
        const partMap = new Map(partDetails.map(p => [p.cardId, p]));

        // Enrich cards with details
        const cardsWithDetails = deck.cards.map(card => {
            const details = cardMap.get(card.cardId);
            const part = partMap.get(card.cardId);

            if (!details || !part) {
                // Fallback if card not found
                return {
                    ...card,
                    name:      '',
                    typeline:  '',
                    manaValue: 0,
                    color:     [],
                    typeMain:  [],
                };
            }

            return {
                ...card,
                name:      details.name,
                typeline:  details.typeline,
                manaValue: details.manaValue,
                color:     part.color ? Array.from(part.color) : [],
                typeMain:  part.typeMain,
            };
        });

        const deckView: DeckView = {
            ...deck,
            cards:      cardsWithDetails,
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

// Check deck legality
const checkLegality = os
    .route({
        method:      'GET',
        description: 'Check deck legality for a format',
        tags:        ['Magic', 'Deck'],
    })
    .input(z.object({
        deckId: z.string(),
        format: z.string().optional(), // If not provided, use deck's format
    }))
    .output(z.object({
        format: z.string(),
        legal:  z.boolean(),
        issues: z.array(z.object({
            cardId:   z.string(),
            cardName: z.string(),
            reason:   z.string(), // 'banned', 'restricted', 'not-legal', 'too-many-copies'
            limit:    z.number().optional(),
            current:  z.number().optional(),
        })),
    }))
    .handler(async ({ input, context }) => {
        const { user } = context;

        // Get deck
        const deck = await db.select()
            .from(Deck)
            .where(eq(Deck.deckId, input.deckId))
            .then(rows => rows[0]);

        if (!deck) {
            throw new ORPCError('NOT_FOUND', { message: 'Deck not found' });
        }

        // Check visibility
        if (deck.visibility === 'private' && (!user || deck.userId !== user.id)) {
            throw new ORPCError('FORBIDDEN', { message: 'This deck is private' });
        }

        const format = input.format || deck.format;
        if (!format) {
            throw new ORPCError('BAD_REQUEST', { message: 'Format not specified' });
        }

        // Get card details with legalities
        const cardIds = [...new Set(deck.cards.map((c: any) => c.cardId))];
        const cards = await db.select({
            cardId:     Card.cardId,
            name:       Card.name,
            legalities: Card.legalities,
        })
            .from(Card)
            .where(inArray(Card.cardId, cardIds));

        const cardMap = new Map(cards.map(c => [c.cardId, c]));

        const issues: any[] = [];
        const cardCounts = new Map<string, number>();

        const isCommander = format === 'commander' || format.includes('duel') || format.includes('brawl');

        // Count cards by category
        let mainDeckCount = 0;
        let commanderCount = 0;

        for (const deckCard of deck.cards) {
            const dc = deckCard as any;
            if (dc.category === 'commander') {
                commanderCount += dc.quantity;
            } else if (dc.category === 'main') {
                mainDeckCount += dc.quantity;
            }
        }

        // Check deck size requirements
        if (isCommander) {
            // Commander: exactly 100 cards in main deck (99 + 1 commander)
            if (mainDeckCount !== 99) {
                issues.push({
                    cardId:   '',
                    cardName: '',
                    reason:   'invalid-deck-size',
                    limit:    99,
                    current:  mainDeckCount,
                });
            }
            // Must have exactly 1 commander
            if (commanderCount !== 1) {
                issues.push({
                    cardId:   '',
                    cardName: '',
                    reason:   'invalid-commander-count',
                    limit:    1,
                    current:  commanderCount,
                });
            }
        } else {
            // Other formats: at least 60 cards in main deck
            if (mainDeckCount < 60) {
                issues.push({
                    cardId:   '',
                    cardName: '',
                    reason:   'invalid-deck-size',
                    limit:    60,
                    current:  mainDeckCount,
                });
            }
            // Non-commander decks cannot have commanders
            if (commanderCount > 0) {
                issues.push({
                    cardId:   '',
                    cardName: '',
                    reason:   'invalid-commander-count',
                    limit:    0,
                    current:  commanderCount,
                });
            }
        }

        // Check each card
        for (const deckCard of deck.cards) {
            const card = cardMap.get((deckCard as any).cardId);
            if (!card) continue;

            const legality = card.legalities[format];

            // Count cards (excluding basic lands and cards that allow any number)
            const cardName = card.name;
            const currentCount = (cardCounts.get(cardName) || 0) + (deckCard as any).quantity;
            cardCounts.set(cardName, currentCount);

            // Check legality status
            if (legality === 'banned') {
                issues.push({
                    cardId:   card.cardId,
                    cardName: card.name,
                    reason:   'banned',
                });
            } else if (legality === 'restricted') {
                // Restricted means max 1 copy
                if ((deckCard as any).quantity > 1) {
                    issues.push({
                        cardId:   card.cardId,
                        cardName: card.name,
                        reason:   'restricted',
                        limit:    1,
                        current:  (deckCard as any).quantity,
                    });
                }
            } else if (legality === 'not_legal' || !legality) {
                issues.push({
                    cardId:   card.cardId,
                    cardName: card.name,
                    reason:   'not-legal',
                });
            }
        }

        // Check copy limit (4 for most formats, 1 for Commander)
        const copyLimit = isCommander ? 1 : 4;
        for (const [cardName, count] of cardCounts.entries()) {
            if (count > copyLimit) {
                const card = cards.find(c => c.name === cardName);
                // Skip basic lands
                if (card && !card.name.match(/^(Plains|Island|Swamp|Mountain|Forest)$/)) {
                    issues.push({
                        cardId:   card.cardId,
                        cardName: card.name,
                        reason:   'too-many-copies',
                        limit:    copyLimit,
                        current:  count,
                    });
                }
            }
        }

        return {
            format,
            legal: issues.length === 0,
            issues,
        };
    });

// Update deck from code (using card names)
const updateFromCode = os
    .input(z.object({
        deckId: z.string(),
        code:   z.string(),
        format: z.enum(['mtgo', 'mtga']).default('mtgo'),
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

        // Parse code
        const lines = input.code.split('\n').map(l => l.trim()).filter(l => l);
        const cardEntries: { name: string, quantity: number, category: 'commander' | 'companion' | 'main' | 'sideboard' }[] = [];
        let currentCategory: 'commander' | 'companion' | 'main' | 'sideboard' = 'main';

        if (input.format === 'mtgo') {
            // MTGO format: blank line separates main deck from sideboard
            let blankLinesSeen = 0;
            const allLines = input.code.split('\n').map(l => l.trim());

            for (const line of allLines) {
                if (!line) {
                    blankLinesSeen++;
                    continue;
                }

                // After first blank line(s), we're in sideboard
                if (blankLinesSeen > 0 && currentCategory === 'main') {
                    currentCategory = 'sideboard';
                }

                const match = line.match(/^(\d+)x?\s+(.+)$/);
                if (match) {
                    const quantity = parseInt(match[1]);
                    const cardName = match[2].trim();

                    cardEntries.push({
                        name:     cardName,
                        quantity,
                        category: currentCategory,
                    });
                }
            }
        } else {
            // MTGA format: section headers
            for (const line of lines) {
                const lowerLine = line.toLowerCase();

                if (lowerLine === 'commander') {
                    currentCategory = 'commander';
                    continue;
                } else if (lowerLine === 'companion') {
                    currentCategory = 'companion';
                    continue;
                } else if (lowerLine === 'deck') {
                    currentCategory = 'main';
                    continue;
                } else if (lowerLine === 'sideboard') {
                    currentCategory = 'sideboard';
                    continue;
                }

                const match = line.match(/^(\d+)x?\s+(.+)$/);
                if (match) {
                    const quantity = parseInt(match[1]);
                    const cardName = match[2].trim();

                    cardEntries.push({
                        name:     cardName,
                        quantity,
                        category: currentCategory,
                    });
                }
            }
        }

        // Look up card IDs from names
        const cardNames = [...new Set(cardEntries.map(e => e.name))];

        // Query cards by exact name or by front face (for double-faced cards)
        const cards = await db.select({
            cardId: Card.cardId,
            name:   Card.name,
        })
            .from(Card)
            .where(
                or(
                    inArray(Card.name, cardNames),
                    // Match double-faced cards by front face name (name starts with "inputName //")
                    ...cardNames.map(name => sql`${Card.name} LIKE ${name + ' //%'}`),
                ),
            );

        // Build a map from both full name and front face name to card ID
        const nameToIdMap = new Map<string, string>();
        for (const card of cards) {
            // Add exact match
            nameToIdMap.set(card.name, card.cardId);

            // If it's a double-faced card (contains //), also map the front face
            if (card.name.includes(' // ')) {
                const frontFace = card.name.split(' // ')[0];
                // Only set if not already set (prefer exact matches)
                if (!nameToIdMap.has(frontFace)) {
                    nameToIdMap.set(frontFace, card.cardId);
                }
            }
        }

        // Convert to deck cards with IDs, skip unrecognized cards
        const deckCards: any[] = [];

        for (const entry of cardEntries) {
            const cardId = nameToIdMap.get(entry.name);
            if (!cardId) {
                // Skip unrecognized cards
                console.warn(`Card not found for name: ${entry.name}, skipping`);
                continue;
            }

            deckCards.push({
                cardId:   cardId,
                quantity: entry.quantity,
                category: entry.category,
            });
        }

        // Update deck
        await db.update(Deck).set({
            cards:     deckCards,
            updatedAt: new Date(),
        }).where(eq(Deck.deckId, input.deckId));

        return { success: true };
    });

export const deckTrpc = {
    create,
    update,
    updateFromCode,
    delete: deleteDeck,
    get,
    list,
    like,
    favorite,
    favorites,
    checkLegality,
};

export const deckApi = {
};
