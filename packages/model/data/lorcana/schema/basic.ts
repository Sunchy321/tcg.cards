import { z } from 'zod';

export const locale = z.enum(['en', 'de', 'es', 'fr', 'it', 'pt', 'ja', 'zhs']);

export const color = z.enum(['amber', 'amethyst', 'emerald', 'ruby', 'sapphire', 'steel']);

export const mainType = z.enum(['action', 'character', 'item', 'location']);

export const category = z.enum(['normal']);

export const layout = z.enum(['location', 'normal']);

export const rarity = z.enum([
    'common',
    'uncommon',
    'rare',
    'super_rare',
    'legendary',
    'enchanted',
    'special',
]);

export type Locale = z.infer<typeof locale>;
export type Color = z.infer<typeof color>;
export type MainType = z.infer<typeof mainType>;
export type Category = z.infer<typeof category>;
export type Layout = z.infer<typeof layout>;
export type Rarity = z.infer<typeof rarity>;
