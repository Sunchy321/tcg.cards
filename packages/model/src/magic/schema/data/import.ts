import { z } from 'zod';

const sourceIds = ['magic/gatherer', 'magic/scryfall', 'magic/mtgch', 'magic/mtgjson'] as const;
const entityTypes = ['card', 'cardLocalization', 'cardPart', 'cardPartLocalization', 'print', 'printPart'] as const;
const fieldGroups = [
  'structure',
  'oracle',
  'gameplay',
  'localization',
  'print_display',
  'print_metadata',
  'classification',
  'legality',
  'image',
  'external_id',
  'art',
] as const;
const coverageStates = ['supported', 'conditional', 'unsupported'] as const;
const strategies = ['overwrite', 'ignore', 'overwrite_when_matched', 'approval_required'] as const;
const decisionModes = ['auto_apply', 'batch_review', 'manual_review'] as const;
const riskLevels = ['low', 'medium', 'high'] as const;
const fieldStates = ['provided', 'explicit_null', 'not_provided', 'not_applicable', 'parse_failed'] as const;
const matcherOperators = ['is_null', 'is_empty_string', 'equals', 'in', 'contains_any'] as const;

export const importSourceId = z.enum(sourceIds);
export const importEntityType = z.enum(entityTypes);
export const importFieldGroup = z.enum(fieldGroups);
export const importCoverageState = z.enum(coverageStates);
export const importStrategy = z.enum(strategies);
export const importDecisionMode = z.enum(decisionModes);
export const importRiskLevel = z.enum(riskLevels);
export const importFieldState = z.enum(fieldStates);
export const importMatcherOperator = z.enum(matcherOperators);
export const importFallbackAction = z.enum(['ignore', 'manual_review']);
export const importSourceStatus = z.enum(['enabled', 'candidate', 'reconcile_only']);
export const importTrustLevel = z.enum(['high', 'medium']);

export type ImportSourceId = z.infer<typeof importSourceId>;
export type ImportEntityType = z.infer<typeof importEntityType>;
export type ImportFieldGroup = z.infer<typeof importFieldGroup>;
export type ImportCoverageState = z.infer<typeof importCoverageState>;
export type ImportStrategy = z.infer<typeof importStrategy>;
export type ImportDecisionMode = z.infer<typeof importDecisionMode>;
export type ImportRiskLevel = z.infer<typeof importRiskLevel>;
export type ImportFieldState = z.infer<typeof importFieldState>;
export type ImportMatcherOperator = z.infer<typeof importMatcherOperator>;

export const importSource = z.strictObject({
  sourceId:            importSourceId,
  name:                z.string(),
  summary:             z.string(),
  role:                z.string(),
  official:            z.boolean(),
  url:                 z.url(),
  trustLevel:          importTrustLevel,
  status:              importSourceStatus,
  defaultStrategy:     importStrategy,
  defaultDecisionMode: importDecisionMode,
  majorFieldGroups:    z.string().array(),
  notes:               z.string().array(),
});

export const importEntity = z.strictObject({
  entityType: importEntityType,
  label:      z.string(),
  targetKey:  z.string().array(),
  matchKeys:  z.string().array(),
});

export const importField = z.strictObject({
  fieldPath:   z.string(),
  label:       z.string(),
  entityType:  importEntityType,
  group:       importFieldGroup,
  riskLevel:   importRiskLevel,
  placeholder: z.boolean(),
  nullable:    z.boolean(),
  lockable:    z.boolean(),
});

export const importFieldStateRule = z.strictObject({
  state:           importFieldState,
  generatesChange: z.boolean(),
  description:     z.string(),
});

export const importCoverageCell = z.strictObject({
  sourceId:  importSourceId,
  coverage:  importCoverageState,
  note:      z.string(),
  condition: z.string().optional(),
});

export const importFieldCoverage = z.strictObject({
  fieldPath:   z.string(),
  label:       z.string(),
  entityType:  importEntityType,
  group:       importFieldGroup,
  riskLevel:   importRiskLevel,
  placeholder: z.boolean(),
  sources:     importCoverageCell.array(),
});

export const sourceFieldPolicyView = z.strictObject({
  sourceId:          importSourceId,
  entityType:        importEntityType,
  fieldPath:         z.string(),
  label:             z.string(),
  group:             importFieldGroup,
  coverage:          importCoverageState,
  coverageNote:      z.string(),
  coverageCondition: z.string().optional(),
  strategy:          importStrategy,
  decisionMode:      importDecisionMode,
  riskLevel:         importRiskLevel,
  matcherSummary:    z.string().optional(),
  fallbackAction:    importFallbackAction.optional(),
  batchGroupBy:      z.string().array(),
  reasonCode:        z.string(),
  allowExplicitNull: z.boolean(),
  lockedPathAware:   z.boolean(),
});

