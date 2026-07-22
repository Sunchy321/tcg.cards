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

export function asNumberArray(value: unknown): number[] {
  if (Array.isArray(value)) return value.filter((v): v is number => typeof v === 'number');
  return [];
}

export function asJsonMap(value: unknown): JsonMap {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as JsonMap;
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
    const enumMap = asJsonMap(config.enumMap);
    const target = resolveKnownEnumTarget(tag);

    if (tag && tag.slug === 'card_set') {
      return context.setIdByDbfId.get(intValue) ?? null;
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
