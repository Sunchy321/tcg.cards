import z from 'zod';

export const imageTaskStatus = z.strictObject({
    method: z.string(),
    type:   z.string(),

    amount: z.strictObject({
        count: z.int().nonnegative(),
        total: z.int().nonnegative(),
    }),
    time: z.strictObject({
        elapsed:   z.number().nonnegative(),
        remaining: z.number().nonnegative(),
    }),
    status: z.record(z.string(), z.string()),
    failed: z.int().nonnegative(),
});

export type ImageTaskStatus = z.infer<typeof imageTaskStatus>;
