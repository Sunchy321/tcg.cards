import { os } from '@orpc/server';
import { z } from 'zod';

import { getLocalDb } from '../../../lib/hearthstone/hsdata-local-db';
import { resolveCardNames as resolveCardNamesInDb } from '../../../lib/hearthstone/card-search';

/** Resolves bilingual names for a batch of cardIds from the local database. */
export const resolveCardNames = os
  .route({
    method:      'POST',
    description: 'Resolve localized names for a batch of cardIds from the local database',
    tags:        ['Desktop', 'Hearthstone', 'Announcement'],
  })
  .input(z.object({
    cardIds: z.array(z.string()).max(200),
  }))
  .output(z.array(z.object({
    cardId: z.string(),
    nameEn: z.string().nullable(),
    nameZh: z.string().nullable(),
  })))
  .handler(async ({ input }) => {
    const db = getLocalDb();
    return resolveCardNamesInDb(db, input.cardIds);
  });
