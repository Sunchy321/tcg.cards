import z from 'zod';

export const formatSchema = z.strictObject({
    formatId: z.string(),

    localization: z.strictObject({
        lang: z.string(),
        name: z.string(),
    }).array(),

    sets: z.string().array().optional(),

    banlist: z.strictObject({
        cardId: z.string(),
        status: z.enum(['legal', 'restricted', 'banned']),
        date:   z.string(),
        group:  z.string().optional(),
    }).array().default([]),

    birthday: z.string(),
});
