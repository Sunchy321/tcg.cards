import { z } from 'zod';

import { legality } from './format-change';
import { category, color, mainType } from './basic';

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

    localization: z.array(
        z.strictObject({
            lang:     z.string(),
            lastDate: z.string(),
            name:     z.string(),
            typeline: z.string(),
            text:     z.string(),
        }),
    ),

    lore:      z.number().optional(),
    strength:  z.number().optional(),
    willPower: z.number().optional(),
    moveCost:  z.number().optional(),

    tags: z.array(z.string()),

    category:   category,
    legalities: z.record(z.string(), legality),
});

export type Card = z.infer<typeof card>;
