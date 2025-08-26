import { z } from 'zod';

import { layout, rarity } from './basic';

export const print = z.strictObject({
    cardId: z.string(),

    lang:   z.string(),
    set:    z.string(),
    number: z.string(),

    name:     z.string(),
    typeline: z.string(),
    text:     z.string(),

    flavorText: z.string().optional(),
    artist:     z.string(),

    imageUri: z.record(z.string(), z.string()),

    tags: z.array(z.string()),

    layout:      layout,
    rarity:      rarity,
    releaseDate: z.string(),
    finishes:    z.array(z.string()).optional(),

    id:           z.number(),
    code:         z.string(),
    tcgPlayerId:  z.number().optional(),
    cardMarketId: z.number().optional(),
    cardTraderId: z.number().optional(),
});

export type Print = z.infer<typeof print>;
