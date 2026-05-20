import z from 'zod';

export const updation = z.strictObject({
    key:      z.string(),
    oldValue: z.any(),
    newValue: z.any(),
});

export const nullableText = z.string().nullable();

/** Describes one old/new value pair in a generic update payload. */
export type Updation = z.infer<typeof updation>;
