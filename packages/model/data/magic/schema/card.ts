import { z } from 'zod';

import { legality } from './game-change';
import { color, fullImageType, locale, layout, rarity } from './basic';

export const category = z.enum([
    'advertisement',
    'art',
    'auxiliary',
    'decklist',
    'default',
    'minigame',
    'player',
    'token',
]);

export type Category = z.infer<typeof category>;

export const card = z.strictObject({
    cardId: z.string(),

    partCount: z.int().min(1).default(1),

    name:     z.string(),
    typeline: z.string(),
    text:     z.string(),

    manaValue:     z.number(),
    colorIdentity: color,

    keywords:       z.array(z.string()),
    counters:       z.array(z.string()),
    producibleMana: z.string().nullable(),

    tags: z.array(z.string()),

    category: category,

    legalities: z.record(z.string(), legality.or(z.string())),

    contentWarning: z.boolean().nullable(),

    scryfallOracleId: z.array(z.string()),
});

export const cardLocalization = z.strictObject({
    cardId: z.string(),
    locale,

    name:     z.string(),
    typeline: z.string(),
    text:     z.string(),

    __lastDate: z.string(),
});

export const cardPart = z.strictObject({
    cardId:    z.string(),
    partIndex: z.int().min(0),

    name:     z.string(),
    typeline: z.string(),
    text:     z.string(),

    cost:           z.array(z.string()).nullable(),
    manaValue:      z.number().nullable(),
    color:          color.nullable(),
    colorIndicator: color.nullable(),

    typeSuper: z.array(z.string()).nullable(),
    typeMain:  z.array(z.string()),
    typeSub:   z.array(z.string()).nullable(),

    power:        z.string().nullable(),
    toughness:    z.string().nullable(),
    loyalty:      z.string().nullable(),
    defense:      z.string().nullable(),
    handModifier: z.string().nullable(),
    lifeModifier: z.string().nullable(),
});

export const cardPartLocalization = z.strictObject({
    cardId:    z.string(),
    locale,
    partIndex: z.int().min(0),

    name:     z.string(),
    typeline: z.string(),
    text:     z.string(),
});

export const cardView = z.strictObject({
    cardId:    z.string(),
    partIndex: z.int().min(0),
    locale,

    card:             card.omit({ cardId: true }),
    localization:     cardLocalization.omit({ cardId: true, locale: true }),
    part:             cardPart.omit({ cardId: true, partIndex: true }),
    partLocalization: cardPartLocalization.omit({ cardId: true, partIndex: true, locale: true }),
});

export const cardProfile = z.strictObject({
    cardId: z.string(),

    localization: z.strictObject({
        locale: z.string(),
        name:   z.string(),
    }).array(),

    versions: z.strictObject({
        lang:        locale,
        set:         z.string(),
        number:      z.string(),
        rarity,
        layout,
        fullImageType,
        releaseDate: z.string(),
    }).array(),
});

export type Card = z.infer<typeof card>;
export type CardLocalization = z.infer<typeof cardLocalization>;
export type CardPart = z.infer<typeof cardPart>;
export type CardPartLocalization = z.infer<typeof cardPartLocalization>;

export type CardView = z.infer<typeof cardView>;
export type CardProfile = z.infer<typeof cardProfile>;
