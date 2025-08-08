import { z } from 'zod';

export const id = 'hearthstone';

export const birthday = '2013-05-23';

export const locale = z.enum(['en', 'de', 'es', 'fr', 'it', 'ja', 'ko', 'mx', 'pl', 'pt', 'ru', 'th', 'zhs', 'zht']);

export const formats = [
    'standard',
    'wild',
    'twist',
    'classic',
    'battlegrounds',
    'mercenaries',
    'arena',
    'duel',
    'tavern_brawl',
    'adventure',
];

export const classes = z.enum([
    'death_knight', 'druid', 'hunter', 'mage', 'paladin', 'priest', 'rogue', 'shaman', 'warlock', 'warrior', 'dream', 'neutral', 'whizbang', 'demon_hunter',
]);

export const types = z.enum([
    'null', 'game', 'player', 'hero', 'minion', 'spell', 'enchantment', 'weapon', 'item', 'token', 'hero_power', 'blank', 'game_mode_button', 'move_minion_hover_target', 'mercenary_ability', 'buddy_meter', 'location', 'quest_reward', 'tavern_spell', 'anomaly', 'trinket', 'pet',
]);

export const race = z.enum([
    'bloodelf', 'draenei', 'dwarf', 'gnome', 'goblin', 'human', 'nightelf', 'orc', 'tauren', 'troll', 'undead', 'worgen', 'goblin2', 'murloc', 'demon', 'scourge', 'mech', 'elemental', 'ogre', 'beast', 'totem', 'nerubian', 'pirate', 'dragon', 'blank', 'all', 'egg', 'quilboar', 'centaur', 'furbolg', 'highelf', 'treant', 'halforc', 'lock', 'naga', 'old_god', 'pandaren', 'gronn', 'celestial', 'gnoll', 'golem', 'vulpera',
]);

export const spellSchool = z.enum([
    'arcane', 'fire', 'frost', 'nature', 'holy', 'shadow', 'fel', 'physical_combat', 'tavern_spell', 'spellcraft', 'lesser_trinket', 'greater_trinket', 'upgrade',
]);

export const rarity = z.enum(['unknown', 'free', 'common', 'rare', 'epic', 'legendary']);

export const layout = z.enum([
    'adventure', 'aftermath', 'augment', 'battle', 'case', 'class',
    'double_faced', 'emblem', 'flip', 'flip_token_bottom', 'flip_token_top',
    'host', 'leveler', 'meld', 'modal_dfc', 'multipart', 'mutate', 'normal',
    'planar', 'prototype', 'reversible_card', 'saga', 'scheme', 'split',
    'split_arena', 'token', 'transform', 'transform_token', 'vanguard',
]);

export const fullImageType = z.enum(['webp', 'jpg', 'png']);

export type Locale = z.infer<typeof locale>;
export type Classes = z.infer<typeof classes>;
export type Types = z.infer<typeof types>;
export type Race = z.infer<typeof race>;
export type SpellSchool = z.infer<typeof spellSchool>;
export type Rarity = z.infer<typeof rarity>;
export type Layout = z.infer<typeof layout>;
export type FullImageType = z.infer<typeof fullImageType>;