export const importBoundaryTable = z.strictObject({
  schema:        z.enum(['magic', 'magic_data', 'magic_app']),
  table:         z.string(),
  role:          z.string(),
  authoritative: z.boolean(),
});

export const importBoundary = z.strictObject({
  dataTables:       importBoundaryTable.array(),
  appTables:        importBoundaryTable.array(),
  domainTables:     importBoundaryTable.array(),
  derivedFields:    z.string().array(),
  lockedPathPolicy: z.string(),
  updationPolicy:   z.string(),
});

export const importP1Input = z.strictObject({
  schema:         z.enum(['magic_data', 'magic_app']),
  table:          z.string(),
  purpose:        z.string(),
  requiredFields: z.string().array(),
});

export const importPolicySnapshot = z.strictObject({
  version:             z.string(),
  publishedAt:         z.string(),
  sources:             importSource.array(),
  entities:            importEntity.array(),
  fields:              importField.array(),
  fieldStates:         importFieldStateRule.array(),
  matcherOperators:    importMatcherOperator.array(),
  fieldCoverageMatrix: importFieldCoverage.array(),
  policies:            sourceFieldPolicyView.array(),
  filterOptions:       z.strictObject({
    sourceIds:      importSourceId.array(),
    entityTypes:    importEntityType.array(),
    fieldGroups:    importFieldGroup.array(),
    coverageStates: importCoverageState.array(),
    decisionModes:  importDecisionMode.array(),
    riskLevels:     importRiskLevel.array(),
  }),
  metadata: z.strictObject({
    generatedBy: z.string(),
    source:      z.string(),
    summary:     z.string(),
    totals:      z.strictObject({
      sources:      z.number().int().nonnegative(),
      fields:       z.number().int().nonnegative(),
      policies:     z.number().int().nonnegative(),
      autoApply:    z.number().int().nonnegative(),
      batchReview:  z.number().int().nonnegative(),
      manualReview: z.number().int().nonnegative(),
    }),
    validation: z.strictObject({
      fieldPathRegistry: z.string(),
      matcher:           z.string(),
      riskBoundary:      z.string(),
      unsupportedPolicy: z.string(),
      explicitNull:      z.string(),
    }),
  }),
  boundary: importBoundary,
  p1Inputs: z.strictObject({
    tables:                importP1Input.array(),
    reservedStorageFields: z.string().array(),
  }),
});

export type ImportSource = z.infer<typeof importSource>;
export type ImportEntity = z.infer<typeof importEntity>;
export type ImportField = z.infer<typeof importField>;
export type ImportFieldCoverage = z.infer<typeof importFieldCoverage>;
export type SourceFieldPolicyView = z.infer<typeof sourceFieldPolicyView>;
export type ImportPolicySnapshot = z.infer<typeof importPolicySnapshot>;

const batchGroupBy = ['sourceId', 'entityType', 'fieldPath', 'ruleSetId', 'localeOrLang', 'reasonCode'];

const field = (
  entityType: ImportEntityType,
  suffix: string,
  label: string,
  group: ImportFieldGroup,
  riskLevel: ImportRiskLevel,
  options: Partial<Pick<ImportField, 'nullable' | 'placeholder'>> = {},
): ImportField => ({
  fieldPath:   `${entityType}.${suffix}`,
  label,
  entityType,
  group,
  riskLevel,
  placeholder: options.placeholder ?? false,
  nullable:    options.nullable ?? false,
  lockable:    true,
});

