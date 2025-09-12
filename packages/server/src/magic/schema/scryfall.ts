import { jsonb, uuid } from 'drizzle-orm/pg-core';

import { schema } from './schema';

import { Legality } from '@model/magic/schema/data/scryfall/basic';

export const Scryfall = schema.table('scryfall', {
    cardId:     uuid('card_id').primaryKey(),
    oracleId:   uuid('oracle_id').notNull(),
    legalities: jsonb('legalities').$type<Record<string, Legality>>().notNull(),
});
