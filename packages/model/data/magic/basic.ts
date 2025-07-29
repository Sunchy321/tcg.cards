import { z } from 'zod';

export const id = 'magic';

export const birthday = '1993-08-05';

export const locale = z.enum([
    'en',
    'zhs',
    'zht',
    'de',
    'fr',
    'it',
    'ja',
    'ko',
    'pt',
    'ru',
    'es',
]);

export const fullLocale = z.enum([
    ...locale.options,
    'ph',
    'he',
    'ar',
    'sa',
    'grc',
    'la',
    'qya',
]);

export type FullLocale = z.infer<typeof fullLocale>;

export const specificManaSymbols = [
    'W', 'U', 'B', 'R', 'G', 'C', 'X', 'Y', 'Z',
    'W/U', 'U/B', 'B/R', 'R/G', 'G/W', 'W/B', 'U/R', 'B/G', 'R/W', 'G/U',
    '2/W', '2/U', '2/B', '2/R', '2/G', 'W/P', 'U/P', 'B/P', 'R/P', 'G/P', 'C/P',
    'W/U/P', 'U/B/P', 'B/R/P', 'R/G/P', 'G/W/P', 'W/B/P', 'U/R/P', 'B/G/P', 'R/W/P', 'G/U/P',
    'C/W', 'C/U', 'C/B', 'C/R', 'C/G',
    'S', 'HW', 'HR',
    'D', 'L',
];

export const manaSymbols = [
    '0', '1', '2', '3', '4', '5', '6', '7', '8', '9',
    '10', '11', '12', '13', '14', '15', '16', '17', '18', '19', '20',
    'H1', '100', '100000', 'INF',
    ...specificManaSymbols,
];

export const symbols = [
    ...manaSymbols,
    'T', 'Q',
    'H', 'E', 'A', 'P',
    'PW', 'CHAOS', 'TK',
];

export const formats = [
    'standard',
    'pioneer',
    'modern',
    'extended',
    'legacy',
    'vintage',
    'alchemy',
    'historic',
    'timeless',
    'explorer',
    'commander',
    'duelcommander',
    'leviathan_commander',
    'commander1v1',
    'brawl',
    'standard_brawl',
    'pauper',
    'oathbreaker',
    'penny',
    'canadian_highlander',
    'pauper_commander',
    'pauper_duelcommander',
];
