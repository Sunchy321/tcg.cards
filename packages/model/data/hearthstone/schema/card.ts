import { z } from 'zod';

import { legality } from './game-change';
import { locale } from './basic';

export const card = z.strictObject({
    cardId: z.string(),

    legalities: z.record(z.string(), legality),
});

export const cardProfile = z.strictObject({
    cardId: z.string(),

    localization: z.strictObject({
        lang: locale,
        name: z.string(),
    }).array(),

    version: z.number().array().array(),
});

export type Card = z.infer<typeof card>;
export type CardProfile = z.infer<typeof cardProfile>;