export const magicImportSources: ImportSource[] = [
  {
    sourceId:            'magic/gatherer',
    name:                'Gatherer',
    summary:             'Official rules source',
    role:                'Official rules, English oracle text, rulings, and multiverse IDs',
    official:            true,
    url:                 'https://gatherer.wizards.com',
    trustLevel:          'high',
    status:              'enabled',
    defaultStrategy:     'overwrite_when_matched',
    defaultDecisionMode: 'manual_review',
    majorFieldGroups:    ['oracle', 'legality', 'external_id'],
    notes:               [
      'Uses official semantics but still requires strict target matching.',
      'Only explicit low-risk fields can be lowered from manual review.',
    ],
  },
  {
    sourceId:            'magic/scryfall',
    name:                'Scryfall',
    summary:             'Structured card and print metadata source',
    role:                'Print metadata, image URIs, external platform IDs, and structured legality data',
    official:            false,
    url:                 'https://scryfall.com',
    trustLevel:          'high',
    status:              'enabled',
    defaultStrategy:     'overwrite_when_matched',
    defaultDecisionMode: 'batch_review',
    majorFieldGroups:    ['print_metadata', 'image', 'external_id', 'legality'],
    notes:               [
      'Low-risk image and external ID fields can use auto apply when the current value is empty.',
      'Oracle-like text remains review gated.',
    ],
  },
  {
    sourceId:            'magic/mtgch',
    name:                'MTGCH',
    summary:             'Chinese localization source',
    role:                'Simplified Chinese card names, type lines, rules text, and localized print surfaces',
    official:            false,
    url:                 'https://mtgch.com',
    trustLevel:          'medium',
    status:              'enabled',
    defaultStrategy:     'overwrite_when_matched',
    defaultDecisionMode: 'batch_review',
    majorFieldGroups:    ['localization', 'print_display'],
    notes:               [
      'Chinese names are never used as fuzzy match keys.',
      'Localization updates stay separate from oracle-level fields.',
    ],
  },
  {
    sourceId:            'magic/mtgjson',
    name:                'MTGJSON',
    summary:             'Bulk reconciliation source',
    role:                'Bulk JSON snapshots, reconciliation, backfill candidates, and diagnostics',
    official:            false,
    url:                 'https://mtgjson.com',
    trustLevel:          'medium',
    status:              'reconcile_only',
    defaultStrategy:     'ignore',
    defaultDecisionMode: 'manual_review',
    majorFieldGroups:    ['print_metadata', 'external_id', 'legality'],
    notes:               [
      'P0 keeps this source in reconciliation mode by default.',
      'Any write path must be opened by an explicit field allowlist.',
    ],
  },
];

export const magicImportEntities: ImportEntity[] = [
  {
    entityType: 'card',
    label:      'Card',
    targetKey:  ['cardId'],
    matchKeys:  ['cardId', 'scryfallOracleId'],
  },
  {
    entityType: 'cardLocalization',
    label:      'Card localization',
    targetKey:  ['cardId', 'locale'],
    matchKeys:  ['cardId', 'locale'],
  },
  {
    entityType: 'cardPart',
    label:      'Card part',
    targetKey:  ['cardId', 'partIndex'],
    matchKeys:  ['cardId', 'partIndex'],
  },
  {
    entityType: 'cardPartLocalization',
    label:      'Card part localization',
    targetKey:  ['cardId', 'partIndex', 'locale'],
    matchKeys:  ['cardId', 'partIndex', 'locale'],
  },
  {
    entityType: 'print',
    label:      'Print',
    targetKey:  ['cardId', 'lang', 'set', 'number'],
    matchKeys:  ['cardId', 'lang', 'set', 'number', 'scryfallCardId', 'multiverseId'],
  },
  {
    entityType: 'printPart',
    label:      'Print part',
    targetKey:  ['cardId', 'partIndex', 'lang', 'set', 'number'],
    matchKeys:  ['cardId', 'partIndex', 'lang', 'set', 'number'],
  },
];

