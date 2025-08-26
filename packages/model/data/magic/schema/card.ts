import { z } from 'zod';

import { legality } from './game-change';
import { fullImageType, fullLocale, layout, rarity } from './basic';

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
    cardId:    z.string(),
    lang:      z.string(),
    partIndex: z.int(),

    partCount: z.int(),

    name:     z.string(),
    typeline: z.string(),
    text:     z.string(),

    localization: z.strictObject({
        name:     z.string(),
        typeline: z.string(),
        text:     z.string(),
    }).array(),

    manaValue:     z.number(),
    colorIdentity: z.string(),

    part: z.strictObject({
        name:     z.string(),
        typeline: z.string(),
        text:     z.string(),

        cost:           z.array(z.string()).nullable(),
        manaValue:      z.number().nullable(),
        color:          z.string().nullable(),
        colorIndicator: z.string().nullable(),

        typeSuper: z.array(z.string()).nullable(),
        typeMain:  z.array(z.string()),
        typeSub:   z.array(z.string()).nullable(),

        power:        z.string().nullable(),
        toughness:    z.string().nullable(),
        loyalty:      z.string().nullable(),
        defense:      z.string().nullable(),
        handModifier: z.string().nullable(),
        lifeModifier: z.string().nullable(),
    }).array(),

    partLocalization: z.strictObject({
        name:       z.string(),
        typeline:   z.string(),
        text:       z.string(),
        __lastDate: z.string(),
    }).array(),

    keywords:       z.array(z.string()),
    counters:       z.array(z.string()),
    producibleMana: z.string().nullable(),

    tags: z.array(z.string()),

    category: category,

    legalities: z.record(z.string(), legality),

    contentWarning: z.boolean().nullable(),

    scryfallOracleId: z.array(z.string()),
});

export const cardView = card.extend({
    localization:     card.shape.localization.element,
    part:             card.shape.part.element,
    partLocalization: card.shape.partLocalization.element,
});

export const cardProfile = z.strictObject({
    cardId: z.string(),

    localization: z.strictObject({
        lang: z.string(),
        name: z.string(),
    }).array(),

    versions: z.strictObject({
        lang:        fullLocale,
        set:         z.string(),
        number:      z.string(),
        rarity,
        layout,
        fullImageType,
        releaseDate: z.string(),
    }).array(),
});

export type Card = z.infer<typeof card>;
export type CardView = z.infer<typeof cardView>;
export type CardProfile = z.infer<typeof cardProfile>;
