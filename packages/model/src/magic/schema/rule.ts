import z from 'zod';

export const ruleItem = z.strictObject({
  itemId: z.string(),

  index: z.number(),
  depth: z.number(),

  serial:   z.string().nullable(),
  text:     z.string(),
  richText: z.string(),
});

export const ruleSummary = z.strictObject({
  date: z.iso.date(),
  lang: z.string(),

  contents: ruleItem.pick({
    itemId: true,
    index:  true,
    depth:  true,
    serial: true,
  }).extend({
    text: z.string().optional(),
  }).array(),
});

export const textDiff = z.object({
  type:  z.enum(['common']),
  value: z.string(),
}).or(z.object({
  type:    z.enum(['diff']),
  isMinor: z.boolean(),
  value:   z.tuple([z.string(), z.string()]),
}));

export const ruleDiffItem = z.strictObject({
  itemId: z.string(),
  type:   z.enum(['add', 'move', 'remove']).optional(),
  serial: z.tuple([z.string().nullable(), z.string().nullable()]),
  depth:  z.tuple([z.number().nullish(), z.number().nullish()]),
  text:   textDiff.array(),
});

export const rule = z.strictObject({
  date: z.iso.date(),
  lang: z.string(),

  contents: ruleItem.array(),
});

export const ruleDiff = z.looseObject({
  from: z.iso.date(),
  to:   z.iso.date(),

  diff: ruleDiffItem.array(),
});

export const ruleHistory = z.strictObject({
  itemId: z.string (),

  diff: z.strictObject({
    dates: z.string().array(),
    text:  z.strictObject({
      type:  z.enum(['add', 'common', 'dual', 'remove']),
      value: z.string(),
    }).array(),
  }).array(),
});

export type RuleItem = z.infer<typeof ruleItem>;
export type RuleSummary = z.infer<typeof ruleSummary>;
export type Rule = z.infer<typeof rule>;
export type TextDiff = z.infer<typeof textDiff>;
export type RuleDiffItem = z.infer<typeof ruleDiffItem>;
export type RuleDiff = z.infer<typeof ruleDiff>;
export type RuleHistory = z.infer<typeof ruleHistory>;

export type RuleSummaryItem = RuleSummary['contents'][0];

// ========== Rule History Schema ==========

export const changeType = z.enum([
  'added',
  'removed',
  'modified',
  'renamed',
  'renamed_modified',
  'moved',
  'split',
  'merged',
]);

export const ruleSourceSchema = z.strictObject({
  id:            z.string(),
  effectiveDate: z.string().nullable(),
  publishedAt:   z.string().nullable(),
  txtUrl:        z.string().nullable(),
  pdfUrl:        z.string().nullable(),
  docxUrl:       z.string().nullable(),
  totalRules:    z.number().nullable(),
  importedAt:    z.iso.date().nullable(),
  status:        z.enum(['active', 'superseded']).default('active'),
});

export const ruleContentSchema = z.strictObject({
  hash:     z.string(),
  content:  z.instanceof(Buffer), // bytea
  size:     z.number(),
  refCount: z.number().default(1),
});

export const ruleEntitySchema = z.strictObject({
  id:              z.string(), // semantic ID: "{firstVersion}-{firstRuleId}"
  currentNodeId:   z.string().nullable(),
  currentRuleId:   z.string().nullable(),
  currentSourceId: z.string().nullable(),
  totalRevisions:  z.number().default(1),
  createdAt:       z.iso.date(),
});

export const ruleNodeSchema = z.strictObject({
  id:          z.string(), // "{sourceId}/{ruleId}"
  sourceId:    z.string(),
  ruleId:      z.string(), // Official ID, e.g., "702.1"
  path:        z.string(), // Materialized path, e.g., "702/1/a"
  level:       z.number(), // 0=chapter, 1=rule, 2=subrule
  parentId:    z.string().nullable(),
  title:       z.string().nullable(),
  contentHash: z.string(),
  entityId:    z.string(),
});

