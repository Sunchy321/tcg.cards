import { z } from 'zod';

export const cardRelation = z.strictObject({
    relation: z.string(),
    version:  z.number().array(),
    sourceId: z.string(),
    targetId: z.string(),
});

export type CardRelation = z.infer<typeof cardRelation>;
