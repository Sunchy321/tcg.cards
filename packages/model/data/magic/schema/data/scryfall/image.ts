import z from 'zod';

export const imageType = z.enum(['png', 'large', 'normal', 'small', 'art_crop', 'border_crop']);

export const imageTaskStatus = z.strictObject({
    overall: z.strictObject({
        count: z.int().min(0),
        total: z.int().min(0),
    }),
    current: z.strictObject({
        set:  z.string(),
        lang: z.string(),
    }),
    status: z.record(z.string(), z.string()),
    failed: z.int().min(0),
});

export type ImageType = z.infer<typeof imageType>;
export type ImageTaskStatus = z.infer<typeof imageTaskStatus>;
