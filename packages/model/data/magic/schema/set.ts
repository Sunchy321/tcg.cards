import { z } from 'zod';

import { fullLocale, rarity } from './basic';

export const booster = z.strictObject({
    boosterId: z.string(),

    packs: z.strictObject({
        contents: z.strictObject({
            type:  z.string(),
            count: z.int(),
        }).array(),

        weight: z.int(),
    }).array(),

    totalWeight: z.int(),

    sheets: z.strictObject({
        typeId: z.string(),

        cards: z.strictObject({
            cardId:  z.string(),
            version: z.strictObject({
                set:    z.string(),
                number: z.string(),
                lang:   z.string().nullable(),
            }),

            weight: z.int(),
        }).array(),

        totalWeight: z.int(),

        allowDuplicates: z.boolean(),
        balanceColors:   z.boolean(),
        isFoil:          z.boolean(),
        isFixed:         z.boolean(),
    }).array(),
});

export const setLocalization = z.strictObject({
    lang: z.string(),
    name: z.string().nullable(),
    link: z.string().nullable(),
});

export const set = z.strictObject({
    setId: z.string(),

    block:  z.string().nullable(),
    parent: z.string().nullable(),

    printedSize: z.int().nullable(),
    cardCount:   z.int(),
    langs:       fullLocale.array(),
    rarities:    rarity.array(),

    localization: setLocalization.array(),

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
    tcgPlayerId: z.int().nullable(),

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
export type SetLocalization = z.infer<typeof setLocalization>;
export type Booster = z.infer<typeof booster>;
export type SetProfile = z.infer<typeof setProfile>;