export const magicImportFields: ImportField[] = [
  field('card', 'partCount', 'Part count', 'structure', 'medium'),
  field('card', 'name', 'Oracle name', 'oracle', 'high'),
  field('card', 'typeline', 'Oracle type line', 'oracle', 'high'),
  field('card', 'text', 'Oracle text', 'oracle', 'high'),
  field('card', 'manaValue', 'Mana value', 'gameplay', 'medium'),
  field('card', 'colorIdentity', 'Color identity', 'gameplay', 'medium'),
  field('card', 'keywords', 'Keywords', 'gameplay', 'medium'),
  field('card', 'counters', 'Counters', 'gameplay', 'medium'),
  field('card', 'producibleMana', 'Producible mana', 'gameplay', 'medium', { nullable: true }),
  field('card', 'contentWarning', 'Content warning', 'classification', 'low', { nullable: true }),
  field('card', 'category', 'Category', 'classification', 'medium'),
  field('card', 'tags', 'Tags', 'classification', 'medium'),
  field('card', 'legalities.{format}', 'Legality by format', 'legality', 'medium', { placeholder: true }),
  field('card', 'scryfallOracleId', 'Scryfall oracle ID', 'external_id', 'low'),
  field('cardLocalization', 'name', 'Localized name', 'localization', 'medium'),
  field('cardLocalization', 'typeline', 'Localized type line', 'localization', 'medium'),
  field('cardLocalization', 'text', 'Localized text', 'localization', 'medium'),
  field('cardPart', 'name', 'Part name', 'oracle', 'high'),
  field('cardPart', 'typeline', 'Part type line', 'oracle', 'high'),
  field('cardPart', 'text', 'Part text', 'oracle', 'high'),
  field('cardPart', 'cost', 'Part cost', 'gameplay', 'medium', { nullable: true }),
  field('cardPart', 'manaValue', 'Part mana value', 'gameplay', 'medium', { nullable: true }),
  field('cardPart', 'color', 'Part color', 'gameplay', 'medium', { nullable: true }),
  field('cardPart', 'colorIndicator', 'Color indicator', 'gameplay', 'medium', { nullable: true }),
  field('cardPart', 'typeSuper', 'Supertypes', 'gameplay', 'medium', { nullable: true }),
  field('cardPart', 'typeMain', 'Main types', 'gameplay', 'medium'),
  field('cardPart', 'typeSub', 'Subtypes', 'gameplay', 'medium', { nullable: true }),
  field('cardPart', 'power', 'Power', 'gameplay', 'medium', { nullable: true }),
  field('cardPart', 'toughness', 'Toughness', 'gameplay', 'medium', { nullable: true }),
  field('cardPart', 'loyalty', 'Loyalty', 'gameplay', 'medium', { nullable: true }),
  field('cardPart', 'defense', 'Defense', 'gameplay', 'medium', { nullable: true }),
  field('cardPart', 'handModifier', 'Hand modifier', 'gameplay', 'medium', { nullable: true }),
  field('cardPart', 'lifeModifier', 'Life modifier', 'gameplay', 'medium', { nullable: true }),
  field('cardPartLocalization', 'name', 'Localized part name', 'localization', 'medium'),
  field('cardPartLocalization', 'typeline', 'Localized part type line', 'localization', 'medium'),
  field('cardPartLocalization', 'text', 'Localized part text', 'localization', 'medium'),
  field('print', 'name', 'Print name', 'print_display', 'high'),
  field('print', 'typeline', 'Print type line', 'print_display', 'high'),
  field('print', 'text', 'Print text', 'print_display', 'high'),
  field('print', 'layout', 'Layout', 'print_metadata', 'medium'),
  field('print', 'frame', 'Frame', 'print_metadata', 'medium'),
  field('print', 'frameEffects', 'Frame effects', 'print_metadata', 'medium'),
  field('print', 'borderColor', 'Border color', 'print_metadata', 'medium'),
  field('print', 'cardBack', 'Card back', 'print_metadata', 'low', { nullable: true }),
  field('print', 'securityStamp', 'Security stamp', 'print_metadata', 'low', { nullable: true }),
  field('print', 'promoTypes', 'Promo types', 'print_metadata', 'low', { nullable: true }),
  field('print', 'rarity', 'Rarity', 'print_metadata', 'medium'),
  field('print', 'releaseDate', 'Release date', 'print_metadata', 'medium'),
  field('print', 'isDigital', 'Digital flag', 'print_metadata', 'high'),
  field('print', 'isPromo', 'Promo flag', 'print_metadata', 'high'),
  field('print', 'isReprint', 'Reprint flag', 'print_metadata', 'high'),
  field('print', 'finishes', 'Finishes', 'print_metadata', 'medium'),
  field('print', 'hasHighResImage', 'High resolution image flag', 'image', 'low'),
  field('print', 'imageStatus', 'Image status', 'image', 'low'),
  field('print', 'fullImageType', 'Full image type', 'image', 'low'),
  field('print', 'inBooster', 'In booster flag', 'print_metadata', 'high'),
  field('print', 'games', 'Games', 'print_metadata', 'medium'),
  field('print', 'previewDate', 'Preview date', 'print_metadata', 'low', { nullable: true }),
  field('print', 'previewSource', 'Preview source', 'print_metadata', 'low', { nullable: true }),
  field('print', 'previewUri', 'Preview URI', 'print_metadata', 'low', { nullable: true }),
  field('print', 'printTags', 'Print tags', 'classification', 'medium'),
  field('print', 'scryfallOracleId', 'Print Scryfall oracle ID', 'external_id', 'low'),
  field('print', 'scryfallCardId', 'Scryfall card ID', 'external_id', 'low', { nullable: true }),
  field('print', 'scryfallFace', 'Scryfall face', 'external_id', 'low', { nullable: true }),
  field('print', 'scryfallImageUris.{kind}', 'Scryfall image URI by kind', 'image', 'low', { nullable: true, placeholder: true }),
  field('print', 'arenaId', 'Arena ID', 'external_id', 'low', { nullable: true }),
  field('print', 'mtgoId', 'MTGO ID', 'external_id', 'low', { nullable: true }),
  field('print', 'mtgoFoilId', 'MTGO foil ID', 'external_id', 'low', { nullable: true }),
  field('print', 'multiverseId', 'Multiverse ID', 'external_id', 'low'),
  field('print', 'tcgPlayerId', 'TCGplayer ID', 'external_id', 'low', { nullable: true }),
  field('print', 'cardMarketId', 'Cardmarket ID', 'external_id', 'low', { nullable: true }),
  field('printPart', 'name', 'Print part name', 'print_display', 'high'),
  field('printPart', 'typeline', 'Print part type line', 'print_display', 'high'),
  field('printPart', 'text', 'Print part text', 'print_display', 'high'),
  field('printPart', 'attractionLights', 'Attraction lights', 'print_metadata', 'medium', { nullable: true }),
  field('printPart', 'flavorName', 'Flavor name', 'art', 'low', { nullable: true }),
  field('printPart', 'flavorText', 'Flavor text', 'art', 'low', { nullable: true }),
  field('printPart', 'artist', 'Artist', 'art', 'low', { nullable: true }),
  field('printPart', 'watermark', 'Watermark', 'art', 'low', { nullable: true }),
  field('printPart', 'scryfallIllusId', 'Scryfall illustration ID', 'external_id', 'low', { nullable: true }),
];

