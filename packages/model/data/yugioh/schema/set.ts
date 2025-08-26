import { z } from 'zod';

import { fullLocale } from './basic';

export const setLocalization = z.strictObject({
    lang: z.string(),
    name: z.string().nullable(),
});

export const set = z.strictObject({
    setId: z.string(),

    cardCount: z.int().nonnegative(),
    langs:     fullLocale.array(),
    rarities:  z.string().array(),

    localization: setLocalization.array(),

    type: z.string(),

    releaseDate: z.iso.date(),
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
export type SetProfile = z.infer<typeof setProfile>;
