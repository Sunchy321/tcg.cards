import { z } from 'zod';

import { updation } from '../../basic';
import { layout, locale, rarity } from './basic';
import { card, cardLocalization } from './card';

export const print = z.strictObject({
    cardId: z.string(),

    lang:   z.string(),
    set:    z.string(),
    number: z.string(),

    name:     z.string(),
    typeline: z.string(),
    text:     z.string(),

    flavorText: z.string().nullable(),
    artist:     z.string(),

    imageUri: z.record(z.string(), z.string()),

    printTags: z.string().array(),

    layout:      layout,
    rarity:      rarity,
    releaseDate: z.string(),
    finishes:    z.array(z.string()).nullable(),

    id:           z.number().nullable(),
    code:         z.string().nullable(),
    tcgPlayerId:  z.number().nullable(),
    cardMarketId: z.number().nullable(),
    cardTraderId: z.number().nullable(),
});

export const cardPrintView = z.object({
    cardId: card.shape.cardId,
    set:    print.shape.set,
    number: print.shape.number,
    lang:   print.shape.lang,

    card: card.omit({
        cardId: true,
    }),

    cardLocalization: cardLocalization.omit({
        cardId: true,
        lang:   true,
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
    lang:   locale,
    rarity: rarity,
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
});

export type Print = z.infer<typeof print>;
export type CardPrintView = z.infer<typeof cardPrintView>;
export type CardEditorView = z.infer<typeof cardEditorView>;
export type CardFullView = z.infer<typeof cardFullView>;
