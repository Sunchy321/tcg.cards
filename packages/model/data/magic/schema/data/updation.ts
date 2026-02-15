import z from 'zod';

import { locale } from '../basic';

export const updationMode = z.enum(['card', 'cardLocalization', 'cardPart', 'cardPartLocalization', 'print', 'printPart']);

export const updation = z.strictObject({
    key:      z.string(),
    oldValue: z.any().nullable(),
    newValue: z.any().nullable(),

    cardId:    z.string(),
    locale:    locale.optional(),
    partIndex: z.number().optional(),
    lang:      locale.optional(),
    set:       z.string().optional(),
    number:    z.string().optional(),
});

export const updationResponse = z.strictObject({
    mode:    updationMode,
    total:   z.number(),
    key:     z.string(),
    current: z.number(),
    values:  updation.array(),
});

export type UpdationMode = z.infer<typeof updationMode>;
export type Updation = z.infer<typeof updation>;
export type UpdationResponse = z.infer<typeof updationResponse>;
