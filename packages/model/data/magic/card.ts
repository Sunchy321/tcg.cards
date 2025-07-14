import { defineEnum, defineModel, IntoType } from '@/model/model';

const categoryModel = defineEnum(
    'advertisement',
    'art',
    'auxiliary',
    'decklist',
    'default',
    'minigame',
    'player',
    'token',
);

export type Category = IntoType<typeof categoryModel>;

export const cardModel = defineModel({
    type: 'object',

    properties: {
        cardId: { type: 'id' },

        name:     { type: 'string' },
        typeline: { type: 'string' },
        text:     { type: 'string' },

        localization: {
            type: 'index-set',

            element: {
                type: 'object',

                properties: {
                    lang:     { type: 'string', index: true },
                    name:     { type: 'string' },
                    typeline: { type: 'string' },
                    text:     { type: 'string' },
                },
            },
        },

        manaValue:     { type: 'number' },
        colorIdentity: { type: 'string-set' },

        parts: {
            type: 'array',

            element: {
                type: 'object',

                properties: {
                    name:     { type: 'string' },
                    typeline: { type: 'string' },
                    text:     { type: 'string' },

                    localization: {
                        type: 'index-set',

                        element: {
                            type: 'object',

                            properties: {
                                lang:       { type: 'string', index: true },
                                __lastDate: { type: 'string' },
                                name:       { type: 'string' },
                                typeline:   { type: 'string' },
                                text:       { type: 'string' },
                            },
                        },
                    },

                    cost:           { type: 'array', element: { type: 'string' }, optional: true },
                    manaValue:      { type: 'number', optional: true },
                    color:          { type: 'string-set', optional: true },
                    colorIndicator: { type: 'string-set', optional: true },

                    type: {
                        type: 'object',

                        properties: {
                            super: { type: 'simple-set', element: { type: 'string' }, optional: true },
                            main:  { type: 'simple-set', element: { type: 'string' } },
                            sub:   { type: 'simple-set', element: { type: 'string' }, optional: true },
                        },
                    },

                    power:        { type: 'numeric', optional: true },
                    toughness:    { type: 'numeric', optional: true },
                    loyalty:      { type: 'numeric', optional: true },
                    defense:      { type: 'numeric', optional: true },
                    handModifier: { type: 'string', optional: true },
                    lifeModifier: { type: 'string', optional: true },
                },
            },
        },

        keywords:       { type: 'simple-set', element: { type: 'string' } },
        counters:       { type: 'simple-set', element: { type: 'string' } },
        producibleMana: { type: 'string-set', optional: true },
        tags:           { type: 'simple-set', element: { type: 'string' } },

        category: categoryModel,

        legalities: {
            type: 'map',

            value: {
                type:   'enum',
                values: [
                    'banned_as_commander',
                    'banned_as_companion',
                    'banned_in_bo1',
                    'banned',
                    'game_changer',
                    'legal',
                    'restricted',
                    'suspended',
                    'unavailable',
                    'score-1',
                    'score-2',
                    'score-3',
                    'score-4',
                    'score-5',
                    'score-6',
                    'score-7',
                    'score-8',
                    'score-9',
                    'score-10',
                ] as const,
            },
        },

        contentWarning: {
            type:     'boolean',
            optional: true,
        },

        scryfall: {
            type:       'object',
            properties: {
                oracleId: { type: 'array', element: { type: 'uuid' } },
            },
        },
    },
});

export type Card = IntoType<typeof cardModel>;
