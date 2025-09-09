import z from 'zod';

export const database = z.strictObject({
    card:                 z.int().nonnegative().default(0),
    cardLocalization:     z.int().nonnegative().default(0),
    cardPart:             z.int().nonnegative().default(0),
    cardPartLocalization: z.int().nonnegative().default(0),

    print:     z.int().nonnegative().default(0),
    printPart: z.int().nonnegative().default(0),

    set: z.int().nonnegative().default(0),
});

export const scryfallBulk = z.strictObject({
    allCard: z.string().array().default([]),
    ruling:  z.string().array().default([]),
});

export type Database = z.infer<typeof database>;
export type ScryfallBulk = z.infer<typeof scryfallBulk>;
