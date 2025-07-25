import { z } from '@model/zod';

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

export const card = z.strictObject({
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
    }).meta({
        primaryKey: ['cardId', 'lang'],
    }),

    manaValue:     z.number().meta({ type: 'int' }),
    colorIdentity: z.string().meta({ type: 'bitset', map: 'WUBRG' }),

    part: z.strictObject({
        name:     z.string().meta({ colName: 'part_name' }),
        typeline: z.string().meta({ colName: 'part_typeline' }),
        text:     z.string().meta({ colName: 'part_text' }),

        localization: z.strictObject({
            name:     z.string().meta({ colName: 'part_loc_name' }),
            typeline: z.string().meta({ colName: 'part_loc_typeline' }),
            text:     z.string().meta({ colName: 'part_loc_text' }),
        }).meta({
            primaryKey: ['cardId', 'lang', 'partIndex'],
        }),

        cost:           z.array(z.string()).optional(),
        manaValue:      z.number().meta({ colName: 'part_mana_value' }).optional(),
        color:          z.string().meta({ type: 'bitset', map: 'WUBRG' }).optional(),
        colorIndicator: z.string().meta({ type: 'bitset', map: 'WUBRG' }).optional(),

        typeSuper: z.array(z.string()).meta({ type: 'set' }).optional(),
        typeMain:  z.array(z.string()).meta({ type: 'set' }),
        typeSub:   z.array(z.string()).meta({ type: 'set' }).optional(),

        power:        z.string().meta({ type: 'numeric' }).optional(),
        toughness:    z.string().meta({ type: 'numeric' }).optional(),
        loyalty:      z.string().meta({ type: 'numeric' }).optional(),
        defense:      z.string().meta({ type: 'numeric' }).optional(),
        handModifier: z.string().optional(),
        lifeModifier: z.string().optional(),
    }).meta({
        primaryKey: ['cardId', 'partIndex'],
    }),

    keywords:       z.array(z.string()).meta({ type: 'set' }),
    counters:       z.array(z.string()).meta({ type: 'set' }),
    producibleMana: z.string().meta({ type: 'bitset', map: 'WUBRGC' }).optional(),

    tags: z.array(z.string()).meta({ type: 'set' }),

    category: category,

    legalities: z.record(legality),

    contentWarning: z.boolean().optional(),

    scryfallOracleId: z.array(z.string().meta({ type: 'uuid' })),
}).meta({
    primaryKey: ['cardId'],
});

export type Card = z.infer<typeof card>;
