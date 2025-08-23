import z from 'zod';

export const updation = z.strictObject({
    key:      z.string(),
    oldValue: z.any(),
    newValue: z.any(),
});

export type Updation = z.infer<typeof updation>;