export const magicImportFieldStateRules: z.infer<typeof importFieldStateRule>[] = [
  {
    state:           'provided',
    generatesChange: true,
    description:     'The normalized record provides a concrete field value.',
  },
  {
    state:           'explicit_null',
    generatesChange: true,
    description:     'The source explicitly declares the field as null and the field rule allows null handling.',
  },
  {
    state:           'not_provided',
    generatesChange: false,
    description:     'The source supports the field but this record did not provide it.',
  },
  {
    state:           'not_applicable',
    generatesChange: false,
    description:     'The field does not apply to this record shape.',
  },
  {
    state:           'parse_failed',
    generatesChange: false,
    description:     'The adapter failed to normalize the source value and must emit diagnostics instead of a change.',
  },
];

interface CoverageRule {
  coverage: ImportCoverageState;
  note: string;
  condition?: string;
}

function coverage(coverageState: ImportCoverageState, note: string, condition?: string): CoverageRule {
  return condition === undefined
    ? { coverage: coverageState, note }
    : { coverage: coverageState, note, condition };
}

function coverageFor(sourceId: ImportSourceId, importField: ImportField): CoverageRule {
  const { fieldPath, group } = importField;

  if (sourceId === 'magic/gatherer') {
    if (group === 'localization') {
      return coverage('unsupported', 'Gatherer is not a localization source.');
    }

    if (group === 'image') {
      return coverage('unsupported', 'P0 does not map Gatherer images into Scryfall image URI fields.');
    }

    if (group === 'external_id') {
      if (fieldPath === 'print.multiverseId') {
        return coverage('supported', 'Gatherer is authoritative for multiverse IDs.');
      }

      return coverage('unsupported', 'Gatherer does not emit this external ID family.');
    }

    if (group === 'oracle') {
      return coverage('supported', 'Official oracle and printed English semantics are available after strict matching.');
    }

    if (group === 'print_display' || group === 'print_metadata' || group === 'legality') {
      return coverage('conditional', 'Gatherer can provide this data only when the matched record exposes it.', 'matched by multiverseId');
    }

    return coverage('conditional', 'Gatherer values require source normalization before diffing.');
  }

  if (sourceId === 'magic/scryfall') {
    if (group === 'localization') {
      return coverage('unsupported', 'Scryfall is not the P0 source for localized target fields.');
    }

    if (group === 'art') {
      return coverage('supported', 'Scryfall supplies artist, flavor, watermark, and illustration metadata.');
    }

    return coverage('supported', 'Scryfall provides structured values for this field family.');
  }

  if (sourceId === 'magic/mtgch') {
    if (group === 'localization') {
      return coverage('supported', 'MTGCH is the P0 source for Simplified Chinese localization fields.');
    }

    if (group === 'print_display') {
      return coverage('conditional', 'MTGCH only provides localized print surfaces for records with Chinese data.', 'locale is zhs');
    }

    if (group === 'print_metadata' || group === 'art') {
      return coverage('conditional', 'MTGCH exposes selected localized print metadata.', 'locale is zhs');
    }

    return coverage('unsupported', 'MTGCH is not authoritative for this field family in P0.');
  }

  if (group === 'image') {
    return coverage('conditional', 'MTGJSON image fields are kept for reconciliation and diagnostics only.');
  }

  return coverage('conditional', 'MTGJSON can emit a bulk candidate, but P0 keeps it out of default writes.');
}

