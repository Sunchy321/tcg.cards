import z from 'zod';

export const gameChangeType = z.enum([
    'card_change',
    'format_change',
    'rule_change',
    'create_card_group',
    'format_death',
]);

export const legality = z.enum([
    'banned_in_card_pool',
    'banned_in_deck',
    'banned',
    'derived',
    'legal',
    'minor',
    'unavailable',
]);

export const status = z.enum([
    ...legality.options,
    'buff',
    'nerf',
    'adjust',
]);

export const cardChange = z.strictObject({
    source:        z.string(),
    date:          z.iso.date(),
    effectiveDate: z.iso.date().nullable(),
    name:          z.string(),
    link:          z.url().array(),
    version:       z.number().positive(),
    lastVersion:   z.number().positive().nullable(),

    type: gameChangeType,

    cardId:   z.string().nullable(),
    formatId: z.string().nullable(),
    group:    z.string().nullable(),

    status: status.nullable(),

    adjustments: z.strictObject({
        part:   z.string(),
        status: status,
    }).array().nullable(),
});

export const gameChange = z.strictObject({
    type:          gameChangeType,
    effectiveDate: z.iso.date().nullable(),
    range:         z.string().array().nullable(),

    cardId: z.string().nullable(),
    setId:  z.string().nullable(),
    ruleId: z.string().nullable(),

    status: status.nullable(),
    group:  z.string().nullable(),

    adjustment: z.strictObject({
        part:   z.string(),
        status: status.nullable(),
    }).array().nullable(),

    relatedCards: z.string().array().nullable(),

    ruleText: z.string().nullable(),
});

export const announcement = z.strictObject({
    source:        z.string(),
    date:          z.iso.date(),
    effectiveDate: z.iso.date().nullable(),
    name:          z.string(),
    links:         z.url().array(),
    version:       z.number().positive(),
    lastVersion:   z.number().positive().nullable(),

    changes: gameChange.array(),
});

export type GameChangeType = z.infer<typeof gameChangeType>;
export type Legality = z.infer<typeof legality>;
export type Status = z.infer<typeof status>;
export type CardChange = z.infer<typeof cardChange>;
export type GameChange = z.infer<typeof gameChange>;
export type Announcement = z.infer<typeof announcement>;

export type Adjustment = GameChange['adjustment'] extends (infer T)[] | null ? T : never;
