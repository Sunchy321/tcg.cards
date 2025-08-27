import z from 'zod';

import { games } from '@model/schema';

export const card = z.strictObject({
    game:   z.enum(games),
    cardId: z.string(),
    lang:   z.string(),

    name:     z.string(),
    typeline: z.string(),
    text:     z.string(),
});

export type Card = z.infer<typeof card>;
