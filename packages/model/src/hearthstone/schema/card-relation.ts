import { z } from 'zod';

/** @deprecated Use `entityRelation` for version-aware card relations. */
export const cardRelation = z.strictObject({
    relation: z.string(),
    version:  z.number().array(),
    sourceId: z.string(),
    targetId: z.string(),
});

export type CardRelation = z.infer<typeof cardRelation>;
