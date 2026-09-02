import { z } from 'zod';

import { legality } from './announcement';
import { color, fullImageType, locale, layout, rarity } from './basic';

export const category = z.enum([
  'advertisement',
  'art',
  'auxiliary',
  'decklist',
  'default',
  'minigame',
  'player',
  'token',
]).describe('category');

export type Category = z.infer<typeof category>;

export const card = z.strictObject({
  cardId:  z.string(),
  version: z.string().default(''),

  partCount: z.int().min(1).default(1),

  name:     z.string(),
  typeline: z.string(),

  manaValue:     z.number(),
  colorIdentity: color,

  keywords:       z.array(z.string()),
  counters:       z.array(z.string()),
  producibleMana: z.string().nullable(),

  tags: z.array(z.string()),

  category: category,

  legalities: z.record(z.string(), legality.or(z.string())),

  hasContentWarning: z.boolean().nullable(),

  scryfallOracleId: z.array(z.string()),
});

export const cardLocalization = z.strictObject({
  cardId:  z.string(),
  version: z.string().default(''),
  locale,
  source:  z.string().default(''),

  name:     z.string(),
  typeline: z.string(),
});

export const cardPart = z.strictObject({
  cardId:    z.string(),
  version:   z.string().default(''),
  partIndex: z.int().min(0),

  name:     z.string(),
  typeline: z.string(),
  text:     z.string(),

  cost:           z.array(z.string()).nullable(),
  manaValue:      z.number().nullable(),
  color:          color.nullable(),
  colorIndicator: color.nullable(),

  typeSuper: z.array(z.string()).nullable(),
  typeMain:  z.array(z.string()),
  typeSub:   z.array(z.string()).nullable(),

  power:        z.string().nullable(),
  toughness:    z.string().nullable(),
  loyalty:      z.string().nullable(),
  defense:      z.string().nullable(),
  handModifier: z.string().nullable(),
  lifeModifier: z.string().nullable(),
});

export const cardPartLocalization = z.strictObject({
  cardId:    z.string(),
  version:   z.string().default(''),
  locale,
  source:    z.string().default(''),
  partIndex: z.int().min(0),

  name:     z.string(),
  typeline: z.string(),
  text:     z.string(),
});

export const cardUnifiedLocalization = z.strictObject({
  cardId:  z.string(),
  version: z.string().default(''),
  locale,

  name:       z.string(),
  typeline:   z.string(),
  text:       z.string(),
  flavorText: z.string().nullable(),

  sourceSet:         z.string().nullable(),
  sourceNumber:      z.string().nullable(),
  sourceReleaseDate: z.string().nullable(),
});

export const cardView = z.strictObject({
  cardId:    z.string(),
  version:   z.string(),
  locale,
  source:    z.string(),
  partIndex: z.int().min(0),

  card:             card.omit({ cardId: true, version: true }),
  localization:     cardLocalization.omit({ cardId: true, version: true, locale: true, source: true }),
  part:             cardPart.omit({ cardId: true, version: true, partIndex: true }),
  partLocalization: cardPartLocalization.omit({ cardId: true, version: true, partIndex: true, locale: true, source: true }),
});

export const cardProfile = z.strictObject({
  cardId: z.string(),

  localization: z.strictObject({
    locale: z.string(),
    name:   z.string(),
  }).array(),

  versions: z.strictObject({
    lang:        locale,
    set:         z.string(),
    number:      z.string(),
    rarity,
    layout,
    fullImageType,
    releaseDate: z.string(),
  }).array(),
});

export type Card = z.infer<typeof card>;
export type CardLocalization = z.infer<typeof cardLocalization>;
export type CardPart = z.infer<typeof cardPart>;
export type CardPartLocalization = z.infer<typeof cardPartLocalization>;
export type CardUnifiedLocalization = z.infer<typeof cardUnifiedLocalization>;

export type CardView = z.infer<typeof cardView>;
export type CardProfile = z.infer<typeof cardProfile>;
