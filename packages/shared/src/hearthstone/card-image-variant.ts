import type {
  CardImageRequirementExportInput,
  ImageVariant,
} from '@tcg-cards/model/hearthstone/schema/data/image';

export type MechanicValue = boolean | number;
export type MechanicMap = Record<string, MechanicValue>;

export interface ImageVariantMechanicIds {
  diamond:   string | null;
  signature: string | null;
  premium:   string | null;
}

export interface CardImageVariantRow {
  type:      string;
  set:       string;
  techLevel: number | null;
  mechanics: MechanicMap;
}

function uniqueValues<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function isMechanicEnabled(value: unknown): boolean {
  return value === true || (typeof value === 'number' && value !== 0);
}

export function hasMechanic(mechanics: MechanicMap, enumId: string | null): boolean {
  return enumId != null && isMechanicEnabled(mechanics[enumId]);
}

export function buildImageVariants(input: Pick<CardImageRequirementExportInput, 'zones' | 'templates' | 'premiums'>): ImageVariant[] {
  const zones = uniqueValues(input.zones);
  const templates = uniqueValues(input.templates);
  const premiums = uniqueValues(input.premiums);

  return zones.flatMap(zone =>
    templates.flatMap(template =>
      premiums.map(premium => ({
        category: 'base' as const,
        zone,
        template,
        premium,
      }))),
  );
}

export function isCardImageVariantAllowed(
  row: CardImageVariantRow,
  variant: ImageVariant,
  mechanicIds: ImageVariantMechanicIds,
): boolean {
  if (row.type === 'enchantment') {
    return false;
  }

  if (variant.zone !== 'hand') {
    return false;
  }

  const isPremium = hasMechanic(row.mechanics, mechanicIds.premium);
  const usesBattlegroundsTemplate = row.set === 'bgs' || row.techLevel != null;

  if (variant.template === 'battlegrounds') {
    if (!usesBattlegroundsTemplate) {
      return false;
    }
    // Battlegrounds cards: premium mechanic → golden, otherwise → normal.
    switch (variant.premium) {
    case 'golden': return isPremium;
    case 'normal': return !isPremium;
    default: return false;
    }
  }

  if (variant.template !== 'normal') {
    return false;
  }

  // Battlegrounds-only types should not generate normal-template renders
  if (row.type === 'trinket' || row.type === 'anomaly') {
    return false;
  }

  // Battlegrounds cards keep the normal template consistent with the battlegrounds template.
  if (row.set === 'bgs') {
    switch (variant.premium) {
    case 'golden': return isPremium;
    case 'normal': return !isPremium;
    default: return false;
    }
  }

  // Mercenary abilities have no golden variant
  if (row.type === 'mercenary_ability' && variant.premium === 'golden') {
    return false;
  }

  if (variant.premium === 'normal' || variant.premium === 'golden') {
    return true;
  }

  if (variant.premium === 'diamond') {
    return hasMechanic(row.mechanics, mechanicIds.diamond);
  }

  if (variant.premium === 'signature') {
    return hasMechanic(row.mechanics, mechanicIds.signature);
  }

  return false;
}
