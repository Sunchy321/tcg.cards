import canonicalize from 'canonicalize';

import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

import { and, eq, inArray, SQL, sql } from 'drizzle-orm';

import { db } from '@tcg-cards/db/db';
import { RENDER_MECHANIC_IDS } from '@tcg-cards/model/src/hearthstone/constant/tag';
import { renderModel as renderModelSchema, type RenderModel } from '@tcg-cards/model/src/hearthstone/schema/entity';
import { mainLocale, type Rarity, rarity as raritySchema, type Types, types as typeSchema } from '@tcg-cards/model/src/hearthstone/schema/basic';
import {
  BaseCard,
  BaseEntity,
  BaseEntityLocalization,
  BaseEntityRelation,
  Card,
  Entity,
  EntityLocalization,
  EntityRelation,
  RawEntitySnapshot,
  RawEntitySnapshotTag,
  Set as HearthstoneSet,
  SourceVersion,
  Tag,
} from '@tcg-cards/db/schema/local/hearthstone';
import type { HsdataProjectReconciledCounts, HsdataProjectWriteBreakdown } from './hsdata-progress';
import { getLocalDb } from './hsdata-local-db';
import { createHsdataProfiler } from './hsdata-profile';

type DbTx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type JsonMap = Record<string, unknown>;
type LocalizedText = Record<string, string>;
type MechanicValue = boolean | number;
type RowKey = string;

interface SourceVersionRow {
  sourceTag: number;
  build:     number | null;
  status:    string;
}

interface RawSnapshotRow {
  id:               string;
  cardId:           string;
  dbfId:            number;
  sourceTags:       number[];
  entityXmlVersion: number;
  snapshotHash:     string;
  extraPayload:     JsonMap;
}

interface RawSnapshotTagRow {
  snapshotId:     string;
  enumId:         number;
  tagOrder:       number;
  rawName:        string;
  rawType:        string;
  rawPayload:     JsonMap;
  valueKind:      string;
  boolValue:      boolean | null;
  intValue:       number | null;
  stringValue:    string | null;
  enumValue:      string | null;
  locStringValue: LocalizedText | null;
  cardRefCardId:  string | null;
  cardRefDbfId:   number | null;
  jsonValue:      unknown;
  parseStatus:    string;
}

interface TagRow {
  enumId:            number;
  slug:              string;
  valueKind:         string;
  normalizeKind:     string;
  normalizeConfig:   JsonMap;
  projectTargetType: string | null;
  projectTargetPath: string | null;
  projectKind:       string | null;
  projectConfig:     JsonMap;
}

interface CardRefValue {
  cardId: string | null;
  dbfId:  number | null;
}

type NormalizedValue
  = | boolean
    | number
    | string
    | string[]
    | LocalizedText
    | CardRefValue
    | JsonMap
    | null;

interface EntityRow {
  cardId:            string;
  version:           number[];
  revisionHash:      string;
  dbfId:             number;
  legacyPayload:     JsonMap;
  set:               string;
  classes:           string[];
  type:              string;
  cost:              number;
  attack:            number | null;
  health:            number | null;
  durability:        number | null;
  armor:             number | null;
  rune:              string[] | null;
  race:              string[] | null;
  spellSchool:       string | null;
  questType:         string | null;
  questProgress:     number | null;
  questPart:         number | null;
  heroPower:         string | null;
  techLevel:         number | null;
  inBobsTavern:      boolean;
  tripleCard:        string | null;
  raceBucket:        string | null;
  armorBucket:       number | null;
  buddy:             string | null;
  bannedRace:        string | null;
  mercenaryRole:     string | null;
  mercenaryFaction:  string | null;
  colddown:          number | null;
  collectible:       boolean;
  elite:             boolean;
  rarity:            string | null;
  artist:            string;
  overrideWatermark: string | null;
  faction:           string | null;
  mechanics:         Record<string, MechanicValue>;
  referencedTags:    Record<string, MechanicValue>;
  textBuilderType:   string;
  changeType:        string;
  isLatest:          boolean;
}

interface LocalizationRow {
  cardId:           string;
  version:          number[];
  lang:             string;
  revisionHash:     string;
  localizationHash: string;
  renderHash:       string | null;
  renderModel:      RenderModel | null;
  isLatest:         boolean;
  name:             string;
  text:             string;
  richText:         string;
  displayText:      string;
  targetText:       string | null;
  textInPlay:       string | null;
  howToEarn:        string | null;
  howToEarnGolden:  string | null;
  flavorText:       string | null;
  locChangeType:    string;
}

interface RelationRow {
  sourceId:           string;
  sourceRevisionHash: string;
  relation:           string;
  targetId:           string;
  version:            number[];
  isLatest:           boolean;
}

interface LocalizationDraft {
  name:            string;
  richText:        string;
  targetText:      string | null;
  textInPlay:      string | null;
  howToEarn:       string | null;
  howToEarnGolden: string | null;
  flavorText:      string | null;
  locChangeType:   string;
}

interface ProjectionContext {
  slugByEnumId:  Map<number, string>;
  cardIdByDbfId: Map<number, string>;
  setIdByDbfId:  Map<number, string>;
}

interface ProjectedSnapshot {
  snapshotId:          string;
  entity:              LocalizationlessEntityRow;
  localizations:       LocalizationRow[];
  relations:           RelationRow[];
  unprojectedTagCount: number;
}

type LocalizationlessEntityRow = Omit<EntityRow, 'version' | 'isLatest'>;
type LocalizationlessLocalizationRow = Omit<LocalizationRow, 'version' | 'isLatest'>;
type EntityStateRow = Pick<EntityRow, 'cardId' | 'version' | 'revisionHash' | 'isLatest'>;
type LocalizationStateRow = Pick<LocalizationRow, 'cardId' | 'version' | 'lang' | 'revisionHash' | 'localizationHash' | 'renderHash' | 'isLatest'> & { renderModel?: RenderModel | null };
type CopyCapableClient = {
  unsafe(query: string): {
    writable(): Promise<NodeJS.WritableStream>;
  };
};
type CopyTx = DbTx & { session: { client: CopyCapableClient } };

interface ReconcileResult<T extends { version: number[], isLatest: boolean }> {
  finalRows: T[];
  syncPlan:  SyncPlan<T>;
  changed:   boolean;
  inserted:  number;
  reused:    number;
  updated:   number;
}

/** Write-plan rows that must be deleted or upserted after reconciliation. */
interface SyncPlan<T extends { version: number[], isLatest: boolean }> {
  deleteRows: T[];
  upsertRows: T[];
  inserted:  number;
  updated:   number;
  deleted:   number;
}

/** Reconciliation hooks that derive row identity groups and lightweight change signatures. */
interface ReconcileOptions<T extends { version: number[], isLatest: boolean }> {
  build:            number;
  skipLatestUpdate: boolean;
  keyOf:            (row: T) => RowKey;
  groupKey:         (row: T) => string;
  stateOf:          (row: T) => string;
  globalLatest:     number;
}

/** Local write profiler injected into projection helpers for sub-step timing. */
interface ProjectWriteProfiler {
  mark(step: string, extra?: Record<string, boolean | number | string | null | undefined>): void;
}

/** Tracks completed row counts for each stacked write-progress segment. */
interface WriteProgressBreakdown {
  entity:               number;
  localization:         number;
  latest:               number;
  relation:             number;
  card:                 number;
  entityDelete:         number;
  localizationDelete:   number;
  relationDelete:       number;
}

/** Identifies one stacked write-progress segment. */
type WriteProgressSegment = keyof WriteProgressBreakdown;

/** One write-progress update emitted while the transaction advances through row-based work. */
interface WriteProgressUpdate {
  message: string;
  advance?: number;
  segment?: WriteProgressSegment;
}

/** Callback that advances one write-progress bar as major SQL operations finish. */
type WriteProgressReporter = (update: WriteProgressUpdate) => Promise<void>;

/** Callback that advances summarize progress while shared rows load and reconcile work proceeds. */
type SummarizeProgressReporter = (message: string, advance?: number) => Promise<void>;

/** Counts entity rows split by the write path they will take inside the current transaction. */
interface EntityWriteBreakdown {
  deleteCount: number;
  metaCount: number;
  insertCount: number;
}

/** Counts localization rows split by the write path they will take inside the current transaction. */
interface LocalizationWriteBreakdown {
  deleteCount: number;
  metaCount: number;
  appendCount: number;
  insertCount: number;
  upsertCount: number;
  affectedLatestRowCount: number;
  latestRowCountByGroup: Map<RowKey, number>;
}

export interface ProjectHsdataInput {
  sourceTag: number;
  dryRun?:   boolean;
  force?:    boolean;
  skipLatestUpdate?: boolean;
  sampleDiff?: boolean;
  onProfileMark?: (step: { step: string; elapsedMs: number; totalMs: number }) => void;
  onProgress?: (input: {
    phase: 'loading_snapshots' | 'loading_tags' | 'projecting_snapshots' | 'summarizing_changes' | 'writing_rows' | 'completed' | 'failed';
    message: string;
    totalSnapshotCount?: number | null;
    completedSnapshotCount?: number | null;
    totalWorkCount?: number | null;
    completedWorkCount?: number | null;
    workLabel?: string | null;
    writeBreakdown?: HsdataProjectWriteBreakdown | null;
    reconciledCounts?: HsdataProjectReconciledCounts | null;
  }) => void | Promise<void>;
}

/** Reasons a row entered the upsert plan after merge simulation. */
export interface DiffBreakdown {
  versionMatch: number;
  versionChanged: number;
  isLatestChanged: number;
  /** Existing rows without matching target, whose version changed (build removed). */
  orphanVersionChanged: number;
  /** Only used for localizations. */
  renderHashChanged?: number;
  renderHashNullExisting?: number;
}

interface WritePlanCounts {
  upsert: number;
  delete: number;
}

export interface ProjectHsdataReport {
  dryRun:                boolean;
  skipped:               boolean;
  sourceTag:             number;
  build:                 number;
  snapshotCount:         number;
  totalSnapshotCount:    number;
  skippedSnapshotCount:  number;
  insertedEntities:      number;
  reusedEntities:        number;
  updatedEntities:       number;
  insertedLocalizations: number;
  reusedLocalizations:   number;
  updatedLocalizations:  number;
  insertedRelations:     number;
  reusedRelations:       number;
  updatedRelations:      number;
  cardRowCount:          number;
  unprojectedTagCount:   number;
  /** Sync plan: how many rows would be written (upserted/deleted). */
  entityPlan:        WritePlanCounts;
  localizationPlan:  WritePlanCounts;
  relationPlan:      WritePlanCounts;
  /** Per-field diff for entities (revisionHash/version/isLatest after merge). */
  entityDiff:        DiffBreakdown;
  /** Per-field diff for localizations (includes renderHash after merge). */
  localizationDiff:  DiffBreakdown;
  /** Per-field diff for relations after merge. */
  relationDiff:      DiffBreakdown;
  /** Absolute path to the diff sample JSON file, if sampleDiff was enabled. */
  sampleDiffPath:    string | null;
}

const strongRelationFields = [
  'heroPower',
  'buddy',
  'tripleCard',
] as const;

const weakRelationFields = ['heroicHeroPower'] as const;

const renderMechanicKeys: Set<string> = new Set(RENDER_MECHANIC_IDS);

const typeValues = new Set(typeSchema.options);
const rarityValues = new Set(raritySchema.options);

const typeAliases: Record<string, string> = {
  invalid:                   'null',
  heropower:                 'hero_power',
  lettuce_ability:           'mercenary_ability',
  battleground_buddy_meter:  'buddy_meter',
  battleground_quest_reward: 'quest_reward',
  battleground_spell:        'tavern_spell',
  bacon_anomaly:             'anomaly',
  bacon_trinket:             'trinket',
};

const typeByInt: Record<number, string> = {
  0:  'null',
  1:  'game',
  2:  'player',
  3:  'hero',
  4:  'minion',
  5:  'spell',
  6:  'enchantment',
  7:  'weapon',
  8:  'item',
  9:  'token',
  10: 'hero_power',
  11: 'blank',
  12: 'game_mode_button',
  13: 'move_minion_hover_target',
  14: 'mercenary_ability',
  15: 'buddy_meter',
  16: 'location',
  17: 'quest_reward',
  18: 'tavern_spell',
  19: 'anomaly',
  20: 'trinket',
  21: 'pet',
};

const rarityAliases: Record<string, string> = {
  invalid: 'unknown',
};

const rarityByInt: Record<number, string> = {
  0: 'unknown',
  1: 'common',
  2: 'free',
  3: 'rare',
  4: 'epic',
  5: 'legendary',
};

const localeMap: Record<string, string> = {
  deDE: 'de',
  enGB: 'en',
  enUS: 'en',
  esES: 'es',
  esMX: 'mx',
  frFR: 'fr',
  itIT: 'it',
  jaJP: 'ja',
  koKR: 'ko',
  plPL: 'pl',
  ptBR: 'pt',
  ruRU: 'ru',
  thTH: 'th',
  zhCN: 'zhs',
  zhHK: 'zht',
  zhSG: 'zhs',
  zhTW: 'zht',
};

function hashCanonicalJson(value: unknown): string {
  return Bun.SHA256.hash(canonicalize(value)!, 'hex') as string;
}

function chunkValues<T>(values: T[], size = 1000): T[][] {
  if (values.length <= size) {
    return [values];
  }

  const chunks: T[][] = [];

  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }

  return chunks;
}

function mergeVersion(...inputs: Array<number[] | number>): number[] {
  const values = inputs.flatMap(value => Array.isArray(value) ? value : [value]);
  return [...new Set(values)].sort((left, right) => left - right);
}

const writeRowBatchSize = 5_000;
const projectProgressBatchSize = 25;
const summarizeProgressBatchSize = 5_000;

/** Checks whether one reconciled version array only appends the current build to an existing sorted history. */
function isAppendBuildVersion(
  existingVersion: number[],
  nextVersion: number[],
  build: number,
): boolean {
  if (existingVersion.includes(build)) {
    return false;
  }

  if (nextVersion.length !== existingVersion.length + 1) {
    return false;
  }

  if (nextVersion[nextVersion.length - 1] !== build) {
    return false;
  }

  for (let index = 0; index < existingVersion.length; index += 1) {
    if (existingVersion[index] !== nextVersion[index]) {
      return false;
    }
  }

  return true;
}

/** Splits one localization sync plan into delete/replace/append/insert buckets before the transaction starts. */
function buildLocalizationWriteBreakdown(
  plan: SyncPlan<LocalizationStateRow>,
  finalRows: LocalizationStateRow[],
  existingRowsByKey: Map<RowKey, LocalizationStateRow>,
  build: number,
): LocalizationWriteBreakdown {
  let metaCount = 0;
  let appendCount = 0;
  let insertCount = 0;

  for (const row of plan.upsertRows) {
    const existing = existingRowsByKey.get(localizationKey(row));

    if (existing == null) {
      insertCount += 1;
      continue;
    }

    if (isAppendBuildVersion(existing.version, row.version, build)) {
      appendCount += 1;
      continue;
    }

    metaCount += 1;
  }

  const affectedGroupKeys = new Set(
    [...plan.deleteRows, ...plan.upsertRows].map(row => localizationGroupKey(row)),
  );
  const latestRowCountByGroup = new Map<RowKey, number>();

  for (const row of finalRows) {
    const groupKey = localizationGroupKey(row);

    if (!affectedGroupKeys.has(groupKey)) {
      continue;
    }

    latestRowCountByGroup.set(groupKey, (latestRowCountByGroup.get(groupKey) ?? 0) + 1);
  }

  const affectedLatestRowCount = [...latestRowCountByGroup.values()]
    .reduce((count, rowCount) => count + rowCount, 0);

  return {
    deleteCount: plan.deleteRows.length,
    metaCount,
    appendCount,
    insertCount,
    upsertCount: plan.upsertRows.length,
    affectedLatestRowCount,
    latestRowCountByGroup,
  };
}

/** Splits one entity sync plan into delete/update/insert buckets before the transaction starts. */
function buildEntityWriteBreakdown(
  plan: SyncPlan<EntityStateRow>,
  existingRowsByKey: Map<RowKey, EntityStateRow>,
): EntityWriteBreakdown {
  let metaCount = 0;
  let insertCount = 0;

  for (const row of plan.upsertRows) {
    if (existingRowsByKey.has(entityKey(row))) {
      metaCount += 1;
      continue;
    }

    insertCount += 1;
  }

  return {
    deleteCount: plan.deleteRows.length,
    metaCount,
    insertCount,
  };
}

/** Counts entity rows that should advance the write-progress UI. */
function countEntityWriteRows(breakdown: EntityWriteBreakdown): number {
  return breakdown.deleteCount + breakdown.metaCount + breakdown.insertCount;
}

/** Counts localization rows that should advance the write-progress UI. */
function countLocalizationWriteRows(breakdown: LocalizationWriteBreakdown): number {
  return (
    breakdown.deleteCount
    + breakdown.upsertCount
    + breakdown.affectedLatestRowCount
  );
}

/** Counts duplicate-safe rows when the write path only inserts missing rows. */
function countIgnoreDuplicateWriteRows(input: {
  entityCount: number;
  localizationCount: number;
  relationCount: number;
}): number {
  return input.entityCount + input.localizationCount + input.relationCount;
}

/** Builds stacked write-progress totals for entity, localization, latest, and relation work. */
function buildWriteProgressTotals(input: {
  ignoreDuplicates: boolean;
  skipLatestUpdate: boolean;
  entity: EntityWriteBreakdown;
  localization: LocalizationWriteBreakdown;
  relationDeleteCount: number;
  relationInsertCount: number;
  targetEntityCount: number;
  targetLocalizationCount: number;
  targetRelationCount: number;
  targetCardCount: number;
}): WriteProgressBreakdown {
  if (input.ignoreDuplicates) {
    return {
      entity:             input.targetEntityCount,
      localization:       input.targetLocalizationCount,
      latest:             0,
      relation:           input.targetRelationCount,
      card:               input.targetCardCount,
      entityDelete:       0,
      localizationDelete: 0,
      relationDelete:     0,
    };
  }

  return {
    entity:             input.entity.metaCount + input.entity.insertCount,
    localization:       input.localization.upsertCount,
    latest:             input.skipLatestUpdate ? 0 : input.localization.affectedLatestRowCount,
    relation:           input.relationInsertCount,
    card:               input.targetCardCount,
    entityDelete:       input.entity.deleteCount,
    localizationDelete: input.localization.deleteCount,
    relationDelete:     input.relationDeleteCount,
  };
}

