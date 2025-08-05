import z from 'zod';

import { legality } from './format-change';

export const formatSchema = z.strictObject({
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

export type Format = z.infer<typeof formatSchema>;
