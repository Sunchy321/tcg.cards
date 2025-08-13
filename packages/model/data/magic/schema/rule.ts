import z from 'zod';

export const ruleItem = z.strictObject({
    itemId: z.string(),

    index: z.number(),
    depth: z.number(),

    serial:   z.string().nullable(),
    text:     z.string(),
    richText: z.string(),
});

export const ruleSummary = z.strictObject({
    date: z.iso.date(),
    lang: z.string(),

    contents: ruleItem.pick({
        itemId: true,
        index:  true,
        depth:  true,
        serial: true,
    }).extend({
        text: z.string().optional(),
    }).array(),
});

export const textDiff = z.string().or(z.tuple([z.string(), z.string()]));

export const ruleDiffItem = z.strictObject({
    itemId: z.string(),
    type:   z.enum(['add', 'move', 'remove']).optional(),
    serial: z.tuple([z.string().nullable(), z.string().nullable()]),
    depth:  z.tuple([z.number().nullable(), z.number().nullable()]),
    text:   textDiff.array(),
});

export const ruleDiff = z.strictObject({
    from: z.iso.date(),
    to:   z.iso.date(),

    diff: ruleDiffItem.array(),
});

export const ruleHistory = z.strictObject({
    itemId: z.string (),

    diff: z.strictObject({
        dates: z.string().array(),
        text:  z.strictObject({
            type:  z.enum(['add', 'common', 'dual', 'remove']),
            value: z.string(),
        }).array(),
    }).array(),
});

export type RuleItem = z.infer<typeof ruleItem>;
export type RuleSummary = z.infer<typeof ruleSummary>;
export type TextDiff = z.infer<typeof textDiff>;
export type RuleDiffItem = z.infer<typeof ruleDiffItem>;
export type RuleDiff = z.infer<typeof ruleDiff>;
export type RuleHistory = z.infer<typeof ruleHistory>;

export type RuleSummaryItem = RuleSummary['contents'][0];