function policyFor(
  source: ImportSource,
  importField: ImportField,
  coverageRule: CoverageRule,
): SourceFieldPolicyView {
  const base = {
    sourceId:          source.sourceId,
    entityType:        importField.entityType,
    fieldPath:         importField.fieldPath,
    label:             importField.label,
    group:             importField.group,
    coverage:          coverageRule.coverage,
    coverageNote:      coverageRule.note,
    ...(coverageRule.condition === undefined ? {} : { coverageCondition: coverageRule.condition }),
    riskLevel:         importField.riskLevel,
    strategy:          'ignore' as ImportStrategy,
    decisionMode:      'manual_review' as ImportDecisionMode,
    batchGroupBy:      [] as string[],
    reasonCode:        'source_unsupported',
    allowExplicitNull: false,
    lockedPathAware:   true,
  };

  if (coverageRule.coverage === 'unsupported') {
    return base;
  }

  if (source.sourceId === 'magic/scryfall') {
    if (importField.group === 'image' || importField.group === 'external_id') {
      return {
        ...base,
        strategy:       'overwrite_when_matched',
        decisionMode:   'auto_apply',
        matcherSummary: 'Auto apply only when the target field is currently null or empty.',
        fallbackAction: 'manual_review',
        reasonCode:     `scryfall_${importField.group}_fill`,
      };
    }

    if (importField.riskLevel === 'high') {
      return {
        ...base,
        strategy:       'overwrite_when_matched',
        decisionMode:   'manual_review',
        matcherSummary: 'High-risk semantic fields require individual review.',
        fallbackAction: 'manual_review',
        reasonCode:     `scryfall_${importField.group}_semantic_review`,
      };
    }

    return {
      ...base,
      strategy:          'overwrite_when_matched',
      decisionMode:      'batch_review',
      matcherSummary:    'Batch only records with a unique target match.',
      fallbackAction:    'manual_review',
      batchGroupBy,
      reasonCode:        `scryfall_${importField.group}_batch`,
      allowExplicitNull: importField.nullable && importField.group === 'print_metadata',
    };
  }

  if (source.sourceId === 'magic/gatherer') {
    if (importField.fieldPath === 'print.multiverseId') {
      return {
        ...base,
        strategy:       'overwrite_when_matched',
        decisionMode:   'batch_review',
        matcherSummary: 'Batch when the record is uniquely matched and the target ID set is empty.',
        fallbackAction: 'manual_review',
        batchGroupBy,
        reasonCode:     'gatherer_multiverse_id',
      };
    }

    return {
      ...base,
      strategy:       'overwrite_when_matched',
      decisionMode:   'manual_review',
      matcherSummary: 'Official semantic fields are reviewed before application.',
      fallbackAction: 'manual_review',
      reasonCode:     `gatherer_${importField.group}_review`,
    };
  }

  if (source.sourceId === 'magic/mtgch') {
    return {
      ...base,
      strategy:       'overwrite_when_matched',
      decisionMode:   'batch_review',
      matcherSummary: 'Batch only records matched by stable print or card identity keys.',
      fallbackAction: 'manual_review',
      batchGroupBy,
      reasonCode:     `mtgch_${importField.group}_localization`,
    };
  }

  if (['print_metadata', 'external_id', 'legality', 'classification', 'art'].includes(importField.group)) {
    return {
      ...base,
      strategy:          'approval_required',
      decisionMode:      'manual_review',
      matcherSummary:    'MTGJSON is reconciliation-only unless a field allowlist explicitly opens review.',
      fallbackAction:    'ignore',
      reasonCode:        `mtgjson_${importField.group}_candidate`,
      allowExplicitNull: importField.nullable,
    };
  }

  return {
    ...base,
    strategy:       'ignore',
    decisionMode:   'manual_review',
    matcherSummary: 'MTGJSON is not a default write source for this field.',
    fallbackAction: 'ignore',
    reasonCode:     'mtgjson_reconcile_only',
  };
}

function buildPolicies(): SourceFieldPolicyView[] {
  return magicImportSources.flatMap(source => {
    return magicImportFields.map(importField => {
      return policyFor(source, importField, coverageFor(source.sourceId, importField));
    });
  });
}

