import z from 'zod';

import { createSearchNormalResult, createSearchResult } from '@search/schema';

import { cardPrintView } from './print';

export const normalResult = createSearchNormalResult(cardPrintView);

export type NormalResult = z.infer<typeof normalResult>;

export const searchResult = createSearchResult(normalResult);

export type SearchResult = z.infer<typeof searchResult>;
