import { z } from 'zod';

import { locale } from '../basic';
import { renderModel } from '../entity';

export const imageZone = z.enum(['hand', 'play']);
export const imageTemplate = z.enum(['normal', 'battlegrounds']);
export const imagePremium = z.enum(['normal', 'golden', 'diamond', 'signature']);
export const imageAssetStatus = z.enum(['ready', 'failed', 'stale']);

export const imageVariant = z.strictObject({
  zone:     imageZone,
  template: imageTemplate,
  premium:  imagePremium,
});

export const imageStyle = z.strictObject({
  styleKey:              z.string(),
  zone:                  imageZone,
  template:              imageTemplate,
  premium:               imagePremium,
  layout:                z.string(),
  width:                 z.int().positive(),
  height:                z.int().positive(),
  transparentBackground: z.boolean(),
});

export const imageRequestCard = z.strictObject({
  cardId:           z.string(),
  lang:             locale,
  version:          z.array(z.int()).nonempty(),
  revisionHash:     z.string(),
  localizationHash: z.string(),
  renderHash:       z.string(),
});

export const imageRequestOutput = z.strictObject({
  fileName:              z.string(),
  format:                z.literal('png'),
  width:                 z.int().positive(),
  height:                z.int().positive(),
  transparentBackground: z.boolean(),
});

export const imageRequestTarget = z.strictObject({
  r2Bucket:    z.string(),
  r2Key:       z.string(),
  contentType: z.literal('image/webp'),
});

export const imageRequirementRequest = z.strictObject({
  requestId:   z.string(),
  card:        imageRequestCard,
  variant:     imageVariant,
  style:       imageStyle,
  output:      imageRequestOutput,
  target:      imageRequestTarget,
  renderModel: renderModel,
});

export const imageRequirementFile = z.strictObject({
  schema:           z.literal('tcg.cards.hearthstone.card-image-requirements.v1'),
  exportId:         z.string(),
  imageSpecVersion: z.literal('hs-card-image-v1'),
  generatedAt:      z.string(),
  toolContract:     z.strictObject({
    inputFormat:         z.literal('json'),
    outputArchiveFormat: z.literal('zip'),
    outputImageFormat:   z.literal('png'),
    fileNamePolicy:      z.literal('exact'),
  }),
  limits: z.strictObject({
    defaultMaxRequests: z.int().positive(),
    hardMaxRequests:    z.int().positive(),
    maxRequests:        z.int().positive(),
    requestCount:       z.int().nonnegative(),
    remainingEstimate:  z.int().nonnegative(),
  }),
  batch: z.strictObject({
    index:   z.int().positive(),
    cursor:  z.string().nullable(),
    hasMore: z.boolean(),
  }),
  defaults: z.strictObject({
    png: z.strictObject({
      color:                 z.literal('rgba'),
      transparentBackground: z.boolean(),
    }),
    target: z.strictObject({
      contentType: z.literal('image/webp'),
      webpPreset:  z.literal('q86-m4-fast'),
    }),
  }),
  requests: z.array(imageRequirementRequest),
});

export const cardImageRequirementExportInput = z.strictObject({
  lang:     locale.default('zhs'),
  cardId:   z.string().trim().min(1).max(256).optional(),
  version:  z.int().positive().optional(),
  zones:    z.array(imageZone).nonempty().default(['hand']),
  templates: z.array(imageTemplate).nonempty().default(['normal']),
  premiums: z.array(imagePremium).nonempty().default(['normal']),
  limit:    z.int().positive().max(500).default(200),
  cursor:   z.string().trim().min(1).optional().nullable(),
});

export const cardImageRequirementExportResult = z.strictObject({
  exportId:          z.string(),
  fileName:          z.string(),
  requestCount:      z.int().nonnegative(),
  remainingEstimate: z.int().nonnegative(),
  hasMore:           z.boolean(),
  nextCursor:        z.string().nullable(),
  content:           z.string(),
});

export type ImageZone = z.infer<typeof imageZone>;
export type ImageTemplate = z.infer<typeof imageTemplate>;
export type ImagePremium = z.infer<typeof imagePremium>;
export type ImageAssetStatus = z.infer<typeof imageAssetStatus>;
export type ImageVariant = z.infer<typeof imageVariant>;
export type ImageStyle = z.infer<typeof imageStyle>;
export type ImageRequestCard = z.infer<typeof imageRequestCard>;
export type ImageRequestOutput = z.infer<typeof imageRequestOutput>;
export type ImageRequestTarget = z.infer<typeof imageRequestTarget>;
export type ImageRequirementRequest = z.infer<typeof imageRequirementRequest>;
export type ImageRequirementFile = z.infer<typeof imageRequirementFile>;
export type CardImageRequirementExportInput = z.infer<typeof cardImageRequirementExportInput>;
export type CardImageRequirementExportResult = z.infer<typeof cardImageRequirementExportResult>;
