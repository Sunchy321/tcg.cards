import z from 'zod';

import { createSearchNormalResult, createSearchResult } from '#search/schema';

import { cardEntityView } from './entity';

export const cardImageVariant = z.enum(['normal', 'golden', 'diamond', 'signature', 'battlegrounds']);

export const normalResult = createSearchNormalResult(cardEntityView).extend({
  variant: cardImageVariant.default('normal'),
});

export type NormalResult = z.infer<typeof normalResult>;

export const searchResult = createSearchResult(normalResult);

export type SearchResult = z.infer<typeof searchResult>;
