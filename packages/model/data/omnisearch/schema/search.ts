import z from 'zod';

import { createSearchNormalResult, createSearchResult } from '@search/common/schema';

import { card } from './card';

export const normalResult = createSearchNormalResult(card);
export const searchResult = createSearchResult(normalResult);

export type NormalResult = z.infer<typeof normalResult>;
export type SearchResult = z.infer<typeof searchResult>;
