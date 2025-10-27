import { z } from 'zod';

export const setLocalization = z.strictObject({
    lang: z.string(),
    name: z.string(),
});

export const set = z.strictObject({
    setId: z.string(),

    dbfId: z.number().nullable(),

    localization: setLocalization.array(),

    type:          z.string(),
    releaseDate:   z.string(),
    cardCountFull: z.number().nullable(),
    cardCount:     z.number().nullable(),
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
