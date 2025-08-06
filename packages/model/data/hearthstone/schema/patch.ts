import z from 'zod';

export const patchSchema = z.strictObject({
    buildNumber: z.int(),
    name:        z.string(),
    shortName:   z.string(),
    hash:        z.string(),
    isLatest:    z.boolean().default(false),
    isUpdated:   z.boolean().default(false),
});

export type Patch = z.infer<typeof patchSchema>;
