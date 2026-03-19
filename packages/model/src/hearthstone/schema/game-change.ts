import z from 'zod';

export const gameChangeType = z.enum([
    'card_change',
    'set_change',
    'rule_change',
    'format_death',
    'card_adjustment',
]);

export const legality = z.enum([
    'banned_in_card_pool',
    'banned_in_deck',
    'banned',
    'derived',
    'legal',
    'minor',
    'unavailable',

    'score',
]);

export const adjustmentType = z.enum([
    'buff',
    'nerf',
    'adjust',
]);

export const status = z.enum([
    ...legality.options,
    ...adjustmentType.options,
]);

export const adjustment = z.strictObject({
    part:   z.string(),
    status: adjustmentType,
});

export const cardChange = z.strictObject({
    source:        z.string(),
    date:          z.iso.date(),
    effectiveDate: z.iso.date().nullable(),
    name:          z.string(),
    link:          z.url().array(),
    version:       z.number().positive(),
    lastVersion:   z.number().positive().nullable(),

    type:   gameChangeType,
    format: z.string().nullable(),

    cardId: z.string(),
    setId:  z.string().nullable(),
    group:  z.string().nullable(),

    status,
    score: z.int().min(1).nullable(),

    adjustment: adjustment.array().nullable(),
});

export const setChange = z.strictObject({
    source:        z.string(),
    date:          z.string(),
    effectiveDate: z.string().nullable(),
    name:          z.string(),
    link:          z.url().array(),
    version:       z.number().positive(),
    lastVersion:   z.number().positive().nullable(),

    type:   gameChangeType,
    format: z.string().nullable(),

    setId: z.string(),

    status,
    score: z.int().min(1).nullable(),
});

export const formatChange = z.strictObject({
    source:        z.string(),
    date:          z.string(),
    effectiveDate: z.string().nullable(),
    name:          z.string(),
    link:          z.url().array(),
    version:       z.int().positive(),
    lastVersion:   z.int().positive().nullable(),

    type:   gameChangeType,
    format: z.string().nullable(),

    cardId: z.string().nullable(),
    setId:  z.string().nullable(),
    ruleId: z.string().nullable(),
    group:  z.string().nullable(),

    status: status.nullable(),
    score:  z.int().min(1).nullable(),

    adjustment: z.object({
        cardId: z.string().optional(),
        detail: adjustment.array(),
    }).array().nullable(),

    relatedCards: z.string().array().nullable(),
});

export type GameChangeType = z.infer<typeof gameChangeType>;
export type Legality = z.infer<typeof legality>;
export type AdjustmentType = z.infer<typeof adjustmentType>;
export type Status = z.infer<typeof status>;
export type Adjustment = z.infer<typeof adjustment>;

export type CardChange = z.infer<typeof cardChange>;
export type SetChange = z.infer<typeof setChange>;
export type FormatChange = z.infer<typeof formatChange>;

export type Legalities = Record<string, Legality>;
