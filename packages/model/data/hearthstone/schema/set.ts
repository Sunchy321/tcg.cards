import { z } from 'zod';

import { locale, rarity } from './basic';

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
    langs:       locale.array(),
    rarities:    rarity.array(),

    localization: setLocalization.array(),

    type: z.string(),

    releaseDate: z.string().nullable(),
});

export const setProfile = set.pick({
    setId:        true,
    parent:       true,
    localization: true,
    type:         true,
    releaseDate:  true,
});

export type Set = z.infer<typeof set>;
export type SetLocalization = z.infer<typeof setLocalization>;
export type SetProfile = z.infer<typeof setProfile>;
