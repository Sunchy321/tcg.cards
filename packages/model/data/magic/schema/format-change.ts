import { z } from 'zod';

export const legality = z.enum([
    'banned_as_commander',
    'banned_as_companion',
    'banned_in_bo1',
    'banned',
    'game_changer',
    'legal',
    'restricted',
    'suspended',
    'unavailable',
    'score-1',
    'score-2',
    'score-3',
    'score-4',
    'score-5',
    'score-6',
    'score-7',
    'score-8',
    'score-9',
    'score-10',
]);

export type Legality = z.infer<typeof legality>;
