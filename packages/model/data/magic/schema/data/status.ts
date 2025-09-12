import z from 'zod';

export const status = z.strictObject({
    method: z.string(),
    type:   z.string(),

    amount: z.strictObject({
        updated: z.number().int().min(0).optional(),
        count:   z.number().int().min(0),
        total:   z.number().int().min(0).optional(),
    }),

    time: z.strictObject({
        elapsed:   z.number().int().min(0),
        remaining: z.number().int().min(0),
    }).optional(),
});

export type Status = z.infer<typeof status>;
