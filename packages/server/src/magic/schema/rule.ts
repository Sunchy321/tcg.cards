import { integer, primaryKey, text } from 'drizzle-orm/pg-core';
import { eq } from 'drizzle-orm';

import { schema } from './schema';

export const ruleItems = schema.table('rule_items', {
    date:   text('date').notNull(),
    itemId: text('item_id').notNull(),

    index: text('index'),
    depth: integer('depth').notNull(),

    text:     text('text').notNull(),
    richText: text('rich_text').notNull(),
}, table => [
    primaryKey({ columns: [table.date, table.itemId] }),
]);

export const rules = schema.table('rules', {
    date: text('date').primaryKey(),
});

export const ruleView = schema.view('rule_view').as(qb => {
    return qb.select({
        date:   rules.date,
        itemId: ruleItems.itemId,

        index: ruleItems.index,
        depth: ruleItems.depth,

        text:     ruleItems.text,
        richText: ruleItems.richText,
    })
        .from(rules)
        .leftJoin(ruleItems, eq(rules.date, ruleItems.date));
});
