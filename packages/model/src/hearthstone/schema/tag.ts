import { z } from 'zod';

const jsonConfig = z.record(z.string(), z.unknown());
const nullableText = z.string().nullable();

export const tagValueKind = z.enum([
  'bool',
  'card_ref',
  'int',
  'json',
  'loc_string',
  'string',
]);

export const tagNormalizeKind = z.enum([
  'identity',
  'identity_int',
  'identity_string',
  'identity_loc_string',
  'identity_card_ref',
  'bool_from_int',
  'enum_from_int',
  'card_ref_from_int',
  'json_wrap',
]);

export const tagProjectKind = z.enum([
  'assign_scalar',
  'assign_bool',
  'assign_int',
  'assign_string',
  'assign_enum',
  'append_string_array',
  'assign_card_ref',
  'assign_localized_text',
  'assign_mechanic',
  'assign_referenced_tag',
  'assign_legacy',
]);

export const tagProjectTargetType = z.enum([
  'entity',
  'entity_localization',
  'relation',
  'legacy',
]);

export const tagStatus = z.enum([
  'discovered',
  'configured',
  'ignored',
  'deprecated',
]);

export const tagProfile = z.strictObject({
  enumId:             z.int(),
  slug:               z.string(),
  slugAliases:        z.array(z.string()),
  name:               nullableText,
  rawName:            nullableText,
  rawType:            nullableText,
  rawNames:           z.array(z.string()),
  valueKind:          z.string(),
  normalizeKind:      z.string(),
  normalizeConfig:    jsonConfig,
  projectTargetType:  nullableText,
  projectTargetPath:  nullableText,
  projectKind:        nullableText,
  projectConfig:      jsonConfig,
  status:             z.string(),
  description:        nullableText,
  firstSeenSourceTag: z.int().nullable(),
  lastSeenSourceTag:  z.int().nullable(),
  createdAt:          z.string(),
  updatedAt:          z.string(),
});

export const tagListInput = z.strictObject({
  q:           z.string().trim().max(200).optional(),
  status:      z.string().trim().max(64).optional(),
  projectKind: z.string().trim().max(64).optional(),
  page:        z.int().positive().default(1),
  limit:       z.int().positive().max(200).default(50),
});

export const tagListResult = z.strictObject({
  items: z.array(tagProfile),
  total: z.int().nonnegative(),
  page:  z.int().positive(),
  limit: z.int().positive(),
});

export const tagGetInput = z.strictObject({
  enumId: z.int(),
});

export const tagUpdateInput = tagGetInput.extend({
  slug:              z.string().trim().min(1).max(160),
  slugAliases:       z.array(z.string().trim().min(1).max(160)).default([]),
  name:              nullableText,
  rawName:           nullableText,
  rawType:           nullableText,
  rawNames:          z.array(z.string().trim().min(1).max(200)).default([]),
  valueKind:         z.string().trim().min(1).max(64),
  normalizeKind:     z.string().trim().min(1).max(64),
  normalizeConfig:   jsonConfig.default({}),
  projectTargetType: nullableText,
  projectTargetPath: nullableText,
  projectKind:       nullableText,
  projectConfig:     jsonConfig.default({}),
  status:            z.string().trim().min(1).max(64),
  description:       nullableText,
});

export type TagValueKind = z.infer<typeof tagValueKind>;
export type TagNormalizeKind = z.infer<typeof tagNormalizeKind>;
export type TagProjectKind = z.infer<typeof tagProjectKind>;
export type TagProjectTargetType = z.infer<typeof tagProjectTargetType>;
export type TagStatus = z.infer<typeof tagStatus>;
export type TagProfile = z.infer<typeof tagProfile>;
export type TagListInput = z.infer<typeof tagListInput>;
export type TagListResult = z.infer<typeof tagListResult>;
export type TagGetInput = z.infer<typeof tagGetInput>;
export type TagUpdateInput = z.infer<typeof tagUpdateInput>;
