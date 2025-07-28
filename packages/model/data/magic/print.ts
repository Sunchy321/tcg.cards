import { z } from '@model/zod';
import { InferView } from '@model/helper';

const layout = z.enum([
    'adventure', 'aftermath', 'augment', 'battle', 'class', 'double_faced',
    'emblem', 'flip_token_bottom', 'flip_token_top', 'flip', 'host',
    'leveler', 'meld', 'modal_dfc', 'multipart', 'normal', 'planar',
    'reversible_card', 'saga', 'scheme', 'split_arena', 'split', 'token',
    'transform_token', 'transform', 'vanguard',
]);

const frame = z.enum(['1993', '1997', '2003', '2015', 'future']);
const borderColor = z.enum(['black', 'borderless', 'gold', 'silver', 'white', 'yellow']);
const securityStamp = z.enum(['acorn', 'arena', 'circle', 'heart', 'oval', 'triangle']);
const rarity = z.enum(['bonus', 'common', 'mythic', 'rare', 'special', 'uncommon']);
const finish = z.enum(['etched', 'foil', 'nonfoil']);
const imageStatus = z.enum(['highres_scan', 'lowres', 'missing', 'placeholder']);
const game = z.enum(['arena', 'astral', 'mtgo', 'paper', 'sega']);

export type Layout = z.infer<typeof layout>;
export type Frame = z.infer<typeof frame>;
export type BorderColor = z.infer<typeof borderColor>;
export type SecurityStamp = z.infer<typeof securityStamp>;
export type Rarity = z.infer<typeof rarity>;
export type Finish = z.infer<typeof finish>;
export type ImageStatus = z.infer<typeof imageStatus>;
export type Game = z.infer<typeof game>;

export const print = z.strictObject({
    cardId:    z.string().meta({ primary: true }),
    set:       z.string().meta({ primary: true }),
    number:    z.string().meta({ primary: true }),
    lang:      z.string().meta({ primary: true }),
    partIndex: z.number().meta({ foreign: true, type: 'small-int' }),

    part: z.strictObject({
        name:     z.string().meta({ colName: 'print_name' }),
        typeline: z.string().meta({ colName: 'print_typeline' }),
        text:     z.string().meta({ colName: 'print_text' }),

        attractionLights: z.string().meta({ type: 'bitset', map: '123456' }).optional(),

        flavorName: z.string().optional(),
        flavorText: z.string().optional(),
        artist:     z.string().optional(),
        watermark:  z.string().meta({ type: 'loose-enum' }).optional(),

        scryfallIllusId: z.string().meta({ type: 'uuid' }).array().optional(),
    }).array().meta({
        primaryKey: ['cardId', 'set', 'number', 'lang', 'partIndex'],
    }),

    printTags: z.string().array().meta({ type: 'set' }),

    layout:        layout,
    frame:         frame,
    frameEffects:  z.string().meta({ type: 'loose-enum' }).array(),
    borderColor:   borderColor,
    cardBack:      z.string().meta({ type: 'uuid' }),
    securityStamp: securityStamp.optional(),
    promoTypes:    z.string().meta({ type: 'loose-enum' }).array().optional(),
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

    previewDate:   z.string().meta({ type: 'date' }).optional(),
    previewSource: z.string().optional(),
    previewUri:    z.string().meta({ type: 'url' }).optional(),

    scryfallOracleId:  z.string().meta({ type: 'uuid' }),
    scryfallCardId:    z.string().meta({ type: 'uuid' }).optional(),
    scryfallFace:      z.enum(['back', 'bottom', 'front', 'top']).optional(),
    scryfallImageUris: z.record(z.string().meta({ type: 'url' })).array(),

    arenaId:      z.number().meta({ type: 'number-id' }).optional(),
    mtgoId:       z.number().meta({ type: 'number-id' }).optional(),
    mtgoFoilId:   z.number().meta({ type: 'number-id' }).optional(),
    multiverseId: z.number().meta({ type: 'number-id' }).array(),
    tcgPlayerId:  z.number().meta({ type: 'number-id' }).optional(),
    cardMarketId: z.number().meta({ type: 'number-id' }).optional(),
}).meta({
    primaryKey: ['cardId', 'set', 'number', 'lang'],
});

export type Print = z.infer<typeof print>;
export type PrintView = InferView<typeof print>;
