import type { ImagePremium, ImageVariant } from '#model/hearthstone/schema/data/image';

export type CardImageOption = ImagePremium | 'battlegrounds';

const imageSpecVersion = 'v1';

function trimBaseUrl(url: string) {
  return url.endsWith('/') ? url.slice(0, -1) : url;
}

export function buildCardImageVariant(option: CardImageOption): ImageVariant {
  if (option === 'battlegrounds') {
    return {
      zone:     'hand',
      template: 'battlegrounds',
      premium:  'normal',
    };
  }

  return {
    zone:     'hand',
    template: 'normal',
    premium:  option,
  };
}

export function buildCardImageUrl(
  assetBaseUrl: string,
  renderHash: string,
  option: CardImageOption,
) {
  const baseUrl = trimBaseUrl(assetBaseUrl);
  const variant = buildCardImageVariant(option);

  return [
    baseUrl,
    'hearthstone',
    'card',
    imageSpecVersion,
    variant.zone,
    variant.template,
    variant.premium,
    renderHash.slice(0, 2),
    `${renderHash}.webp`,
  ].join('/');
}

export function buildLegacyCardImageUrl(
  assetBaseUrl: string,
  version: number,
  option: CardImageOption,
  cardId: string,
) {
  const baseUrl = trimBaseUrl(assetBaseUrl);

  return [
    baseUrl,
    'hearthstone',
    'card',
    'image',
    'webp',
    String(version),
    'zhs',
    option,
    `${cardId}.webp`,
  ].join('/');
}
