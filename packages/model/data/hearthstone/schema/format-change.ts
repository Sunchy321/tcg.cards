import { z } from 'zod';

export const legality = z.enum([
    'banned_in_card_pool',
    'banned_in_deck',
    'banned',
    'derived',
    'legal',
    'minor',
    'unavailable',
]);

export const formatChange = z.object({
});

export type Legality = z.infer<typeof legality>;
export type FormatChange = z.infer<typeof formatChange>;
