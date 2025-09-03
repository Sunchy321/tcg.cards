import { z } from 'zod';

import { rarity } from './basic';

export const setLocalization = z.strictObject({
    lang:           z.string(),
    name:           z.string().optional(),
    isOfficialName: z.boolean().optional(),
});

export const set = z.strictObject({
    setId:  z.string(),
    number: z.number(),

    cardCount: z.number(),
    langs:     z.array(z.string()),
    rarities:  z.array(rarity),

    localization: z.array(setLocalization),

    type: z.string(),

    releaseDate:    z.string(),
    prereleaseDate: z.string(),

    lorcanaJsonId: z.string(),
});

export const setProfile = set.pick({
    setId:        true,
    localization: true,
    type:         true,
    releaseDate:  true,
});

export type Set = z.infer<typeof set>;
export type SetLocalization = z.infer<typeof setLocalization>;
export type SetProfile = z.infer<typeof setProfile>;