function validateSnapshot(snapshot: unknown): ImportPolicySnapshot {
  const parsed = importPolicySnapshot.parse(snapshot);
  const fieldByPath = new Map(parsed.fields.map(importField => [importField.fieldPath, importField]));

  for (const policy of parsed.policies) {
    const importField = fieldByPath.get(policy.fieldPath);

    if (importField === undefined) {
      throw new Error(`Unregistered import field path: ${policy.fieldPath}`);
    }

    if (policy.coverage === 'unsupported' && policy.strategy !== 'ignore') {
      throw new Error(`Unsupported field cannot declare a write strategy: ${policy.sourceId} ${policy.fieldPath}`);
    }

    if (policy.decisionMode === 'auto_apply' && policy.riskLevel !== 'low') {
      throw new Error(`Auto apply is only allowed for low-risk fields: ${policy.sourceId} ${policy.fieldPath}`);
    }

    if (policy.allowExplicitNull && !importField.nullable) {
      throw new Error(`Explicit null is only allowed for nullable fields: ${policy.sourceId} ${policy.fieldPath}`);
    }
  }

  return parsed;
}

function compileSnapshot(): ImportPolicySnapshot {
  const policies = buildPolicies();
  const policyByKey = new Map(policies.map(policy => [`${policy.sourceId}:${policy.fieldPath}`, policy]));
  const fieldCoverageMatrix: ImportFieldCoverage[] = magicImportFields.map(importField => ({
    fieldPath:   importField.fieldPath,
    label:       importField.label,
    entityType:  importField.entityType,
    group:       importField.group,
    riskLevel:   importField.riskLevel,
    placeholder: importField.placeholder,
    sources:     magicImportSources.map(source => {
      const policy = policyByKey.get(`${source.sourceId}:${importField.fieldPath}`);

      if (policy === undefined) {
        throw new Error(`Missing policy for ${source.sourceId} ${importField.fieldPath}`);
      }

      return {
        sourceId:  source.sourceId,
        coverage:  policy.coverage,
        note:      policy.coverageNote,
        ...(policy.coverageCondition === undefined ? {} : { condition: policy.coverageCondition }),
      };
    }),
  }));

  return validateSnapshot({
    version:             'magic-import-p0',
    publishedAt:         '2026-04-18T00:00:00.000Z',
    sources:             magicImportSources,
    entities:            magicImportEntities,
    fields:              magicImportFields,
    fieldStates:         magicImportFieldStateRules,
    matcherOperators:    [...matcherOperators],
    fieldCoverageMatrix,
    policies,
    filterOptions:       {
      sourceIds:      [...sourceIds],
      entityTypes:    [...entityTypes],
      fieldGroups:    [...fieldGroups],
      coverageStates: [...coverageStates],
      decisionModes:  [...decisionModes],
      riskLevels:     [...riskLevels],
    },
    metadata: {
      generatedBy: 'repository-default-config',
      source:      'docs/magic-data-import-p0-design.md',
      summary:     'Published P0 snapshot for Magic source coverage, field registry, and import policy decisions.',
      totals:      {
        sources:      magicImportSources.length,
        fields:       magicImportFields.length,
        policies:     policies.length,
        autoApply:    policies.filter(policy => policy.decisionMode === 'auto_apply').length,
        batchReview:  policies.filter(policy => policy.decisionMode === 'batch_review').length,
        manualReview: policies.filter(policy => policy.decisionMode === 'manual_review').length,
      },
      validation: {
        fieldPathRegistry: 'Every policy fieldPath must exist in the P0 field registry.',
        matcher:           'Only structured matcher operators are allowed.',
        riskBoundary:      'Auto apply is limited to low-risk fields.',
        unsupportedPolicy: 'Unsupported source-field pairs must use ignore.',
        explicitNull:      'explicit_null can only generate changes for nullable fields with an allowing policy.',
      },
    },
    boundary: {
      dataTables: [
        { schema: 'magic_data', table: 'import_sources', role: 'Source configuration', authoritative: true },
        { schema: 'magic_data', table: 'import_rule_sets', role: 'Published rule sets', authoritative: true },
        { schema: 'magic_data', table: 'import_field_rules', role: 'Field-level policies', authoritative: true },
        { schema: 'magic_data', table: 'import_policy_snapshots', role: 'Published policy snapshots', authoritative: true },
        { schema: 'magic_data', table: 'import_runs', role: 'Import runs and diagnostics', authoritative: true },
        { schema: 'magic_data', table: 'import_raw_records', role: 'Raw source payloads', authoritative: true },
        { schema: 'magic_data', table: 'import_change_sets', role: 'Candidate change groups', authoritative: true },
        { schema: 'magic_data', table: 'import_field_changes', role: 'Candidate field changes', authoritative: true },
        { schema: 'magic_data', table: 'import_apply_logs', role: 'Apply and rollback logs', authoritative: true },
      ],
      appTables: [
        { schema: 'magic_app', table: 'import_review_actions', role: 'User review and override actions', authoritative: true },
      ],
      domainTables: [
        { schema: 'magic', table: 'cards', role: 'Card domain facts', authoritative: true },
        { schema: 'magic', table: 'card_localizations', role: 'Card localization facts', authoritative: true },
        { schema: 'magic', table: 'card_parts', role: 'Card part domain facts', authoritative: true },
        { schema: 'magic', table: 'card_part_localizations', role: 'Card part localization facts', authoritative: true },
        { schema: 'magic', table: 'prints', role: 'Print domain facts', authoritative: true },
        { schema: 'magic', table: 'print_parts', role: 'Print part domain facts', authoritative: true },
      ],
      derivedFields: [
        'import_change_sets.decisionStatus',
        'import_field_changes.decisionStatus',
        'import_change_sets.appliedAt',
        'import_field_changes.appliedAt',
      ],
      lockedPathPolicy: 'Fields listed in __lockedPaths can never auto apply and require review override handling.',
      updationPolicy:   'The new import pipeline never writes new candidates into __updations.',
    },
    p1Inputs: {
      tables: [
        {
          schema:         'magic_data',
          table:          'import_sources',
          purpose:        'Store source IDs, source roles, default strategies, default decision modes, and trust levels.',
          requiredFields: ['sourceId', 'name', 'status', 'defaultStrategy', 'defaultDecisionMode', 'trustLevel'],
        },
        {
          schema:         'magic_data',
          table:          'import_rule_sets',
          purpose:        'Version published policy configurations.',
          requiredFields: ['id', 'version', 'status', 'publishedAt', 'publishedBy'],
        },
        {
          schema:         'magic_data',
          table:          'import_field_rules',
          purpose:        'Store source-field strategy, matcher, fallback, batch grouping, and explicit null settings.',
          requiredFields: ['ruleSetId', 'sourceId', 'fieldPath', 'strategy', 'decisionMode', 'riskLevel'],
        },
        {
          schema:         'magic_data',
          table:          'import_policy_snapshots',
          purpose:        'Store compiled read-only snapshots served to the console.',
          requiredFields: ['version', 'publishedAt', 'contentHash', 'snapshot'],
        },
        {
          schema:         'magic_data',
          table:          'import_runs',
          purpose:        'Track import batches, source diagnostics, and field-state statistics.',
          requiredFields: ['id', 'sourceId', 'status', 'startedAt', 'completedAt', 'diagnostics'],
        },
        {
          schema:         'magic_data',
          table:          'import_raw_records',
          purpose:        'Persist raw and normalized source records with storage mode fields reserved.',
          requiredFields: ['id', 'importRunId', 'sourceRecordKey', 'targetEntityType', 'targetKey', 'payloadHash'],
        },
        {
          schema:         'magic_data',
          table:          'import_change_sets',
          purpose:        'Group candidate field changes by matched target entity.',
          requiredFields: ['id', 'importRunId', 'targetEntityType', 'targetKey', 'decisionStatus'],
        },
        {
          schema:         'magic_data',
          table:          'import_field_changes',
          purpose:        'Store candidate field-level changes and value references.',
          requiredFields: ['id', 'changeSetId', 'fieldPath', 'beforeValueHash', 'afterValueHash', 'decisionStatus'],
        },
        {
          schema:         'magic_app',
          table:          'import_review_actions',
          purpose:        'Persist user review and override actions such as approve, reject, ignore, and override.',
          requiredFields: ['id', 'fieldChangeId', 'action', 'reviewerId', 'createdAt'],
        },
        {
          schema:         'magic_data',
          table:          'import_apply_logs',
          purpose:        'Persist applied writes and rollback records.',
          requiredFields: ['id', 'fieldChangeId', 'action', 'appliedAt', 'beforeValueHash', 'afterValueHash'],
        },
      ],
      reservedStorageFields: [
        'beforeValueStorageMode',
        'afterValueStorageMode',
        'beforeValueHash',
        'afterValueHash',
        'beforeValueRef',
        'afterValueRef',
      ],
    },
  });
}

export const magicImportPolicySnapshot = compileSnapshot();
