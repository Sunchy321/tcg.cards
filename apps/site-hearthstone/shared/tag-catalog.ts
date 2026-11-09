import { z } from 'zod';

import { mainLocale } from '@tcg-cards/model/hearthstone/schema/basic';
import { tagSemanticValueKind } from '@tcg-cards/model/hearthstone/schema/tag';

export const tagCatalogPageSizes = [50, 100, 200, 500] as const;
const tagCatalogPageSize = z.literal(tagCatalogPageSizes);

export const tagCatalogProjection = z.enum([
  'field',
  'mechanic',
  'relation',
  'localized',
  'none',
]);

export const tagCatalogInput = z.strictObject({
  q:          z.string().trim().max(200).default(''),
  lang:       mainLocale,
  projection: z.union([tagCatalogProjection, tagCatalogProjection.array().max(tagCatalogProjection.options.length)])
    .transform(value => [value].flat()).default([]),
  valueType: z.union([tagSemanticValueKind, tagSemanticValueKind.array().max(tagSemanticValueKind.options.length)])
    .transform(value => [value].flat()).default([]),
  page:     z.int().positive().default(1),
  pageSize: tagCatalogPageSize.default(tagCatalogPageSizes[0]),
});

export const tagCatalogResult = z.strictObject({
  items: z.array(z.strictObject({
    enumId:      z.int(),
    slug:        z.string(),
    name:        z.string().nullable(),
    description: z.string().nullable(),
    projections: tagCatalogProjection.array(),
    valueType:   tagSemanticValueKind.nullable(),
  })),
  total:        z.int().nonnegative(),
  catalogTotal: z.int().nonnegative(),
  page:         z.int().positive(),
  pageSize:     tagCatalogPageSize,
});

/** One display category for where a tag appears in card data. */
export type TagCatalogProjection = z.infer<typeof tagCatalogProjection>;

/** Locale, search criteria, and requested page for the public directory. */
export type TagCatalogInput = z.infer<typeof tagCatalogInput>;
