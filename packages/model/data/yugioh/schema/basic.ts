import z from 'zod';

export const mainLocale = z.enum(['ja', 'en', 'en/asia', 'de', 'es', 'fr', 'it', 'ko', 'pt', 'zhs']);

export const locale = z.enum([...mainLocale.options, 'zhs/cn', 'zhs/md', 'zhs/nw', 'zhs/pro']);

export const attribute = z.enum([
    'light',
    'dark',
    'water',
    'fire',
    'earth',
    'wind',
    'divine',

    'spell',
    'trap',

    'laugh',
]);

export const layout = z.enum([
    'normal',
    'effect',
    'fusion',
    'ritual',
    'synchro',
    'xyz',
    'normal_pendulum',
    'effect_pendulum',
    'fusion_pendulum',
    'ritual_pendulum',
    'synchro_pendulum',
    'xyz_pendulum',
    'link',

    'spell',
    'trap',

    'token',
    'skill',
]);

export type MainLocale = z.infer<typeof mainLocale>;
export type Locale = z.infer<typeof locale>;
export type Attribute = z.infer<typeof attribute>;
export type Layout = z.infer<typeof layout>;
