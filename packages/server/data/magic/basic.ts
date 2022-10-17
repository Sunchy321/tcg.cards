export const birthday = '1993-08-05';

export const locales = [
    'en',
    'de',
    'es',
    'fr',
    'it',
    'ja',
    'ko',
    'pt',
    'ru',
    'zhs',
    'zht',
];

export const extendedLocales = [
    ...locales,
    'ph',
    'he',
    'ar',
    'sa',
    'grc',
    'la',
];

export const specificManaSymbols = [
    'W', 'U', 'B', 'R', 'G', 'C', 'X', 'Y', 'Z',
    'W/U', 'U/B', 'B/R', 'R/G', 'G/W', 'W/B', 'U/R', 'B/G', 'R/W', 'G/U',
    '2/W', '2/U', '2/B', '2/R', '2/G', 'W/P', 'U/P', 'B/P', 'R/P', 'G/P',
    'W/U/P', 'U/B/P', 'B/R/P', 'R/G/P', 'G/W/P', 'W/B/P', 'U/R/P', 'B/G/P', 'R/W/P', 'G/U/P',
    'S', 'HW', 'HR',
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
    'P', 'E', 'A',
    'PW', 'CHAOS', 'TK',
];

export const formats = [
    'standard',
    'alchemy',
    'historic',
    'explorer',
    'pioneer',
    'modern',
    'extended',
    'legacy',
    'vintage',
    'commander',
    'duelcommander',
    'leviathan_commander',
    'commander1v1',
    'brawl',
    'historic_brawl',
    'pauper',
    'penny',
    'pauper_commander',
];