/** Converts internal write-progress counts into the frontend stacked progress payload. */
function toWriteProgressBreakdown(
  totals: WriteProgressBreakdown,
  completed: WriteProgressBreakdown,
): HsdataProjectWriteBreakdown {
  return {
    entity: {
      totalRowCount: totals.entity,
      completedRowCount: completed.entity,
    },
    localization: {
      totalRowCount: totals.localization,
      completedRowCount: completed.localization,
    },
    latest: {
      totalRowCount: totals.latest,
      completedRowCount: completed.latest,
    },
    relation: {
      totalRowCount: totals.relation,
      completedRowCount: completed.relation,
    },
    card: {
      totalRowCount: totals.card,
      completedRowCount: completed.card,
    },
    entityDelete: {
      totalRowCount: totals.entityDelete,
      completedRowCount: completed.entityDelete,
    },
    localizationDelete: {
      totalRowCount: totals.localizationDelete,
      completedRowCount: completed.localizationDelete,
    },
    relationDelete: {
      totalRowCount: totals.relationDelete,
      completedRowCount: completed.relationDelete,
    },
  };
}

function normalizeLocaleKey(raw: string, override?: Record<string, string>): string | null {
  const mapped = override?.[raw] ?? localeMap[raw] ?? raw;
  return mainLocale.options.includes(mapped as typeof mainLocale.options[number]) ? mapped : null;
}

function asJsonMap(value: unknown): JsonMap {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  return value as JsonMap;
}

function asStringRecord(value: unknown): Record<string, string> {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => typeof item === 'string'),
  ) as Record<string, string>;
}

function asNumberArray(value: unknown): number[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(item => Number.isSafeInteger(item)) as number[];
}

function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter(item => typeof item === 'string');
  }

  return typeof value === 'string' ? [value] : [];
}

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    if (seen.has(value)) {
      continue;
    }

    seen.add(value);
    result.push(value);
  }

  return result;
}

/** Yields control to the event loop so streamed progress updates can flush during CPU-heavy loops. */
async function yieldProgressEventLoop(): Promise<void> {
  await new Promise<void>(resolve => setTimeout(resolve, 0));
}

function cleanNullValue<T>(value: T, config: JsonMap): T | null {
  const nullValues = (config.nullValues ?? []) as unknown[];
  return nullValues.some(item => item === value) ? null : value;
}

