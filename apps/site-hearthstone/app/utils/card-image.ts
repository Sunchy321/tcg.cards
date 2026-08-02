import type { ImageCategory, ImagePremium, ImageVariant } from '#model/hearthstone/schema/data/image';

export type CardImageOption = ImagePremium | 'battlegrounds';

// Types that have variant-specific placeholder SVGs (e.g. minion-signature.svg)
const PLACEHOLDER_VARIANT_TYPES = new Set(['hero', 'location', 'minion', 'spell', 'weapon']);

const LETTUCE_MERCENARY = '1665';
const LETTUCE_EQUIPMENT = '1855';
const LETTUCE_ABILITY_SUMMONED_MINION = '1676';

const TIMEWARPED = '4503';

function resolvePlaceholderType(type: string, mechanics?: Record<string, boolean | number>): string {
  if (type === 'mercenary_ability') {
    if (mechanics?.[LETTUCE_MERCENARY]) return 'mercenary-minion';
    if (mechanics?.[LETTUCE_EQUIPMENT]) return 'mercenary-equipment';
    if (mechanics?.[LETTUCE_ABILITY_SUMMONED_MINION]) return 'mercenary-ability-minion';
    return 'mercenary-ability';
  }

  if (type === 'minion' && mechanics?.[TIMEWARPED]) return 'minion-timewarped';

  return type;
}

export function getCardPlaceholder(type: string, variant: CardImageOption, mechanics?: Record<string, boolean | number>): string {
  const effectiveType = resolvePlaceholderType(type, mechanics);
  const slug = effectiveType.replace(/_/g, '-');
  if (variant !== 'normal' && variant !== 'golden' && PLACEHOLDER_VARIANT_TYPES.has(type)) {
    return `/placeholder/${slug}-${variant}.svg`;
  }
  return `/placeholder/${slug}.svg`;
}

function trimBaseUrl(url: string) {
  return url.endsWith('/') ? url.slice(0, -1) : url;
}

export function buildCardImageVariant(option: CardImageOption, hasPremiumMechanic?: boolean): ImageVariant {
  if (option === 'battlegrounds') {
    return {
      category: 'base',
      zone:     'hand',
      template: 'battlegrounds',
      premium:  hasPremiumMechanic ? 'golden' : 'normal',
    };
  }

  return {
    category: 'base',
    zone:     'hand',
    template: 'normal',
    premium:  option,
  };
}

export function buildCardImageUrl(
  assetBaseUrl: string,
  renderHash: string,
  option: CardImageOption,
  hasPremiumMechanic?: boolean,
  category?: ImageCategory,
) {
  const baseUrl = trimBaseUrl(assetBaseUrl);
  const variant = buildCardImageVariant(option, hasPremiumMechanic);
  if (category != null) variant.category = category;

  return [
    baseUrl,
    'hearthstone',
    'card',
    variant.category,
    variant.zone,
    variant.template,
    variant.premium,
    renderHash.slice(0, 2),
    `${renderHash}.webp`,
  ].join('/');
}