export const ruleChangeDetailsSchema = z.strictObject({
  oldContentHash:   z.string().optional(),
  newContentHash:   z.string().optional(),
  oldRuleId:        z.string().optional(),
  newRuleId:        z.string().optional(),
  similarityScore:  z.number().optional(),
  splitInto:        z.string().array().optional(),
  splitRatios:      z.number().array().optional(),
  mergedFrom:       z.string().array().optional(),
  similarities:     z.number().array().optional(),
});

export const ruleChangeSchema = z.strictObject({
  id:           z.string(),
  fromSourceId: z.string(),
  toSourceId:   z.string(),
  entityId:     z.string(),
  fromNodeId:   z.string().nullable(),
  toNodeId:     z.string().nullable(),
  type:         changeType,
  details:      z.string(), // JSON string
  createdAt:    z.iso.date(),
});

// Parsed types for frontend/API usage
export const parsedRuleNodeSchema = z.strictObject({
  id:          z.string(),
  sourceId:    z.string(),
  ruleId:      z.string(),
  path:        z.string(),
  level:       z.number(),
  parentId:    z.string().nullable(),
  title:       z.string().nullable(),
  content:     z.string(),
  contentHash: z.string(),
});

export const parsedRuleSourceSchema = z.strictObject({
  id:           z.string(),
  effectiveDate: z.string(),
  publishedAt:   z.string(),
  totalRules:    z.number(),
  nodes:         parsedRuleNodeSchema.array(),
});

export const matchResultSchema = z.strictObject({
  type:        z.enum(['unchanged', 'added', 'removed', 'modified', 'renamed', 'renamed_modified', 'moved']),
  oldNodeId:   z.string().nullable(),
  newNodeId:   z.string().nullable(),
  similarity:  z.number(),
  details:     z.strictObject({
    oldRuleId:        z.string().optional(),
    newRuleId:        z.string().optional(),
    oldContentHash:   z.string().optional(),
    newContentHash:   z.string().optional(),
    fingerprintMatch: z.boolean().optional(),
  }).optional(),
});

export const splitResultSchema = z.strictObject({
  type:            z.literal('split'),
  fromRuleId:      z.string(),
  intoRuleIds:     z.string().array(),
  similarities:    z.number().array(),
  totalSimilarity: z.number(),
});

export const mergeResultSchema = z.strictObject({
  type:            z.literal('merged'),
  fromRuleIds:     z.string().array(),
  intoRuleId:      z.string(),
  similarities:    z.number().array(),
  totalSimilarity: z.number(),
});

export const importResultSchema = z.strictObject({
  sourceId:         z.string(),
  totalNodes:       z.number(),
  newEntities:      z.number(),
  existingEntities: z.number(),
  changes:          z.strictObject({
    added:    z.number(),
    removed:  z.number(),
    modified: z.number(),
    renamed:  z.number(),
    moved:    z.number(),
    split:    z.number(),
    merged:   z.number(),
  }),
});

// Export types
export type ChangeType = z.infer<typeof changeType>;
export type RuleSource = z.infer<typeof ruleSourceSchema>;
export type RuleContent = z.infer<typeof ruleContentSchema>;
export type RuleEntity = z.infer<typeof ruleEntitySchema>;
export type RuleNode = z.infer<typeof ruleNodeSchema>;
export type RuleChange = z.infer<typeof ruleChangeSchema>;
export type RuleChangeDetails = z.infer<typeof ruleChangeDetailsSchema>;
export type ParsedRuleNode = z.infer<typeof parsedRuleNodeSchema>;
export type ParsedRuleSource = z.infer<typeof parsedRuleSourceSchema>;
export type MatchResult = z.infer<typeof matchResultSchema>;
export type SplitResult = z.infer<typeof splitResultSchema>;
export type MergeResult = z.infer<typeof mergeResultSchema>;
export type ImportResult = z.infer<typeof importResultSchema>;
