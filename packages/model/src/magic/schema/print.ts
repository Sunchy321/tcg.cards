import { z } from 'zod';

import { fullImageType, locale, layout, rarity } from './basic';
import { card as card, cardLocalization, cardPart, cardPartLocalization } from './card';

export const frame = z.enum(['1993', '1997', '2003', '2015', 'future']).describe('frame');
export const borderColor = z.enum(['black', 'borderless', 'gold', 'silver', 'white', 'yellow']).describe('borderColor');
export const securityStamp = z.enum(['acorn', 'arena', 'circle', 'heart', 'oval', 'triangle']).describe('securityStamp');
export const finish = z.enum(['nonfoil', 'foil', 'etched', 'glossy']).describe('finish');
export const imageStatus = z.enum(['highres_scan', 'lowres', 'missing', 'placeholder']).describe('imageStatus');
export const game = z.enum(['arena', 'astral', 'mtgo', 'paper', 'sega']).describe('game');
export const scryfallFace = z.enum(['back', 'bottom', 'front', 'top']).describe('scryfallFace');

export type Frame = z.infer<typeof frame>;
export type BorderColor = z.infer<typeof borderColor>;
export type SecurityStamp = z.infer<typeof securityStamp>;
export type Finish = z.infer<typeof finish>;
export type ImageStatus = z.infer<typeof imageStatus>;
export type Game = z.infer<typeof game>;
export type ScryfallFace = z.infer<typeof scryfallFace>;

export const print = z.strictObject({
  cardId:  z.string(),
  version: z.string().default(''),
  set:     z.string(),
  number:  z.string(),
  lang:    locale,
  source:  z.string().default(''),

  name:     z.string(),
  typeline: z.string(),

  layout:        layout,
  frame:         frame,
  frameEffects:  z.string().array(),
  borderColor:   borderColor,
  cardBack:      z.uuid().nullable(),
  securityStamp: securityStamp.nullable(),
  promoTypes:    z.string().array().nullable(),
  rarity:        rarity,
  releaseDate:   z.iso.date(),

  isDigital:       z.boolean(),
  isPromo:         z.boolean(),
  isReprint:       z.boolean(),
  finishes:        finish.array(),
  hasHighResImage: z.boolean(),
  imageStatus,
  imageUpdatedAt:  z.string().nullable(),
  fullImageType,

  inBooster: z.boolean(),
  games:     game.array(),

  previewDate:   z.iso.date().nullable(),
  previewSource: z.string().nullable(),
  previewUri:    z.string().nullable(),

  printTags: z.string().array(),

  isVariation: z.boolean().default(false),
  variationOf: z.uuid().nullable(),

  artistIds:      z.uuid().array().default([]),
  illustrationId: z.uuid().nullable(),
  resourceId:     z.string().nullable(),

  scryfallOracleId:  z.uuid(),
  scryfallCardId:    z.uuid().nullable(),
  scryfallFace:      scryfallFace.nullable(),
  scryfallImageUris: z.record(z.string(), z.url()).array().nullable(),

  arenaId:           z.int().nullable(),
  mtgoId:            z.int().nullable(),
  mtgoFoilId:        z.int().nullable(),
  multiverseId:      z.int().array(),
  tcgPlayerId:       z.int().nullable(),
  tcgplayerEtchedId: z.int().nullable(),
  cardMarketId:      z.int().nullable(),
});

export const printPart = z.strictObject({
  cardId:    print.shape.cardId,
  version:   print.shape.version,
  set:       print.shape.set,
  number:    print.shape.number,
  lang:      print.shape.lang,
  source:    print.shape.source,
  partIndex: cardPart.shape.partIndex,

  name:     z.string(),
  typeline: z.string(),
  text:     z.string(),

  attractionLights: z.string().nullable(),

  flavorName: z.string().nullable(),
  flavorText: z.string().nullable(),
  artist:     z.string().nullable(),
  watermark:  z.string().nullable(),

  scryfallIllusId: z.uuid().array().nullable(),
});

export const printView = z.strictObject({
  cardId:    print.shape.cardId,
  version:   print.shape.version,
  set:       print.shape.set,
  number:    print.shape.number,
  lang:      print.shape.lang,
  source:    print.shape.source,
  partIndex: printPart.shape.partIndex,

  print: print.omit({
    cardId:  true,
    version: true,
    set:     true,
    number:  true,
    lang:    true,
    source:  true,
  }),

  printPart: printPart.omit({
    cardId:    true,
    version:   true,
    set:       true,
    number:    true,
    lang:      true,
    source:    true,
    partIndex: true,
  }),
});

export const cardPrintView = z.object({
  cardId:    card.shape.cardId,
  version:   card.shape.version,
  locale:    cardLocalization.shape.locale,
  source:    cardLocalization.shape.source,
  set:       print.shape.set,
  number:    print.shape.number,
  lang:      print.shape.lang,
  partIndex: cardPart.shape.partIndex,

  card:                 card.omit({ cardId: true, version: true }),
  cardLocalization:     cardLocalization.omit({ cardId: true, version: true, locale: true, source: true }),
  cardPart:             cardPart.omit({ cardId: true, version: true, partIndex: true }),
  cardPartLocalization: cardPartLocalization.omit({ cardId: true, version: true, partIndex: true, locale: true, source: true }),
  print:                print.omit({ cardId: true, version: true, set: true, number: true, lang: true, source: true }),
  printPart:            printPart.omit({ cardId: true, version: true, set: true, number: true, lang: true, source: true, partIndex: true }),
});

export const version = z.strictObject({
  set:    z.string(),
  number: z.string(),
  lang:   locale,
  locale,
  rarity: rarity,
});

export const cardEditorView = z.strictObject({
  cardId:    card.shape.cardId,
  version:   card.shape.version,
  locale:    cardLocalization.shape.locale,
  source:    cardLocalization.shape.source,
  set:       print.shape.set,
  number:    print.shape.number,
  lang:      print.shape.lang,
  partIndex: cardPart.shape.partIndex,

  card: cardPrintView.shape.card,

  cardLocalization: cardPrintView.shape.cardLocalization,

  cardPart: cardPrintView.shape.cardPart,

  cardPartLocalization: cardPrintView.shape.cardPartLocalization,

  print: cardPrintView.shape.print,

  printPart: cardPrintView.shape.printPart,

  relatedCards: z.strictObject({
    relation: z.string(),
    cardId:   z.string(),
    version:  version.omit({ rarity: true }).optional(),
  }).array().optional(),

  __inDatabase: z.boolean(),

  __original: z.strictObject({
    cardId: card.shape.cardId.optional(),
    locale: cardLocalization.shape.locale.optional(),
    lang:   print.shape.lang.optional(),
  }).default({}),
});

export const cardFullView = cardPrintView.extend({
  versions: version.array(),

  relatedCards: z.strictObject({
    relation: z.string(),
    cardId:   z.string(),
    version:  version.optional(),
  }).array(),

  rulings: z.strictObject({
    cardId:   z.string(),
    source:   z.string(),
    date:     z.string(),
    text:     z.string(),
    richText: z.string(),
  }).array(),
});

export type Print = z.infer<typeof print>;
export type PrintPart = z.infer<typeof printPart>;

export type PrintView = z.infer<typeof printView>;
export type CardPrintView = z.infer<typeof cardPrintView>;
export type CardEditorView = z.infer<typeof cardEditorView>;
export type CardFullView = z.infer<typeof cardFullView>;
