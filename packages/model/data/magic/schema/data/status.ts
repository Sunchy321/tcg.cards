import z from 'zod';

export const status = z.strictObject({
    method: z.string(),
    type:   z.string(),

    amount: z.strictObject({
        updated: z.int().min(0).optional(),
        count:   z.int().min(0),
        total:   z.int().min(0).optional(),
    }),

    time: z.strictObject({
        elapsed:   z.int().min(0),
        remaining: z.number().min(0).or(z.literal(Infinity)),
    }).optional(),
});

export type Status = z.infer<typeof status>;
