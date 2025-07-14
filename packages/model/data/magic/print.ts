import { defineEnum, defineModel, IntoType } from '@/model/model';

const layoutModel = defineEnum(
    'adventure', 'aftermath', 'augment', 'battle', 'class', 'double_faced',
    'emblem', 'flip_token_bottom', 'flip_token_top', 'flip', 'host',
    'leveler', 'meld', 'modal_dfc', 'multipart', 'normal', 'planar',
    'reversible_card', 'saga', 'scheme', 'split_arena', 'split', 'token',
    'transform_token', 'transform', 'vanguard',
);

const frameModel = defineEnum('1993', '1997', '2003', '2015', 'future');
const borderColorModel = defineEnum('black', 'borderless', 'gold', 'silver', 'white', 'yellow');
const securityStampModel = defineEnum('acorn', 'arena', 'circle', 'heart', 'oval', 'triangle');
const rarityModel = defineEnum('bonus', 'common', 'mythic', 'rare', 'special', 'uncommon');
const finishModel = defineEnum('etched', 'foil', 'nonfoil');
const imageStatusModel = defineEnum('highres_scan', 'lowres', 'missing', 'placeholder');
const gameModel = defineEnum('arena', 'astral', 'mtgo', 'paper', 'sega');

export type Layout = IntoType<typeof layoutModel>;
export type Frame = IntoType<typeof frameModel>;
export type BorderColor = IntoType<typeof borderColorModel>;
export type SecurityStamp = IntoType<typeof securityStampModel>;
export type Rarity = IntoType<typeof rarityModel>;
export type Finish = IntoType<typeof finishModel>;
export type ImageStatus = IntoType<typeof imageStatusModel>;
export type Game = IntoType<typeof gameModel>;

export const printModel = defineModel({
    type: 'object',

    properties: {
        cardId: { type: 'id' },

        lang:   { type: 'string' },
        set:    { type: 'string' },
        number: { type: 'string' },

        parts: {
            type:    'array',
            element: {
                type:       'object',
                properties: {
                    name:     { type: 'string' },
                    typeline: { type: 'string' },
                    text:     { type: 'string' },

                    attractionLights: { type: 'array', element: { type: 'number' }, optional: true },

                    scryfallIllusId: { type: 'array', element: { type: 'string' }, optional: true },
                    flavorName:      { type: 'string', optional: true },
                    flavorText:      { type: 'string', optional: true },
                    artist:          { type: 'string', optional: true },
                    watermark:       { type: 'loose-enum', optional: true },
                },
            },
        },

        tags: { type: 'simple-set', element: { type: 'string' } },

        layout:        layoutModel,
        frame:         frameModel,
        frameEffects:  { type: 'simple-set', element: { type: 'loose-enum' } },
        borderColor:   borderColorModel,
        cardBack:      { type: 'uuid' },
        securityStamp: { ...securityStampModel, optional: true },
        promoTypes:    { type: 'simple-set', element: { type: 'loose-enum' }, optional: true },
        rarity:        rarityModel,
        releaseDate:   { type: 'string-date' },

        isDigital:       { type: 'boolean' },
        isPromo:         { type: 'boolean' },
        isReprint:       { type: 'boolean' },
        finishes:        { type: 'simple-set', element: finishModel },
        hasHighResImage: { type: 'boolean' },
        imageStatus:     imageStatusModel,

        inBooster: { type: 'boolean' },
        games:     { type: 'simple-set', element: gameModel },

        preview: {
            type:       'object',
            optional:   true,
            properties: {
                date:   { type: 'string-date' },
                source: { type: 'string' },
                uri:    { type: 'url' },
            },
        },

        scryfall: {
            type:       'object',
            properties: {
                oracleId: { type: 'uuid' },
                cardId:   { type: 'uuid', optional: true },
                face:     {
                    type:     'enum',
                    values:   ['back', 'bottom', 'front', 'top'] as const,
                    optional: true,
                },
                imageUris: {
                    type:    'array',
                    element: {
                        type:  'map',
                        value: { type: 'url' },
                    },
                },
            },
        },

        arenaId:      { type: 'number-id', optional: true },
        mtgoId:       { type: 'number-id', optional: true },
        mtgoFoilId:   { type: 'number-id', optional: true },
        multiverseId: { type: 'array', element: { type: 'number-id' } },
        tcgPlayerId:  { type: 'number-id', optional: true },
        cardMarketId: { type: 'number-id', optional: true },
    },
});

export type Print = IntoType<typeof printModel>;
