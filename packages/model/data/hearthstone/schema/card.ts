import { z } from 'zod';

import { legality } from './format-change';

export const cardSchema = z.strictObject({
    cardId: z.string(),

    legalities: z.record(z.string(), legality),
});

export const Card = z.infer<typeof cardSchema>;
