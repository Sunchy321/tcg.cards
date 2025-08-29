import { z } from 'zod';

export const setLocalization = z.strictObject({
    lang: z.string(),
    name: z.string(),
});

export const set = z.strictObject({
    setId: z.string(),

    dbfId: z.number().nullable(),

    type:        z.string(),
    releaseDate: z.string(),
    cardCount:   z.tuple([z.number(), z.number()]),
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
