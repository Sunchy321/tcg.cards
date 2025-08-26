import { z } from 'zod';

import { legality } from './format-change';

export const format = z.strictObject({
    formatId:     z.string(),
    localization: z.array(
        z.strictObject({
            lang: z.string(),
            name: z.string(),
        }),
    ),
    sets:    z.array(z.string()).optional(),
    banlist: z.array(
        z.strictObject({
            id:     z.string(),
            status: legality,
            date:   z.string(),
            group:  z.string().optional(),
        }),
    ),
    birthday:  z.string().optional(),
    deathdate: z.string().optional(),
    isEternal: z.boolean(),
});

export type Format = z.infer<typeof format>;
