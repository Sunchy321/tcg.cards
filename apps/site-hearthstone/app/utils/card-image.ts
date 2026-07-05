import type { ImageCategory, ImagePremium, ImageVariant } from '#model/hearthstone/schema/data/image';

export type CardImageOption = ImagePremium | 'battlegrounds';

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
