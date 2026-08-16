import type { TagRow, JsonMap } from './types';

const typeByInt: Record<number, string> = {
  0:  'null',
  1:  'game',
  2:  'player',
  3:  'hero',
  4:  'minion',
  5:  'spell',
  6:  'enchantment',
  7:  'weapon',
  8:  'item',
  9:  'token',
  10: 'hero_power',
  11: 'blank',
  12: 'game_mode_button',
  13: 'move_minion_hover_target',
  14: 'mercenary_ability',
  15: 'buddy_meter',
  16: 'location',
  17: 'quest_reward',
  18: 'tavern_spell',
  19: 'anomaly',
  20: 'trinket',
  21: 'pet',
};

const rarityByInt: Record<number, string> = {
  0: 'unknown',
  1: 'common',
  2: 'free',
  3: 'rare',
  4: 'epic',
  5: 'legendary',
};

/** SPELL_SCHOOL enum int → slug, used when normalizeConfig.enumMap is the "spell-school" alias. */
const spellSchoolByInt: Record<number, string> = {
  1: 'arcane',
  2: 'fire',
  3: 'frost',
  4: 'nature',
  5: 'holy',
  6: 'shadow',
  7: 'fel',
  8: 'physical_combat',
  9: 'tavern_spell',
  10: 'spellcraft',
  11: 'lesser_trinket',
  12: 'greater_trinket',
  13: 'upgrade',
};

/** CARDRACE enum int → slug, used when normalizeConfig.enumMap is the "race" alias. */
const raceByInt: Record<number, string> = {
  1: 'bloodelf',
  2: 'draenei',
  3: 'dwarf',
  4: 'gnome',
  5: 'goblin',
  6: 'human',
  7: 'nightelf',
  8: 'orc',
  9: 'tauren',
  10: 'troll',
  11: 'undead',
  12: 'worgen',
  13: 'goblin2',
  14: 'murloc',
  15: 'demon',
  16: 'scourge',
  17: 'mech',
  18: 'elemental',
  19: 'ogre',
  20: 'beast',
  21: 'totem',
  22: 'nerubian',
  23: 'pirate',
  24: 'dragon',
  25: 'blank',
  26: 'all',
  38: 'egg',
  43: 'quilboar',
  80: 'centaur',
  81: 'furbolg',
  83: 'highelf',
  84: 'treant',
  88: 'halforc',
  89: 'lock',
  92: 'naga',
  93: 'old_god',
  94: 'pandaren',
  95: 'gronn',
  96: 'celestial',
  97: 'gnoll',
  98: 'golem',
  100: 'vulpera',
};

/** TAG_CLASS enum int → slug, used when normalizeConfig.enumMap is the "multiclass" alias. */
const classByInt: Record<number, string> = {
  1:  'death_knight',
  2:  'druid',
  3:  'hunter',
  4:  'mage',
  5:  'paladin',
  6:  'priest',
  7:  'rogue',
  8:  'shaman',
  9:  'warlock',
  10: 'warrior',
  11: 'dream',
  12: 'neutral',
  13: 'whizbang',
  14: 'demon_hunter',
};

/** Expands a MULTI_CLASSES (tag 476) bitmask into the list of class slugs. */
function expandClassBitmask(mask: number): string[] {
  const classes: string[] = [];
  let bit = 1;
  while (mask !== 0) {
    if (mask & 1) {
      const slug = classByInt[bit];
      if (slug != null) classes.push(slug);
    }
    mask >>= 1;
    bit++;
  }
  return classes;
}

const enumMapAliasTables: Record<string, Record<number, string>> = {
  'spell-school': spellSchoolByInt,
  'race': raceByInt,
};

export function asNumberArray(value: unknown): number[] {
  if (Array.isArray(value)) return value.filter((v): v is number => typeof v === 'number');
  return [];
}

export function asJsonMap(value: unknown): JsonMap {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as JsonMap;
}

/** Resolves normalizeConfig.enumMap, including string aliases like "spell-school". */
export function resolveEnumMap(enumMap: unknown): JsonMap {
  if (typeof enumMap === 'string') {
    const alias = enumMapAliasTables[enumMap];
    return alias ? alias as unknown as JsonMap : {};
  }
  return asJsonMap(enumMap);
}

function resolveKnownEnumTarget(tag: TagRow | undefined): 'type' | 'rarity' | null {
  const targetPath = tag?.projectTargetPath ?? null;
  if (targetPath === 'type' || targetPath === 'rarity') return targetPath;
  if (tag?.slug === 'card_type') return 'type';
  if (tag?.slug === 'rarity') return 'rarity';
  return null;
}

function normalizeKnownEnumValue(
  target: 'type' | 'rarity',
  value: number,
): string | null {
  if (target === 'type') return typeByInt[value] ?? null;
  return rarityByInt[value] ?? null;
}

export type NormalizedValue = boolean | number | string | string[] | { cardId: string | null, dbfId: number | null } | null;

interface ProjectionContext {
  cardIdByDbfId: Map<number, string>;
  setIdByDbfId:  Map<number, string>;
}

export function normalizeExtractedTagValue(
  intValue: number,
  tag: TagRow | undefined,
  context: ProjectionContext,
): NormalizedValue {
  const normalizeKind = tag?.normalizeKind ?? 'identity_int';

  if (normalizeKind === 'identity_int') {
    return intValue;
  }

  if (normalizeKind === 'bool_from_int') {
    const config = tag?.normalizeConfig ?? {};
    const trueValues = asNumberArray(config.trueValues);
    const falseValues = asNumberArray(config.falseValues);

    if (trueValues.length > 0 || falseValues.length > 0) {
      if (trueValues.includes(intValue)) return true;
      if (falseValues.includes(intValue)) return false;
      return null;
    }

    if (intValue === 1) return true;
    if (intValue === 0) return false;
    return null;
  }

  if (normalizeKind === 'enum_from_int') {
    const config = tag?.normalizeConfig ?? {};
    const enumMap = resolveEnumMap(config.enumMap);
    const target = resolveKnownEnumTarget(tag);

    if (tag && tag.slug === 'card_set') {
      return context.setIdByDbfId.get(intValue) ?? null;
    }

    // MULTI_CLASSES (tag 476) value is a bitmask over TAG_CLASS enum values.
    if (config.enumMap === 'multiclass') {
      return expandClassBitmask(intValue);
    }

    const mapped = enumMap[String(intValue)];
    if (typeof mapped === 'string') {
      if (target == null) return mapped;
      return normalizeKnownEnumValue(target, intValue) ?? mapped;
    }

    if (Array.isArray(mapped)) {
      return mapped.filter(item => typeof item === 'string') as string[];
    }

    if (target != null) {
      const fallback = normalizeKnownEnumValue(target, intValue);
      if (fallback != null) return fallback;
    }

    return config.allowUnknownEnumValue === true ? String(intValue) : null;
  }

  if (normalizeKind === 'card_ref_from_int') {
    return {
      cardId: context.cardIdByDbfId.get(intValue) ?? null,
      dbfId:  intValue,
    };
  }

  return intValue;
}

export function isNormalizedMechanicValue(value: NormalizedValue): value is boolean | number {
  return typeof value === 'boolean' || (typeof value === 'number' && Number.isSafeInteger(value));
}
