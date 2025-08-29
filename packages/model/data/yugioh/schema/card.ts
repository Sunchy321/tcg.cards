import z from 'zod';

import { attribute, fullLocale } from './basic';
import { legality } from './game-change';

export const category = z.enum(['normal']);

export const card = z.strictObject({
    cardId: z.string(),

    localization: z.strictObject({
        lang:     fullLocale,
        name:     z.string(),
        rubyName: z.string().nullable(),
        typeline: z.string(),
        text:     z.string(),
        comment:  z.string().nullable(),
    }).array(),

    typeMain:           z.string(),
    typeSub:            z.string().array().nullable(),
    attribute:          attribute.nullable(),
    level:              z.int().nonnegative().nullable(),
    rank:               z.int().nonnegative().nullable(),
    linkValue:          z.int().nonnegative().nullable(),
    linkMarkers:        z.int().nonnegative().array().nullable(),
    attack:             z.string().nullable(),
    defense:            z.string().nullable(),
    race:               z.string().nullable(),
    leftPendulumScale:  z.int().nonnegative().nullable(),
    rightPendulumScale: z.int().nonnegative().nullable(),

    tags: z.array(z.string()),

    category:   category,
    legalities: z.record(z.string(), legality),

    konamiId: z.int().positive().nullable(),
    passcode: z.int().positive().nullable(),
});

export const cardView = card.extend({
    lang: card.shape.localization.element.shape.lang,

    localization: card.shape.localization.element.omit({ lang: true }),
});

export const cardProfile = z.strictObject({
    cardId: z.string(),

    localization: z.strictObject({
        lang: z.string(),
        name: z.string(),
    }).array(),

    passcode: z.number().positive().nullable(),

    versions: z.strictObject({
        lang:   fullLocale,
        set:    z.string(),
        number: z.string(),
        rarity: z.string(),
    }).array(),
});

export type Card = z.infer<typeof card>;
export type CardView = z.infer<typeof cardView>;
export type CardProfile = z.infer<typeof cardProfile>;
