import { z } from 'zod';

import { legality } from './game-change';
import { category, color, layout, locale, rarity } from './basic';

export const card = z.strictObject({
    cardId: z.string(),

    cost:  z.number(),
    color: z.array(color),

    inkwell: z.boolean(),

    name:     z.string(),
    typeline: z.string(),
    text:     z.string(),

    typeMain: z.string(),
    typeSub:  z.string().array().nullable(),

    lore:      z.number().nullable(),
    strength:  z.number().nullable(),
    willPower: z.number().nullable(),
    moveCost:  z.number().nullable(),

    tags: z.string().array(),

    category:   category,
    legalities: z.record(z.string(), legality),
});

export const cardLocalization = z.strictObject({
    cardId:     z.string(),
    lang:       locale,
    name:       z.string(),
    typeline:   z.string(),
    text:       z.string(),
    __lastDate: z.string(),
});

export const cardView = card.extend({
    lang: cardLocalization.shape.lang,

    localization: cardLocalization.omit({ cardId: true, lang: true }),
});

export const cardProfile = z.strictObject({
    cardId: z.string(),

    localization: z.strictObject({
        lang: locale,
        name: z.string(),
    }).array(),

    versions: z.strictObject({
        set:         z.string(),
        number:      z.string(),
        lang:        locale,
        rarity:      rarity,
        layout:      layout,
        releaseDate: z.string(),
    }).array(),
});

export type Card = z.infer<typeof card>;
export type CardLocalization = z.infer<typeof cardLocalization>;

export type CardView = z.infer<typeof cardView>;
export type CardProfile = z.infer<typeof cardProfile>;
