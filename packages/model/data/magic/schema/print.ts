import { z } from 'zod';

import { updation } from '../../basic';
import { fullImageType, locale, layout, rarity } from './basic';
import { card as card, cardLocalization, cardPart, cardPartLocalization } from './card';

export const frame = z.enum(['1993', '1997', '2003', '2015', 'future']);
export const borderColor = z.enum(['black', 'borderless', 'gold', 'silver', 'white', 'yellow']);
export const securityStamp = z.enum(['acorn', 'arena', 'circle', 'heart', 'oval', 'triangle']);
export const finish = z.enum(['nonfoil', 'foil', 'etched', 'glossy']);
export const imageStatus = z.enum(['highres_scan', 'lowres', 'missing', 'placeholder']);
export const game = z.enum(['arena', 'astral', 'mtgo', 'paper', 'sega']);
export const scryfallFace = z.enum(['back', 'bottom', 'front', 'top']);

export type Frame = z.infer<typeof frame>;
export type BorderColor = z.infer<typeof borderColor>;
export type SecurityStamp = z.infer<typeof securityStamp>;
export type Finish = z.infer<typeof finish>;
export type ImageStatus = z.infer<typeof imageStatus>;
export type Game = z.infer<typeof game>;
export type ScryfallFace = z.infer<typeof scryfallFace>;

export const print = z.strictObject({
    cardId: z.string(),
    set:    z.string(),
    number: z.string(),
    lang:   locale,

    name:     z.string(),
    typeline: z.string(),
    text:     z.string(),

    layout:        layout,
    frame:         frame,
    frameEffects:  z.string().array(),
    borderColor:   borderColor,
    cardBack:      z.uuid().nullable(),
    securityStamp: securityStamp.nullable(),
    promoTypes:    z.string().array().nullable(),
    rarity:        rarity,
    releaseDate:   z.iso.date(),

    isDigital:       z.boolean(),
    isPromo:         z.boolean(),
    isReprint:       z.boolean(),
    finishes:        finish.array(),
    hasHighResImage: z.boolean(),
    imageStatus,
    fullImageType,

    inBooster: z.boolean(),
    games:     game.array(),

    previewDate:   z.iso.date().nullable(),
    previewSource: z.string().nullable(),
    previewUri:    z.string().nullable(),

    printTags: z.string().array(),

    scryfallOracleId:  z.uuid(),
    scryfallCardId:    z.uuid().nullable(),
    scryfallFace:      scryfallFace.nullable(),
    scryfallImageUris: z.record(z.string(), z.url()).array().nullable(),

    arenaId:      z.int().nullable(),
    mtgoId:       z.int().nullable(),
    mtgoFoilId:   z.int().nullable(),
    multiverseId: z.int().array(),
    tcgPlayerId:  z.int().nullable(),
    cardMarketId: z.int().nullable(),
});

export const printPart = z.strictObject({
    cardId:    print.shape.cardId,
    set:       print.shape.set,
    number:    print.shape.number,
    lang:      print.shape.lang,
    partIndex: cardPart.shape.partIndex,

    name:     z.string(),
    typeline: z.string(),
    text:     z.string(),

    attractionLights: z.string().nullable(),

    flavorName: z.string().nullable(),
    flavorText: z.string().nullable(),
    artist:     z.string().nullable(),
    watermark:  z.string().nullable(),

    scryfallIllusId: z.uuid().array().nullable(),
});

export const printView = z.strictObject({
    cardId:    print.shape.cardId,
    set:       print.shape.set,
    number:    print.shape.number,
    lang:      print.shape.lang,
    partIndex: printPart.shape.partIndex,

    print: print.omit({
        cardId: true,
        set:    true,
        number: true,
        lang:   true,
    }),

    printPart: printPart.omit({
        cardId:    true,
        set:       true,
        number:    true,
        lang:      true,
        partIndex: true,
    }),
});

export const cardPrintView = z.object({
    cardId:    card.shape.cardId,
    locale:    cardLocalization.shape.locale,
    set:       print.shape.set,
    number:    print.shape.number,
    lang:      print.shape.lang,
    partIndex: cardPart.shape.partIndex,

    card:                 card.omit({ cardId: true }),
    cardLocalization:     cardLocalization.omit({ cardId: true, locale: true }),
    cardPart:             cardPart.omit({ cardId: true, partIndex: true }),
    cardPartLocalization: cardPartLocalization.omit({ cardId: true, partIndex: true, locale: true }),
    print:                print.omit({ cardId: true, set: true, number: true, lang: true }),
    printPart:            printPart.omit({ cardId: true, set: true, number: true, lang: true, partIndex: true }),
});

export const version = z.strictObject({
    set:    z.string(),
    number: z.string(),
    lang:   locale,
    locale,
    rarity: rarity,
});

export const cardEditorView = z.strictObject({
    cardId:    card.shape.cardId,
    locale:    cardLocalization.shape.locale,
    set:       print.shape.set,
    number:    print.shape.number,
    lang:      print.shape.lang,
    partIndex: cardPart.shape.partIndex,

    card: cardPrintView.shape.card.extend({
        __lockedPaths: z.string().array().default([]),
        __updations:   updation.array().default([]),
    }),

    cardLocalization: cardPrintView.shape.cardLocalization.extend({
        __lockedPaths: z.string().array().default([]),
        __updations:   updation.array().default([]),
    }),

    cardPart: cardPrintView.shape.cardPart.extend({
        __lockedPaths: z.string().array().default([]),
        __updations:   updation.array().default([]),
    }),

    cardPartLocalization: cardPrintView.shape.cardPartLocalization.extend({
        __lockedPaths: z.string().array().default([]),
        __updations:   updation.array().default([]),
    }),

    print: cardPrintView.shape.print.extend({
        __lockedPaths: z.string().array().default([]),
        __updations:   updation.array().default([]),
    }),

    printPart: cardPrintView.shape.printPart.extend({
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
        locale: cardLocalization.shape.locale.optional(),
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
export type PrintPart = z.infer<typeof printPart>;

export type PrintView = z.infer<typeof printView>;
export type CardPrintView = z.infer<typeof cardPrintView>;
export type CardEditorView = z.infer<typeof cardEditorView>;
export type CardFullView = z.infer<typeof cardFullView>;
