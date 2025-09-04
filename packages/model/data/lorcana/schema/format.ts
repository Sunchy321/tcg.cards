import { z } from 'zod';

import { legality } from './game-change';

export const format = z.strictObject({
    formatId:     z.string(),
    localization: z.array(
        z.strictObject({
            lang: z.string(),
            name: z.string(),
        }),
    ),
    sets:    z.array(z.string()).nullable(),
    banlist: z.array(
        z.strictObject({
            cardId: z.string(),
            status: legality,
            date:   z.string(),
            group:  z.string().nullable(),
        }),
    ),
    birthday:  z.string().nullable(),
    deathdate: z.string().nullable(),

    tags: z.string().array().default([]),
});

export type Format = z.infer<typeof format>;
