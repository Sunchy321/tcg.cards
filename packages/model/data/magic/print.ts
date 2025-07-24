import 'zod-metadata/register';
import { z } from 'zod';

const layoutModel = z.enum([
    'adventure', 'aftermath', 'augment', 'battle', 'class', 'double_faced',
    'emblem', 'flip_token_bottom', 'flip_token_top', 'flip', 'host',
    'leveler', 'meld', 'modal_dfc', 'multipart', 'normal', 'planar',
    'reversible_card', 'saga', 'scheme', 'split_arena', 'split', 'token',
    'transform_token', 'transform', 'vanguard',
]);

const frameModel = z.enum(['1993', '1997', '2003', '2015', 'future']);
const borderColorModel = z.enum(['black', 'borderless', 'gold', 'silver', 'white', 'yellow']);
const securityStampModel = z.enum(['acorn', 'arena', 'circle', 'heart', 'oval', 'triangle']);
const rarityModel = z.enum(['bonus', 'common', 'mythic', 'rare', 'special', 'uncommon']);
const finishModel = z.enum(['etched', 'foil', 'nonfoil']);
const imageStatusModel = z.enum(['highres_scan', 'lowres', 'missing', 'placeholder']);
const gameModel = z.enum(['arena', 'astral', 'mtgo', 'paper', 'sega']);

export type Layout = z.infer<typeof layoutModel>;
export type Frame = z.infer<typeof frameModel>;
export type BorderColor = z.infer<typeof borderColorModel>;
export type SecurityStamp = z.infer<typeof securityStampModel>;
export type Rarity = z.infer<typeof rarityModel>;
export type Finish = z.infer<typeof finishModel>;
export type ImageStatus = z.infer<typeof imageStatusModel>;
export type Game = z.infer<typeof gameModel>;

export const printModel = z.strictObject({
    cardId:    z.string(),
    set:       z.string(),
    number:    z.string(),
    lang:      z.string(),
    partIndex: z.number().meta({ foreign: true, type: 'small-int' }),

    partCount: z.number().meta({ type: 'small-int' }),

    parts: z.strictObject({
        name:     z.string(),
        typeline: z.string(),
        text:     z.string(),

        attractionLights: z.string().meta({ type: 'bitset', map: '123456' }).optional(),

        flavorName: z.string().optional(),
        flavorText: z.string().optional(),
        artist:     z.string().optional(),
        watermark:  z.string().meta({ type: 'loose-enum' }).optional(),

        scryfallIllusId: z.string().meta({ type: 'uuid' }).array().optional(),
    }).meta({
        primaryKey: ['cardId', 'set', 'number', 'lang', 'partIndex'],
    }),

    printTags: z.string().array().meta({ type: 'set' }),

    layout:        layoutModel,
    frame:         frameModel,
    frameEffects:  z.string().meta({ type: 'loose-enum' }).array(),
    borderColor:   borderColorModel,
    cardBack:      z.string().meta({ type: 'uuid' }),
    securityStamp: securityStampModel.optional(),
    promoTypes:    z.string().meta({ type: 'loose-enum' }).array().optional(),
    rarity:        rarityModel,
    releaseDate:   z.string().meta({ type: 'date' }),

    isDigital:       z.boolean(),
    isPromo:         z.boolean(),
    isReprint:       z.boolean(),
    finishes:        finishModel.array(),
    hasHighResImage: z.boolean(),
    imageStatus:     imageStatusModel,

    inBooster: z.boolean(),
    games:     gameModel.array(),

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

export type Print = z.infer<typeof printModel>;
