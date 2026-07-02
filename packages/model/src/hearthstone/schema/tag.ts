import { z } from 'zod';

import { nullableText } from '../../common';

const jsonConfig = z.record(z.string(), z.unknown());

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
  'bool_from_int',
  'enum_from_int',
  'card_ref_from_int',
  'json_wrap',
]);

export const tagProjectKind = z.enum([
  'assign_value',
  'append_string_array',
  'assign_card_ref',
  'assign_localized_text',
  'assign_mechanic',
  'assign_referenced_tag',
  'assign_legacy',
  'emit_relation',
]);

export const tagProjectTargetType = z.enum([
  'entity',
  'entity_localization',
  'entity_relation',
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

export const tagConflictStatus = z.enum([
  'open',
  'in_review',
  'resolved',
  'dismissed',
]);

export const tagConflictResolution = z.enum([
  'accept_incoming',
  'keep_current_winner',
  'require_followup_commit',
  'winner_clear',
]);

export const tagConflictProfile = z.strictObject({
  id:                 z.uuid(),
  processingSide:     z.string(),
  processingStage:    z.string(),
  conflictKind:       z.string(),
  enumId:             z.int(),
  fieldPath:          z.string(),
  sourceSummary:      z.record(z.string(), z.unknown()),
  candidateBaseValue: z.unknown().nullable(),
  localValue:         z.unknown().nullable(),
  incomingValue:      z.unknown().nullable(),
  effectiveValue:     z.unknown().nullable(),
  winnerValue:        z.unknown().nullable(),
  baseRevision:       z.string(),
  status:             tagConflictStatus,
  reason:             nullableText,
  resolution:         tagConflictResolution.nullable(),
  createdAt:          z.string(),
  resolvedAt:         z.string().nullable(),
});

export const tagConflictListInput = z.strictObject({
  status:          tagConflictStatus.optional(),
  processingSide:  z.string().trim().max(32).optional(),
  processingStage: z.string().trim().max(32).optional(),
  enumId:          z.int().optional(),
  page:            z.int().positive().default(1),
  limit:           z.int().positive().max(200).default(50),
});

export const tagConflictListResult = z.strictObject({
  items: z.array(tagConflictProfile),
  total: z.int().nonnegative(),
  page:  z.int().positive(),
  limit: z.int().positive(),
});

export const tagConflictGetInput = z.strictObject({
  id: z.uuid(),
});

export const tagConflictResolveInput = tagConflictGetInput.extend({
  resolution: tagConflictResolution,
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
export type TagConflictStatus = z.infer<typeof tagConflictStatus>;
export type TagConflictResolution = z.infer<typeof tagConflictResolution>;
export type TagConflictProfile = z.infer<typeof tagConflictProfile>;
export type TagConflictListInput = z.infer<typeof tagConflictListInput>;
export type TagConflictListResult = z.infer<typeof tagConflictListResult>;
export type TagConflictGetInput = z.infer<typeof tagConflictGetInput>;
export type TagConflictResolveInput = z.infer<typeof tagConflictResolveInput>;
export type TagUpdateInput = z.infer<typeof tagUpdateInput>;
