import { boolean, integer, text } from 'drizzle-orm/pg-core';

import { schema } from './schema';

export const Patch = schema.table('patches', {
    buildNumber: integer('build_number').primaryKey(),
    name:        text('name').notNull(),
    shortName:   text('short_name').notNull(),
    hash:        text('hash').notNull(),
    isCurrent:   boolean('is_current').notNull().default(false),
    isUpdated:   boolean('is_updated').notNull().default(false),
});
