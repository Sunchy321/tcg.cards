/// <reference types="bun" />

import { createHash } from 'node:crypto';

import { beforeEach, describe, expect, mock, test } from 'bun:test';

import type { R2Bucket } from '@cloudflare/workers-types';

import { HAS_DIAMOND, HAS_SIGNATURE } from '@tcg-cards/model/src/hearthstone/constant/tag';
import type { ImageRequirementFile } from '@tcg-cards/model/src/hearthstone/schema/data/image';
import type { RenderModel } from '@tcg-cards/model/src/hearthstone/schema/entity';
import type { ImageCandidateRow } from './card-image';

const dbState = {
  selectRows:       [] as Array<{ r2Key: string, sha256: string | null, status: string }>,
  transactionError: null as Error | null,
  importRows:       [] as unknown[],
  assetUpsertRows:  [] as Array<{ values: unknown, set: unknown }>,
};

const schemaMock = {
  CardImageAsset: {
    imageSpecVersion: 'imageSpecVersion',
    renderHash:       'renderHash',
    zone:             'zone',
    template:         'template',
    premium:          'premium',
    r2Key:            'r2Key',
    sha256:           'sha256',
    status:           'status',
    lang:             'lang',
  },
  CardImageExport: {},
  CardImageImport: {},
  Entity:          {
    version:  'version',
    isLatest: 'isLatest',
  },
  EntityLocalization: {
    version:  'version',
    isLatest: 'isLatest',
  },
  Set: {},
  Tag: {},
} as const;

const dbMock = {
  select: mock(() => ({
    from: () => ({
      where: async () => dbState.selectRows,
    }),
  })),
  transaction: mock(async (callback: (tx: {
    insert: (table: unknown) => {
      values: (value: unknown) => Promise<void> | {
        onConflictDoUpdate: (input: { set: unknown }) => Promise<void>;
      };
    };
  }) => Promise<void>) => {
    if (dbState.transactionError) {
      throw dbState.transactionError;
    }

    await callback({
      insert: table => ({
        values: value => {
          if (table === schemaMock.CardImageImport) {
            dbState.importRows.push(value);
            return Promise.resolve();
          }

          if (table === schemaMock.CardImageAsset) {
            return {
              onConflictDoUpdate: async ({ set }) => {
                dbState.assetUpsertRows.push({ values: value, set });
              },
            };
          }

          return Promise.resolve();
        },
      }),
    });
  }),
};

mock.module('#db/db', () => ({ db: dbMock }));
mock.module('#schema/hearthstone', () => schemaMock);
mock.module('#model/hearthstone/schema/data/image', async () => {
  return await import('@tcg-cards/model/src/hearthstone/schema/data/image');
});
mock.module('#model/hearthstone/constant/tag', async () => {
  return await import('@tcg-cards/model/src/hearthstone/constant/tag');
});

