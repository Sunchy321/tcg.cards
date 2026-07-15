import z from 'zod';

export const patch = z.strictObject({
  buildNumber: z.int(),
  name:        z.string(),
  shortName:   z.string(),
  hash:        z.string(),
  isLatest:    z.boolean().default(false),

  releaseDate: z.string().nullable(),
  expansion:   z.string().nullable(),
});

export type Patch = z.infer<typeof patch>;
