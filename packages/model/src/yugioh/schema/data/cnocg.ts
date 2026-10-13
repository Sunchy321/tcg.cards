import { z } from 'zod';

/**
 * One print entry of the official CNOCG card database (yugioh-card-cn.com):
 * the pack, regional card number, official rarity wording, and release date.
 */
export const cnocgPackEntry = z.looseObject({
  packId:      z.string(),
  packName:    z.string(),
  releaseDate: z.string(),
  cardNo:      z.string(),
  rarity:      z.string(),
  rarityId:    z.int().nullable().optional(),
  rarityKey:   z.string().nullable().optional(),
});

/**
 * The `response` payload of the CNOCG detail endpoint for one card: official
 * simplified-Chinese text plus the full CN print list. The API is v0 and adds
 * fields freely, so the schema is loose on purpose: known fields are typed,
 * unknown fields pass through instead of failing the crawl.
 */
export const cnocgCardData = z.looseObject({
  cardId:            z.int(),
  lang:              z.string(),
  cardName:          z.string(),
  attributeName:     z.string().nullable().optional(),
  effectName:        z.string().nullable().optional(),
  speciesName:       z.string().nullable().optional(),
  otherItemNameList: z.string().array().nullable().optional(),
  starchip:          z.int().nullable().optional(),
  linkMarkerCount:   z.int().nullable().optional(),
  /** Konami's link-marker encoding ("813"), same code as the Neuron arrow icon class. */
  linkMarker:        z.string().nullable().optional(),
  penScale:          z.int().nullable().optional(),
  atk:               z.int().nullable().optional(),
  def:               z.int().nullable().optional(),
  cardText:          z.string().nullable().optional(),
  pendulumText:      z.string().nullable().optional(),
  note:              z.string().nullable().optional(),
  defaultImageId:    z.int().nullable().optional(),
  imageIdList:       z.int().array().nullable().optional(),
  packList:          cnocgPackEntry.array(),
});

/** The envelope every CNOCG API response is wrapped in. */
export const cnocgDetailEnvelope = z.looseObject({
  result: z.looseObject({
    code:    z.int(),
    message: z.string(),
  }),
  response: cnocgCardData.nullable(),
});

/** Result code for a successfully resolved card. */
export const CNOCG_CODE_OK = 200000;
/** Result code for a card that has no entry in the CN database. */
export const CNOCG_CODE_NOT_FOUND = 404000;

export type CnocgPackEntry = z.infer<typeof cnocgPackEntry>;
export type CnocgCardData = z.infer<typeof cnocgCardData>;
