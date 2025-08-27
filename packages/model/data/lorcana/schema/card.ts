import { z } from 'zod';

import { legality } from './format-change';
import { category, color, locale, mainType } from './basic';

export const card = z.strictObject({
    cardId: z.string(),

    cost:  z.number(),
    color: z.array(color),

    inkwell: z.boolean(),

    name:     z.string(),
    typeline: z.string(),
    text:     z.string(),

    type: z.strictObject({
        main: mainType,
        sub:  z.array(z.string()).optional(),
    }),

    localization: z.strictObject({
        lang:       locale,
        name:       z.string(),
        typeline:   z.string(),
        text:       z.string(),
        __lastDate: z.string(),
    }).array(),

    lore:      z.number().optional(),
    strength:  z.number().optional(),
    willPower: z.number().optional(),
    moveCost:  z.number().optional(),

    tags: z.array(z.string()),

    category:   category,
    legalities: z.record(z.string(), legality),
});

export type Card = z.infer<typeof card>;
