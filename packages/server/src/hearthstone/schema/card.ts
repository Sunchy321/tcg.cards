import { jsonb, text } from 'drizzle-orm/pg-core';

import { schema } from './schema';

import { Card as ICard } from '@interface/hearthstone/card';

export const Card = schema.table('cards', {
    cardId: text('card_id').primaryKey(),

    legalities: jsonb('legalities').$type<ICard['legalities']>().default({}),
});
