import { integer, primaryKey, text } from 'drizzle-orm/pg-core';
import { and, eq } from 'drizzle-orm';

import { schema } from './schema';

export const RuleItem = schema.table('rule_items', {
    date:   text('date').notNull(),
    lang:   text('lang').notNull(),
    itemId: text('item_id').notNull(),

    index: integer('index').notNull(),
    depth: integer('depth').notNull(),

    serial:   text('serial'),
    text:     text('text').notNull(),
    richText: text('rich_text').notNull(),
}, table => [
    primaryKey({ columns: [table.date, table.lang, table.itemId] }),
]);

export const Rule = schema.table('rules', {
    date: text('date').notNull(),
    lang: text('lang').notNull(),
}, table => [
    primaryKey({ columns: [table.date, table.lang] }),
]);

export const ruleView = schema.view('rule_view').as(qb => {
    return qb.select({
        date:   Rule.date,
        lang:   Rule.lang,
        itemId: RuleItem.itemId,

        index: RuleItem.index,
        depth: RuleItem.depth,

        text:     RuleItem.text,
        richText: RuleItem.richText,
    })
        .from(Rule)
        .leftJoin(RuleItem, and(
            eq(Rule.date, RuleItem.date),
            eq(Rule.lang, RuleItem.lang),
        ));
});
