import { primaryKey, text } from 'drizzle-orm/pg-core';

import { schema } from './schema';

import { locale as hearthstoneLocale, types } from '@/hearthstone/schema/entity';

export const HearthstoneTypeLocalization = schema.table('hearthstone_type_localizations', {
    type: types('type').notNull(),
    lang: hearthstoneLocale('lang').notNull(),

    text: text('type_text').notNull(),
}, table => [
    primaryKey({ columns: [table.type, table.lang] }),
]);
