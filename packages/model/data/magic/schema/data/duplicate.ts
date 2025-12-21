import z from 'zod';

import { locale } from '../basic';
import { print, printPart } from '../print';

export const duplicateMode = z.enum(['print', 'printPart']);

export const duplicatePrint = z.strictObject({
    total: z.number(),

    set:    z.string(),
    number: z.string(),
    lang:   locale,

    duplicates:    z.string().array(),
    duplicateData: print.array(),
});

export const duplicatePrintPart = z.strictObject({
    total: z.number(),

    set:       z.string(),
    number:    z.string(),
    lang:      locale,
    partIndex: z.number(),

    duplicates:    z.string().array(),
    duplicateData: printPart.array(),
});

export const duplicate = duplicatePrint.or(duplicatePrintPart);

export type DuplicateMode = z.infer<typeof duplicateMode>;
export type DuplicatePrint = z.infer<typeof duplicatePrint>;
export type DuplicatePrintPart = z.infer<typeof duplicatePrintPart>;
export type Duplicate = z.infer<typeof duplicate>;
