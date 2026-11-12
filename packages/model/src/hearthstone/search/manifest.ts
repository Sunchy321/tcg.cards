import { z } from 'zod';

/** Identifies the latest build represented by one complete search dataset. */
export const hearthstoneSearchManifest = z.strictObject({
  dataVersion: z.string().min(1),
  releaseHash: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  buildNumber: z.int().positive(),
});

/** Carries version metadata alongside, rather than inside, search rows. */
export type HearthstoneSearchManifest = z.infer<typeof hearthstoneSearchManifest>;

/** Preserves the small set of mechanic values needed by search filters and card images. */
export type SimpleTags = Record<string, boolean | number>;

export const SIMPLE_TAG_IDS = ['12', '1665', '1855', '1676', '4503', '1932', '2589', '1965', '2355'] as const;

/** Copies only approved search and image tags without converting their original values. */
export function pickSimpleTags(mechanics: SimpleTags): SimpleTags {
  return Object.fromEntries(SIMPLE_TAG_IDS
    .filter(id => Object.hasOwn(mechanics, id))
    .map(id => [id, mechanics[id]!]));
}
