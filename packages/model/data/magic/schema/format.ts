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
        score:  z.int().min(1).nullable(),
        date:   z.string(),
        group:  z.string().nullable(),
    }).array(),

    birthday:  z.string().nullable(),
    deathdate: z.string().nullable(),

    tags: z.string().array().default([]),
});

export type Format = z.infer<typeof format>;
