import { ORPCError, os } from '@orpc/server';

import z from 'zod';
import _ from 'lodash';
import { and, desc, eq, gte, lte, or } from 'drizzle-orm';

import { diffThreeString } from '@common/util/diff';
import { getRuleDiff } from '@/magic/rule/diff';

import { ruleDiff, ruleHistory, ruleItem, ruleSummary } from '@model/magic/schema/rule';

import { db } from '@/drizzle';
import { Rule, RuleItem } from '../schema/rule';

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

export const ruleTrpc = {
    list,
    summary,
    chapter,
    diff,
    history,
};

export const ruleApi = {
    list,
    summary,
    chapter,
    diff,
    history,
};
