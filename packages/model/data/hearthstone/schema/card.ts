import { z } from 'zod';

import { legality } from './format-change';

export const card = z.strictObject({
    cardId: z.string(),

    legalities: z.record(z.string(), legality),
});

export type Card = z.infer<typeof card>;
