import { z } from 'zod';

import { fullLocale, rarity } from './basic';

export const booster = z.strictObject({
    boosterId: z.string(),

    packs: z.strictObject({
        contents: z.strictObject({
            type:  z.string(),
            count: z.number(),
        }).array(),

        weight: z.number(),
    }).array(),

    totalWeight: z.number(),

    sheets: z.strictObject({
        typeId: z.string(),

        cards: z.strictObject({
            cardId:  z.string(),
            version: z.strictObject({
                set:    z.string(),
                number: z.string(),
                lang:   z.string().nullable(),
            }),

            weight: z.number(),
        }).array(),

        totalWeight: z.number(),

        allowDuplicates: z.boolean(),
        balanceColors:   z.boolean(),
        isFoil:          z.boolean(),
        isFixed:         z.boolean(),
    }).array(),
});

export const set = z.strictObject({
    setId: z.string(),

    block:  z.string().nullable(),
    parent: z.string().nullable(),

    printedSize: z.number().nullable(),
    cardCount:   z.number(),
    langs:       fullLocale.array(),
    rarities:    rarity.array(),

    localization: z.strictObject({
        lang: z.string(),
        name: z.string().nullable(),
        link: z.string().nullable(),
    }).array(),

    type:            z.string(),
    isDigital:       z.boolean(),
    isFoilOnly:      z.boolean(),
    isNonfoilOnly:   z.boolean(),
    symbolStyle:     z.string().array().nullable(),
    doubleFacedIcon: z.string().array().nullable(),

    releaseDate: z.string().nullable(),

    scryfallId:   z.uuid(),
    scryfallCode: z.string(),

    mtgoCode:    z.string().nullable(),
    tcgPlayerId: z.number().nullable(),

    boosters: booster.array().nullable(),
});

export const setProfile = set.pick({
    setId:           true,
    parent:          true,
    localization:    true,
    type:            true,
    symbolStyle:     true,
    doubleFacedIcon: true,
    releaseDate:     true,
});

export type Set = z.infer<typeof set>;
export type Booster = z.infer<typeof booster>;
export type SetProfile = z.infer<typeof setProfile>;
