import { z } from 'zod';

export const entityRelation = z.strictObject({
  sourceId:           z.string(),
  sourceRevisionHash: z.string(),
  relation:           z.string(),
  targetId:           z.string(),
  version:            z.number().array().nonempty(),
  isLatest:           z.boolean(),
});

export type EntityRelation = z.infer<typeof entityRelation>;
