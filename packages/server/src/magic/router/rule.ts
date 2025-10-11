import { ORPCError, os } from '@orpc/server';

import z from 'zod';
import _ from 'lodash';
import { and, desc, eq, gte, lte, or } from 'drizzle-orm';

import {
    Rule as IRule, rule,
    ruleDiff, ruleHistory,
    RuleItem as IRuleItem, ruleItem,
    ruleSummary,
} from '@model/magic/schema/rule';

import { db } from '@/drizzle';
import { Rule, RuleItem } from '../schema/rule';

import CardNameExtrator from '@/magic/extract-name';

import { readdirSync } from 'fs';
import { join } from 'path';

import { diffThreeString } from '@common/util/diff';
import { intoRichText } from '@/magic/util';
import { getRuleDiff } from '@/magic/rule/diff';
import { parse as parseDetail, reparse as reparseDetail } from '@/magic/rule/parse';

import { dataPath } from '@/config';

function parseCard(item: IRuleItem, data: IRule, cardNames: { id: string, name: string[] }[]) {
    const blacklist = [];

    // Keywords are not treated as card name in its clause
    if (/^70[12]/.test(item.serial ?? '') && item.depth > 2) {
        const parent = data.contents.find(co => co.depth === 2
          && (item.serial ?? '').slice(0, -1) === (co.serial ?? '').slice(0, -1)
          && /\w$/.test(co.text));

        if (parent != null) {
            blacklist.push(parent.text);
        }
    }

    const cards = new CardNameExtrator({ text: item.text, cardNames, blacklist }).extract();

    item.richText = intoRichText(item.text, cards);
}

const list = os
    .route({
        method:      'GET',
        description: 'List all rule dates',
        tags:        ['Magic', 'Rule'],
    })
    .input(z.any())
    .output(z.string().array())
    .handler(async () => {
        return await db.select({ date: Rule.date })
            .from(Rule)
            .orderBy(desc(Rule.date))
            .then(rules => rules.map(r => r.date));
    })
    .callable();

const files = os
    .input(z.void())
    .output(z.string().array())
    .handler(async () => {
        const dir = join(dataPath, 'magic', 'rule');

        const files = readdirSync(dir)
            .filter(t => t.endsWith('txt'))
            .map(t => t.slice(0, -4))
            .sort((a, b) => a.localeCompare(b));

        return files;
    });

const summary = os
    .route({
        method:      'GET',
        description: 'Get rule summary',
        tags:        ['Magic', 'Rule'],
    })
    .input(z.object({
        date: z.iso.date(),
        lang: z.string().default('en'),
    }))
    .output(ruleSummary)
    .handler(async ({ input }) => {
        const { date, lang } = input;

        const rule = await db.select()
            .from(Rule)
            .where(and(
                eq(Rule.date, date),
                or(eq(Rule.lang, 'en'), eq(Rule.lang, lang)),
            ))
            .then(rows => rows[0]);

        if (rule == null) {
            throw new ORPCError('NOT_FOUND');
        }

        const items = await db.select({
            itemId: RuleItem.itemId,
            index:  RuleItem.index,
            depth:  RuleItem.depth,
            serial: RuleItem.serial,
            text:   RuleItem.text,
        }).from(RuleItem)
            .where(and(
                eq(RuleItem.date, rule.date),
                eq(RuleItem.lang, rule.lang),
            ))
            .orderBy(RuleItem.index);

        const contents = items.map(item => {
            return _.omit(item, /[a-z!]$/.test(item.text) ? [] : ['text']);
        });

        return {
            date,
            lang,
            contents,
        };
    })
    .callable();

const chapter = os
    .route({
        method:      'GET',
        description: 'Get rule chapter',
        tags:        ['Magic', 'Rule'],
    })
    .input(z.object({
        date: z.iso.date(),
        lang: z.string().default('en'),
        from: z.int().min(0),
        to:   z.int().min(0),
    }))
    .output(ruleItem.array())
    .handler(async ({ input }) => {
        const { date, lang, from, to } = input;

        const rule = await db.select()
            .from(Rule)
            .where(and(
                eq(Rule.date, date),
                or(eq(Rule.lang, 'en'), eq(Rule.lang, lang)),
            ))
            .then(rows => rows[0]);

        if (rule == null) {
            throw new ORPCError('NOT_FOUND');
        }

        const items = await db.select({
            itemId:   RuleItem.itemId,
            index:    RuleItem.index,
            depth:    RuleItem.depth,
            serial:   RuleItem.serial,
            text:     RuleItem.text,
            richText: RuleItem.richText,
        }).from(RuleItem)
            .where(and(
                eq(RuleItem.date, rule.date),
                eq(RuleItem.lang, rule.lang),
                gte(RuleItem.index, from),
                lte(RuleItem.index, to),
            ))
            .orderBy(RuleItem.index);

        return items;
    })
    .callable();

const diff = os
    .route({
        method:      'GET',
        description: 'Get rule difference',
        tags:        ['Magic', 'Rule'],
    })
    .input(z.object({
        from: z.iso.date(),
        to:   z.iso.date(),
        lang: z.string().default('en'),
    }))
    .output(ruleDiff)
    .handler(async ({ input }) => {
        const { from, to, lang } = input;

        const diff = await getRuleDiff(from, to, lang);

        if (diff == null) {
            throw new ORPCError('NOT_FOUND');
        }

        return diff;
    })
    .callable();

