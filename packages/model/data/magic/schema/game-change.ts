import z from 'zod';

export const gameChangeType = z.enum([
    'card_change',
    'set_change',
    'rule_change',
    'format_death',

    'card_adjustment',
]);

export const legality = z.enum([
    'banned_as_commander',
    'banned_as_companion',
    'banned_in_bo1',
    'banned',
    'game_changer',
    'legal',
    'restricted',
    'suspended',
    'unavailable',
    'score-1',
    'score-2',
    'score-3',
    'score-4',
    'score-5',
    'score-6',
    'score-7',
    'score-8',
    'score-9',
    'score-10',
]);

export const status = z.enum([
    ...legality.options,
    'buff',
    'nerf',
    'adjust',
]);

export const adjustment = z.strictObject({
    part:   z.string(),
    status: status,
});

export const cardChange = z.strictObject({
    source:        z.string(),
    date:          z.iso.date(),
    effectiveDate: z.iso.date().nullable(),
    name:          z.string(),
    link:          z.url().array(),

    type:   gameChangeType,
    format: z.string().nullable(),

    cardId: z.string().nullable(),
    setId:  z.string().nullable(),
    group:  z.string().nullable(),

    status: status.nullable(),

    adjustments: adjustment.array().nullable(),
});

export const setChange = z.strictObject({
    source:        z.string(),
    date:          z.iso.date(),
    effectiveDate: z.iso.date().nullable(),
    name:          z.string(),
    link:          z.url().array(),

    type:   gameChangeType,
    format: z.string().nullable(),

    setId: z.string().nullable(),

    status: status.nullable(),
});

export const formatChange = z.strictObject({
    source:        z.string(),
    date:          z.iso.date(),
    effectiveDate: z.iso.date().nullable(),
    name:          z.string(),
    link:          z.url().array(),

    type:   gameChangeType,
    format: z.string().nullable(),

    formatId: z.string().nullable(),
    cardId:   z.string().nullable(),
    setId:    z.string().nullable(),
    group:    z.string().nullable(),

    status: status.nullable(),

    adjustments: adjustment.array().nullable(),
});

export type GameChangeType = z.infer<typeof gameChangeType>;
export type Legality = z.infer<typeof legality>;
export type Adjustment = z.infer<typeof adjustment>;
export type Status = z.infer<typeof status>;
