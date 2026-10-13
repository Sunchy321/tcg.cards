import {
  bigint,
  integer,
} from 'drizzle-orm/pg-core';

import { Card } from './card';
import { schema } from './schema';

/** Related-card references materialized from the source relations map. */
export const CardRelation = schema.table('card_relations', {
  cardId: bigint('card_id', { mode: 'number' })
    .primaryKey()
    .references(() => Card.cardId, { onDelete: 'cascade' }),
  relatedCardIds: integer('related_card_ids').array().notNull().default([]),
  specificEffectCardIds: integer('specific_effect_card_ids').array().notNull().default([]),
});
