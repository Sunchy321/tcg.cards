import { jsonb, text } from 'drizzle-orm/pg-core';

import { schema } from './schema';

import type { Card as ICard } from '#model/hearthstone/schema/card';

export const Card = schema.table('cards', {
  cardId: text('card_id').primaryKey(),

  legalities: jsonb('legalities').$type<ICard['legalities']>().notNull().default({}),
});
