import { os } from '@orpc/server';
import { z } from 'zod';
import { desc } from 'drizzle-orm';
import { Patch } from '@tcg-cards/db/schema/local/hearthstone';
import { getLocalDb } from '../../../lib/hearthstone/hsdata-local-db';

export const listPatches = os
  .route({
    method: 'GET',
    description: 'List patches for version dropdown',
    tags: ['Desktop', 'Hearthstone', 'Announcement'],
  })
  .input(z.any())
  .output(z.any())
  .handler(async () => {
    const db = getLocalDb();
    return db.select().from(Patch).orderBy(desc(Patch.buildNumber));
  });
