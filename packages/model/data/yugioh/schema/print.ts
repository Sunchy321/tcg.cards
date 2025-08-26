import { z } from 'zod';

import { updation } from '../../basic';
import { fullLocale, layout } from './basic';
import { card, cardView } from './card';

export const print = z.strictObject({
    cardId: z.string(),
    set:    z.string(),
    number: z.string(),
    lang:   fullLocale,

    name:     z.string(),
    rubyName: z.string().nullable(),
    typeline: z.string(),
    text:     z.string(),
    comment:  z.string().nullable(),

    layout:      layout,
    passcode:    z.number().int().positive().nullable(),
    rarity:      z.string(),
    releaseDate: z.iso.date().nullable(),

    printTags: z.string().array(),
});

export const printView = print;

export const cardPrintView = z.object({
    cardId: card.shape.cardId,
    set:    print.shape.set,
    number: print.shape.number,
    lang:   print.shape.lang,

    card: card.omit({
        cardId:       true,
        localization: true,
    }),

    cardLocalization: cardView.shape.localization.omit({
        lang: true,
    }),

    print: print.omit({
        cardId: true,
        set:    true,
        number: true,
        lang:   true,
    }),
});

export const version = z.strictObject({
    set:    z.string(),
    number: z.string(),
    lang:   fullLocale,
    rarity: z.string(),
});

export const cardEditorView = z.strictObject({
    cardId: card.shape.cardId,
    set:    print.shape.set,
    number: print.shape.number,
    lang:   print.shape.lang,

    card: cardPrintView.shape.card.extend({
        __lockedPaths: z.string().array().default([]),
        __updations:   updation.array().default([]),
    }),

    cardLocalization: cardPrintView.shape.cardLocalization.extend({
        __lockedPaths: z.string().array().default([]),
        __updations:   updation.array().default([]),
    }),

    print: cardPrintView.shape.print.extend({
        __lockedPaths: z.string().array().default([]),
        __updations:   updation.array().default([]),
    }),

    relatedCards: z.strictObject({
        relation: z.string(),
        cardId:   z.string(),
        version:  version.omit({ rarity: true }).optional(),
    }).array().optional(),

    __inDatabase: z.boolean(),

    __original: z.strictObject({
        cardId: card.shape.cardId.optional(),
        lang:   print.shape.lang.optional(),
    }).default({}),
});

export const cardFullView = cardPrintView.extend({
    versions: version.array(),

    relatedCards: z.strictObject({
        relation: z.string(),
        cardId:   z.string(),
        version:  version.optional(),
    }).array(),

    rulings: z.strictObject({
        cardId:   z.string(),
        source:   z.string(),
        date:     z.string(),
        text:     z.string(),
        richText: z.string(),
    }).array(),
});

export type Print = z.infer<typeof print>;
export type CardPrintView = z.infer<typeof cardPrintView>;
export type CardEditorView = z.infer<typeof cardEditorView>;
export type CardFullView = z.infer<typeof cardFullView>;
