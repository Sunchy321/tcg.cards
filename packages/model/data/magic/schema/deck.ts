import { z } from 'zod';

export const deckVisibility = z.enum(['public', 'unlisted', 'private']);

export type DeckVisibility = z.infer<typeof deckVisibility>;

export const deckCard = z.strictObject({
    cardId:   z.string(),
    quantity: z.number().int().min(1).default(1),
    category: z.enum(['main', 'sideboard', 'commander', 'companion']).default('main'),
    version:  z.strictObject({
        set:    z.string(),
        number: z.string(),
        lang:   z.string().optional(),
    }).optional(),
});

export const deck = z.strictObject({
    deckId:      z.string(),
    userId:      z.string(),
    name:        z.string().min(1).max(200),
    description: z.string().max(2000).nullable(),
    format:      z.string().nullable(),

    cards: z.array(deckCard),

    visibility: deckVisibility.default('private'),
    tags:       z.array(z.string()).default([]),

    createdAt: z.date(),
    updatedAt: z.date(),

    // stats
    views:     z.number().int().min(0).default(0),
    likes:     z.number().int().min(0).default(0),
    favorites: z.number().int().min(0).default(0),
});

export const deckView = z.strictObject({
    deckId:      z.string(),
    userId:      z.string(),
    userName:    z.string(),
    name:        z.string().min(1).max(200),
    description: z.string().max(2000).nullable(),
    format:      z.string().nullable(),

    cards: z.array(deckCard),

    visibility: deckVisibility.default('private'),
    tags:       z.array(z.string()).default([]),

    createdAt: z.date(),
    updatedAt: z.date(),

    // stats
    views:     z.number().int().min(0).default(0),
    likes:     z.number().int().min(0).default(0),
    favorites: z.number().int().min(0).default(0),

    isLiked:    z.boolean().default(false),
    isFavorite: z.boolean().default(false),
});

export const deckListItem = deck.omit({ cards: true, description: true });

export type DeckCard = z.infer<typeof deckCard>;
export type Deck = z.infer<typeof deck>;
export type DeckView = z.infer<typeof deckView>;
export type DeckListItem = z.infer<typeof deckListItem>;
