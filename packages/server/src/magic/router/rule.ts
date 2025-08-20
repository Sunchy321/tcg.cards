import { Hono } from 'hono';
import { describeRoute } from 'hono-openapi';
import { resolver, validator } from 'hono-openapi/zod';

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
    .input(z.void())
    .output(z.string().array())
    .handler(async () => {
        return await db.select({ date: Rule.date })
            .from(Rule)
            .orderBy(desc(Rule.date))
            .then(rules => rules.map(r => r.date));
    })
    .callable();

const summary = os
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

export const ruleApi = new Hono()
    .get(
        '/list',
        describeRoute({
            tags:      ['Magic', 'Rule'],
            summary:   'List rules',
            responses: {
                200: {
                    description: 'List of rules retrieved successfully',
                    content:     {
                        'application/json': {
                            schema: resolver(z.string().array()),
                        },
                    },
                },
            },
            validateResponse: true,
        }),
        async c => c.json(await list()),
    )
    .get(
        '/summary',
        describeRoute({
            tags:      ['Magic', 'Rule'],
            summary:   'Get rule summary',
            responses: {
                200: {
                    description: 'Rule summary retrieved successfully',
                    content:     {
                        'application/json': {
                            schema: resolver(ruleSummary),
                        },
                    },
                },
            },
            validateResponse: true,
        }),
        validator('query', z.object({
            date: z.iso.date(),
            lang: z.string().default('en'),
        })),
        async c => c.json(await summary(c.req.valid('query'))),
    )
    .get(
        '/chapter',
        describeRoute({
            tags:      ['Magic', 'Rule'],
            summary:   'Get rule chapter',
            responses: {
                200: {
                    description: 'Rule chapter retrieved successfully',
                    content:     {
                        'application/json': {
                            schema: resolver(ruleItem.array()),
                        },
                    },
                },
            },
            validateResponse: true,
        }),
        validator('query', z.object({
            date: z.iso.date(),
            lang: z.string().default('en'),
            from: z.preprocess(val => Number.parseInt(val as string, 10), z.number().int().min(0)),
            to:   z.preprocess(val => Number.parseInt(val as string, 10), z.number().int().min(0)),
        })),
        async c => c.json(await chapter(c.req.valid('query'))),
    )
    .get(
        '/diff',
        describeRoute({
            tags:      ['Magic', 'Rule'],
            summary:   'Diff two revisions of rule',
            responses: {
                200: {
                    description: 'Rule history retrieved successfully',
                    content:     {
                        'application/json': {
                            schema: resolver(ruleDiff),
                        },
                    },
                },
            },
            validateResponse: true,
        }),
        validator('query', z.object({
            from: z.iso.date(),
            to:   z.iso.date(),
            lang: z.string().default('en'),
        })),
        async c => c.json(await diff(c.req.valid('query'))),
    )
    .get(
        '/history',
        describeRoute({
            tags:      ['Magic', 'Rule'],
            summary:   'Get rule history',
            responses: {
                200: {
                    description: 'Rule history retrieved successfully',
                    content:     {
                        'application/json': {
                            schema: resolver(ruleHistory),
                        },
                    },
                },
            },
            validateResponse: true,
        }),
        validator('query', z.object({
            itemId: z.string().default('en'),
        })),
        async c => c.json(await history(c.req.valid('query'))),
    );
