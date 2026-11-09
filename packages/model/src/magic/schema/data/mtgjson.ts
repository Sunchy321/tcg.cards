import { z } from 'zod';

/**
 * MTGJSON set-level data model, matching `magic_data.mtgjson_sets`.
 * The full Set object (cards[], tokens[], booster, sealedProduct[], decks[])
 * is kept in `data` and intentionally left untyped.
 */
export const mtgjsonSet = z.strictObject({
  setId:            z.string(),
  name:             z.string(),
  type:             z.string(),
  baseSetSize:      z.int(),
  totalSetSize:     z.int(),
  releaseDate:      z.string(),
  isFoilOnly:       z.boolean(),
  isNonFoilOnly:    z.boolean().nullable(),
  isOnlineOnly:     z.boolean(),
  isPaperOnly:      z.boolean().nullable(),
  isForeignOnly:    z.boolean().nullable(),
  isPartialPreview: z.boolean().nullable(),
  keyruneCode:      z.string(),
  block:            z.string().nullable(),
  parentCode:       z.string().nullable(),
  mtgoCode:         z.string().nullable(),
  mcmId:            z.int().nullable(),
  mcmIdExtras:      z.int().nullable(),
  mcmName:          z.string().nullable(),
  cardsphereSetId:  z.int().nullable(),
  tcgplayerGroupId: z.int().nullable(),
  tokenSetCode:     z.string().nullable(),
  languages:        z.string().array().nullable(),
  translations:     z.record(z.string(), z.string()).nullable(),
  data:             z.unknown(),
});

export type MtgjsonSet = z.infer<typeof mtgjsonSet>;
