import { os } from '@orpc/server';
import { z } from 'zod';

import { getLocalDb } from '../../../lib/hearthstone/hsdata-local-db';
import { searchCardsByQuery } from '../../../lib/hearthstone/card-search';

const cardSearchResult = z.object({
  cardId: z.string(),
  nameEn: z.string().nullable(),
  nameZh: z.string().nullable(),
  set:    z.string().nullable(),
  type:   z.string().nullable(),
});

/** Searches cards by English name, Chinese name, or cardId from the local database. */
export const searchCards = os
  .route({
    method:      'GET',
    description: 'Search cards by localized name or cardId from the local database',
    tags:        ['Desktop', 'Hearthstone', 'Announcement'],
  })
  .input(z.object({
    q:      z.string().trim().min(1).max(100),
    limit:  z.number().int().min(1).max(50).default(20),
    format: z.string().trim().optional(),
  }))
  .output(z.array(cardSearchResult))
  .handler(async ({ input }) => {
    const db = getLocalDb();
    return searchCardsByQuery(db, input.q, input.limit, input.format);
  });
