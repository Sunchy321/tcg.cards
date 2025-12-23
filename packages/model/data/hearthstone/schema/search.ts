import z from 'zod';

import { createSearchNormalResult, createSearchResult } from '@search/common/schema';

import { cardEntityView } from './entity';

export const normalResult = createSearchNormalResult(cardEntityView);

export type NormalResult = z.infer<typeof normalResult>;

export const searchResult = createSearchResult(normalResult);

export type SearchResult = z.infer<typeof searchResult>;