const history = os
    .route({
        method:      'GET',
        description: 'Get rule item history',
        tags:        ['Magic', 'Rule'],
    })
    .input(z.object({
        itemId: z.string(),
        lang:   z.string().default('en'),
    }))
    .output(ruleHistory)
    .handler(async ({ input }) => {
        const { itemId } = input;

        const items = await db.select()
            .from(RuleItem)
            .where(eq(RuleItem.itemId, itemId))
            .orderBy(RuleItem.date);

        if (items.length === 0) {
            throw new ORPCError('NOT_FOUND');
        }

        const groups = [];

        for (const item of items) {
            if (groups.length === 0 || groups[groups.length - 1].text !== item.text) {
                groups.push({ dates: [item.date], text: item.text });
            } else {
                groups[groups.length - 1].dates.push(item.date);
            }
        }

        const result = groups.map((curr, i, arr) => {
            const prev = arr[i - 1];
            const next = arr[i + 1];

            return {
                dates: curr.dates,
                text:  diffThreeString(prev?.text ?? curr.text, curr.text, next?.text ?? curr.text),
            };
        });

        return {
            itemId,
            diff: result,
        };
    })
    .callable();

const full = os
    .input(z.string())
    .output(rule)
    .handler(async ({ input }) => {
        const date = input;

        try {
            const ruleEntry = await db.select()
                .from(Rule)
                .where(eq(Rule.date, date))
                .then(rows => rows[0]);

            if (ruleEntry == null) {
                throw new ORPCError('NOT_FOUND');
            }

            const contents = await db.select({
                itemId: RuleItem.itemId,

                index: RuleItem.index,
                depth: RuleItem.depth,

                serial:   RuleItem.serial,
                text:     RuleItem.text,
                richText: RuleItem.richText,
            })
                .from(RuleItem)
                .where(and(
                    eq(RuleItem.date, ruleEntry.date),
                    eq(RuleItem.lang, ruleEntry.lang),
                ))
                .orderBy(RuleItem.index);

            return {
                date,
                lang: 'en',
                contents,
            };
        } catch (e) {
            console.error(e);
            throw e;
        }
    });

const parse = os
    .input(z.string())
    .output(rule)
    .handler(async ({ input }) => {
        const date = input;

        try {
            const result = await parseDetail(date);

            return result;
        } catch (e) {
            console.error(e);
            throw e;
        }
    });

const save = os
    .input(rule)
    .output(z.void())
    .handler(async ({ input }) => {
        const { date, lang, contents } = input;

        try {
            await db.transaction(async tx => {
                await tx.insert(Rule).values({
                    date,
                    lang,
                }).onConflictDoNothing();

                const oldItems = await tx.select()
                    .from(RuleItem)
                    .where(and(
                        eq(RuleItem.date, date),
                        eq(RuleItem.lang, lang),
                    ));

                const cardNames = await CardNameExtrator.names();

                for (const c of contents) {
                    const oldItem = oldItems.find(co => co.text === c.text);

                    if (oldItem != null) {
                        continue;
                    }

                    parseCard(c, input, cardNames);
                }

                await tx.delete(RuleItem)
                    .where(and(
                        eq(RuleItem.date, date),
                        eq(RuleItem.lang, lang),
                    ));

                await tx.insert(RuleItem).values(
                    contents.map(item => ({
                        itemId: item.itemId,

                        date,
                        lang,

                        index: item.index,
                        depth: item.depth,

                        serial:   item.serial,
                        text:     item.text,
                        richText: item.richText,
                    })),
                );
            });
        } catch (e) {
            console.log(e);
            throw e;
        }
    })
    .callable();

const reparse = os
    .input(z.string())
    .output(rule)
    .handler(async ({ input }) => {
        const date = input;

        try {
            const data = await reparseDetail(date);

            const oldItems = await db.select()
                .from(RuleItem)
                .where(and(
                    eq(RuleItem.date, date),
                    eq(RuleItem.lang, 'en'),
                ));

            const cardNames = await CardNameExtrator.names();

            for (const c of data.contents) {
                const oldItem = oldItems.find(co => co.itemId == c.itemId);

                if (oldItem == null || oldItem.text != c.text) {
                    parseCard(c, data, cardNames);
                }
            }

            return data;
        } catch (e) {
            console.error(e);
            throw e;
        }
    })
    .callable();

const allReparse = os
    .input(z.void())
    .output(z.void())
    .handler(async () => {
        const rules = await db.select()
            .from(Rule)
            .where(eq(Rule.lang, 'en'))
            .orderBy(Rule.date);

        for (const r of rules) {
            try {
                const result = await reparse(r.date);

                await save(result);

                console.log(r.date);
            } catch (e) {
                console.error(e);
            }
        }
    });

export const ruleTrpc = {
    list,
    files,
    summary,
    chapter,
    diff,
    history,
    full,
    parse,
    save,
    reparse,
    allReparse,
};

export const ruleApi = {
    list,
    summary,
    chapter,
    diff,
    history,
};
