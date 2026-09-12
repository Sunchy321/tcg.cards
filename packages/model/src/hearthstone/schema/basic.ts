import { z } from 'zod';

export const id = 'hearthstone';

export const birthday = '2013-05-23';

export const mainLocale = z.enum(['en', 'de', 'es', 'fr', 'it', 'ja', 'ko', 'mx', 'pl', 'pt', 'ru', 'th', 'zhs', 'zht']).describe('mainLocale');

export const locale = z.enum(mainLocale.options).describe('locale');

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

export const format = z.enum([
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
]).describe('format');

export const classes = z.enum([
  'death_knight', 'druid', 'hunter', 'mage', 'paladin', 'priest', 'rogue', 'shaman', 'warlock', 'warrior', 'dream', 'neutral', 'whizbang', 'demon_hunter',
]).describe('class');

export const types = z.enum([
  'null', 'game', 'player', 'hero', 'minion', 'spell', 'enchantment', 'weapon', 'item', 'token', 'hero_power', 'blank', 'game_mode_button', 'move_minion_hover_target', 'mercenary_ability', 'buddy_meter', 'location', 'quest_reward', 'tavern_spell', 'anomaly', 'trinket', 'pet',
]).describe('type');

export const race = z.enum([
  'bloodelf', 'draenei', 'dwarf', 'gnome', 'goblin', 'human', 'nightelf', 'orc', 'tauren', 'troll', 'undead', 'worgen', 'goblin2', 'murloc', 'demon', 'scourge', 'mech', 'elemental', 'ogre', 'beast', 'totem', 'nerubian', 'pirate', 'dragon', 'blank', 'all', 'egg', 'quilboar', 'centaur', 'furbolg', 'highelf', 'treant', 'halforc', 'lock', 'naga', 'old_god', 'pandaren', 'gronn', 'celestial', 'gnoll', 'golem', 'vulpera',
]).describe('race');

export const spellSchool = z.enum([
  'arcane', 'fire', 'frost', 'nature', 'holy', 'shadow', 'fel', 'physical_combat', 'tavern_spell', 'spellcraft', 'lesser_trinket', 'greater_trinket', 'upgrade',
]).describe('spellSchool');

export const rarity = z.enum(['unknown', 'free', 'common', 'rare', 'epic', 'legendary']).describe('rarity');

export type Locale = z.infer<typeof locale>;
export type Classes = z.infer<typeof classes>;
export type Types = z.infer<typeof types>;
export type Race = z.infer<typeof race>;
export type SpellSchool = z.infer<typeof spellSchool>;
export type Rarity = z.infer<typeof rarity>;
