import { z } from 'zod';

/** Per-card Chinese name / type line / text (zhs_card.json). */
export const zhsCard = z.strictObject({
  cardId:       z.string(),
  name:         z.string().nullable(),
  faceName:     z.string().nullable(),
  flavorName:   z.string().nullable(),
  typeLine:     z.string().nullable(),
  text:         z.string().nullable(),
  flavorText:   z.string().nullable(),
  multiverseId: z.int().nullable(),
  source:       z.string().nullable(),
  extra:        z.unknown().nullable(),
});

/** Per-oracle Chinese translations (zhs_oracle.json). */
export const zhsOracle = z.strictObject({
  faceOracleId:    z.string(),
  oracleId:        z.string(),
  set:             z.string(),
  collectorNumber: z.string(),
  releasedAt:      z.string(),
  typeLine:        z.string(),
  oracleText:      z.string().nullable(),
  translatedName:  z.string().nullable(),
  nameStage:       z.int().nullable(),
  nameSource:      z.string().nullable(),
  translatedType:  z.string().nullable(),
  typeStage:       z.int().nullable(),
  translatedText:  z.string().nullable(),
  textStage:       z.int().nullable(),
  textSource:      z.string().nullable(),
  formerNames:     z.unknown().nullable(),
  extra:           z.unknown().nullable(),
});

/** Chinese flavor text (zhs_flavor.json). */
export const zhsFlavor = z.strictObject({
  flavorId:             z.string(),
  name:                 z.string().nullable(),
  flavorName:           z.string().nullable(),
  flavorText:           z.string().nullable(),
  set:                  z.string().nullable(),
  collectorNumber:      z.string().nullable(),
  releasedAt:           z.string().nullable(),
  translatedFlavorName: z.string().nullable(),
  translatedFlavorText: z.string().nullable(),
  flavorUpdatedAt:      z.string().nullable(),
  source:               z.string().nullable(),
  stage:                z.int().nullable(),
  extra:                z.unknown().nullable(),
});

/** Chinese ruling translations (zhs_ruling.json). */
export const zhsRuling = z.strictObject({
  ruling:          z.string(),
  comment:         z.string(),
  translation:     z.string(),
  source:          z.string().nullable(),
  stage:           z.int().nullable(),
  lastPublishedAt: z.string().nullable(),
  extra:           z.unknown().nullable(),
});

/** Chinese set names (zhs_set.json). */
export const zhsSet = z.strictObject({
  setId:  z.string(),
  code:   z.string(),
  name:   z.string(),
  source: z.string().nullable(),
  stage:  z.int().nullable(),
});

/** Chinese type / subtype / supertype translations (zhs_type.json). */
export const zhsType = z.strictObject({
  typeName:    z.string(),
  typeType:    z.string(),
  translation: z.string().nullable(),
  stage:       z.int().nullable(),
});

export type ZhsCard = z.infer<typeof zhsCard>;
export type ZhsOracle = z.infer<typeof zhsOracle>;
export type ZhsFlavor = z.infer<typeof zhsFlavor>;
export type ZhsRuling = z.infer<typeof zhsRuling>;
export type ZhsSet = z.infer<typeof zhsSet>;
export type ZhsType = z.infer<typeof zhsType>;
