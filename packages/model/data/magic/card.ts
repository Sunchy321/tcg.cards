import { z } from '@model-code/zod';

import { legality } from './format-change';

export const category = z.enum([
    'advertisement',
    'art',
    'auxiliary',
    'decklist',
    'default',
    'minigame',
    'player',
    'token',
]);

export type Category = z.infer<typeof category>;

export const cardSchema = z.strictObject({
    cardId:    z.string().meta({ primary: true }),
    lang:      z.string().meta({ foreign: true }),
    partIndex: z.number().meta({ foreign: true, type: 'small-int' }),

    partCount: z.number().meta({ type: 'small-int' }),

    name:     z.string(),
    typeline: z.string(),
    text:     z.string(),

    localization: z.strictObject({
        name:     z.string().meta({ colName: 'loc_name' }),
        typeline: z.string().meta({ colName: 'loc_typeline' }),
        text:     z.string().meta({ colName: 'loc_text' }),
    }).array(),

    manaValue:     z.number(),
    colorIdentity: z.string().meta({ type: 'bitset', map: 'WUBRG' }),

    part: z.strictObject({
        name:     z.string().meta({ colName: 'part_name' }),
        typeline: z.string().meta({ colName: 'part_typeline' }),
        text:     z.string().meta({ colName: 'part_text' }),

        cost:           z.array(z.string()).nullable(),
        manaValue:      z.number().meta({ colName: 'part_mana_value' }).nullable(),
        color:          z.string().meta({ type: 'bitset', map: 'WUBRG' }).nullable(),
        colorIndicator: z.string().meta({ type: 'bitset', map: 'WUBRG' }).nullable(),

        typeSuper: z.array(z.string()).meta({ type: 'set' }).nullable(),
        typeMain:  z.array(z.string()).meta({ type: 'set' }),
        typeSub:   z.array(z.string()).meta({ type: 'set' }).nullable(),

        power:        z.string().meta({ type: 'numeric' }).nullable(),
        toughness:    z.string().meta({ type: 'numeric' }).nullable(),
        loyalty:      z.string().meta({ type: 'numeric' }).nullable(),
        defense:      z.string().meta({ type: 'numeric' }).nullable(),
        handModifier: z.string().nullable(),
        lifeModifier: z.string().nullable(),
    }).array(),

    partLocalization: z.strictObject({
        name:       z.string().meta({ colName: 'part_loc_name' }),
        typeline:   z.string().meta({ colName: 'part_loc_typeline' }),
        text:       z.string().meta({ colName: 'part_loc_text' }),
        __lastDate: z.string(),
    }).array(),

    keywords:       z.array(z.string()).meta({ type: 'set' }),
    counters:       z.array(z.string()).meta({ type: 'set' }),
    producibleMana: z.string().meta({ type: 'bitset', map: 'WUBRGC' }).nullable(),

    tags: z.array(z.string()).meta({ type: 'set' }),

    category: category,

    legalities: z.record(z.string(), legality),

    contentWarning: z.boolean().nullable(),

    scryfallOracleId: z.array(z.string().meta({ type: 'uuid' })),
});

export const cardModel = cardSchema.extend({
    localization:     cardSchema.shape.cardId.meta({ primaryKey: ['cardId', 'lang'] }),
    part:             cardSchema.shape.part.meta({ primaryKey: ['cardId', 'partIndex'] }),
    partLocalization: cardSchema.shape.partLocalization.meta({ primaryKey: ['cardId', 'lang', 'partIndex'] }),
}).meta({
    primaryKey: ['cardId'],
});

export const cardView = cardSchema.extend({
    localization:     cardSchema.shape.localization.element,
    part:             cardSchema.shape.part.element,
    partLocalization: cardSchema.shape.partLocalization.element,
});

export type Card = z.infer<typeof cardSchema>;
export type CardView = z.infer<typeof cardView>;