const {
  buildCardImageImportPlan,
  buildCardImagePngFileName,
  buildCardImageR2Key,
  buildCardImageRequestId,
  buildCardImageStyle,
  buildImageVariants,
  collectImageRequirementRequests,
  importCardImageArchiveFromBrowser,
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

function sha256Bytes(bytes: Uint8Array) {
  return createHash('sha256').update(bytes).digest('hex');
}

function buildWebp(width: number, height: number) {
  const widthMinusOne = width - 1;
  const heightMinusOne = height - 1;
  const payload = Uint8Array.from([
    0x2F,
    widthMinusOne & 0xFF,
    ((widthMinusOne >> 8) & 0x3F) | ((heightMinusOne & 0x03) << 6),
    (heightMinusOne >> 2) & 0xFF,
    (heightMinusOne >> 10) & 0x0F,
  ]);
  const bytes = new Uint8Array(12 + 8 + payload.length + 1);
  const view = new DataView(bytes.buffer);

  bytes.set([0x52, 0x49, 0x46, 0x46], 0);
  view.setUint32(4, bytes.length - 8, true);
  bytes.set([0x57, 0x45, 0x42, 0x50], 8);
  bytes.set([0x56, 0x50, 0x38, 0x4C], 12);
  view.setUint32(16, payload.length, true);
  bytes.set(payload, 20);

  return bytes;
}

function buildSingleRequestRequirementFile(input?: {
  renderHash?: string;
  variant?: {
    zone:     'hand' | 'play';
    template: 'normal' | 'battlegrounds';
    premium:  'normal' | 'golden' | 'diamond' | 'signature';
  };
}): ImageRequirementFile {
  const renderHash = input?.renderHash ?? '9f2c0f6e4e0c7f4d0f0b8c2e9c8d7a1a3c6b4e5f60123456789abcdef01';
  const variant = input?.variant ?? {
    zone:     'hand',
    template: 'normal',
    premium:  'normal',
  };
  const requestId = buildCardImageRequestId(renderHash, variant);

  return {
    schema:           'tcg.cards.hearthstone.card-image-requirements.v1',
    exportId:         'hsimg_test_export',
    imageSpecVersion: 'v1',
    generatedAt:      '2026-04-24T00:00:00.000Z',
    toolContract:     {
      inputFormat:         'json',
      outputArchiveFormat: 'zip',
      outputImageFormat:   'png',
      fileNamePolicy:      'exact',
    },
    limits: {
      defaultMaxRequests: 200,
      hardMaxRequests:    500,
      maxRequests:        200,
      requestCount:       1,
      remainingEstimate:  0,
    },
    batch: {
      index:   1,
      cursor:  null,
      hasMore: false,
    },
    defaults: {
      png: {
        color:                 'rgba',
        transparentBackground: true,
      },
      target: {
        contentType: 'image/webp',
        webpPreset:  'q86-m4-fast',
      },
    },
    requests: [{
      requestId,
      card: {
        cardId:           'CORE_EXAMPLE_001',
        lang:             'zhs',
        version:          [31001],
        revisionHash:     'rev-1',
        localizationHash: 'loc-1',
        renderHash,
      },
      variant,
      style:  buildCardImageStyle(variant),
      output: {
        fileName:              buildCardImagePngFileName(requestId),
        format:                'png',
        width:                 512,
        height:                768,
        transparentBackground: true,
      },
      target: {
        r2Bucket:    'asset',
        r2Key:       buildCardImageR2Key(renderHash, variant),
        contentType: 'image/webp',
      },
      renderModel: {
        ...renderModel,
        set: 1637,
      },
    }],
  };
}

function buildMultiRequestRequirementFile(renderHashes: string[]): ImageRequirementFile {
  const variant = {
    zone:     'hand',
    template: 'normal',
    premium:  'normal',
  } as const;

  return {
    schema:           'tcg.cards.hearthstone.card-image-requirements.v1',
    exportId:         'hsimg_test_export',
    imageSpecVersion: 'v1',
    generatedAt:      '2026-04-24T00:00:00.000Z',
    toolContract:     {
      inputFormat:         'json',
      outputArchiveFormat: 'zip',
      outputImageFormat:   'png',
      fileNamePolicy:      'exact',
    },
    limits: {
      defaultMaxRequests: 200,
      hardMaxRequests:    500,
      maxRequests:        200,
      requestCount:       renderHashes.length,
      remainingEstimate:  0,
    },
    batch: {
      index:   1,
      cursor:  null,
      hasMore: false,
    },
    defaults: {
      png: {
        color:                 'rgba',
        transparentBackground: true,
      },
      target: {
        contentType: 'image/webp',
        webpPreset:  'q86-m4-fast',
      },
    },
    requests: renderHashes.map((renderHash, index) => {
      const requestId = buildCardImageRequestId(renderHash, variant);

      return {
        requestId,
        card: {
          cardId:           `CORE_EXAMPLE_${String(index + 1).padStart(3, '0')}`,
          lang:             'zhs',
          version:          [31001],
          revisionHash:     `rev-${index + 1}`,
          localizationHash: `loc-${index + 1}`,
          renderHash,
        },
        variant,
        style:  buildCardImageStyle(variant),
        output: {
          fileName:              buildCardImagePngFileName(requestId),
          format:                'png',
          width:                 512,
          height:                768,
          transparentBackground: true,
        },
        target: {
          r2Bucket:    'asset',
          r2Key:       buildCardImageR2Key(renderHash, variant),
          contentType: 'image/webp',
        },
        renderModel: {
          ...renderModel,
          cardId: `CORE_EXAMPLE_${String(index + 1).padStart(3, '0')}`,
          set:    1637,
        },
      };
    }),
  };
}

beforeEach(() => {
  dbState.selectRows = [];
  dbState.transactionError = null;
  dbState.importRows = [];
  dbState.assetUpsertRows = [];
});

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
      .toBe('hearthstone/card/v1/play/battlegrounds/golden/9f/9f2c0f6e4e0c7f4d0f0b8c2e9c8d7a1a3c6b4e5f60123456789abcdef01.webp');
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
        setDbfId:         1637,
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
        setDbfId:  1637,
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
    expect(result.requests[0]?.renderModel.set).toBe(1637);
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

  test('builds import plan with accepted, missing and rejected files', () => {
    const variant = {
      zone:     'hand',
      template: 'normal',
      premium:  'normal',
    } as const;
    const renderHash = '9f2c0f6e4e0c7f4d0f0b8c2e9c8d7a1a3c6b4e5f60123456789abcdef01';
    const requestId = buildCardImageRequestId(renderHash, variant);
    const requirementFile: ImageRequirementFile = {
      schema:           'tcg.cards.hearthstone.card-image-requirements.v1',
      exportId:         'hsimg_test_export',
      imageSpecVersion: 'v1',
      generatedAt:      '2026-04-24T00:00:00.000Z',
      toolContract:     {
        inputFormat:         'json',
        outputArchiveFormat: 'zip',
        outputImageFormat:   'png',
        fileNamePolicy:      'exact',
      },
      limits: {
        defaultMaxRequests: 200,
        hardMaxRequests:    500,
        maxRequests:        200,
        requestCount:       2,
        remainingEstimate:  0,
      },
      batch: {
        index:   1,
        cursor:  null,
        hasMore: false,
      },
      defaults: {
        png: {
          color:                 'rgba',
          transparentBackground: true,
        },
        target: {
          contentType: 'image/webp',
          webpPreset:  'q86-m4-fast',
        },
      },
      requests: [
        {
          requestId,
          card: {
            cardId:           'CORE_EXAMPLE_001',
            lang:             'zhs',
            version:          [31001],
            revisionHash:     'rev-1',
            localizationHash: 'loc-1',
            renderHash,
          },
          variant,
          style:  buildCardImageStyle(variant),
          output: {
            fileName:              buildCardImagePngFileName(requestId),
            format:                'png',
            width:                 512,
            height:                768,
            transparentBackground: true,
          },
          target: {
            r2Bucket:    'asset',
            r2Key:       buildCardImageR2Key(renderHash, variant),
            contentType: 'image/webp',
          },
          renderModel: {
            ...renderModel,
            set: 1637,
          },
        },
        {
          requestId: buildCardImageRequestId(`${renderHash.slice(0, -1)}2`, variant),
          card:      {
            cardId:           'CORE_EXAMPLE_002',
            lang:             'zhs',
            version:          [31001],
            revisionHash:     'rev-2',
            localizationHash: 'loc-2',
            renderHash:       `${renderHash.slice(0, -1)}2`,
          },
          variant,
          style:  buildCardImageStyle(variant),
          output: {
            fileName:              `${buildCardImageRequestId(`${renderHash.slice(0, -1)}2`, variant).replace('sha256:', '')}.png`,
            format:                'png',
            width:                 512,
            height:                768,
            transparentBackground: true,
          },
          target: {
            r2Bucket:    'asset',
            r2Key:       buildCardImageR2Key(`${renderHash.slice(0, -1)}2`, variant),
            contentType: 'image/webp',
          },
          renderModel: {
            ...renderModel,
            cardId: 'CORE_EXAMPLE_002',
            set:    1637,
          },
        },
      ],
    };

    const webpBytes = buildWebp(512, 768);

    const plan = buildCardImageImportPlan({
      requirementFile,
      manifest: {
        archiveFileName: 'results.zip',
        files:           [{
          requestId,
          sha256:   sha256Bytes(webpBytes),
          byteSize: webpBytes.byteLength,
        }],
        rejected: [{
          fileName: 'unknown.png',
          message:  'PNG file is not declared in the requirements JSON',
        }],
      },
      files: new Map([
        [requestId, webpBytes],
      ]),
      existingAssets: new Map(),
    });

    expect(plan.acceptedFiles).toHaveLength(1);
    expect(plan.acceptedFiles[0]?.r2Key).toBe(buildCardImageR2Key(renderHash, variant));
    expect(plan.missingCount).toBe(1);
    expect(plan.problems).toHaveLength(1);
  });

  test('does not double-count uploaded bytes after sha256 mismatch', () => {
    const requirementFile = buildSingleRequestRequirementFile();
    const request = requirementFile.requests[0]!;
    const webpBytes = buildWebp(512, 768);

    const plan = buildCardImageImportPlan({
      requirementFile,
      manifest: {
        archiveFileName: 'results.zip',
        files:           [{
          requestId: request.requestId,
          sha256:    'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
          byteSize:  webpBytes.byteLength,
        }],
        rejected: [],
      },
      files: new Map([
        [request.requestId, webpBytes],
      ]),
      existingAssets: new Map(),
    });

    expect(plan.acceptedFiles).toHaveLength(0);
    expect(plan.missingCount).toBe(0);
    expect(plan.problems).toEqual([{
      fileName: request.output.fileName,
      message:  'Converted WebP sha256 does not match uploaded bytes',
    }]);
  });

  test('re-uploads same sha256 when existing asset is not ready', () => {
    const requirementFile = buildSingleRequestRequirementFile();
    const request = requirementFile.requests[0]!;
    const r2Key = buildCardImageR2Key(request.card.renderHash, request.variant);
    const webpBytes = buildWebp(512, 768);
    const webpSha256 = sha256Bytes(webpBytes);

    const plan = buildCardImageImportPlan({
      requirementFile,
      manifest: {
        archiveFileName: 'results.zip',
        files:           [{
          requestId: request.requestId,
          sha256:    webpSha256,
          byteSize:  webpBytes.byteLength,
        }],
        rejected: [],
      },
      files: new Map([
        [request.requestId, webpBytes],
      ]),
      existingAssets: new Map([
        [r2Key, {
          sha256: webpSha256,
          status: 'failed',
        }],
      ]),
    });

    expect(plan.acceptedFiles).toHaveLength(1);
    expect(plan.acceptedFiles[0]?.shouldUpload).toBe(true);
    expect(plan.problems).toHaveLength(0);
  });

  test('rejects non-webp payload even when manifest sha256 matches', () => {
    const requirementFile = buildSingleRequestRequirementFile();
    const request = requirementFile.requests[0]!;
    const invalidBytes = new Uint8Array([1, 2, 3, 4]);

    const plan = buildCardImageImportPlan({
      requirementFile,
      manifest: {
        archiveFileName: 'results.zip',
        files:           [{
          requestId: request.requestId,
          sha256:    sha256Bytes(invalidBytes),
          byteSize:  invalidBytes.byteLength,
        }],
        rejected: [],
      },
      files: new Map([
        [request.requestId, invalidBytes],
      ]),
      existingAssets: new Map(),
    });

    expect(plan.acceptedFiles).toHaveLength(0);
    expect(plan.problems).toEqual([{
      fileName: request.output.fileName,
      message:  'Converted payload is not a valid WebP image',
    }]);
  });

  test('rejects webp payload with unexpected dimensions', () => {
    const requirementFile = buildSingleRequestRequirementFile();
    const request = requirementFile.requests[0]!;
    const webpBytes = buildWebp(256, 256);

    const plan = buildCardImageImportPlan({
      requirementFile,
      manifest: {
        archiveFileName: 'results.zip',
        files:           [{
          requestId: request.requestId,
          sha256:    sha256Bytes(webpBytes),
          byteSize:  webpBytes.byteLength,
        }],
        rejected: [],
      },
      files: new Map([
        [request.requestId, webpBytes],
      ]),
      existingAssets: new Map(),
    });

    expect(plan.acceptedFiles).toHaveLength(0);
    expect(plan.problems).toEqual([{
      fileName: request.output.fileName,
      message:  'Converted WebP dimensions 256x256 do not match expected 512x768',
    }]);
  });
});

