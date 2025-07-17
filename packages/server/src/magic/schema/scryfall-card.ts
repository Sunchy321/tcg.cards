import { jsonb, uuid } from 'drizzle-orm/pg-core';

import { schema } from './schema';

import { RawCard } from '@interface/magic/scryfall/card';

export const scryfallCards = schema.table('scryfall_cards', {
    cardId: uuid().primaryKey(),

    data: jsonb().$type<RawCard>().notNull(),
});
