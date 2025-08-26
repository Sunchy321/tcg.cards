import { z } from 'zod';

export const cardRelation = z.strictObject({
    relation:      z.string(),
    sourceId:      z.string(),
    targetId:      z.string(),
    targetVersion: z.strictObject({
        set:    z.string(),
        number: z.string(),
        lang:   z.string().optional(),
    }).optional(),
});

export type CardRelation = z.infer<typeof cardRelation>;
