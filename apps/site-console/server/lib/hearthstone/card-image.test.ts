/// <reference types="bun" />

import { describe, expect, mock, test } from 'bun:test';

import { HAS_DIAMOND, HAS_SIGNATURE } from '@tcg-cards/model/src/hearthstone/constant/tag';
import type { RenderModel } from '@tcg-cards/model/src/hearthstone/schema/entity';
import type { ImageCandidateRow } from './card-image';

mock.module('#db/db', () => ({ db: {} }));
mock.module('#schema/hearthstone', () => ({
  CardImageAsset:     {},
  CardImageExport:    {},
  Entity:             {},
  EntityLocalization: {},
  Tag:                {},
}));
mock.module('#model/hearthstone/schema/data/image', async () => {
  return await import('@tcg-cards/model/src/hearthstone/schema/data/image');
});
mock.module('#model/hearthstone/constant/tag', async () => {
  return await import('@tcg-cards/model/src/hearthstone/constant/tag');
});

const {
  buildCardImagePngFileName,
  buildCardImageR2Key,
  buildCardImageRequestId,
  buildCardImageStyle,
  buildImageVariants,
  collectImageRequirementRequests,
  isCardImageVariantAllowed,
} = await import('./card-image');

const mechanicIds = {
  diamond:   String(HAS_DIAMOND),
  signature: String(HAS_SIGNATURE),
} as const;

const renderModel: RenderModel = {
  cardId:          'CORE_EXAMPLE_001',
  lang:            'zhs',
  variant:         'normal',
  templateVersion: 'v1',
  assetVersion:    'v1',
  localization:    {
    name:     '示例卡牌',
    richText: '造成 3 点伤害。',
  },
  type:              'spell',
  cost:              2,
  attack:            null,
  health:            null,
  durability:        null,
  armor:             null,
  classes:           ['mage'],
  race:              null,
  spellSchool:       'fire',
  mercenaryFaction:  null,
  set:               'CORE',
  overrideWatermark: null,
  rarity:            'common',
  elite:             false,
  techLevel:         null,
  rune:              null,
  renderMechanics:   {},
};

describe('card image helpers', () => {
  test('builds stable request ids and png file names', () => {
    const variant = {
      zone:     'hand',
      template: 'normal',
      premium:  'normal',
    } as const;

    const requestId = buildCardImageRequestId('9f2c0f6e4e0c7f4d0f0b8c2e9c8d7a1a3c6b4e5f60123456789abcdef01', variant);

    expect(requestId).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(buildCardImagePngFileName(requestId)).toBe(`${requestId.slice('sha256:'.length)}.png`);
  });

  test('builds style and r2 key from variant', () => {
    const variant = {
      zone:     'play',
      template: 'battlegrounds',
      premium:  'golden',
    } as const;

    expect(buildCardImageStyle(variant)).toEqual({
      styleKey:              'play.battlegrounds.golden',
      zone:                  'play',
      template:              'battlegrounds',
      premium:               'golden',
      layout:                'card.play.v1',
      width:                 512,
      height:                768,
      transparentBackground: true,
    });

    expect(buildCardImageR2Key('9f2c0f6e4e0c7f4d0f0b8c2e9c8d7a1a3c6b4e5f60123456789abcdef01', variant))
      .toBe('hearthstone/card-images/hs-card-image-v1/play/battlegrounds/golden/9f/9f2c0f6e4e0c7f4d0f0b8c2e9c8d7a1a3c6b4e5f60123456789abcdef01.webp');
  });

  test('collects missing requests with offset and ready filtering', () => {
    const variants = buildImageVariants({
      zones:     ['hand'],
      templates: ['normal'],
      premiums:  ['normal', 'golden'],
    });

    const rows = [
      {
        cardId:           'A',
        version:          [1],
        lang:             'zhs',
        revisionHash:     'rev-a',
        localizationHash: 'loc-a',
        renderHash:       'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        renderModel,
        type:             'spell',
        set:              'CORE',
        techLevel:        null,
        mechanics:        {},
      },
      {
        cardId:           'B',
        version:          [1],
        lang:             'zhs',
        revisionHash:     'rev-b',
        localizationHash: 'loc-b',
        renderHash:       'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
        renderModel:      {
          ...renderModel,
          cardId: 'B',
        },
        type:      'spell',
        set:       'CORE',
        techLevel: null,
        mechanics: {},
      },
    ] satisfies ImageCandidateRow[];

    const readyKeys = new Set([
      'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\u0000hand\u0000normal\u0000golden',
    ]);

    const result = collectImageRequirementRequests({
      rows,
      readyKeys,
      variants,
      mechanicIds,
      r2Bucket:    'asset',
      offset:      1,
      limit:       2,
      seenMissing: 0,
    });

    expect(result.missingCount).toBe(3);
    expect(result.requests).toHaveLength(2);
    expect(result.requests[0]?.card.cardId).toBe('B');
    expect(result.requests[0]?.variant.premium).toBe('normal');
    expect(result.requests[1]?.variant.premium).toBe('golden');
  });

  test('keeps only legacy-supported style combinations per card', () => {
    const variants = buildImageVariants({
      zones:     ['hand', 'play'],
      templates: ['normal', 'battlegrounds'],
      premiums:  ['normal', 'golden', 'diamond', 'signature'],
    });

    const spellAllowed = variants
      .filter(variant => isCardImageVariantAllowed({
        type:      'spell',
        set:       'CORE',
        techLevel: null,
        mechanics: { [HAS_DIAMOND]: true },
      }, variant, mechanicIds))
      .map(variant => `${variant.zone}.${variant.template}.${variant.premium}`);

    expect(spellAllowed).toEqual([
      'hand.normal.normal',
      'hand.normal.golden',
      'hand.normal.diamond',
    ]);

    const bgsAllowed = variants
      .filter(variant => isCardImageVariantAllowed({
        type:      'minion',
        set:       'bgs',
        techLevel: 5,
        mechanics: {
          [HAS_DIAMOND]:   true,
          [HAS_SIGNATURE]: true,
        },
      }, variant, mechanicIds))
      .map(variant => `${variant.zone}.${variant.template}.${variant.premium}`);

    expect(bgsAllowed).toEqual([
      'hand.normal.normal',
      'hand.normal.golden',
      'hand.normal.diamond',
      'hand.normal.signature',
      'hand.battlegrounds.normal',
    ]);

    const enchantmentAllowed = variants
      .filter(variant => isCardImageVariantAllowed({
        type:      'enchantment',
        set:       'CORE',
        techLevel: null,
        mechanics: {},
      }, variant, mechanicIds));

    expect(enchantmentAllowed).toHaveLength(0);
  });
});
