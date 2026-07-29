import { z } from 'zod';
import { isNotNull } from 'drizzle-orm';

import { os } from '../index';
import { getLocalDb } from '../../lib/hearthstone/hsdata-local-db';
import { BaseEntity, BaseEntityLocalization, BaseEntityRelation } from '@tcg-cards/db/schema/local/hearthstone';

const output = z.object({
  entities:      z.number(),
  localizations: z.number(),
  relations:     z.number(),
});

export const purgeSoftDeletedEntities = os
  .route({
    method:      'POST',
    description: 'Hard-delete all soft-deleted rows from entities, entity_localizations, and entity_relations',
    tags:        ['Desktop Runtime', 'Hearthstone', 'Purge'],
  })
  .output(output)
  .handler(async () => {
    const db = getLocalDb();
    const [e, l, r] = await Promise.all([
      db.delete(BaseEntity).where(isNotNull(BaseEntity.deletedAt)).returning({ id: BaseEntity.cardId }),
      db.delete(BaseEntityLocalization).where(isNotNull(BaseEntityLocalization.deletedAt)).returning({ id: BaseEntityLocalization.cardId }),
      db.delete(BaseEntityRelation).where(isNotNull(BaseEntityRelation.deletedAt)).returning({ id: BaseEntityRelation.sourceId }),
    ]);

    return { entities: e.length, localizations: l.length, relations: r.length };
  });