describe('card image browser import', () => {
  test('deletes already uploaded objects when a later upload fails', async () => {
    const requirementFile = buildMultiRequestRequirementFile([
      '9f2c0f6e4e0c7f4d0f0b8c2e9c8d7a1a3c6b4e5f60123456789abcdef01',
      '8f2c0f6e4e0c7f4d0f0b8c2e9c8d7a1a3c6b4e5f60123456789abcdef02',
    ]);
    const firstRequest = requirementFile.requests[0]!;
    const secondRequest = requirementFile.requests[1]!;
    const firstBytes = buildWebp(512, 768);
    const secondBytes = buildWebp(512, 768);
    const bucket = {
      put: mock(async (key: string) => {
        if (key === buildCardImageR2Key(secondRequest.card.renderHash, secondRequest.variant)) {
          throw new Error('upload failed');
        }
      }),
      delete: mock(async () => undefined),
    };

    await expect(importCardImageArchiveFromBrowser({
      requirementContent: JSON.stringify(requirementFile),
      manifest:           {
        archiveFileName: 'results.zip',
        files:           [
          {
            requestId: firstRequest.requestId,
            sha256:    sha256Bytes(firstBytes),
            byteSize:  firstBytes.byteLength,
          },
          {
            requestId: secondRequest.requestId,
            sha256:    sha256Bytes(secondBytes),
            byteSize:  secondBytes.byteLength,
          },
        ],
        rejected: [],
      },
      files: [
        {
          requestId: firstRequest.requestId,
          bytes:     firstBytes,
        },
        {
          requestId: secondRequest.requestId,
          bytes:     secondBytes,
        },
      ],
      env: {
        R2_ASSET:        bucket as unknown as R2Bucket,
        R2_ASSET_BUCKET: 'asset',
      },
    })).rejects.toThrow('upload failed');

    expect(bucket.delete).toHaveBeenCalledWith(
      buildCardImageR2Key(firstRequest.card.renderHash, firstRequest.variant),
    );
  });

  test('deletes uploaded objects when the database transaction fails', async () => {
    const requirementFile = buildSingleRequestRequirementFile();
    const request = requirementFile.requests[0]!;
    const fileBytes = buildWebp(512, 768);
    const bucket = {
      put:    mock(async () => undefined),
      delete: mock(async () => undefined),
    };

    dbState.transactionError = new Error('transaction failed');

    await expect(importCardImageArchiveFromBrowser({
      requirementContent: JSON.stringify(requirementFile),
      manifest:           {
        archiveFileName: 'results.zip',
        files:           [{
          requestId: request.requestId,
          sha256:    sha256Bytes(fileBytes),
          byteSize:  fileBytes.byteLength,
        }],
        rejected: [],
      },
      files: [{
        requestId: request.requestId,
        bytes:     fileBytes,
      }],
      env: {
        R2_ASSET:        bucket as unknown as R2Bucket,
        R2_ASSET_BUCKET: 'asset',
      },
    })).rejects.toThrow('transaction failed');

    expect(bucket.put).toHaveBeenCalledWith(
      buildCardImageR2Key(request.card.renderHash, request.variant),
      fileBytes,
      expect.any(Object),
    );
    expect(bucket.delete).toHaveBeenCalledWith(
      buildCardImageR2Key(request.card.renderHash, request.variant),
    );
  });
});
