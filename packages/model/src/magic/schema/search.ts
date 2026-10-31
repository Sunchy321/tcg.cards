import z from 'zod';

import { createSearchNormalResult, createSearchResult } from '#search/schema';

import { imageType } from './basic';
import { cardEditorView, cardPrintView } from './print';
import { ambit } from '../../ambit';

export const essentialCardSearchItem = z.strictObject({
  cardId:               cardPrintView.shape.cardId,
  version:              cardPrintView.shape.version,
  locale:               cardPrintView.shape.locale,
  source:               cardPrintView.shape.source,
  set:                  cardPrintView.shape.set,
  number:               cardPrintView.shape.number,
  lang:                 cardPrintView.shape.lang,
  partIndex:            cardPrintView.shape.partIndex,
  cardPartLocalization: z.strictObject({
    name:     cardPrintView.shape.cardPartLocalization.shape.name,
    rubyName: z.string().nullable(),
  }),
  print: z.strictObject({
    layout:      cardPrintView.shape.print.shape.layout,
    imageType,
    imageStatus: cardPrintView.shape.print.shape.imageStatus,
  }),
});

export const normalResult = createSearchNormalResult(cardPrintView).extend({
  ambit,
});

export const searchResult = createSearchResult(normalResult);

export const essentialNormalResult = createSearchNormalResult(essentialCardSearchItem).extend({
  ambit,
});

export const essentialSearchResult = createSearchResult(essentialNormalResult);

export const devResult = z.object({
  result:  cardEditorView.array(),
  total:   z.int().min(0),
  elapsed: z.int().min(0),
});

export const devSearchResult = createSearchResult(devResult);

export type NormalResult = z.infer<typeof normalResult>;
export type SearchResult = z.infer<typeof searchResult>;
export type EssentialCardSearchItem = z.infer<typeof essentialCardSearchItem>;
export type EssentialNormalResult = z.infer<typeof essentialNormalResult>;
export type EssentialSearchResult = z.infer<typeof essentialSearchResult>;
export type DevResult = z.infer<typeof devResult>;
export type DevSearchResult = z.infer<typeof devSearchResult>;
