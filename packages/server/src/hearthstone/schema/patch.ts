import { boolean, integer, text } from 'drizzle-orm/pg-core';

import { schema } from './schema';

export const patches = schema.table('patches', {
    buildNumber: integer('build_number').primaryKey(),
    name:        text('name'),
    shortName:   text('short_name'),
    hash:        text('hash'),
    isCurrent:   boolean('is_current').default(false),
    isUpdated:   boolean('is_updated').default(false),
});
