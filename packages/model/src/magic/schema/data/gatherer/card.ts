import { z } from 'zod';

const language = z.strictObject({
  englishName:     z.string(),
  originalName:    z.string(),
  isoCountryCode:  z.string(),
  isoLanguageCode: z.string(),
  code:            z.string(),
});

const color = z.strictObject({
  colorCode: z.string(),
  colorName: z.string(),
});

const formatLegality = z.strictObject({
  formatName: z.string(),
  legality:   z.string(),
});

const relatedCardInstance = z.strictObject({
  cardNumber:        z.string(),
  cardNumberVariant: z.string(),
  instanceName:      z.string(),
  languageCode:      z.string(),
  oracleName:        z.string(),
  nameKebab:         z.string(),
  resourceId:        z.string(),
  setCode:           z.string(),
  setName:           z.string(),
  setReleaseDate:    z.string(),
  imageUrls:         z.record(z.string(), z.string()),
});

const ruling = z.strictObject({
  rulingDate:      z.string(),
  rulingStatement: z.string(),
});

/**
 * Other face of a double-faced card: Gatherer puts the back face's card data
 * here instead of giving it a reachable multiverse id, which is why the back
 * image URL can only be read from this field.
 */
const compositeCard = z.looseObject({
  instanceName:  z.string().optional(),
  compositeType: z.string().optional(),
  imageUrls:     z.record(z.string(), z.string()).optional(),
});

/** A single Gatherer CardData payload, extracted from the site's RSC flight data. */
export const gathererCard = z.strictObject({
  resourceId:           z.string(),
  multiverseId:         z.int(),
  kind:                 z.literal('CardData'),
  id:                   z.string(),
  convertedManaCost:    z.union([z.string(), z.number()]),
  cardColor:            z.string(),
  cardNumber:           z.string(),
  cardNumberVariant:    z.string(),
  englishLanguageName:  z.string(),
  instanceName:         z.string(),
  language,
  languageCode:         z.string(),
  nativeLanguageName:   z.string(),
  oracleName:           z.string(),
  nameKebab:            z.string(),
  rarityCode:           z.string(),
  rarityName:           z.string(),
  setCode:              z.string(),
  setName:              z.string(),
  artistName:           z.string(),
  flavorText:           z.string(),
  instanceManaText:     z.string(),
  instanceSubtype:      z.string(),
  instanceText:         z.string(),
  instanceType:         z.string(),
  instanceTypeLine:     z.string(),
  oracleManaText:       z.string(),
  oracleSubtype:        z.string(),
  oracleText:           z.string(),
  oracleType:           z.string(),
  oracleTypeLine:       z.string(),
  oracleTypes:          z.string().array(),
  oracleSubtypes:       z.string().array(),
  oracleSupertypes:     z.string().array(),
  instanceTypes:        z.string().array(),
  instanceSubtypes:     z.string().array(),
  instanceSupertypes:   z.string().array(),
  imageUrls:            z.record(z.string(), z.string()),
  compositeCard:        compositeCard.nullable().optional(),
  colors:               color.array(),
  formatLegalities:     formatLegality.array(),
  relatedCardInstances: relatedCardInstance.array(),
  rulings:              ruling.array(),
  setReleaseDate:       z.string(),
  otherLanguages:       language.array(),
});

export type GathererData = z.infer<typeof gathererCard>;