function normalizeEnumToken(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function resolveKnownEnumTarget(tag: TagRow | undefined): 'type' | 'rarity' | null {
  const targetPath = tag?.projectTargetPath ? normalizeTargetPath(tag.projectTargetPath) : null;

  if (targetPath === 'type' || targetPath === 'rarity') {
    return targetPath;
  }

  if (tag?.slug === 'card_type') {
    return 'type';
  }

  if (tag?.slug === 'rarity') {
    return 'rarity';
  }

  return null;
}

function normalizeKnownEnumValue(
  target: 'type' | 'rarity',
  value: string | number | null,
): string | null {
  if (value == null) {
    return null;
  }

  if (typeof value === 'number') {
    return target === 'type'
      ? typeByInt[value] ?? null
      : rarityByInt[value] ?? null;
  }

  const token = normalizeEnumToken(value);

  if (target === 'type') {
    if (typeValues.has(token as Types)) {
      return token;
    }

    return typeAliases[token] ?? null;
  }

  if (rarityValues.has(token as Rarity)) {
    return token;
  }

  return rarityAliases[token] ?? null;
}

function normalizeProjectedEnumValue(
  path: string,
  value: string | number | null,
): string | null {
  if (path !== 'type' && path !== 'rarity') {
    return typeof value === 'string' ? value : null;
  }

  return normalizeKnownEnumValue(path, value);
}

function normalizeScalarValue(row: RawSnapshotTagRow): NormalizedValue {
  if (row.boolValue != null) return row.boolValue;
  if (row.intValue != null) return row.intValue;
  if (row.stringValue != null) return row.stringValue;
  if (row.locStringValue != null) return row.locStringValue;
  if (row.cardRefCardId != null || row.cardRefDbfId != null) {
    return {
      cardId: row.cardRefCardId,
      dbfId:  row.cardRefDbfId,
    };
  }

  return row.jsonValue == null ? null : asJsonMap(row.jsonValue);
}

function usesSetEnumRule(tag: TagRow | undefined): boolean {
  return tag?.normalizeKind === 'enum_from_int'
    && tag.normalizeConfig.enumMap === 'set';
}

function assertResolvedSetId(
  snapshot: RawSnapshotRow,
  row: RawSnapshotTagRow,
  normalized: NormalizedValue,
) {
  if (typeof normalized === 'string' && normalized.length > 0) {
    return;
  }

  const rawValue = row.intValue ?? row.stringValue ?? row.jsonValue ?? row.rawPayload;
  throw new Error(
    `[hearthstone][hsdata-project] unresolved setId for card ${snapshot.cardId} (${snapshot.dbfId}) from set dbfId ${String(rawValue)}`,
  );
}

function normalizeTagValue(
  row: RawSnapshotTagRow,
  tag: TagRow | undefined,
  context: ProjectionContext,
): NormalizedValue {
  const normalizeKind = tag?.normalizeKind ?? 'identity';
  const normalizeConfig = tag?.normalizeConfig ?? {};
  const trueValues = asNumberArray(normalizeConfig.trueValues);
  const falseValues = asNumberArray(normalizeConfig.falseValues);
  const enumMap = asJsonMap(normalizeConfig.enumMap);

  if (normalizeKind === 'identity' || normalizeKind === '') {
    return normalizeScalarValue(row);
  }

  if (normalizeKind === 'identity_int') {
    return row.intValue;
  }

  if (normalizeKind === 'identity_string') {
    return row.stringValue;
  }

  if (normalizeKind === 'identity_loc_string') {
    return row.locStringValue;
  }

  if (normalizeKind === 'identity_card_ref') {
    return row.cardRefCardId == null && row.cardRefDbfId == null
      ? null
      : {
        cardId: row.cardRefCardId,
        dbfId:  row.cardRefDbfId,
      };
  }

  if (normalizeKind === 'bool_from_int') {
    const value = row.intValue;

    if (value == null) {
      return row.boolValue;
    }

    if (trueValues.length > 0 || falseValues.length > 0) {
      if (trueValues.includes(value)) return true;
      if (falseValues.includes(value)) return false;
      return null;
    }

    if (value === 1) return true;
    if (value === 0) return false;
    return null;
  }

  if (normalizeKind === 'enum_from_int') {
    const value = row.intValue;
    const target = resolveKnownEnumTarget(tag);

    if (value == null) {
      return null;
    }

    if (usesSetEnumRule(tag)) {
      return context.setIdByDbfId.get(value) ?? null;
    }

    const mapped = enumMap[String(value)];
    if (typeof mapped === 'string') {
      if (target == null) {
        return mapped;
      }

      return normalizeKnownEnumValue(target, mapped) ?? mapped;
    }

    if (Array.isArray(mapped)) {
      return mapped.filter(item => typeof item === 'string') as string[];
    }

    if (target != null) {
      const fallback = normalizeKnownEnumValue(target, value);

      if (fallback != null) {
        return fallback;
      }
    }

    return normalizeConfig.allowUnknownEnumValue === true ? String(value) : null;
  }

  if (normalizeKind === 'card_ref_from_int') {
    if (row.cardRefCardId != null || row.cardRefDbfId != null) {
      return {
        cardId: row.cardRefCardId,
        dbfId:  row.cardRefDbfId,
      };
    }

    if (row.intValue == null) {
      return null;
    }

    return {
      cardId: context.cardIdByDbfId.get(row.intValue) ?? null,
      dbfId:  row.intValue,
    };
  }

  if (normalizeKind === 'json_wrap') {
    return asJsonMap(row.jsonValue ?? row.rawPayload);
  }

  return normalizeScalarValue(row);
}

function createLocalizationDraft(): LocalizationDraft {
  return {
    name:            '',
    richText:        '',
    targetText:      null,
    textInPlay:      null,
    howToEarn:       null,
    howToEarnGolden: null,
    flavorText:      null,
    locChangeType:   'unknown',
  };
}

function textFromRichText(richText: string): string {
  return richText
    .replace(/[$#](\d+)/g, (_match: string, value: string) => value)
    .replace(/<\/?.>|\[.\]/g, '');
}

function setLocalizationField(draft: LocalizationDraft, path: string, value: string) {
  if (path === 'name') {
    draft.name = value;
    return true;
  }

  if (path === 'richText') {
    draft.richText = value;
    return true;
  }

  if (path === 'targetText') {
    draft.targetText = value;
    return true;
  }

  if (path === 'textInPlay') {
    draft.textInPlay = value;
    return true;
  }

  if (path === 'howToEarn') {
    draft.howToEarn = value;
    return true;
  }

  if (path === 'howToEarnGolden') {
    draft.howToEarnGolden = value;
    return true;
  }

  if (path === 'flavorText') {
    draft.flavorText = value;
    return true;
  }

  return false;
}

function normalizeTargetPath(path: string): string {
  return path
    .replace(/^entity_localizations?\./, '')
    .replace(/^entity\./, '')
    .replace(/^localization\./, '')
    .replace(/^legacyPayload\./, 'legacyPayload.')
    .replace(/^legacy_payload\./, 'legacyPayload.');
}

function isMechanicValue(value: unknown): value is MechanicValue {
  return typeof value === 'boolean' || Number.isSafeInteger(value);
}

function applyEntityScalar(draft: EntityRow, path: string, value: unknown) {
  if (path === 'set' && typeof value === 'string') {
    draft.set = value;
    return;
  }

  if (path === 'type' && (typeof value === 'string' || Number.isSafeInteger(value))) {
    draft.type = normalizeProjectedEnumValue(path, value as string | number) ?? draft.type;
    return;
  }

  if (path === 'cost' && Number.isSafeInteger(value)) {
    draft.cost = value as number;
    return;
  }

  if (path === 'attack' && (value == null || Number.isSafeInteger(value))) {
    draft.attack = value as number | null;
    return;
  }

  if (path === 'health' && (value == null || Number.isSafeInteger(value))) {
    draft.health = value as number | null;
    return;
  }

  if (path === 'durability' && (value == null || Number.isSafeInteger(value))) {
    draft.durability = value as number | null;
    return;
  }

  if (path === 'armor' && (value == null || Number.isSafeInteger(value))) {
    draft.armor = value as number | null;
    return;
  }

  if (path === 'spellSchool' && (value == null || typeof value === 'string')) {
    draft.spellSchool = value as string | null;
    return;
  }

  if (path === 'questType' && (value == null || typeof value === 'string')) {
    draft.questType = value as string | null;
    return;
  }

  if (path === 'questProgress' && (value == null || Number.isSafeInteger(value))) {
    draft.questProgress = value as number | null;
    return;
  }

  if (path === 'questPart' && (value == null || Number.isSafeInteger(value))) {
    draft.questPart = value as number | null;
    return;
  }

  if (path === 'techLevel' && (value == null || Number.isSafeInteger(value))) {
    draft.techLevel = value as number | null;
    return;
  }

  if (path === 'inBobsTavern' && typeof value === 'boolean') {
    draft.inBobsTavern = value;
    return;
  }

  if (path === 'raceBucket' && (value == null || typeof value === 'string')) {
    draft.raceBucket = value as string | null;
    return;
  }

  if (path === 'armorBucket' && (value == null || Number.isSafeInteger(value))) {
    draft.armorBucket = value as number | null;
    return;
  }

  if (path === 'bannedRace' && (value == null || typeof value === 'string')) {
    draft.bannedRace = value as string | null;
    return;
  }

  if (path === 'mercenaryRole' && (value == null || typeof value === 'string')) {
    draft.mercenaryRole = value as string | null;
    return;
  }

  if (path === 'mercenaryFaction' && (value == null || typeof value === 'string')) {
    draft.mercenaryFaction = value as string | null;
    return;
  }

  if (path === 'colddown' && (value == null || Number.isSafeInteger(value))) {
    draft.colddown = value as number | null;
    return;
  }

  if (path === 'collectible' && typeof value === 'boolean') {
    draft.collectible = value;
    return;
  }

  if (path === 'elite' && typeof value === 'boolean') {
    draft.elite = value;
    return;
  }

  if (path === 'rarity' && (value == null || typeof value === 'string' || Number.isSafeInteger(value))) {
    draft.rarity = value == null ? null : normalizeProjectedEnumValue(path, value as string | number);
    return;
  }

  if (path === 'artist' && typeof value === 'string') {
    draft.artist = value;
    return;
  }

  if (path === 'overrideWatermark' && (value == null || typeof value === 'string')) {
    draft.overrideWatermark = value as string | null;
    return;
  }

  if (path === 'faction' && (value == null || typeof value === 'string')) {
    draft.faction = value as string | null;
    return;
  }

  if (path === 'textBuilderType' && typeof value === 'string') {
    draft.textBuilderType = value;
  }
}

function appendEntityStringArray(draft: EntityRow, path: string, value: unknown) {
  const values = uniqueStrings(asStringArray(value));

  if (path === 'classes') {
    draft.classes = uniqueStrings([...draft.classes, ...values]);
    return;
  }

  if (path === 'rune') {
    draft.rune = uniqueStrings([...(draft.rune ?? []), ...values]);
    return;
  }

  if (path === 'race') {
    draft.race = uniqueStrings([...(draft.race ?? []), ...values]);
  }
}

function appendStringArrayValue(value: unknown, config: JsonMap): unknown {
  if (value === false) {
    return null;
  }

  if (value === true) {
    return typeof config.value === 'string' ? config.value : null;
  }

  return value;
}

function applyLegacyValue(draft: EntityRow, path: string, value: unknown) {
  const key = path.startsWith('legacyPayload.')
    ? path.slice('legacyPayload.'.length)
    : path;

  if (key.length === 0) {
    return;
  }

  draft.legacyPayload[key] = value;
}

function applyCardRef(
  draft: EntityRow,
  weakRelationTarget: Map<string, string>,
  path: string,
  value: CardRefValue,
) {
  if (!value.cardId) {
    return;
  }

  if (path === 'heroPower') {
    draft.heroPower = value.cardId;
    return;
  }

  if (path === 'buddy') {
    draft.buddy = value.cardId;
    return;
  }

  if (path === 'tripleCard') {
    draft.tripleCard = value.cardId;
    return;
  }

  if (path === 'heroicHeroPower') {
    weakRelationTarget.set(path, value.cardId);
  }
}

function createEntityDraft(snapshot: RawSnapshotRow): EntityRow {
  const referencedTags = Object.fromEntries(
    Object.entries(asJsonMap(snapshot.extraPayload.referencedTags))
      .filter(([, value]) => isMechanicValue(value)),
  ) as Record<string, MechanicValue>;

  return {
    cardId:            snapshot.cardId,
    version:           [],
    revisionHash:      '',
    dbfId:             snapshot.dbfId,
    legacyPayload:     {},
    set:               '',
    classes:           [],
    type:              'null',
    cost:              0,
    attack:            null,
    health:            null,
    durability:        null,
    armor:             null,
    rune:              null,
    race:              null,
    spellSchool:       null,
    questType:         null,
    questProgress:     null,
    questPart:         null,
    heroPower:         null,
    techLevel:         null,
    inBobsTavern:      false,
    tripleCard:        null,
    raceBucket:        null,
    armorBucket:       null,
    buddy:             null,
    bannedRace:        null,
    mercenaryRole:     null,
    mercenaryFaction:  null,
    colddown:          null,
    collectible:       false,
    elite:             false,
    rarity:            null,
    artist:            '',
    overrideWatermark: null,
    faction:           null,
    mechanics:         {},
    referencedTags,
    textBuilderType:   'default',
    changeType:        'unknown',
    isLatest:          false,
  };
}

function buildRevisionHashPayload(row: LocalizationlessEntityRow): JsonMap {
  return {
    cardId:            row.cardId,
    dbfId:             row.dbfId,
    legacyPayload:     row.legacyPayload,
    set:               row.set,
    classes:           row.classes,
    type:              row.type,
    cost:              row.cost,
    attack:            row.attack,
    health:            row.health,
    durability:        row.durability,
    armor:             row.armor,
    rune:              row.rune,
    race:              row.race,
    spellSchool:       row.spellSchool,
    questType:         row.questType,
    questProgress:     row.questProgress,
    questPart:         row.questPart,
    heroPower:         row.heroPower,
    techLevel:         row.techLevel,
    inBobsTavern:      row.inBobsTavern,
    tripleCard:        row.tripleCard,
    raceBucket:        row.raceBucket,
    armorBucket:       row.armorBucket,
    buddy:             row.buddy,
    bannedRace:        row.bannedRace,
    mercenaryRole:     row.mercenaryRole,
    mercenaryFaction:  row.mercenaryFaction,
    colddown:          row.colddown,
    collectible:       row.collectible,
    elite:             row.elite,
    rarity:            row.rarity,
    artist:            row.artist,
    overrideWatermark: row.overrideWatermark,
    faction:           row.faction,
    mechanics:         row.mechanics,
    referencedTags:    row.referencedTags,
  };
}

function buildLocalizationHashPayload(row: LocalizationlessLocalizationRow): JsonMap {
  return {
    cardId:          row.cardId,
    lang:            row.lang,
    name:            row.name,
    richText:        row.richText,
    targetText:      row.targetText,
    textInPlay:      row.textInPlay,
    howToEarn:       row.howToEarn,
    howToEarnGolden: row.howToEarnGolden,
    flavorText:      row.flavorText,
  };
}

function getValueAtPath(value: unknown, path: PropertyKey[]): unknown {
  let current = value;

  for (const key of path) {
    if (current == null || typeof current !== 'object') {
      return undefined;
    }

    current = (current as Record<PropertyKey, unknown>)[key];
  }

  return current;
}

function formatIssuePath(path: PropertyKey[]): string {
  return path.map(value => String(value)).join('.');
}

function buildRenderModel(
  entity: LocalizationlessEntityRow,
  localization: LocalizationlessLocalizationRow,
): RenderModel {
  const renderMechanics = Object.fromEntries(
    Object.entries(entity.mechanics)
      .filter(([enumId, value]) => renderMechanicKeys.has(enumId) && isMechanicValue(value)),
  );

  const payload = {
    cardId: entity.cardId,
    lang:   localization.lang,

    templateVersion: 'v1',
    assetVersion:    'v1',

    localization: {
      name:     localization.name,
      richText: localization.richText,
    },

    type:              entity.type,
    cost:              entity.cost,
    attack:            entity.attack,
    health:            entity.health,
    durability:        entity.durability,
    armor:             entity.armor,
    classes:           entity.classes,
    race:              entity.race,
    spellSchool:       entity.spellSchool,
    mercenaryRole:     entity.mercenaryRole,
    mercenaryFaction:  entity.mercenaryFaction,
    colddown:          entity.colddown,
    set:               entity.set,
    overrideWatermark: entity.overrideWatermark,
    rarity:            entity.rarity,
    elite:             entity.elite,
    techLevel:         entity.techLevel,
    rune:              entity.rune,
    renderMechanics,
  };
  // Omit null/undefined fields so absent optional fields don't change the render hash.
  const stripped = Object.fromEntries(
    Object.entries(payload).filter(([, v]) => v != null),
  );
  const result = renderModelSchema.safeParse(stripped);

  if (!result.success) {
    const issues = result.error.issues.map(issue => ({
      path:    formatIssuePath(issue.path),
      message: issue.message,
      value:   getValueAtPath(payload, issue.path),
    }));

    throw new Error(`[hearthstone][hsdata-project] invalid render model for card ${entity.cardId} (${entity.dbfId}) lang ${localization.lang}: ${JSON.stringify(issues)}`);
  }

  return result.data;
}

function entityKey(row: Pick<EntityRow, 'cardId' | 'revisionHash'>): RowKey {
  return `${row.cardId}\u0000${row.revisionHash}`;
}

function localizationKey(
  row: Pick<LocalizationRow, 'cardId' | 'lang' | 'revisionHash' | 'localizationHash'>,
): RowKey {
  return `${row.cardId}\u0000${row.lang}\u0000${row.revisionHash}\u0000${row.localizationHash}`;
}

/** Builds the reconcile-group key for one localization family keyed by card and language. */
function localizationGroupKey(
  row: Pick<LocalizationStateRow, 'cardId' | 'lang'>,
): RowKey {
  return `${row.cardId}\u0000${row.lang}`;
}

function relationKey(
  row: Pick<RelationRow, 'sourceId' | 'sourceRevisionHash' | 'relation' | 'targetId'>,
): RowKey {
  return `${row.sourceId}\u0000${row.sourceRevisionHash}\u0000${row.relation}\u0000${row.targetId}`;
}

/** Clones one reconciled row while keeping nested payload references and only copying the mutable version array. */
function cloneReconcileRow<T extends { version: number[], isLatest: boolean }>(row: T): T {
  return {
    ...row,
    version: [...row.version],
  };
}

function recomputeLatest<T extends { version: number[], isLatest: boolean }>(
  rows: Map<RowKey, T>,
  globalLatest: number,
) {
  for (const row of rows.values()) {
    row.isLatest = row.version.includes(globalLatest);
  }
}

/** Builds one lightweight entity state signature so reconciliation compares hashes and version flags instead of full-row JSON. */
function entityState(row: Pick<EntityRow, 'revisionHash' | 'version' | 'isLatest'>): string {
  return `${row.revisionHash}\u0000${row.version.join(',')}\u0000${row.isLatest ? 1 : 0}`;
}

/** Builds one lightweight localization state signature so reconciliation only reacts to payload identity and version membership. */
function localizationState(row: Pick<LocalizationRow, 'revisionHash' | 'localizationHash' | 'renderHash' | 'version' | 'isLatest'>): string {
  return [
    row.revisionHash,
    row.localizationHash,
    row.renderHash ?? '',
    row.version.join(','),
  ].join('\u0000');
}

/** Builds one lightweight relation state signature so reconciliation checks stable identifiers and version flags only. */
function relationState(row: RelationRow): string {
  return [
    row.sourceRevisionHash,
    row.relation,
    row.targetId,
    row.version.join(','),
    row.isLatest ? '1' : '0',
  ].join('\u0000');
}

/** Reconciles one projected row family by updating version membership and comparing lightweight state signatures. */
async function reconcileRows<T extends { version: number[], isLatest: boolean }>(
  existingRows: T[],
  targetRows: T[],
  options: ReconcileOptions<T>,
  onProgress?: SummarizeProgressReporter,
  progressLabel?: string,
): Promise<ReconcileResult<T>> {
  // Keep the original rows as read-only lookup input. The final row set is rebuilt separately so
  // reconciliation does not deep-clone every existing row before any change is known.
  const existingByKey = new Map(existingRows.map(row => [options.keyOf(row), row]));
  const finalByKey = new Map<RowKey, T>();

  // Collect target builds per group so existing rows whose version includes those builds
  // are also pruned. This handles the case where projecting source version A drags in
  // snapshots from source version B, and B already has rows for the same card.
  const targetBuildsByGroup = new Map<string, Set<number>>();
  for (const row of targetRows) {
    const group = options.groupKey(row);
    const builds = targetBuildsByGroup.get(group);
    if (builds) {
      for (const v of row.version) builds.add(v);
    } else {
      targetBuildsByGroup.set(group, new Set(row.version));
    }
  }

  for (const row of existingRows) {
    const groupTargetBuilds = targetBuildsByGroup.get(options.groupKey(row));
    const nextVersion = row.version.filter(value => {
      if (value === options.build) return false;
      if (groupTargetBuilds?.has(value)) return false;
      return true;
    });

    if (nextVersion.length === 0) {
      continue;
    }

    finalByKey.set(options.keyOf(row), {
      ...cloneReconcileRow(row),
      version:  nextVersion,
      isLatest: false,
    });
  }

  let inserted = 0;
  let reused = 0;
  let updated = 0;
  let completedTargetRows = 0;

  for (const row of targetRows) {
    const key = options.keyOf(row);
    const existing = existingByKey.get(key);
    const current = finalByKey.get(key);

    if (!existing) {
      inserted += 1;
      finalByKey.set(key, {
        ...cloneReconcileRow(row),
        version:  [...row.version],
        isLatest: false,
      });
    } else {
      if (existing.version.includes(options.build)) {
        reused += 1;
      } else {
        updated += 1;
      }

      finalByKey.set(key, {
        ...(current ?? cloneReconcileRow(row)),
        ...cloneReconcileRow(row),
        version:  mergeVersion(current?.version ?? [], ...row.version),
        isLatest: options.skipLatestUpdate ? existing.isLatest : false,
      });
    }

    completedTargetRows += 1;
    if (onProgress && completedTargetRows % summarizeProgressBatchSize === 0) {
      await onProgress(
        `Reconciled ${progressLabel ?? 'target'} rows (${completedTargetRows}/${targetRows.length})`,
        summarizeProgressBatchSize,
      );
      await yieldProgressEventLoop();
    }
  }

  if (onProgress && completedTargetRows % summarizeProgressBatchSize !== 0) {
    await onProgress(
      `Reconciled ${progressLabel ?? 'target'} rows (${completedTargetRows}/${targetRows.length})`,
      completedTargetRows % summarizeProgressBatchSize,
    );
    await yieldProgressEventLoop();
  }

  if (!options.skipLatestUpdate) {
    recomputeLatest(finalByKey, options.globalLatest);
  }

  const finalRows = [...finalByKey.values()];
  const deleteRows: T[] = [];
  const upsertRows: T[] = [];
  let syncInserted = 0;
  let syncUpdated = 0;

  for (const row of existingRows) {
    const key = options.keyOf(row);

    if (!finalByKey.has(key)) {
      deleteRows.push(row);
    }
  }

  for (const row of finalRows) {
    const key = options.keyOf(row);
    const existing = existingByKey.get(key);
    const currentState = options.stateOf(row);
    const previousState = existing == null ? null : options.stateOf(existing);

    // When the old metadata-update path set renderHash but the stored renderModel
    // is stale (null or contains null fields), detect and backfill even when
    // hashes match.
    const existingRM = existing != null ? (existing as Record<string, unknown>).renderModel : undefined;
    const targetRM = (row as Record<string, unknown>).renderModel;
    const renderModelCanonicalMismatch = targetRM != null
      && (existingRM == null || canonicalize(existingRM) !== canonicalize(targetRM));

    if (currentState === previousState && !renderModelCanonicalMismatch) {
      continue;
    }

    if (existing == null) {
      syncInserted += 1;
    } else {
      syncUpdated += 1;
    }

    upsertRows.push(row);
  }

  const changed = deleteRows.length > 0 || upsertRows.length > 0;
  const syncPlan = {
    deleteRows,
    upsertRows,
    inserted: syncInserted,
    updated:  syncUpdated,
    deleted:  deleteRows.length,
  };

  return {
    finalRows,
    syncPlan,
    changed,
    inserted,
    reused,
    updated,
  };
}

function relationName(field: string): string {
  if (field === 'heroPower') return 'hero_power';
  if (field === 'tripleCard') return 'triple_card';
  if (field === 'heroicHeroPower') return 'heroic_hero_power';
  return field.replace(/[A-Z]/g, match => `_${match.toLowerCase()}`);
}

function finalizeEntityDraft(
  draft: EntityRow,
): LocalizationlessEntityRow {
  draft.classes = uniqueStrings(draft.classes);
  draft.rune = draft.rune != null && draft.rune.length > 0 ? uniqueStrings(draft.rune) : null;
  draft.race = draft.race != null && draft.race.length > 0 ? uniqueStrings(draft.race) : null;

  if (draft.type === 'minion') {
    if (draft.attack != null && draft.health == null) {
      draft.health = 0;
    }

    if (draft.attack == null && draft.health != null) {
      draft.attack = 0;
    }
  } else if (draft.type === 'weapon') {
    if (draft.attack != null && draft.durability == null) {
      draft.durability = 0;
    }

    if (draft.attack == null && draft.durability != null) {
      draft.attack = 0;
    }
  }

  const entity: LocalizationlessEntityRow = {
    cardId:            draft.cardId,
    revisionHash:      '',
    dbfId:             draft.dbfId,
    legacyPayload:     draft.legacyPayload,
    set:               draft.set,
    classes:           draft.classes,
    type:              draft.type,
    cost:              draft.cost,
    attack:            draft.attack,
    health:            draft.health,
    durability:        draft.durability,
    armor:             draft.armor,
    rune:              draft.rune,
    race:              draft.race,
    spellSchool:       draft.spellSchool,
    questType:         draft.questType,
    questProgress:     draft.questProgress,
    questPart:         draft.questPart,
    heroPower:         draft.heroPower,
    techLevel:         draft.techLevel,
    inBobsTavern:      draft.inBobsTavern,
    tripleCard:        draft.tripleCard,
    raceBucket:        draft.raceBucket,
    armorBucket:       draft.armorBucket,
    buddy:             draft.buddy,
    bannedRace:        draft.bannedRace,
    mercenaryRole:     draft.mercenaryRole,
    mercenaryFaction:  draft.mercenaryFaction,
    colddown:          draft.colddown,
    collectible:       draft.collectible,
    elite:             draft.elite,
    rarity:            draft.rarity,
    artist:            draft.artist,
    overrideWatermark: draft.overrideWatermark,
    faction:           draft.faction,
    mechanics:         draft.mechanics,
    referencedTags:    draft.referencedTags,
    textBuilderType:   'default',
    changeType:        draft.changeType,
  };

  return {
    ...entity,
    revisionHash: hashCanonicalJson(buildRevisionHashPayload(entity)),
  };
}

function finalizeLocalizationRows(
  entity: LocalizationlessEntityRow,
  localizationMap: Map<string, LocalizationDraft>,
  slugByEnumId: Map<number, string>,
): LocalizationRow[] {
  const rows: LocalizationRow[] = [];

  for (const [lang, localization] of localizationMap.entries()) {
    const richText = localization.richText;
    const text = textFromRichText(richText);
    const displayText = richText;

    const row: LocalizationlessLocalizationRow = {
      cardId:           entity.cardId,
      lang,
      revisionHash:     entity.revisionHash,
      localizationHash: '',
      renderHash:       null,
      renderModel:      null,
      name:             localization.name,
      text,
      richText,
      displayText,
      targetText:       localization.targetText,
      textInPlay:       localization.textInPlay,
      howToEarn:        localization.howToEarn,
      howToEarnGolden:  localization.howToEarnGolden,
      flavorText:       localization.flavorText,
      locChangeType:    localization.locChangeType,
    };

    const localizationHash = hashCanonicalJson(buildLocalizationHashPayload(row));
    const renderModel = buildRenderModel(entity, row);
    const renderHash = hashCanonicalJson(renderModel);

    rows.push({
      ...row,
      localizationHash,
      renderModel,
      renderHash,
      version:  [],
      isLatest: false,
    });
  }

  if (rows.length === 0) {
    if (entity.cardId === 'PlaceholderCard' && entity.dbfId === 0) {
      return [];
    }

    throw new Error(`[hearthstone][hsdata-project] missing localization rows for ${entity.cardId}`);
  }

  return rows;
}

function projectSnapshot(
  snapshot: RawSnapshotRow,
  rawTags: RawSnapshotTagRow[],
  tagMap: Map<number, TagRow>,
  context: ProjectionContext,
): ProjectedSnapshot {
  const entityDraft = createEntityDraft(snapshot);
  const localizations = new Map<string, LocalizationDraft>();
  const weakRelationTargets = new Map<string, string>();
  let unprojectedTagCount = 0;

  const sortedTags = [...rawTags].sort((left, right) => left.tagOrder - right.tagOrder);

  for (const row of sortedTags) {
    const tag = tagMap.get(row.enumId);
    const projectKind = tag?.projectKind;
    const targetPath = tag?.projectTargetPath ? normalizeTargetPath(tag.projectTargetPath) : null;

    if (!projectKind || !targetPath) {
      unprojectedTagCount += 1;
      continue;
    }

    const normalized = normalizeTagValue(row, tag, context);
    if (targetPath === 'set' && usesSetEnumRule(tag)) {
      assertResolvedSetId(snapshot, row, normalized);
    }

    const projectConfig = tag.projectConfig ?? {};
    const cleaned = cleanNullValue(normalized, projectConfig);

    if (cleaned == null) {
      unprojectedTagCount += 1;
      continue;
    }

    if (projectKind === 'assign_value') {
      applyEntityScalar(entityDraft, targetPath, cleaned);
      continue;
    }

    if (projectKind === 'append_string_array') {
      const value = appendStringArrayValue(cleaned, projectConfig);

      if (value != null) {
        appendEntityStringArray(entityDraft, targetPath, value);
      }

      continue;
    }

    if (projectKind === 'assign_card_ref') {
      if (typeof cleaned === 'object' && !Array.isArray(cleaned) && ('cardId' in cleaned || 'dbfId' in cleaned)) {
        applyCardRef(entityDraft, weakRelationTargets, targetPath, cleaned as CardRefValue);
        continue;
      }

      unprojectedTagCount += 1;
      continue;
    }

    if (projectKind === 'assign_localized_text') {
      const localeOverrides = asStringRecord(projectConfig.localeMap);

      if (typeof cleaned !== 'object' || Array.isArray(cleaned)) {
        unprojectedTagCount += 1;
        continue;
      }

      let projected = false;

      for (const [rawLang, text] of Object.entries(cleaned as LocalizedText)) {
        if (typeof text !== 'string') {
          continue;
        }

        const lang = normalizeLocaleKey(rawLang, localeOverrides);
        if (lang == null) {
          continue;
        }

        const draft = localizations.get(lang) ?? createLocalizationDraft();
        if (!setLocalizationField(draft, targetPath, text)) {
          continue;
        }

        localizations.set(lang, draft);
        projected = true;
      }

      if (!projected) {
        unprojectedTagCount += 1;
      }

      continue;
    }

    if (projectKind === 'assign_mechanic') {
      if (isMechanicValue(cleaned)) {
        entityDraft.mechanics[String(row.enumId)] = cleaned;
        continue;
      }

      unprojectedTagCount += 1;
      continue;
    }

    if (projectKind === 'assign_referenced_tag') {
      if (isMechanicValue(cleaned)) {
        entityDraft.referencedTags[String(row.enumId)] = cleaned;
        continue;
      }

      unprojectedTagCount += 1;
      continue;
    }

    if (projectKind === 'assign_legacy') {
      applyLegacyValue(entityDraft, targetPath, cleaned);
      continue;
    }

    unprojectedTagCount += 1;
  }

  const entity = finalizeEntityDraft(entityDraft);
  const localizationRows = finalizeLocalizationRows(entity, localizations, context.slugByEnumId);

  const relationRows: RelationRow[] = [];

  for (const field of strongRelationFields) {
    const targetId = entity[field];

    if (targetId == null) {
      continue;
    }

    relationRows.push({
      sourceId:           entity.cardId,
      sourceRevisionHash: entity.revisionHash,
      relation:           relationName(field),
      targetId,
      version:            [],
      isLatest:           false,
    });
  }

  for (const field of weakRelationFields) {
    const targetId = weakRelationTargets.get(field);

    if (!targetId) {
      continue;
    }

    relationRows.push({
      sourceId:           entity.cardId,
      sourceRevisionHash: entity.revisionHash,
      relation:           relationName(field),
      targetId,
      version:            [],
      isLatest:           false,
    });
  }

  return {
    snapshotId: snapshot.id,
    entity,
    localizations: localizationRows,
    relations:     relationRows,
    unprojectedTagCount,
  };
}

async function getSourceVersion(sourceTag: number): Promise<SourceVersionRow | null> {
  return await db.select({
    sourceTag: SourceVersion.sourceTag,
    build:     SourceVersion.build,
    status:    SourceVersion.status,
  })
    .from(SourceVersion)
    .where(eq(SourceVersion.sourceTag, sourceTag))
    .then(rows => rows[0] ?? null);
}

/** Loads builds for completed source versions referenced by snapshot source_tags arrays. */
async function getBuildsBySourceTags(
  sourceTags: number[],
): Promise<Map<number, number>> {
  if (sourceTags.length === 0) {
    return new Map();
  }

  const builds = new Map<number, number>();
  const rows = await db.select({
    sourceTag: SourceVersion.sourceTag,
    build:     SourceVersion.build,
  })
    .from(SourceVersion)
    .where(and(
      inArray(SourceVersion.sourceTag, sourceTags),
      eq(SourceVersion.status, 'completed'),
      sql<boolean>`${SourceVersion.build} IS NOT NULL`,
    ));

  for (const row of rows) {
    if (row.build != null) {
      builds.set(row.sourceTag, row.build);
    }
  }

  return builds;
}

async function loadSnapshots(sourceTag: number, includeProjected = false): Promise<RawSnapshotRow[]> {
  const conditions: SQL[] = [sql<boolean>`${sourceTag} = ANY(${RawEntitySnapshot.sourceTags})`];
  if (!includeProjected) {
    conditions.push(eq(RawEntitySnapshot.projected, false));
  }
  return await db.select({
    id:               RawEntitySnapshot.id,
    cardId:           RawEntitySnapshot.cardId,
    dbfId:            RawEntitySnapshot.dbfId,
    sourceTags:       RawEntitySnapshot.sourceTags,
    entityXmlVersion: RawEntitySnapshot.entityXmlVersion,
    snapshotHash:     RawEntitySnapshot.snapshotHash,
    extraPayload:     RawEntitySnapshot.extraPayload,
  })
    .from(RawEntitySnapshot)
    .where(and(...conditions));
}

async function loadSnapshotTags(
  snapshotIds: string[],
  onProgress?: (completedSnapshotCount: number, totalSnapshotCount: number) => void | Promise<void>,
): Promise<RawSnapshotTagRow[]> {
  const rows: RawSnapshotTagRow[] = [];
  let completedSnapshotCount = 0;

  for (const chunk of chunkValues(snapshotIds)) {
    if (chunk.length === 0) {
      continue;
    }

    const result = await db.select({
      snapshotId:     RawEntitySnapshotTag.snapshotId,
      enumId:         RawEntitySnapshotTag.enumId,
      tagOrder:       RawEntitySnapshotTag.tagOrder,
      rawName:        RawEntitySnapshotTag.rawName,
      rawType:        RawEntitySnapshotTag.rawType,
      rawPayload:     RawEntitySnapshotTag.rawPayload,
      valueKind:      RawEntitySnapshotTag.valueKind,
      boolValue:      RawEntitySnapshotTag.boolValue,
      intValue:       RawEntitySnapshotTag.intValue,
      stringValue:    RawEntitySnapshotTag.stringValue,
      enumValue:      RawEntitySnapshotTag.enumValue,
      locStringValue: RawEntitySnapshotTag.locStringValue,
      cardRefCardId:  RawEntitySnapshotTag.cardRefCardId,
      cardRefDbfId:   RawEntitySnapshotTag.cardRefDbfId,
      jsonValue:      RawEntitySnapshotTag.jsonValue,
      parseStatus:    RawEntitySnapshotTag.parseStatus,
    })
      .from(RawEntitySnapshotTag)
      .where(inArray(RawEntitySnapshotTag.snapshotId, chunk));

    rows.push(...result);
    completedSnapshotCount += chunk.length;
    await onProgress?.(completedSnapshotCount, snapshotIds.length);
  }

  return rows;
}

async function loadTagRows(enumIds: number[]): Promise<Map<number, TagRow>> {
  const rows: TagRow[] = [];

  for (const chunk of chunkValues(enumIds)) {
    if (chunk.length === 0) {
      continue;
    }

    const result = await db.select({
      enumId:            Tag.enumId,
      slug:              Tag.slug,
      valueKind:         Tag.valueKind,
      normalizeKind:     Tag.normalizeKind,
      normalizeConfig:   Tag.normalizeConfig,
      projectTargetType: Tag.projectTargetType,
      projectTargetPath: Tag.projectTargetPath,
      projectKind:       Tag.projectKind,
      projectConfig:     Tag.projectConfig,
    })
      .from(Tag)
      .where(inArray(Tag.enumId, chunk));

    rows.push(...result);
  }

  return new Map(rows.map(row => [row.enumId, row]));
}

async function loadSetIdByDbfId(): Promise<Map<number, string>> {
  const rows = await db.select({
    dbfId: HearthstoneSet.dbfId,
    setId: HearthstoneSet.setId,
  })
    .from(HearthstoneSet)
    .then(items => items.filter(item => item.dbfId != null));

  return new Map(rows.map(row => [row.dbfId!, row.setId]));
}

/** Loads only shared rows whose reconcile groups appear in the current projected entity/localization/relation sets. */
async function loadExistingRowsForProjection(
  build: number,
  entityCardIds: string[],
  localizationGroups: Array<Pick<LocalizationStateRow, 'cardId' | 'lang'>>,
  localizationKeys: Array<Pick<LocalizationStateRow, 'cardId' | 'lang' | 'revisionHash' | 'localizationHash'>>,
  localizationBuilds: number[],
  relationSourceIds: string[],
  profiler?: ProjectWriteProfiler,
  onProgress?: SummarizeProgressReporter,
): Promise<{
    entities: EntityStateRow[];
    localizations: LocalizationStateRow[];
    relations: RelationRow[];
  }> {
  type EntityStateQueryRow = {
    cardId: string;
    version: number[];
    revisionHash: string;
    isLatest: boolean;
  };
  type LocalizationStateQueryRow = {
    cardId: string;
    version: number[];
    lang: string;
    revisionHash: string;
    localizationHash: string;
    renderHash: string | null;
    renderModel: RenderModel | null;
    isLatest: boolean;
  };
  type RelationQueryRow = {
    sourceId: string;
    sourceRevisionHash: string;
    relation: string;
    targetId: string;
    version: number[];
    isLatest: boolean;
  };

  return await db.transaction(async tx => {
    const copyTx = tx as CopyTx;
    const entities: EntityStateRow[] = [];
    if (entityCardIds.length > 0) {
      await copyTx.session.client.unsafe(`
        create temp table hsdata_projection_entity_existing_stage
        on commit drop as
        select
          card_id
        from hearthstone.entities
        with no data
      `);

      for (const chunk of chunkValues(entityCardIds, summarizeProgressBatchSize)) {
        await copyTx.session.client.unsafe(`truncate hsdata_projection_entity_existing_stage`);
        await copyEntityGroupIdsIntoTable(copyTx, chunk, 'hsdata_projection_entity_existing_stage');
        await analyzeTempTable(copyTx, 'hsdata_projection_entity_existing_stage');

        const rows = await tx.execute<EntityStateQueryRow>(sql`
          select
            target.card_id as "cardId",
            target.version as "version",
            target.revision_hash as "revisionHash",
            target.is_latest as "isLatest"
          from hearthstone.entities as target
          inner join hsdata_projection_entity_existing_stage as stage
            on target.card_id = stage.card_id
                  `);
        entities.push(...rows);
        await onProgress?.(
          `Loaded existing entity rows for ${Math.min(entities.length, entityCardIds.length)} projected cards`,
          chunk.length,
        );
      }

      profiler?.mark('load_existing_rows_copy_entity_stage', {
        rowCount: entityCardIds.length,
      });
      profiler?.mark('load_existing_rows_analyze_entity_stage', {
        rowCount: entityCardIds.length,
      });
    }
    profiler?.mark('load_existing_rows_select_entities', {
      rowCount: entities.length,
    });

    const localizations = localizationGroups.length === 0
      ? [] as LocalizationStateRow[]
      : await (async () => {
        const exactRows: LocalizationStateRow[] = [];
        const buildRows: LocalizationStateRow[] = [];

        await copyTx.session.client.unsafe(`
          create temp table hsdata_projection_localization_existing_stage
          on commit drop as
          select
            card_id,
            lang
          from hearthstone.entity_localizations
          with no data
        `);
        await copyTx.session.client.unsafe(`
          create temp table hsdata_projection_localization_existing_key_stage
          on commit drop as
          select
            card_id,
            lang,
            revision_hash,
            localization_hash
          from hearthstone.entity_localizations
          with no data
        `);

        for (const chunk of chunkValues(localizationKeys, summarizeProgressBatchSize)) {
          await copyTx.session.client.unsafe(`truncate hsdata_projection_localization_existing_key_stage`);
          await copyLocalizationKeysIntoTable(
            copyTx,
            chunk,
            'hsdata_projection_localization_existing_key_stage',
          );
          await analyzeTempTable(copyTx, 'hsdata_projection_localization_existing_key_stage');

          const rows = await tx.execute<LocalizationStateQueryRow>(sql`
            select
              target.card_id as "cardId",
              target.version as "version",
              target.lang as "lang",
              target.revision_hash as "revisionHash",
              target.localization_hash as "localizationHash",
              target.render_hash as "renderHash",
              target.render_model as "renderModel",
              target.is_latest as "isLatest"
            from hearthstone.entity_localizations as target
            inner join hsdata_projection_localization_existing_key_stage as stage
              on target.card_id = stage.card_id
             and target.lang = stage.lang
             and target.revision_hash = stage.revision_hash
             and target.localization_hash = stage.localization_hash
                    `);
          exactRows.push(...rows);
          await onProgress?.(
            `Loaded exact localization rows for ${Math.min(exactRows.length, localizationKeys.length)} projected revision keys`,
            chunk.length,
          );
        }

        for (const chunk of chunkValues(localizationGroups, summarizeProgressBatchSize)) {
          await copyTx.session.client.unsafe(`truncate hsdata_projection_localization_existing_stage`);
          await copyLocalizationGroupIdsIntoTable(
            copyTx,
            chunk,
            'hsdata_projection_localization_existing_stage',
          );
          await analyzeTempTable(copyTx, 'hsdata_projection_localization_existing_stage');

          const rows = await tx.execute<LocalizationStateQueryRow>(sql`
            select
              target.card_id as "cardId",
              target.version as "version",
              target.lang as "lang",
              target.revision_hash as "revisionHash",
              target.localization_hash as "localizationHash",
              target.render_hash as "renderHash",
              target.render_model as "renderModel",
              target.is_latest as "isLatest"
            from hearthstone.entity_localizations as target
            inner join hsdata_projection_localization_existing_stage as stage
              on target.card_id = stage.card_id
             and target.lang = stage.lang
            where target.version && ARRAY[${sql.join(localizationBuilds.map(v => sql`${v}`), sql`, `)}]::integer[]
                        `);
          buildRows.push(...rows);
          await onProgress?.(
            `Loaded current-build localization groups for ${Math.min(buildRows.length, localizationGroups.length)} projected card-language families`,
            chunk.length,
          );
        }

        profiler?.mark('load_existing_rows_copy_localization_stage', {
          rowCount: localizationGroups.length,
        });
        profiler?.mark('load_existing_rows_analyze_localization_stage', {
          rowCount: localizationGroups.length,
        });
        profiler?.mark('load_existing_rows_copy_localization_key_stage', {
          rowCount: localizationKeys.length,
        });
        profiler?.mark('load_existing_rows_analyze_localization_key_stage', {
          rowCount: localizationKeys.length,
        });
        profiler?.mark('load_existing_rows_select_localizations_exact', {
          rowCount: exactRows.length,
        });
        profiler?.mark('load_existing_rows_select_localizations_current_build', {
          rowCount: buildRows.length,
        });

        const merged = new Map<string, LocalizationStateRow>();

        for (const row of exactRows) {
          merged.set(localizationKey(row), row);
        }

        for (const row of buildRows) {
          merged.set(localizationKey(row), row);
        }

        return [...merged.values()];
      })();
    profiler?.mark('load_existing_rows_select_localizations', {
      rowCount: localizations.length,
    });

    const relations: RelationRow[] = [];
    if (relationSourceIds.length > 0) {
      await copyTx.session.client.unsafe(`
        create temp table hsdata_projection_relation_existing_stage
        on commit drop as
        select
          source_id
        from hearthstone.entity_relations
        with no data
      `);

      for (const chunk of chunkValues(relationSourceIds, summarizeProgressBatchSize)) {
        await copyTx.session.client.unsafe(`truncate hsdata_projection_relation_existing_stage`);
        await copyRelationSourceIdsIntoTable(copyTx, chunk, 'hsdata_projection_relation_existing_stage');
        await analyzeTempTable(copyTx, 'hsdata_projection_relation_existing_stage');

        const rows = await tx.execute<RelationQueryRow>(sql`
          select
            target.source_id as "sourceId",
            target.source_revision_hash as "sourceRevisionHash",
            target.relation as "relation",
            target.target_id as "targetId",
            target.version as "version",
            target.is_latest as "isLatest"
          from hearthstone.entity_relations as target
          inner join hsdata_projection_relation_existing_stage as stage
            on target.source_id = stage.source_id
                  `);
        relations.push(...rows);
        await onProgress?.(
          `Loaded existing relation rows for ${Math.min(relations.length, relationSourceIds.length)} projected source cards`,
          chunk.length,
        );
      }

      profiler?.mark('load_existing_rows_copy_relation_stage', {
        rowCount: relationSourceIds.length,
      });
      profiler?.mark('load_existing_rows_analyze_relation_stage', {
        rowCount: relationSourceIds.length,
      });
    }
    profiler?.mark('load_existing_rows_select_relations', {
      rowCount: relations.length,
    });
    profiler?.mark('load_existing_rows_select_results', {
      entityCount:       entities.length,
      localizationCount: localizations.length,
      relationCount:     relations.length,
    });

    return {
      entities,
      localizations,
      relations,
    };
  });
}

/** Deletes relation rows by their full composite key via a temp table. */
async function deleteRelationsByKey(tx: CopyTx, rows: RelationRow[]) {
  if (rows.length === 0) {
    return;
  }

  await tx.session.client.unsafe(`
    create temp table hsdata_projection_relation_delete_stage
    on commit drop as
    select
      source_id,
      relation,
      target_id,
      source_revision_hash
    from hearthstone.entity_relations
    with no data
  `);

  await copyRelationKeysIntoTable(tx, rows, 'hsdata_projection_relation_delete_stage');

  await tx.session.client.unsafe(`
    update hearthstone.entity_relations as target
    set deleted_at = now()
    from hsdata_projection_relation_delete_stage as stage
    where target.source_id = stage.source_id
      and target.relation = stage.relation
      and target.target_id = stage.target_id
      and target.source_revision_hash = stage.source_revision_hash
  `);
}

/** Loads duplicate entity rows into a temp table, then inserts only missing primary keys into the shared table. */
async function insertEntitiesIgnoreDuplicates(tx: CopyTx, rows: EntityRow[]) {
  await tx.session.client.unsafe(`
    create temp table hsdata_projection_entity_copy_stage (
      like hearthstone.entities including defaults
    ) on commit drop
  `);

  await copyEntitiesIntoTable(tx, rows, 'hsdata_projection_entity_copy_stage');

  await tx.session.client.unsafe(`
    insert into hearthstone.entities (
      card_id,
      version,
      revision_hash,
      dbf_id,
      legacy_payload,
      set,
      class,
      type,
      cost,
      attack,
      health,
      durability,
      armor,
      rune,
      race,
      spell_school,
      quest_type,
      quest_progress,
      quest_part,
      hero_power,
      tech_level,
      in_bobs_tavern,
      triple_card,
      race_bucket,
      armor_bucket,
      buddy,
      banned_race,
      mercenary_role,
      mercenary_faction,
      colddown,
      collectible,
      elite,
      rarity,
      artist,
      override_watermark,
      faction,
      mechanics,
      referenced_tags,
      text_builder_type,
      change_type,
      is_latest
    )
    select
      card_id,
      version,
      revision_hash,
      dbf_id,
      legacy_payload,
      set,
      class,
      type,
      cost,
      attack,
      health,
      durability,
      armor,
      rune,
      race,
      spell_school,
      quest_type,
      quest_progress,
      quest_part,
      hero_power,
      tech_level,
      in_bobs_tavern,
      triple_card,
      race_bucket,
      armor_bucket,
      buddy,
      banned_race,
      mercenary_role,
      mercenary_faction,
      colddown,
      collectible,
      elite,
      rarity,
      artist,
      override_watermark,
      faction,
      mechanics,
      referenced_tags,
      text_builder_type,
      change_type,
      is_latest
    from hsdata_projection_entity_copy_stage
    on conflict do nothing
  `);
}

/** Encodes one nullable CSV field for PostgreSQL COPY with tab delimiter and `\N` nulls. */
function encodeCopyCsvField(value: string | null): string {
  if (value == null) {
    return '\\N';
  }

  return `"${value.replace(/"/g, '""')}"`;
}

/** Encodes one PostgreSQL integer-array literal for COPY input. */
function encodeCopyIntArray(values: number[]): string {
  return `{${values.join(',')}}`;
}

/** Encodes one PostgreSQL text-array literal for COPY input. */
function encodeCopyTextArray(values: string[]): string {
  return `{${values.map(value => `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`).join(',')}}`;
}

/** Renders one entity primary-key row into one COPY-compatible line for temp delete staging tables. */
function encodeEntityKeyCopyRow(row: Pick<EntityRow, 'cardId' | 'revisionHash'>): string {
  return [
    encodeCopyCsvField(row.cardId),
    encodeCopyCsvField(row.revisionHash),
  ].join('\t') + '\n';
}

/** Renders one entity group key into one COPY-compatible line for temp existing-row staging tables. */
function encodeEntityGroupCopyRow(cardId: string): string {
  return [
    encodeCopyCsvField(cardId),
  ].join('\t') + '\n';
}

/** Renders one entity version/isLatest row into one COPY-compatible line for temp meta-update staging tables. */
function encodeEntityMetaCopyRow(row: EntityStateRow): string {
  return [
    encodeCopyCsvField(row.cardId),
    encodeCopyCsvField(row.revisionHash),
    encodeCopyCsvField(encodeCopyIntArray(row.version)),
    encodeCopyCsvField(row.isLatest ? 't' : 'f'),
  ].join('\t') + '\n';
}

/** Renders one localization primary-key row into one COPY-compatible line for temp delete staging tables. */
function encodeLocalizationKeyCopyRow(
  row: Pick<LocalizationRow, 'cardId' | 'lang' | 'revisionHash' | 'localizationHash'>,
): string {
  return [
    encodeCopyCsvField(row.cardId),
    encodeCopyCsvField(row.lang),
    encodeCopyCsvField(row.revisionHash),
    encodeCopyCsvField(row.localizationHash),
  ].join('\t') + '\n';
}

/** Renders one localization group key into one COPY-compatible line for temp existing-row staging tables. */
function encodeLocalizationGroupCopyRow(
  row: Pick<LocalizationStateRow, 'cardId' | 'lang'>,
): string {
  return [
    encodeCopyCsvField(row.cardId),
    encodeCopyCsvField(row.lang),
  ].join('\t') + '\n';
}

/** Renders one localization version row into one COPY-compatible line for temp meta-update staging tables. */
function encodeLocalizationMetaCopyRow(row: LocalizationStateRow): string {
  return [
    encodeCopyCsvField(row.cardId),
    encodeCopyCsvField(row.lang),
    encodeCopyCsvField(row.revisionHash),
    encodeCopyCsvField(row.localizationHash),
    encodeCopyCsvField(row.renderHash ?? null),
    encodeCopyCsvField(row.renderModel != null ? encodeCopyJson(row.renderModel) : null),
    encodeCopyCsvField(encodeCopyIntArray(row.version)),
  ].join('\t') + '\n';
}

/** Renders one relation source key into one COPY-compatible line for temp existing-row staging tables. */
function encodeRelationSourceIdCopyRow(sourceId: string): string {
  return [
    encodeCopyCsvField(sourceId),
  ].join('\t') + '\n';
}

/** Renders one relation composite key into one COPY-compatible line for temp staging tables. */
function encodeRelationKeyCopyRow(row: RelationRow): string {
  return [
    encodeCopyCsvField(row.sourceId),
    encodeCopyCsvField(row.relation),
    encodeCopyCsvField(row.targetId),
    encodeCopyCsvField(row.sourceRevisionHash),
  ].join('\t') + '\n';
}

/** Encodes one JSON payload for COPY input using PostgreSQL text parsing. */
function encodeCopyJson(value: unknown): string | null {
  if (value == null) {
    return null;
  }

  return JSON.stringify(value);
}

/** Renders one entity row into one COPY-compatible TSV/CSV line. */
function encodeEntityCopyRow(row: EntityRow): string {
  return [
    encodeCopyCsvField(row.cardId),
    encodeCopyCsvField(encodeCopyIntArray(row.version)),
    encodeCopyCsvField(row.revisionHash),
    encodeCopyCsvField(String(row.dbfId)),
    encodeCopyCsvField(encodeCopyJson(row.legacyPayload)),
    encodeCopyCsvField(row.set),
    encodeCopyCsvField(encodeCopyTextArray(row.classes)),
    encodeCopyCsvField(row.type),
    encodeCopyCsvField(String(row.cost)),
    encodeCopyCsvField(row.attack == null ? null : String(row.attack)),
    encodeCopyCsvField(row.health == null ? null : String(row.health)),
    encodeCopyCsvField(row.durability == null ? null : String(row.durability)),
    encodeCopyCsvField(row.armor == null ? null : String(row.armor)),
    encodeCopyCsvField(row.rune == null ? null : encodeCopyTextArray(row.rune)),
    encodeCopyCsvField(row.race == null ? null : encodeCopyTextArray(row.race)),
    encodeCopyCsvField(row.spellSchool),
    encodeCopyCsvField(row.questType),
    encodeCopyCsvField(row.questProgress == null ? null : String(row.questProgress)),
    encodeCopyCsvField(row.questPart == null ? null : String(row.questPart)),
    encodeCopyCsvField(row.heroPower),
    encodeCopyCsvField(row.techLevel == null ? null : String(row.techLevel)),
    encodeCopyCsvField(row.inBobsTavern ? 't' : 'f'),
    encodeCopyCsvField(row.tripleCard),
    encodeCopyCsvField(row.raceBucket),
    encodeCopyCsvField(row.armorBucket == null ? null : String(row.armorBucket)),
    encodeCopyCsvField(row.buddy),
    encodeCopyCsvField(row.bannedRace),
    encodeCopyCsvField(row.mercenaryRole),
    encodeCopyCsvField(row.mercenaryFaction),
    encodeCopyCsvField(row.colddown == null ? null : String(row.colddown)),
    encodeCopyCsvField(row.collectible ? 't' : 'f'),
    encodeCopyCsvField(row.elite ? 't' : 'f'),
    encodeCopyCsvField(row.rarity),
    encodeCopyCsvField(row.artist),
    encodeCopyCsvField(row.overrideWatermark),
    encodeCopyCsvField(row.faction),
    encodeCopyCsvField(encodeCopyJson(row.mechanics)),
    encodeCopyCsvField(encodeCopyJson(row.referencedTags)),
    encodeCopyCsvField(row.textBuilderType),
    encodeCopyCsvField(row.changeType),
    encodeCopyCsvField(row.isLatest ? 't' : 'f'),
  ].join('\t') + '\n';
}

/** Renders one localization row into one COPY-compatible TSV/CSV line. */
function encodeLocalizationCopyRow(row: LocalizationRow): string {
  return [
    encodeCopyCsvField(row.cardId),
    encodeCopyCsvField(encodeCopyIntArray(row.version)),
    encodeCopyCsvField(row.lang),
    encodeCopyCsvField(row.revisionHash),
    encodeCopyCsvField(row.localizationHash),
    encodeCopyCsvField(row.renderHash),
    encodeCopyCsvField(encodeCopyJson(row.renderModel)),
    encodeCopyCsvField(row.isLatest ? 't' : 'f'),
    encodeCopyCsvField(row.name),
    encodeCopyCsvField(row.text),
    encodeCopyCsvField(row.richText),
    encodeCopyCsvField(row.displayText),
    encodeCopyCsvField(row.targetText),
    encodeCopyCsvField(row.textInPlay),
    encodeCopyCsvField(row.howToEarn),
    encodeCopyCsvField(row.howToEarnGolden),
    encodeCopyCsvField(row.flavorText),
    encodeCopyCsvField(row.locChangeType),
  ].join('\t') + '\n';
}

/** Streams entity rows into one COPY target so large entity batches avoid hundreds of insert statements. */
async function copyEntitiesIntoTable(
  tx: CopyTx,
  rows: EntityRow[],
  targetTable: string,
) {
  const writable = await tx.session.client.unsafe(`
    copy ${targetTable} (
      card_id,
      version,
      revision_hash,
      dbf_id,
      legacy_payload,
      set,
      class,
      type,
      cost,
      attack,
      health,
      durability,
      armor,
      rune,
      race,
      spell_school,
      quest_type,
      quest_progress,
      quest_part,
      hero_power,
      tech_level,
      in_bobs_tavern,
      triple_card,
      race_bucket,
      armor_bucket,
      buddy,
      banned_race,
      mercenary_role,
      mercenary_faction,
      colddown,
      collectible,
      elite,
      rarity,
      artist,
      override_watermark,
      faction,
      mechanics,
      referenced_tags,
      text_builder_type,
      change_type,
      is_latest
    ) from stdin with (
      format csv,
      delimiter E'\\t',
      null '\\N'
    )
  `).writable();

  /** Yields one COPY line per entity row so PostgreSQL can stream the whole batch. */
  async function* generateEntityCopyLines() {
    for (const row of rows) {
      yield encodeEntityCopyRow(row);
    }
  }

  await pipeline(
    Readable.from(generateEntityCopyLines()),
    writable,
  );
}

/** Streams localization rows into one COPY target so large localization batches avoid hundreds of insert statements. */
async function copyLocalizationsIntoTable(
  tx: CopyTx,
  rows: LocalizationRow[],
  targetTable: string,
) {
  const writable = await tx.session.client.unsafe(`
    copy ${targetTable} (
      card_id,
      version,
      lang,
      revision_hash,
      localization_hash,
      render_hash,
      render_model,
      is_latest,
      name,
      text,
      rich_text,
      display_text,
      target_text,
      text_in_play,
      how_to_earn,
      how_to_earn_golden,
      flavor_text,
      loc_change_type
    ) from stdin with (
      format csv,
      delimiter E'\\t',
      null '\\N'
    )
  `).writable();

  /** Yields one COPY line per localization row so PostgreSQL can stream the whole batch. */
  async function* generateLocalizationCopyLines() {
    for (const row of rows) {
      yield encodeLocalizationCopyRow(row);
    }
  }

  await pipeline(
    Readable.from(generateLocalizationCopyLines()),
    writable,
  );
}

/** Streams entity primary keys into one temp table so shared-row deletes only touch rows removed by reconciliation. */
async function copyEntityKeysIntoTable(
  tx: CopyTx,
  rows: Array<Pick<EntityRow, 'cardId' | 'revisionHash'>>,
  targetTable: string,
) {
  const writable = await tx.session.client.unsafe(`
    copy ${targetTable} (
      card_id,
      revision_hash
    ) from stdin with (
      format csv,
      delimiter E'\\t',
      null '\\N'
    )
  `).writable();

  /** Yields one COPY line per entity key so composite-key deletes can stay set-based. */
  async function* generateEntityKeyCopyLines() {
    for (const row of rows) {
      yield encodeEntityKeyCopyRow(row);
    }
  }

  await pipeline(
    Readable.from(generateEntityKeyCopyLines()),
    writable,
  );
}

/** Streams entity group keys into one temp table so shared-row reads only touch projected cards. */
async function copyEntityGroupIdsIntoTable(
  tx: CopyTx,
  rows: string[],
  targetTable: string,
) {
  const writable = await tx.session.client.unsafe(`
    copy ${targetTable} (
      card_id
    ) from stdin with (
      format csv,
      delimiter E'\\t',
      null '\\N'
    )
  `).writable();

  /** Yields one COPY line per entity group key so projected-card reads stay set-based. */
  async function* generateEntityGroupCopyLines() {
    for (const row of rows) {
      yield encodeEntityGroupCopyRow(row);
    }
  }

  await pipeline(
    Readable.from(generateEntityGroupCopyLines()),
    writable,
  );
}

/** Streams entity version/isLatest rows into one temp table so historical rows can update metadata without reloading payload columns. */
async function copyEntityMetaRowsIntoTable(
  tx: CopyTx,
  rows: EntityStateRow[],
  targetTable: string,
) {
  const writable = await tx.session.client.unsafe(`
    copy ${targetTable} (
      card_id,
      revision_hash,
      version,
      is_latest
    ) from stdin with (
      format csv,
      delimiter E'\\t',
      null '\\N'
    )
  `).writable();

  /** Yields one COPY line per entity metadata row so historical latest/version flips stay set-based. */
  async function* generateEntityMetaCopyLines() {
    for (const row of rows) {
      yield encodeEntityMetaCopyRow(row);
    }
  }

  await pipeline(
    Readable.from(generateEntityMetaCopyLines()),
    writable,
  );
}

/** Refreshes planner statistics for one temp table after staged rows have been copied into it. */
async function analyzeTempTable(
  tx: CopyTx,
  tableName: string,
) {
  await tx.session.client.unsafe(`analyze ${tableName}`);
}

/** Streams localization primary keys into one temp table so shared-row deletes only touch rows removed by reconciliation. */
async function copyLocalizationKeysIntoTable(
  tx: CopyTx,
  rows: Array<Pick<LocalizationRow, 'cardId' | 'lang' | 'revisionHash' | 'localizationHash'>>,
  targetTable: string,
) {
  const writable = await tx.session.client.unsafe(`
    copy ${targetTable} (
      card_id,
      lang,
      revision_hash,
      localization_hash
    ) from stdin with (
      format csv,
      delimiter E'\\t',
      null '\\N'
    )
  `).writable();

  /** Yields one COPY line per localization key so composite-key deletes can stay set-based. */
  async function* generateLocalizationKeyCopyLines() {
    for (const row of rows) {
      yield encodeLocalizationKeyCopyRow(row);
    }
  }

  await pipeline(
    Readable.from(generateLocalizationKeyCopyLines()),
    writable,
  );
}

/** Streams localization group keys into one temp table so shared-row reads only touch projected card/lang groups. */
async function copyLocalizationGroupIdsIntoTable(
  tx: CopyTx,
  rows: Array<Pick<LocalizationStateRow, 'cardId' | 'lang'>>,
  targetTable: string,
) {
  const writable = await tx.session.client.unsafe(`
    copy ${targetTable} (
      card_id,
      lang
    ) from stdin with (
      format csv,
      delimiter E'\\t',
      null '\\N'
    )
  `).writable();

  /** Yields one COPY line per localization group key so projected localization reads stay set-based. */
  async function* generateLocalizationGroupCopyLines() {
    for (const row of rows) {
      yield encodeLocalizationGroupCopyRow(row);
    }
  }

  await pipeline(
    Readable.from(generateLocalizationGroupCopyLines()),
    writable,
  );
}

/** Streams localization version rows into one temp table so historical rows can update metadata without reloading text payloads. */
async function copyLocalizationMetaRowsIntoTable(
  tx: CopyTx,
  rows: LocalizationStateRow[],
  targetTable: string,
) {
  const writable = await tx.session.client.unsafe(`
    copy ${targetTable} (
      card_id,
      lang,
      revision_hash,
      localization_hash,
      render_hash,
      render_model,
      version
    ) from stdin with (
      format csv,
      delimiter E'\\t',
      null '\\N'
    )
  `).writable();

  /** Yields one COPY line per localization metadata row so historical version membership stays set-based. */
  async function* generateLocalizationMetaCopyLines() {
    for (const row of rows) {
      yield encodeLocalizationMetaCopyRow(row);
    }
  }

  await pipeline(
    Readable.from(generateLocalizationMetaCopyLines()),
    writable,
  );
}

/** Streams relation source keys into one temp table so shared-row reads only touch projected relation families. */
async function copyRelationSourceIdsIntoTable(
  tx: CopyTx,
  rows: string[],
  targetTable: string,
) {
  const writable = await tx.session.client.unsafe(`
    copy ${targetTable} (
      source_id
    ) from stdin with (
      format csv,
      delimiter E'\\t',
      null '\\N'
    )
  `).writable();

  /** Yields one COPY line per relation source key so projected-family reads stay set-based. */
  async function* generateRelationSourceKeyCopyLines() {
    for (const row of rows) {
      yield encodeRelationSourceIdCopyRow(row);
    }
  }

  await pipeline(
    Readable.from(generateRelationSourceKeyCopyLines()),
    writable,
  );
}

/** Copies relation composite keys into one temp table ready for DELETE JOIN. */
async function copyRelationKeysIntoTable(
  tx: CopyTx,
  rows: RelationRow[],
  targetTable: string,
) {
  const writable = await tx.session.client.unsafe(`
    copy ${targetTable} (
      source_id,
      relation,
      target_id,
      source_revision_hash
    ) from stdin with (
      format csv,
      delimiter E'\\t',
      null '\\N'
    )
  `).writable();

  async function* generateRelationKeyCopyLines() {
    for (const row of rows) {
      yield encodeRelationKeyCopyRow(row);
    }
  }

  await pipeline(
    Readable.from(generateRelationKeyCopyLines()),
    writable,
  );
}

/** Loads duplicate localization rows into a temp table, then inserts only missing primary keys into the shared table. */
async function insertLocalizationsIgnoreDuplicates(tx: CopyTx, rows: LocalizationRow[]) {
  await tx.session.client.unsafe(`
    create temp table hsdata_projection_localization_copy_stage (
      like hearthstone.entity_localizations including defaults
    ) on commit drop
  `);

  await copyLocalizationsIntoTable(tx, rows, 'hsdata_projection_localization_copy_stage');
  await analyzeTempTable(tx, 'hsdata_projection_localization_copy_stage');

  await tx.session.client.unsafe(`
    insert into hearthstone.entity_localizations (
      card_id,
      version,
      lang,
      revision_hash,
      localization_hash,
      render_hash,
      render_model,
      is_latest,
      name,
      text,
      rich_text,
      display_text,
      target_text,
      text_in_play,
      how_to_earn,
      how_to_earn_golden,
      flavor_text,
      loc_change_type
    )
    select
      card_id,
      version,
      lang,
      revision_hash,
      localization_hash,
      render_hash,
      render_model,
      is_latest,
      name,
      text,
      rich_text,
      display_text,
      target_text,
      text_in_play,
      how_to_earn,
      how_to_earn_golden,
      flavor_text,
      loc_change_type
    from hsdata_projection_localization_copy_stage
    on conflict do nothing
  `);
}

/** Deletes only reconciled entity keys so unchanged historical rows stay in place. */
async function deleteEntities(
  tx: CopyTx,
  rows: Array<Pick<EntityRow, 'cardId' | 'revisionHash'>>,
) {
  if (rows.length === 0) {
    return;
  }

  await tx.session.client.unsafe(`
    create temp table hsdata_projection_entity_delete_stage
    on commit drop as
    select
      card_id,
      revision_hash
    from hearthstone.entities
    with no data
  `);

  await copyEntityKeysIntoTable(tx, rows, 'hsdata_projection_entity_delete_stage');

  await tx.session.client.unsafe(`
    update hearthstone.entities as target
    set deleted_at = now()
    from hsdata_projection_entity_delete_stage as stage
    where target.card_id = stage.card_id
      and target.revision_hash = stage.revision_hash
  `);
}

/** Upserts only reconciled entity deltas so unchanged historical rows are no longer deleted and reinserted. */
async function upsertEntities(
  tx: CopyTx,
  plan: SyncPlan<EntityStateRow>,
  existingRowsByKey: Map<RowKey, EntityStateRow>,
  targetRowsByKey: Map<RowKey, EntityRow>,
  profiler?: ProjectWriteProfiler,
  onProgress?: WriteProgressReporter,
) {
  if (plan.upsertRows.length === 0) {
    return;
  }

  const insertRows: EntityRow[] = [];
  const metaRows: EntityStateRow[] = [];

  for (const row of plan.upsertRows) {
    const key = entityKey(row);

    // Existing entity keys already pin the payload by revisionHash, so write-path changes only need
    // to update version membership and latest flags. Only brand-new keys need the full row payload.
    if (existingRowsByKey.has(key)) {
      metaRows.push(row);
      continue;
    }

    const full = targetRowsByKey.get(key);

    if (!full) {
      throw new Error(`[hearthstone][hsdata-project] missing target entity row for key ${key}`);
    }

    insertRows.push({
      ...full,
      version:  [...row.version],
      isLatest: row.isLatest,
    });
  }

  if (metaRows.length > 0) {
    await updateEntityMetaRows(tx, metaRows, profiler, onProgress);
  }

  if (insertRows.length === 0) {
    return;
  }

  await tx.session.client.unsafe(`
    create temp table hsdata_projection_entity_copy_stage (
      like hearthstone.entities including defaults
    ) on commit drop
  `);

  for (const chunk of chunkValues(insertRows, writeRowBatchSize)) {
    await tx.session.client.unsafe(`truncate hsdata_projection_entity_copy_stage`);
    await copyEntitiesIntoTable(tx, chunk, 'hsdata_projection_entity_copy_stage');
    await analyzeTempTable(tx, 'hsdata_projection_entity_copy_stage');

    // The staged entity insert path only materializes new revision keys after existing keys have already
    // received their metadata-only updates through the temp-table merge above.
    await tx.session.client.unsafe(`
      insert into hearthstone.entities (
        card_id,
        version,
        revision_hash,
        dbf_id,
        legacy_payload,
        set,
        class,
        type,
        cost,
        attack,
        health,
        durability,
        armor,
        rune,
        race,
        spell_school,
        quest_type,
        quest_progress,
        quest_part,
        hero_power,
        tech_level,
        in_bobs_tavern,
        triple_card,
        race_bucket,
        armor_bucket,
        buddy,
        banned_race,
        mercenary_role,
        mercenary_faction,
        colddown,
        collectible,
        elite,
        rarity,
        artist,
        override_watermark,
        faction,
        mechanics,
        referenced_tags,
        text_builder_type,
        change_type,
        is_latest
      )
      select
        stage.card_id,
        stage.version,
        stage.revision_hash,
        stage.dbf_id,
        stage.legacy_payload,
        stage.set,
        stage.class,
        stage.type,
        stage.cost,
        stage.attack,
        stage.health,
        stage.durability,
        stage.armor,
        stage.rune,
        stage.race,
        stage.spell_school,
        stage.quest_type,
        stage.quest_progress,
        stage.quest_part,
        stage.hero_power,
        stage.tech_level,
        stage.in_bobs_tavern,
        stage.triple_card,
        stage.race_bucket,
        stage.armor_bucket,
        stage.buddy,
        stage.banned_race,
        stage.mercenary_role,
        stage.mercenary_faction,
        stage.colddown,
        stage.collectible,
        stage.elite,
        stage.rarity,
        stage.artist,
        stage.override_watermark,
        stage.faction,
        stage.mechanics,
        stage.referenced_tags,
        stage.text_builder_type,
        stage.change_type,
        stage.is_latest
      from hsdata_projection_entity_copy_stage as stage
      where not exists (
        select 1
        from hearthstone.entities as target
        where target.card_id = stage.card_id
          and target.revision_hash = stage.revision_hash
                )
    `);

    await onProgress?.({
      message: `Inserted brand-new entity rows into the shared tables (${chunk.length} rows)`,
      advance: chunk.length,
      segment: 'entity',
    });
  }

  profiler?.mark('write_entities_insert_new_rows', {
    rowCount: insertRows.length,
  });
}

/** Updates only entity version/isLatest metadata for historical rows whose payload did not change. */
async function updateEntityMetaRows(
  tx: DbTx,
  rows: EntityStateRow[],
  profiler?: ProjectWriteProfiler,
  onProgress?: WriteProgressReporter,
) {
  if (rows.length === 0) {
    return;
  }

  for (const chunk of chunkValues(rows, writeRowBatchSize)) {
    for (const row of chunk) {
      await tx.update(BaseEntity)
        .set({ version: row.version, isLatest: row.isLatest })
        .where(and(
          eq(Entity.cardId, row.cardId),
          eq(Entity.revisionHash, row.revisionHash),
        ));
    }

    await onProgress?.({
      message: `Updated entity metadata rows (${Math.min(rows.length, chunk.length)} rows in current batch)`,
      advance: chunk.length,
      segment: 'entity',
    });
  }

  profiler?.mark('write_entities_update_meta_rows', {
    rowCount: rows.length,
  });
}

/** Synchronizes only reconciled localization deltas instead of staging every historical row for the projected cards. */
async function syncLocalizations(
  tx: CopyTx,
  plan: SyncPlan<LocalizationStateRow>,
  existingRowsByKey: Map<RowKey, LocalizationStateRow>,
  targetRowsByKey: Map<RowKey, LocalizationRow>,
  build: number,
  skipLatestUpdate: boolean,
  profiler?: ProjectWriteProfiler,
  onProgress?: WriteProgressReporter,
  latestRowCountByGroup?: Map<RowKey, number>,
) {
  if (plan.deleteRows.length === 0 && plan.upsertRows.length === 0) {
    return;
  }

  const affectedGroups = [
    ...new Map(
      [...plan.deleteRows, ...plan.upsertRows].map(row => [localizationGroupKey(row), {
        cardId: row.cardId,
        lang:   row.lang,
      }]),
    ).values(),
  ];

  if (plan.deleteRows.length > 0) {
    await tx.session.client.unsafe(`
      create temp table hsdata_projection_localization_delete_stage
      on commit drop as
      select
        card_id,
        lang,
        revision_hash,
        localization_hash
      from hearthstone.entity_localizations
      with no data
    `);

    for (const chunk of chunkValues(plan.deleteRows, writeRowBatchSize)) {
      await tx.session.client.unsafe(`truncate hsdata_projection_localization_delete_stage`);
      await copyLocalizationKeysIntoTable(tx, chunk, 'hsdata_projection_localization_delete_stage');
      await analyzeTempTable(tx, 'hsdata_projection_localization_delete_stage');

      await tx.session.client.unsafe(`
        update hearthstone.entity_localizations as target
        set deleted_at = now()
        from hsdata_projection_localization_delete_stage as stage
        where target.card_id = stage.card_id
          and target.lang = stage.lang
          and target.revision_hash = stage.revision_hash
          and target.localization_hash = stage.localization_hash
      `);

      await onProgress?.({
        message: `Deleted obsolete localization rows from the shared tables (${chunk.length} rows)`,
        advance: chunk.length,
        segment: 'localizationDelete',
      });
    }

    profiler?.mark('write_localizations_delete_rows', {
      rowCount: plan.deleteRows.length,
    });
  }

  if (plan.upsertRows.length === 0) {
    return;
  }

  const insertRows: LocalizationRow[] = [];
  const appendRows: LocalizationStateRow[] = [];
  const metaRows: LocalizationStateRow[] = [];

  for (const row of plan.upsertRows) {
    const key = localizationKey(row);
    const existing = existingRowsByKey.get(key);

    // Existing localization keys already pin the rendered payload by revision/localization hashes, so
    // repeated source versions only need metadata updates. Only new keys need a full row insert.
    if (existing != null) {
      if (isAppendBuildVersion(existing.version, row.version, build)) {
        appendRows.push(row);
      } else {
        metaRows.push(row);
      }
      continue;
    }

    const full = targetRowsByKey.get(key);

    if (!full) {
      throw new Error(`[hearthstone][hsdata-project] missing target localization row for key ${key}`);
    }

    insertRows.push({
      ...full,
      version:  [...row.version],
      isLatest: row.isLatest,
    });
  }

  const combinedMetaRows: Array<LocalizationStateRow & { isAppend: boolean }> = [
    ...metaRows.map(row => ({ ...row, isAppend: false }) as LocalizationStateRow & { isAppend: boolean }),
    ...appendRows.map(row => ({ ...row, isAppend: true }) as LocalizationStateRow & { isAppend: boolean }),
  ];

  if (combinedMetaRows.length > 0) {
    for (const chunk of chunkValues(combinedMetaRows, writeRowBatchSize)) {
      for (const row of chunk) {
        if (row.isAppend) {
          await tx.update(BaseEntityLocalization)
            .set({
              version: sql`array_append(${EntityLocalization.version}, ${build})`,
              renderHash: sql`coalesce(${row.renderHash ?? null}, ${EntityLocalization.renderHash})`,
              renderModel: sql`coalesce(${row.renderModel != null ? JSON.stringify(row.renderModel) : null}::jsonb, ${EntityLocalization.renderModel})`,
            })
            .where(and(
              eq(EntityLocalization.cardId, row.cardId),
              sql`${EntityLocalization.lang} = ${row.lang}`,
              eq(EntityLocalization.revisionHash, row.revisionHash),
              eq(EntityLocalization.localizationHash, row.localizationHash),
              sql`NOT (${build} = any(${EntityLocalization.version}))`,
            ));
        } else {
          const metaRow = row as typeof metaRows[number];
          await tx.update(BaseEntityLocalization)
            .set({
              version: metaRow.version,
              renderHash: sql`coalesce(${metaRow.renderHash ?? null}, ${EntityLocalization.renderHash})`,
              renderModel: sql`coalesce(${metaRow.renderModel != null ? JSON.stringify(metaRow.renderModel) : null}::jsonb, ${EntityLocalization.renderModel})`,
            })
            .where(and(
              eq(EntityLocalization.cardId, metaRow.cardId),
              sql`${EntityLocalization.lang} = ${metaRow.lang}`,
              eq(EntityLocalization.revisionHash, metaRow.revisionHash),
              eq(EntityLocalization.localizationHash, metaRow.localizationHash),
            ));
        }
      }

      await onProgress?.({
        message: `Updated localization metadata rows (${chunk.length} rows)`,
        advance: chunk.length,
        segment: 'localization',
      });
    }

    profiler?.mark('write_localizations_update_meta_rows', {
      metaRowCount: metaRows.length,
      appendRowCount: appendRows.length,
    });
  }

  if (insertRows.length > 0) {
    await tx.session.client.unsafe(`
      create temp table hsdata_projection_localization_copy_stage (
        like hearthstone.entity_localizations including defaults
      ) on commit drop
    `);

    for (const chunk of chunkValues(insertRows, writeRowBatchSize)) {
      await tx.session.client.unsafe(`truncate hsdata_projection_localization_copy_stage`);
      await copyLocalizationsIntoTable(tx, chunk, 'hsdata_projection_localization_copy_stage');
      await analyzeTempTable(tx, 'hsdata_projection_localization_copy_stage');

      // The staged localization insert path only materializes new composite keys after existing keys have
      // already received their metadata-only updates through the temp-table merge above.
      await tx.session.client.unsafe(`
        insert into hearthstone.entity_localizations (
          card_id,
          version,
          lang,
          revision_hash,
          localization_hash,
          render_hash,
          render_model,
          is_latest,
          name,
          text,
          rich_text,
          display_text,
          target_text,
          text_in_play,
          how_to_earn,
          how_to_earn_golden,
          flavor_text,
          loc_change_type
        )
        select
          stage.card_id,
          stage.version,
          stage.lang,
          stage.revision_hash,
          stage.localization_hash,
          stage.render_hash,
          stage.render_model,
          stage.is_latest,
          stage.name,
          stage.text,
          stage.rich_text,
          stage.display_text,
          stage.target_text,
          stage.text_in_play,
          stage.how_to_earn,
          stage.how_to_earn_golden,
          stage.flavor_text,
          stage.loc_change_type
        from hsdata_projection_localization_copy_stage as stage
        where not exists (
          select 1
          from hearthstone.entity_localizations as target
          where target.card_id = stage.card_id
            and target.lang = stage.lang
            and target.revision_hash = stage.revision_hash
            and target.localization_hash = stage.localization_hash
                    )
      `);

      await onProgress?.({
        message: `Inserted brand-new localization rows into the shared tables (${chunk.length} rows)`,
        advance: chunk.length,
        segment: 'localization',
      });
    }

    profiler?.mark('write_localizations_insert_new_rows', {
      rowCount: insertRows.length,
    });
  }

  if (!skipLatestUpdate) {
    await refreshLocalizationLatestRows(
      tx,
      affectedGroups,
      profiler,
      onProgress,
      latestRowCountByGroup,
    );
  }
}

/** Recomputes one affected localization family's latest flag after version-only changes have been written. */
async function refreshLocalizationLatestRows(
  tx: DbTx,
  rows: Array<Pick<LocalizationStateRow, 'cardId' | 'lang'>>,
  profiler?: ProjectWriteProfiler,
  onProgress?: WriteProgressReporter,
  latestRowCountByGroup?: Map<RowKey, number>,
) {
  if (rows.length === 0) {
    return;
  }

  const uniqueGroups = [...new Map(rows.map(r => [localizationGroupKey(r), r])).values()];

  for (const chunk of chunkValues(uniqueGroups, writeRowBatchSize)) {
    for (const group of chunk) {
      const groupRows = await tx.select({
        cardId: EntityLocalization.cardId,
        lang: EntityLocalization.lang,
        revisionHash: EntityLocalization.revisionHash,
        localizationHash: EntityLocalization.localizationHash,
        version: EntityLocalization.version,
        isLatest: EntityLocalization.isLatest,
      })
        .from(EntityLocalization)
        .where(and(
          eq(EntityLocalization.cardId, group.cardId),
          sql`${EntityLocalization.lang} = ${group.lang}`,
                  ));

      if (groupRows.length === 0) continue;

      let maxBuild = 0;
      for (const r of groupRows) {
        const last = r.version[r.version.length - 1];
        if (last !== undefined && last > maxBuild) maxBuild = last;
      }

      for (const r of groupRows) {
        const shouldBeLatest = maxBuild > 0 && r.version.includes(maxBuild);
        if (r.isLatest !== shouldBeLatest) {
          await tx.update(BaseEntityLocalization)
            .set({ isLatest: shouldBeLatest })
            .where(and(
              eq(EntityLocalization.cardId, r.cardId),
              sql`${EntityLocalization.lang} = ${r.lang}`,
              eq(EntityLocalization.revisionHash, r.revisionHash),
              eq(EntityLocalization.localizationHash, r.localizationHash),
            ));
        }
      }
    }

    const chunkAdvance = chunk.reduce((count, row) => {
      const groupKey = localizationGroupKey(row);
      return count + (latestRowCountByGroup?.get(groupKey) ?? 0);
    }, 0);

    await onProgress?.({
      message: `Refreshed localization latest flags for affected card-language groups (${chunk.length} groups)`,
      advance: chunkAdvance,
      segment: 'latest',
    });
  }

  profiler?.mark('write_localizations_refresh_latest_rows', {
    rowCount: rows.length,
  });
}

async function insertRelations(tx: DbTx, rows: RelationRow[]) {
  for (const chunk of chunkValues(rows)) {
    if (chunk.length === 0) {
      continue;
    }

    await tx.insert(BaseEntityRelation)
      .values(chunk)
      .onConflictDoNothing();
  }
}

/** Inserts relation rows while ignoring existing primary keys so repeated writes can exercise the write path safely. */
async function insertRelationsIgnoreDuplicates(tx: DbTx, rows: RelationRow[]) {
  for (const chunk of chunkValues(rows)) {
    if (chunk.length === 0) {
      continue;
    }

    await tx.insert(BaseEntityRelation)
      .values(chunk)
      .onConflictDoNothing();
  }
}

interface DiffSample {
  key: string;
  existingVersion: number[];
  targetVersion: number[];
  mergedVersion: number[];
  existingIsLatest: boolean;
  targetIsLatest: boolean;
  existingRenderHash: string | null;
  targetRenderHash: string | null;
  existingRenderModel: unknown;
  targetRenderModel: unknown;
  reasons: string[];
}

const MAX_DIFF_SAMPLES = 10;

interface SummarizeDiffOptions<TE, TT> {
  build:            number;
  skipLatestUpdate: boolean;
  keyOf:            (r: TE | TT) => string;
  renderHashOf:     (r: TE | TT) => string | null | undefined;
  renderModelOf?:   (r: TT) => unknown;
  existingRenderModelOf?: (r: TE) => unknown;
  label:            string;
  outSamples:       DiffSample[];
}

/** Simulates mergeVersion and compares existing vs target state, categorising reasons. */
function summarizeDiff<TE extends { version: number[]; isLatest: boolean }, TT extends { version: number[]; isLatest: boolean }>(
  existing: TE[],
  targets: TT[],
  opts: SummarizeDiffOptions<TE, TT>,
): DiffBreakdown {
  const existingByKey = new Map(existing.map(r => [opts.keyOf(r), r]));
  let versionMatch = 0;
  let versionChanged = 0;
  let isLatestChanged = 0;
  let renderHashChanged = 0;
  let renderHashNullExisting = 0;
  const hasRender = opts.renderHashOf !== noRenderHash;

  let orphanCount = 0;
  const targetKeySet = new Set(targets.map(t => opts.keyOf(t)));

  for (const t of targets) {
    const e = existingByKey.get(opts.keyOf(t));
    if (!e) continue;

    const nextVersion = e.version.filter(v => v !== opts.build);
    const merged = mergeVersion(nextVersion, ...t.version);

    const verSame = merged.join(',') === e.version.join(',');
    const resolvedLatest = opts.skipLatestUpdate ? e.isLatest : t.isLatest;
    const isLatestSame = resolvedLatest === e.isLatest;
    const renderSame = !hasRender || (opts.renderHashOf(t) ?? null) === (opts.renderHashOf(e) ?? null);
    // The metadata-update path can set renderHash without renderModel, causing
    // hash match even when the stored model is stale. Check model content too.
    const renderModelSame = !opts.renderModelOf || !opts.existingRenderModelOf
      || canonicalize(opts.renderModelOf(t)) === canonicalize(opts.existingRenderModelOf(e) ?? null);
    const renderReallySame = renderSame && renderModelSame;

    if (verSame && isLatestSame && renderReallySame) {
      versionMatch += 1;
      continue;
    }

    if (!verSame) versionChanged += 1;
    if (!isLatestSame && verSame) isLatestChanged += 1;
    if (hasRender && (!renderSame || !renderModelSame)) {
      renderHashChanged += 1;
      if ((opts.renderHashOf(e) ?? null) == null) renderHashNullExisting += 1;
    }

    if (opts.outSamples.length < MAX_DIFF_SAMPLES) {
      const reasons: string[] = [];
      if (!verSame) reasons.push('version');
      if (!isLatestSame && verSame) reasons.push('isLatest');
      if (hasRender && (!renderSame || !renderModelSame)) reasons.push('renderHash');
      opts.outSamples.push({
        key: `${opts.label}:${opts.keyOf(t)}`,
        existingVersion: e.version,
        targetVersion: t.version,
        mergedVersion: merged,
        existingIsLatest: e.isLatest,
        targetIsLatest: t.isLatest,
        existingRenderHash: hasRender ? (opts.renderHashOf(e) ?? null) : null,
        targetRenderHash: hasRender ? (opts.renderHashOf(t) ?? null) : null,
        existingRenderModel: opts.existingRenderModelOf?.(e) ?? null,
        targetRenderModel: opts.renderModelOf?.(t) ?? null,
        reasons,
      });
    }
  }

  // Existing rows without a matching target: build removed from version, may trigger upsert.
  for (const e of existing) {
    if (targetKeySet.has(opts.keyOf(e))) continue;
    const nextVersion = e.version.filter(v => v !== opts.build);
    if (nextVersion.length === 0) continue; // would be deleted, not upserted
    if (nextVersion.join(',') !== e.version.join(',')) {
      orphanCount += 1;
      if (opts.outSamples.length < MAX_DIFF_SAMPLES) {
        opts.outSamples.push({
          key: `${opts.label}(orphan):${opts.keyOf(e)}`,
          existingVersion: e.version,
          targetVersion: [],
          mergedVersion: nextVersion,
          existingIsLatest: e.isLatest,
          targetIsLatest: e.isLatest,
          existingRenderHash: hasRender ? (opts.renderHashOf(e) ?? null) : null,
          targetRenderHash: null,
          existingRenderModel: opts.existingRenderModelOf?.(e) ?? null,
          targetRenderModel: null,
          reasons: ['version(removed build)'],
        });
      }
    }
  }

  return {
    versionMatch,
    versionChanged,
    isLatestChanged,
    orphanVersionChanged: orphanCount,
    ...(hasRender ? { renderHashChanged, renderHashNullExisting } : {}),
  };
}

function noRenderHash(_r: unknown): null { return null; }

export async function projectHsdata(input: ProjectHsdataInput): Promise<ProjectHsdataReport> {
  const dryRun = input.dryRun ?? false;
  const force = input.force ?? false;
  const skipLatestUpdate = input.skipLatestUpdate ?? false;
  const profiler = createHsdataProfiler('project', {
    sourceTag: input.sourceTag,
    dryRun,
    force,
    skipLatestUpdate,
  }, {
    onMark: input.onProfileMark,
    silent: input.onProfileMark != null,
  });
  try {
    const sourceVersion = await getSourceVersion(input.sourceTag);
    profiler.mark('load_source_version');

    if (!sourceVersion) {
      throw new Error(`[hearthstone][hsdata-project] sourceTag ${input.sourceTag} does not exist`);
    }

    if (sourceVersion.status !== 'completed') {
      throw new Error(`[hearthstone][hsdata-project] sourceTag ${input.sourceTag} is not completed`);
    }

    if (sourceVersion.build == null) {
      throw new Error(`[hearthstone][hsdata-project] sourceTag ${input.sourceTag} is missing build`);
    }

  await input.onProgress?.({
    phase:                   'loading_snapshots',
    message:                 'Loading raw snapshots from the local database',
    totalSnapshotCount:      null,
    completedSnapshotCount:  0,
    totalWorkCount:          null,
    completedWorkCount:      null,
    workLabel:               'snapshot',
  });

  const snapshots = await loadSnapshots(input.sourceTag, force);
  const [{ count: totalSnapshotCount }] = await db.select({
    count: sql<number>`count(*)`,
  }).from(RawEntitySnapshot)
    .where(sql<boolean>`${input.sourceTag} = ANY(${RawEntitySnapshot.sourceTags})`);
  profiler.mark('load_snapshots', {
    build:         sourceVersion.build,
    snapshotCount: snapshots.length,
  });

    if (snapshots.length === 0) {
      if (totalSnapshotCount === 0) {
        throw new Error(`[hearthstone][hsdata-project] no raw snapshots found for sourceTag ${input.sourceTag}`);
      }

      await input.onProgress?.({
        phase:                   'completed',
        message:                 'All snapshots already projected, nothing to do',
        totalSnapshotCount:      totalSnapshotCount,
        completedSnapshotCount:  totalSnapshotCount,
        totalWorkCount:          totalSnapshotCount,
        completedWorkCount:      totalSnapshotCount,
        workLabel:               'snapshot',
        writeBreakdown:          null,
      });

      profiler.done({ outcome: 'skipped', snapshotCount: 0 });

      return {
        dryRun,
        skipped:               true,
        sourceTag:             input.sourceTag,
        build:                 sourceVersion.build,
        snapshotCount:         0,
        totalSnapshotCount,
        skippedSnapshotCount:  totalSnapshotCount,
        insertedEntities:      0,
        reusedEntities:        0,
        updatedEntities:       0,
        insertedLocalizations: 0,
        reusedLocalizations:   0,
        updatedLocalizations:  0,
        insertedRelations:     0,
        reusedRelations:       0,
        updatedRelations:      0,
        cardRowCount:          0,
        unprojectedTagCount:   0,
        entityPlan:            { upsert: 0, delete: 0 },
        localizationPlan:      { upsert: 0, delete: 0 },
        relationPlan:          { upsert: 0, delete: 0 },
        entityDiff:            { versionMatch: 0, versionChanged: 0, isLatestChanged: 0, orphanVersionChanged: 0 },
        localizationDiff:      { versionMatch: 0, versionChanged: 0, isLatestChanged: 0, orphanVersionChanged: 0, renderHashChanged: 0, renderHashNullExisting: 0 },
        relationDiff:          { versionMatch: 0, versionChanged: 0, isLatestChanged: 0, orphanVersionChanged: 0 },
        sampleDiffPath:        null,
      };
    }

  // Collect all sourceTags referenced by the loaded snapshots and resolve their builds.
  // Each snapshot may belong to multiple sourceTags. Writing all builds at once lets later
  // projections skip rows whose builds are already present in the version array.
  const allSourceTags = [...new Set(snapshots.flatMap(s => s.sourceTags))];
  const buildsBySourceTag = await getBuildsBySourceTags(allSourceTags);
  const buildsBySnapshotId = new Map<string, number[]>();
  for (const snapshot of snapshots) {
    const builds = snapshot.sourceTags
      .map(st => buildsBySourceTag.get(st))
      .filter((b): b is number => b != null);
    if (builds.length > 0) {
      buildsBySnapshotId.set(snapshot.id, mergeVersion(...builds));
    }
  }
  profiler.mark('resolve_source_tag_builds', {
    sourceTagCount: allSourceTags.length,
    resolvedCount:  buildsBySourceTag.size,
    skippedCount:   allSourceTags.length - buildsBySourceTag.size,
  });

  await input.onProgress?.({
    phase:                   'loading_tags',
    message:                 'Loading raw snapshot tags and projection rules',
    totalSnapshotCount:      snapshots.length,
    completedSnapshotCount:  0,
    totalWorkCount:          snapshots.length,
    completedWorkCount:      0,
    workLabel:               'snapshot',
  });

  const snapshotIdSet = new Set(snapshots.map(snapshot => snapshot.id));
  const rawTags = await loadSnapshotTags([...snapshotIdSet], async (completedSnapshotCount, totalSnapshotCount) => {
    await input.onProgress?.({
      phase:                   'loading_tags',
      message:                 `Loaded tags for ${completedSnapshotCount} of ${totalSnapshotCount} snapshots`,
      totalSnapshotCount:      snapshots.length,
      completedSnapshotCount:  completedSnapshotCount,
      totalWorkCount:          totalSnapshotCount,
      completedWorkCount:      completedSnapshotCount,
      workLabel:               'snapshot',
    });
  });
  profiler.mark('load_snapshot_tags', {
    snapshotCount: snapshots.length,
    rawTagCount:   rawTags.length,
  });
  const enumIds = [...new Set(rawTags.map(row => row.enumId))].sort((left, right) => left - right);
  const tagMap = await loadTagRows(enumIds);
  profiler.mark('load_tag_rows', {
    enumIdCount: enumIds.length,
    tagRuleCount: tagMap.size,
  });
  const rawTagsBySnapshotId = new Map<string, RawSnapshotTagRow[]>();

  for (const row of rawTags) {
    const rows = rawTagsBySnapshotId.get(row.snapshotId) ?? [];
    rows.push(row);
    rawTagsBySnapshotId.set(row.snapshotId, rows);
  }

  const cardIdByDbfId = new Map(snapshots.map(snapshot => [snapshot.dbfId, snapshot.cardId]));
  const slugByEnumId = new Map(
    [...tagMap.values()].map(tag => [tag.enumId, tag.slug]),
  );
  const setIdByDbfId = await loadSetIdByDbfId();
  profiler.mark('build_projection_context', {
    cardRefCount: cardIdByDbfId.size,
    slugCount:    slugByEnumId.size,
    setCount:     setIdByDbfId.size,
  });
  const context: ProjectionContext = {
    slugByEnumId,
    cardIdByDbfId,
    setIdByDbfId,
  };

  await input.onProgress?.({
    phase:                   'projecting_snapshots',
    message:                 'Projecting snapshots into shared entity rows',
    totalSnapshotCount:      snapshots.length,
    completedSnapshotCount:  0,
    totalWorkCount:          snapshots.length,
    completedWorkCount:      0,
    workLabel:               'snapshot',
  });

  const projected: ProjectedSnapshot[] = [];

  for (let index = 0; index < snapshots.length; index += 1) {
    const snapshot = snapshots[index]!;
    projected.push(projectSnapshot(
      snapshot,
      rawTagsBySnapshotId.get(snapshot.id) ?? [],
      tagMap,
      context,
    ));

    const completedSnapshotCount = index + 1;

    const shouldReportProgress = (
      completedSnapshotCount <= 10
      || completedSnapshotCount === snapshots.length
      || completedSnapshotCount % projectProgressBatchSize === 0
    );

    if (input.onProgress && shouldReportProgress) {
      await input.onProgress({
        phase:                   'projecting_snapshots',
        message:                 `Projected ${completedSnapshotCount} of ${snapshots.length} snapshots`,
        totalSnapshotCount:      snapshots.length,
        completedSnapshotCount,
        totalWorkCount:          snapshots.length,
        completedWorkCount:      completedSnapshotCount,
        workLabel:               'snapshot',
        writeBreakdown:          null,
      });

      await yieldProgressEventLoop();
    }
  }
  profiler.mark('project_snapshots', {
    snapshotCount:      projected.length,
    entityCount:        projected.length,
    localizationCount:  projected.reduce((count, item) => count + item.localizations.length, 0),
    relationCount:      projected.reduce((count, item) => count + item.relations.length, 0),
    unprojectedTagCount: projected.reduce((count, item) => count + item.unprojectedTagCount, 0),
  });

  const targetEntities = projected.map(item => ({
    ...item.entity,
    version:  buildsBySnapshotId.get(item.snapshotId) ?? [sourceVersion.build!],
    isLatest: false,
  }));
  const targetEntityStates: EntityStateRow[] = targetEntities.map(row => ({
    cardId:       row.cardId,
    version:      row.version,
    revisionHash: row.revisionHash,
    isLatest:     row.isLatest,
  }));
  const targetLocalizations = projected.flatMap(item => item.localizations.map(row => ({
    ...row,
    version:  buildsBySnapshotId.get(item.snapshotId) ?? [sourceVersion.build!],
    isLatest: false,
  })));
  const targetLocalizationStates: LocalizationStateRow[] = targetLocalizations.map(row => ({
    cardId:           row.cardId,
    version:          row.version,
    lang:             row.lang,
    revisionHash:     row.revisionHash,
    localizationHash: row.localizationHash,
    renderHash:       row.renderHash,
    renderModel:      row.renderModel,
    isLatest:         row.isLatest,
  }));
  const targetRelations = projected.flatMap(item => item.relations.map(row => ({
    ...row,
    version:  buildsBySnapshotId.get(item.snapshotId) ?? [sourceVersion.build!],
    isLatest: false,
  })));
  const entityCardIds = [...new Set(targetEntities.map(row => row.cardId))].sort();
  const localizationGroups = [
    ...new Map(
      targetLocalizations.map(row => [localizationGroupKey(row), {
        cardId: row.cardId,
        lang:   row.lang,
      }]),
    ).values(),
  ].sort((left, right) => {
    const cardCompare = left.cardId.localeCompare(right.cardId);
    return cardCompare !== 0 ? cardCompare : left.lang.localeCompare(right.lang);
  });
  const targetEntityRowsByKey = new Map(targetEntities.map(row => [entityKey(row), row]));
  const targetLocalizationRowsByKey = new Map(targetLocalizations.map(row => [localizationKey(row), row]));
  const summarizeTotalWork = entityCardIds.length
    + localizationGroups.length
    + targetEntityStates.length
    + targetLocalizationStates.length
    + targetRelations.length;
  let completedSummarizeWork = 0;
  const reportSummarizeProgress = async (message: string, advance = 0) => {
    completedSummarizeWork += advance;

    await input.onProgress?.({
      phase:                   'summarizing_changes',
      message,
      totalSnapshotCount:      snapshots.length,
      completedSnapshotCount:  snapshots.length,
      totalWorkCount:          summarizeTotalWork,
      completedWorkCount:      Math.min(completedSummarizeWork, summarizeTotalWork),
      workLabel:               'row',
      writeBreakdown:          null,
    });
  };

  const cardIds = entityCardIds;
  const sourceIds = [...cardIds];
  const localizationTargetBuilds = [...new Set(targetLocalizationStates.flatMap(row => row.version))];
  await reportSummarizeProgress('Loading existing shared rows for the projected result set');
  const {
    entities: existingEntities,
    localizations: existingLocalizations,
    relations: existingRelations,
  } = await loadExistingRowsForProjection(
    sourceVersion.build,
    entityCardIds,
    localizationGroups,
    targetLocalizationStates,
    localizationTargetBuilds,
    sourceIds,
    profiler,
    reportSummarizeProgress,
  );
  profiler.mark('load_existing_rows', {
    cardCount:                   cardIds.length,
    existingEntityCount:         existingEntities.length,
    existingLocalizationCount:   existingLocalizations.length,
    existingRelationCount:       existingRelations.length,
    targetEntityCount:           targetEntities.length,
    targetLocalizationCount:     targetLocalizations.length,
    targetRelationCount:         targetRelations.length,
  });
  const existingEntityRowsByKey = new Map(existingEntities.map(row => [entityKey(row), row]));
  const existingLocalizationRowsByKey = new Map(existingLocalizations.map(row => [localizationKey(row), row]));

  await reportSummarizeProgress('Reconciling projected rows against the shared tables');

  const [maxBuildRow] = await db.select({ maxBuild: sql<number>`MAX(${SourceVersion.build})` })
    .from(SourceVersion)
    .where(eq(SourceVersion.projectionStatus, 'completed'));
  const globalLatest = maxBuildRow?.maxBuild ?? sourceVersion.build;

  const entityResult = await reconcileRows(existingEntities, targetEntityStates, {
    build:            sourceVersion.build,
    skipLatestUpdate,
    keyOf:            entityKey,
    groupKey:         row => row.cardId,
    stateOf:          entityState,
    globalLatest,
  }, reportSummarizeProgress, 'entity');
  profiler.mark('reconcile_entities', {
    insertedEntities: entityResult.inserted,
    reusedEntities:   entityResult.reused,
    updatedEntities:  entityResult.updated,
    finalEntityCount: entityResult.finalRows.length,
    changed:          entityResult.changed,
  });
  const localizationResult = await reconcileRows(existingLocalizations, targetLocalizationStates, {
    build:            sourceVersion.build,
    skipLatestUpdate,
    keyOf:            localizationKey,
    groupKey:         localizationGroupKey,
    stateOf:          localizationState,
    globalLatest,
  }, reportSummarizeProgress, 'localization');
  profiler.mark('reconcile_localizations', {
    insertedLocalizations: localizationResult.inserted,
    reusedLocalizations:   localizationResult.reused,
    updatedLocalizations:  localizationResult.updated,
    finalLocalizationCount: localizationResult.finalRows.length,
    changed:               localizationResult.changed,
  });
  const relationResult = await reconcileRows(existingRelations, targetRelations, {
    build:            sourceVersion.build,
    skipLatestUpdate,
    keyOf:            relationKey,
    groupKey:         row => row.sourceId,
    stateOf:          relationState,
    globalLatest,
  }, reportSummarizeProgress, 'relation');
  profiler.mark('reconcile_relations', {
    insertedRelations: relationResult.inserted,
    reusedRelations:   relationResult.reused,
    updatedRelations:  relationResult.updated,
    finalRelationCount: relationResult.finalRows.length,
    changed:           relationResult.changed,
  });
  await reportSummarizeProgress('Reconciled projected rows against the shared tables');

  // Surface reconciled counts so the frontend can show how many rows were skipped.
  await input.onProgress?.({
    phase:                   'summarizing_changes',
    message:                 'Reconciled projected rows against the shared tables',
    totalSnapshotCount:      snapshots.length,
    completedSnapshotCount:  snapshots.length,
    totalWorkCount:          summarizeTotalWork,
    completedWorkCount:      summarizeTotalWork,
    workLabel:               'row',
    writeBreakdown:          null,
    reconciledCounts: {
      reusedEntities:        entityResult.reused,
      reusedLocalizations:   localizationResult.reused,
      reusedRelations:       relationResult.reused,
      insertedEntities:      entityResult.inserted,
      insertedLocalizations: localizationResult.inserted,
      insertedRelations:     relationResult.inserted,
      updatedEntities:       entityResult.updated,
      updatedLocalizations:  localizationResult.updated,
      updatedRelations:      relationResult.updated,
    },
  });

  // Compute per-field diff breakdowns (simulating mergeVersion, for dry-run diagnostics).
  const entitySamples: DiffSample[] = [];
  const locSamples: DiffSample[] = [];
  const relSamples: DiffSample[] = [];
  const entityDiff = summarizeDiff(existingEntities, targetEntities, {
    build: sourceVersion.build, skipLatestUpdate,
    keyOf: r => entityKey(r), renderHashOf: noRenderHash, label: 'entity', outSamples: entitySamples,
  });
  const localizationDiff = summarizeDiff(existingLocalizations, targetLocalizations, {
    build: sourceVersion.build, skipLatestUpdate,
    keyOf: r => localizationKey(r), renderHashOf: r => r.renderHash,
    renderModelOf: r => (r as LocalizationRow).renderModel,
    existingRenderModelOf: r => (r as LocalizationStateRow).renderModel ?? null,
    label: 'localization', outSamples: locSamples,
  });
  const relationDiff = summarizeDiff(existingRelations, targetRelations, {
    build: sourceVersion.build, skipLatestUpdate,
    keyOf: r => relationKey(r), renderHashOf: noRenderHash, label: 'relation', outSamples: relSamples,
  });
  const diffSamples = [...locSamples, ...entitySamples, ...relSamples];
  let sampleDiffPath: string | null = null;
  if (input.sampleDiff && diffSamples.length > 0) {
    const dir = join(tmpdir(), 'hsdata-diff-samples');
    mkdirSync(dir, { recursive: true });
    sampleDiffPath = join(dir, `diff-${sourceVersion.sourceTag}-${Date.now()}.json`);
    writeFileSync(sampleDiffPath, JSON.stringify(diffSamples, null, 2), 'utf-8');
    console.log(`[hsdata-project] wrote ${diffSamples.length} diff samples to ${sampleDiffPath}`);
  }

  const entityPlan = entityResult.syncPlan;
  const localizationPlan = localizationResult.syncPlan;
  const relationPlan = relationResult.syncPlan;
  const entityWriteBreakdown = buildEntityWriteBreakdown(
    entityPlan,
    existingEntityRowsByKey,
  );
  const localizationWriteBreakdown = buildLocalizationWriteBreakdown(
    localizationPlan,
    localizationResult.finalRows,
    existingLocalizationRowsByKey,
    sourceVersion.build,
  );
  const changed = entityResult.changed || localizationResult.changed || relationResult.changed;
  const skipped = !changed && !force;
  // `force` keeps the source eligible for a fresh write-path run. When the reconciled result is
  // unchanged, the duplicate-safe branch writes only the current target rows and ignores existing
  // primary keys so repeated runs do not rewrite or remove shared-table state.
  const shouldWrite = changed || force;
  const ignoreDuplicates = force && !changed;
  profiler.mark('summarize_projection', {
    changed,
    skipped,
    shouldWrite,
    ignoreDuplicates,
  });

  const publishedCardIds = [...new Set(targetEntities.map(e => e.cardId))].sort();

  if (!dryRun && shouldWrite) {
    const writeProgressTotals = buildWriteProgressTotals({
      ignoreDuplicates,
      skipLatestUpdate,
      entity: entityWriteBreakdown,
      localization: localizationWriteBreakdown,
      relationDeleteCount: ignoreDuplicates ? 0 : relationPlan.deleteRows.length,
      relationInsertCount: ignoreDuplicates ? targetRelations.length : relationPlan.upsertRows.length,
      targetEntityCount: targetEntities.length,
      targetLocalizationCount: targetLocalizations.length,
      targetRelationCount: targetRelations.length,
      targetCardCount: publishedCardIds.length,
    });
    const totalWriteRows = writeProgressTotals.entity
      + writeProgressTotals.localization
      + writeProgressTotals.latest
      + writeProgressTotals.relation
      + writeProgressTotals.card
      + writeProgressTotals.entityDelete
      + writeProgressTotals.localizationDelete
      + writeProgressTotals.relationDelete;
    await input.onProgress?.({
      phase:                   'writing_rows',
      message:                 'Preparing to write projected rows into the shared tables',
      totalSnapshotCount:      snapshots.length,
      completedSnapshotCount:  snapshots.length,
      totalWorkCount:          totalWriteRows,
      completedWorkCount:      0,
      workLabel:               'row',
      writeBreakdown:          toWriteProgressBreakdown(writeProgressTotals, {
        entity:             0,
        localization:       0,
        latest:             0,
        relation:           0,
        card:               0,
        entityDelete:       0,
        localizationDelete: 0,
        relationDelete:     0,
      }),
    });

    await db.transaction(async tx => {
      let completedWriteRows = 0;
      const completedWriteBreakdown: WriteProgressBreakdown = {
        entity:             0,
        localization:       0,
        latest:             0,
        relation:           0,
        card:               0,
        entityDelete:       0,
        localizationDelete: 0,
        relationDelete:     0,
      };
      const reportWriteProgress = async (
        message: string,
        advance = 0,
        segment?: WriteProgressSegment,
      ) => {
        completedWriteRows += advance;

        if (segment) {
          completedWriteBreakdown[segment] += advance;
        }

        await input.onProgress?.({
          phase:                   'writing_rows',
          message,
          totalSnapshotCount:      snapshots.length,
          completedSnapshotCount:  snapshots.length,
          totalWorkCount:          totalWriteRows,
          completedWorkCount:      completedWriteRows,
          workLabel:               'row',
          writeBreakdown:          toWriteProgressBreakdown(writeProgressTotals, completedWriteBreakdown),
        });
      };

      if (!ignoreDuplicates) {
        await deleteEntities(tx as CopyTx, entityPlan.deleteRows);
        profiler.mark('write_delete_entities', {
          rowCount: entityPlan.deleted,
        });
        if (entityPlan.deleted > 0) {
          await reportWriteProgress('Deleted obsolete entity rows from the shared tables', entityPlan.deleted, 'entityDelete');
        }
        if (relationPlan.deleteRows.length > 0) {
          await deleteRelationsByKey(tx as CopyTx, relationPlan.deleteRows);
        }
        profiler.mark('write_delete_relations', {
          deletedRowCount: relationPlan.deleted,
        });
        if (relationPlan.deleted > 0) {
          await reportWriteProgress('Deleted stale relation rows for the projected source cards', relationPlan.deleted, 'relationDelete');
        }
      }

      if (ignoreDuplicates) {
        await insertEntitiesIgnoreDuplicates(tx as CopyTx, targetEntities);
        await reportWriteProgress('Inserted projected entity rows with duplicate-safe writes', targetEntities.length, 'entity');
      } else {
        await upsertEntities(
          tx as CopyTx,
          entityPlan,
          existingEntityRowsByKey,
          targetEntityRowsByKey,
          profiler,
          async update => {
            await reportWriteProgress(update.message, update.advance ?? 0, update.segment);
          },
        );
      }
      profiler.mark('write_insert_entities', {
        rowCount: ignoreDuplicates ? targetEntities.length : entityPlan.upsertRows.length,
      });

      if (ignoreDuplicates) {
        await insertLocalizationsIgnoreDuplicates(tx as CopyTx, targetLocalizations);
        await reportWriteProgress('Inserted projected localization rows with duplicate-safe writes', targetLocalizations.length, 'localization');
      } else {
        await syncLocalizations(
          tx as CopyTx,
          localizationPlan,
          existingLocalizationRowsByKey,
          targetLocalizationRowsByKey,
          sourceVersion.build!,
          skipLatestUpdate,
          profiler,
          async update => {
            await reportWriteProgress(update.message, update.advance ?? 0, update.segment);
          },
          localizationWriteBreakdown.latestRowCountByGroup,
        );
      }
      profiler.mark('write_insert_localizations', {
        rowCount: ignoreDuplicates ? targetLocalizations.length : localizationPlan.upsertRows.length,
      });

      if (ignoreDuplicates) {
        await insertRelationsIgnoreDuplicates(tx, targetRelations);
      } else {
        await insertRelations(tx, relationPlan.upsertRows);
      }
      profiler.mark('write_insert_relations', {
        rowCount: ignoreDuplicates ? targetRelations.length : relationPlan.upsertRows.length,
      });
      await reportWriteProgress(
        'Wrote projected relation rows into the shared tables',
        ignoreDuplicates ? targetRelations.length : relationPlan.upsertRows.length,
        'relation',
      );

      if (!dryRun && !skipped) {
        if (publishedCardIds.length > 0) {
          await tx.insert(BaseCard).values(
            publishedCardIds.map(cardId => ({ cardId, legalities: {} })),
          ).onConflictDoNothing();
          profiler.mark('write_ensure_cards', { rowCount: publishedCardIds.length });
          await reportWriteProgress('Ensured card rows exist for projected entities', publishedCardIds.length, 'card');
        }
      }
    });
    profiler.mark('write_transaction_committed');
  }

  if (!dryRun && snapshots.length > 0) {
    await db.update(RawEntitySnapshot)
      .set({ projected: true })
      .where(inArray(RawEntitySnapshot.id, snapshots.map(s => s.id)));
  }

  await input.onProgress?.({
    phase:                   'completed',
    message:                 'Completed hsdata projection',
    totalSnapshotCount:      snapshots.length,
    completedSnapshotCount:  snapshots.length,
    totalWorkCount:          snapshots.length,
    completedWorkCount:      snapshots.length,
    workLabel:               'snapshot',
    writeBreakdown:          null,
  });

    const report = {
      dryRun,
      skipped,
      sourceTag:             input.sourceTag,
      build:                 sourceVersion.build,
      snapshotCount:         snapshots.length,
      totalSnapshotCount:    totalSnapshotCount,
      skippedSnapshotCount:  totalSnapshotCount - snapshots.length,
      insertedEntities:      entityResult.inserted,
      reusedEntities:        entityResult.reused,
      updatedEntities:       entityResult.updated,
      insertedLocalizations: localizationResult.inserted,
      reusedLocalizations:   localizationResult.reused,
      updatedLocalizations:  localizationResult.updated,
      insertedRelations:     relationResult.inserted,
      reusedRelations:       relationResult.reused,
      updatedRelations:      relationResult.updated,
      cardRowCount:          publishedCardIds.length,
      unprojectedTagCount:   projected.reduce((count, item) => count + item.unprojectedTagCount, 0),
      entityPlan:            { upsert: entityPlan.upsertRows.length, delete: entityPlan.deleteRows.length },
      localizationPlan:      { upsert: localizationPlan.upsertRows.length, delete: localizationPlan.deleteRows.length },
      relationPlan:          { upsert: relationPlan.upsertRows.length, delete: relationPlan.deleteRows.length },
      entityDiff,
      localizationDiff,
      relationDiff,
      sampleDiffPath,
    };

    profiler.done({
      outcome: skipped ? 'skipped' : dryRun ? 'dry_run' : 'completed',
      snapshotCount: report.snapshotCount,
      insertedEntities: report.insertedEntities,
      updatedEntities: report.updatedEntities,
      insertedLocalizations: report.insertedLocalizations,
      updatedLocalizations: report.updatedLocalizations,
      insertedRelations: report.insertedRelations,
      updatedRelations: report.updatedRelations,
      unprojectedTagCount: report.unprojectedTagCount,
    });

    return report;
  } catch (error) {
    profiler.mark('failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    profiler.done({ outcome: 'failed' });
    throw error;
  }
}

export async function recomputeLatestProjection(options?: {
  onProgress?: (event: {
    phase: string;
    message: string;
    totalRowCount: number | null;
    completedRowCount: number | null;
    updatedCount: number | null;
  }) => void;
}): Promise<{
  entityRowCount: number;
  localizationRowCount: number;
  relationRowCount: number;
  entityUpdatedCount: number;
  localizationUpdatedCount: number;
  relationUpdatedCount: number;
}> {
  const localDb = getLocalDb();

  const [maxBuildRow] = await localDb.select({ maxBuild: sql<number>`MAX(${SourceVersion.build})` })
    .from(SourceVersion)
    .where(eq(SourceVersion.projectionStatus, 'completed'));
  const globalLatest = maxBuildRow?.maxBuild;

  if (globalLatest == null) {
    throw new Error('No completed source versions found for isLatest recomputation.');
  }

  const entityRows = await localDb.select().from(Entity);
  const entityByCardId = new Map<string, typeof entityRows>();
  for (const row of entityRows) {
    const group = entityByCardId.get(row.cardId) ?? [];
    group.push(row);
    entityByCardId.set(row.cardId, group);
  }

  options?.onProgress?.({
    phase: 'entity',
    message: `Scanning ${entityByCardId.size} entity groups (global latest build ${globalLatest})`,
    totalRowCount: entityByCardId.size,
    completedRowCount: 0,
    updatedCount: 0,
  });

  let entityUpdatedCount = 0;
  let entityCompleted = 0;
  for (const [, rows] of entityByCardId) {
    for (const row of rows) {
      const latest = row.version.includes(globalLatest);
      if (row.isLatest !== latest) {
        await localDb.update(BaseEntity)
          .set({ isLatest: latest })
          .where(and(eq(Entity.cardId, row.cardId), eq(Entity.revisionHash, row.revisionHash)));
        entityUpdatedCount += 1;
      }
    }
    entityCompleted += 1;
    if (options?.onProgress && entityCompleted % 5000 === 0) {
      options.onProgress({
        phase: 'entity',
        message: `Updating entity isLatest (${entityCompleted}/${entityByCardId.size})`,
        totalRowCount: entityByCardId.size,
        completedRowCount: entityCompleted,
        updatedCount: entityUpdatedCount,
      });
    }
  }

  if (options?.onProgress) {
    options.onProgress({
      phase: 'entity',
      message: `Entity isLatest updated (${entityUpdatedCount} changed)`,
      totalRowCount: entityByCardId.size,
      completedRowCount: entityByCardId.size,
      updatedCount: entityUpdatedCount,
    });
  }

  const localizationRows = await localDb.select().from(EntityLocalization);
  const localizationByGroup = new Map<string, typeof localizationRows>();
  for (const row of localizationRows) {
    const key = localizationGroupKey(row);
    const group = localizationByGroup.get(key) ?? [];
    group.push(row);
    localizationByGroup.set(key, group);
  }

  options?.onProgress?.({
    phase: 'localization',
    message: `Scanning ${localizationByGroup.size} localization groups`,
    totalRowCount: localizationByGroup.size,
    completedRowCount: 0,
    updatedCount: 0,
  });

  let localizationUpdatedCount = 0;
  let localizationCompleted = 0;
  for (const [, rows] of localizationByGroup) {
    for (const row of rows) {
      const latest = row.version.includes(globalLatest);
      if (row.isLatest !== latest) {
        await localDb.update(BaseEntityLocalization)
          .set({ isLatest: latest })
          .where(and(
            eq(EntityLocalization.cardId, row.cardId),
            eq(EntityLocalization.lang, row.lang),
            eq(EntityLocalization.revisionHash, row.revisionHash),
            eq(EntityLocalization.localizationHash, row.localizationHash),
          ));
        localizationUpdatedCount += 1;
      }
    }
    localizationCompleted += 1;
    if (options?.onProgress && localizationCompleted % 5000 === 0) {
      options.onProgress({
        phase: 'localization',
        message: `Updating localization isLatest (${localizationCompleted}/${localizationByGroup.size})`,
        totalRowCount: localizationByGroup.size,
        completedRowCount: localizationCompleted,
        updatedCount: localizationUpdatedCount,
      });
    }
  }

  if (options?.onProgress) {
    options.onProgress({
      phase: 'localization',
      message: `Localization isLatest updated (${localizationUpdatedCount} changed)`,
      totalRowCount: localizationByGroup.size,
      completedRowCount: localizationByGroup.size,
      updatedCount: localizationUpdatedCount,
    });
  }

  const relationRows = await localDb.select().from(EntityRelation);
  const relationBySourceId = new Map<string, typeof relationRows>();
  for (const row of relationRows) {
    const group = relationBySourceId.get(row.sourceId) ?? [];
    group.push(row);
    relationBySourceId.set(row.sourceId, group);
  }

  options?.onProgress?.({
    phase: 'relation',
    message: `Scanning ${relationBySourceId.size} relation groups`,
    totalRowCount: relationBySourceId.size,
    completedRowCount: 0,
    updatedCount: 0,
  });

  let relationUpdatedCount = 0;
  let relationCompleted = 0;
  for (const [, rows] of relationBySourceId) {
    const maxVersion = Math.max(...rows.flatMap(r => r.version));
    for (const row of rows) {
      const latest = row.version.includes(maxVersion);
      if (row.isLatest !== latest) {
        await localDb.update(BaseEntityRelation)
          .set({ isLatest: latest })
          .where(and(
            eq(EntityRelation.sourceId, row.sourceId),
            eq(EntityRelation.sourceRevisionHash, row.sourceRevisionHash),
            eq(EntityRelation.relation, row.relation),
            eq(EntityRelation.targetId, row.targetId),
          ));
        relationUpdatedCount += 1;
      }
    }
    relationCompleted += 1;
    if (options?.onProgress && relationCompleted % 5000 === 0) {
      options.onProgress({
        phase: 'relation',
        message: `Updating relation isLatest (${relationCompleted}/${relationBySourceId.size})`,
        totalRowCount: relationBySourceId.size,
        completedRowCount: relationCompleted,
        updatedCount: relationUpdatedCount,
      });
    }
  }

  if (options?.onProgress) {
    options.onProgress({
      phase: 'relation',
      message: `Relation isLatest updated (${relationUpdatedCount} changed)`,
      totalRowCount: relationBySourceId.size,
      completedRowCount: relationBySourceId.size,
      updatedCount: relationUpdatedCount,
    });
  }

  return {
    entityRowCount: entityRows.length,
    localizationRowCount: localizationRows.length,
    relationRowCount: relationRows.length,
    entityUpdatedCount,
    localizationUpdatedCount,
    relationUpdatedCount,
  };
}

