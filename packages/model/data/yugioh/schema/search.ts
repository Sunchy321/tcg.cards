import z from 'zod';

import { createSearchNormalResult, createSearchResult } from '@search/common/schema';

import { cardEditorView, cardPrintView } from './print';

export const normalResult = createSearchNormalResult(cardPrintView);
export const searchResult = createSearchResult(normalResult);

export const devResult = z.object({
    result:  cardEditorView.array(),
    total:   z.int().min(0),
    elapsed: z.int().min(0),
});

export const devSearchResult = createSearchResult(devResult);

export type NormalResult = z.infer<typeof normalResult>;
export type SearchResult = z.infer<typeof searchResult>;
export type DevResult = z.infer<typeof devResult>;
export type DevSearchResult = z.infer<typeof devSearchResult>;
