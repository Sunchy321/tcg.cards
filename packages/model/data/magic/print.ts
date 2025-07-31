import { z } from 'zod';

import { layout, rarity } from './basic';
import { cardSchema as card, cardView } from './card';

export const frame = z.enum(['1993', '1997', '2003', '2015', 'future']);
export const borderColor = z.enum(['black', 'borderless', 'gold', 'silver', 'white', 'yellow']);
export const securityStamp = z.enum(['acorn', 'arena', 'circle', 'heart', 'oval', 'triangle']);
export const finish = z.enum(['etched', 'foil', 'nonfoil']);
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
    cardId:    z.string().meta({ primary: true }),
    set:       z.string().meta({ primary: true }),
    number:    z.string().meta({ primary: true }),
    lang:      z.string().meta({ primary: true }),
    partIndex: z.number().meta({ foreign: true, type: 'small-int' }),

    name:     z.string().meta({ colName: 'print_name' }),
    typeline: z.string().meta({ colName: 'print_typeline' }),
    text:     z.string().meta({ colName: 'print_text' }),

    part: z.strictObject({
        name:     z.string().meta({ colName: 'print_part_name' }),
        typeline: z.string().meta({ colName: 'print_part_typeline' }),
        text:     z.string().meta({ colName: 'print_part_text' }),

        attractionLights: z.string().meta({ type: 'bitset', map: '123456' }).nullable(),

        flavorName: z.string().nullable(),
        flavorText: z.string().nullable(),
        artist:     z.string().nullable(),
        watermark:  z.string().meta({ type: 'loose-enum' }).nullable(),

        scryfallIllusId: z.string().meta({ type: 'uuid' }).array().nullable(),
    }).array(),

    layout:        layout,
    frame:         frame,
    frameEffects:  z.string().meta({ type: 'loose-enum' }).array(),
    borderColor:   borderColor,
    cardBack:      z.string().meta({ type: 'uuid' }).nullable(),
    securityStamp: securityStamp.nullable(),
    promoTypes:    z.string().meta({ type: 'loose-enum' }).array().nullable(),
    rarity:        rarity,
    releaseDate:   z.string().meta({ type: 'date' }),

    isDigital:       z.boolean(),
    isPromo:         z.boolean(),
    isReprint:       z.boolean(),
    finishes:        finish.array(),
    hasHighResImage: z.boolean(),
    imageStatus:     imageStatus,

    inBooster: z.boolean(),
    games:     game.array(),

    previewDate:   z.string().meta({ type: 'date' }).nullable(),
    previewSource: z.string().nullable(),
    previewUri:    z.string().meta({ type: 'url' }).nullable(),

    printTags: z.string().array().meta({ type: 'set' }),

    scryfallOracleId:  z.string().meta({ colName: 'print_scryfall_oracle_id', type: 'uuid' }),
    scryfallCardId:    z.string().meta({ type: 'uuid' }).nullable(),
    scryfallFace:      scryfallFace.nullable(),
    scryfallImageUris: z.record(z.string(), z.string().meta({ type: 'url' })).array().nullable(),

    arenaId:      z.number().meta({ type: 'number-id' }).nullable(),
    mtgoId:       z.number().meta({ type: 'number-id' }).nullable(),
    mtgoFoilId:   z.number().meta({ type: 'number-id' }).nullable(),
    multiverseId: z.number().meta({ type: 'number-id' }).array(),
    tcgPlayerId:  z.number().meta({ type: 'number-id' }).nullable(),
    cardMarketId: z.number().meta({ type: 'number-id' }).nullable(),
});

export const printModel = print.extend({
    part: print.shape.part.meta({ primaryKey: ['cardId', 'set', 'number', 'lang', 'partIndex'] }),
}).meta({
    primaryKey: ['cardId', 'set', 'number', 'lang'],
});

export const printView = print.extend({
    part: print.shape.part.element,
});

export const cardPrintView = z.object({
    cardId:    card.shape.cardId,
    set:       print.shape.set,
    number:    print.shape.number,
    lang:      print.shape.lang,
    partIndex: card.shape.partIndex,

    card: card.omit({
        cardId:           true,
        lang:             true,
        partIndex:        true,
        localization:     true,
        part:             true,
        partLocalization: true,
    }),

    cardLocalization:     cardView.shape.localization,
    cardPart:             cardView.shape.part,
    cardPartLocalization: cardView.shape.partLocalization,

    print: print.omit({
        cardId:    true,
        set:       true,
        number:    true,
        lang:      true,
        partIndex: true,
        part:      true,
    }),

    printPart: printView.shape.part,
});

export const version = z.strictObject({
    set:    z.string(),
    number: z.string(),
    lang:   z.string(),
    rarity: rarity,
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
export type PrintView = z.infer<typeof printView>;
export type CardPrintView = z.infer<typeof cardPrintView>;
export type CardFullView = z.infer<typeof cardFullView>;
