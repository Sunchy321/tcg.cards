import z from 'zod';

import { legality } from './game-change';

export const format = z.strictObject({
    formatId: z.string(),

    localization: z.strictObject({
        lang: z.string(),
        name: z.string(),
    }).array(),

    sets: z.string().array().nullable(),

    banlist: z.strictObject({
        cardId: z.string(),
        status: legality,
        date:   z.string(),
        group:  z.string().nullable(),
    }).array().nullable(),

    birthday:  z.string().nullable(),
    deathdate: z.string().nullable(),
});

export type Format = z.infer<typeof format>;
