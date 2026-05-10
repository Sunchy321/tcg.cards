import { createHash } from 'node:crypto';

import { eq, inArray, sql } from 'drizzle-orm';
import { SaxesParser, type SaxesTagPlain } from 'saxes';

import { db } from '@tcg-cards/db/db';
import {
  RawEntitySnapshot,
  RawEntitySnapshotTag,
  SourceVersion,
} from '@tcg-cards/db/schema/hearthstone/data/card-model';
import { Set as HearthstoneSet } from '@tcg-cards/db/schema/hearthstone/set';
import { Tag } from '@tcg-cards/db/schema/hearthstone/tag';

import {
  buildHsdataPlaceholderSetId,
  isHsdataPlaceholderSetId,
} from './hsdata-set-placeholder';

// Shared transaction shape for import helpers.
type DbTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

// XML node children used by the local parser.
type XmlChild = XmlElement | string;
// Generic JSON payload fragments stored during import.
export type JsonMap = Record<string, unknown>;
// Referenced tag values that can collapse to booleans.
type ReferencedTagValue = boolean | number;

// Parsed XML element node.
interface XmlElement {
  name:       string;
  attributes: Record<string, string>;
  children:   XmlChild[];
}

// Legacy whole-archive import entrypoint.
export interface ImportHsdataInput {
  xml:           string;
  sourceTag:     number;
  sourceCommit?: string | null;
  sourceUri?:    string | null;
  importEngineVersion?: string | null;
  dryRun?:       boolean;
  force?:        boolean;
}

// Normalized tag value shapes used by raw tag storage.
type TagValueKind
  = | 'bool'
    | 'card_ref'
    | 'int'
    | 'json'
    | 'loc_string'
    | 'string';

// Normalized raw tag before database projection.
export interface RawTagInput {
  enumId:         number;
  rawName:        string;
  rawType:        string;
  rawPayload:     JsonMap;
  rawValue:       string | null;
  locStringValue: Record<string, string> | null;
  cardRefCardId:  string | null;
  tagOrder:       number;
}

// Snapshot content used to derive one parsed entity and snapshot hash.
export interface HsdataSnapshotInput {
  cardId:           string;
  dbfId:            number;
  entityXmlVersion: number;
  tags:             RawTagInput[];
  extraPayload: JsonMap;
}

// Parsed hsdata entity snapshot.
export interface ParsedEntity {
  cardId:           string;
  dbfId:            number;
  entityXmlVersion: number;
  tags:             RawTagInput[];
  extraPayload:     JsonMap;
  snapshotHash:     string;
}

// Parsed hsdata source payload.
export interface ParsedHsdata {
  build:    number;
  entities: ParsedEntity[];
}

// Discovered-tag data already stored in the database.
interface ExistingTagRow {
  enumId:             number;
  slug:               string;
  rawName:            string | null;
  rawType:            string | null;
  rawNames:           string[];
  valueKind:          string;
  normalizeKind:      string;
  projectTargetType:  string | null;
  projectTargetPath:  string | null;
  projectKind:        string | null;
  firstSeenSourceTag: number | null;
  lastSeenSourceTag:  number | null;
}

// Existing raw snapshot row used for reuse checks.
interface SnapshotRow {
  id:           string;
  cardId:       string;
  snapshotHash: string;
  sourceTags:   number[];
}

// source_versions row used by import guards.
interface SourceVersionRow {
  sourceTag:  number;
  build:      number | null;
  sourceHash: string;
  importEngineVersion: string | null;
  status:     string;
}

// source_versions write payload used by status updates.
interface SourceVersionWriteInput {
  sourceTag:    number;
  build:        number | null;
  sourceHash:   string;
  sourceCommit: string | null | undefined;
  sourceUri:    string | null | undefined;
  importEngineVersion: string | null | undefined;
}

const cardSetEnumId = 183;
const cardSetRawName = 'CARD_SET';

// Modeled set ids accepted by downstream projection.
function isModeledSetId(setId: string): boolean {
  return setId.length > 0 && !isHsdataPlaceholderSetId(setId);
}

// Completed raw hsdata import report.
export interface ImportHsdataReport {
  dryRun:                boolean;
  skipped:               boolean;
  sourceTag:             number;
  build:                 number;
  sourceHash:            string;
  entityCount:           number;
  insertedSnapshots:     number;
  reusedSnapshots:       number;
  insertedTagRows:       number;
  discoveredTagCount:    number;
  updatedDiscoveredTags: number;
  fallbackTagRowCount:   number;
  latestSnapshotCount:   number;
  discoveredTags:        number[];
}

// Parsed hsdata payload accepted by the shared import path.
export interface ImportParsedHsdataInput {
  parsed: ParsedHsdata;
  sourceTag: number;
  sourceHash: string;
  sourceCommit?: string | null;
  sourceUri?: string | null;
  importEngineVersion?: string | null;
  dryRun?: boolean;
  force?: boolean;
}

// Stable sha256 digest.
function sha256(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex');
}

// Array form of nullable-or-array inputs.
function toArray<T>(value: T | T[] | null | undefined): T[] {
  if (value == null) {
    return [];
  }

  return Array.isArray(value) ? value : [value];
}

// Deterministic JSON serialization for snapshot hashing.
function canonicalizeJson(value: unknown): string {
  if (value == null) return 'null';
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number' || typeof value === 'boolean') return JSON.stringify(value);

  if (Array.isArray(value)) {
    return `[${value.map(item => canonicalizeJson(item)).join(',')}]`;
  }

  const object = value as Record<string, unknown>;
  const keys = Object.keys(object).sort();
  return `{${keys.map(key => `${JSON.stringify(key)}:${canonicalizeJson(object[key])}`).join(',')}}`;
}

// Hash of canonical JSON payloads.
function hashCanonicalJson(value: unknown): string {
  return sha256(canonicalizeJson(value));
}

// Snapshot hash payload reduced from one normalized entity.
function normalizeSnapshotPayload(input: HsdataSnapshotInput) {
  return {
    cardId:           input.cardId,
    dbfId:            input.dbfId,
    entityXmlVersion: input.entityXmlVersion,
    tags:             input.tags.map(tag => ({
      enumId:         tag.enumId,
      rawName:        tag.rawName,
      rawType:        tag.rawType,
      rawValue:       tag.rawValue,
      locStringValue: tag.locStringValue,
      cardRefCardId:  tag.cardRefCardId,
      tagOrder:       tag.tagOrder,
      rawPayload:     tag.rawPayload,
    })),
    extraPayload:     input.extraPayload,
  };
}

// Snapshot hash derived from the canonical entity payload.
export function computeHsdataSnapshotHash(input: HsdataSnapshotInput): string {
  return hashCanonicalJson(normalizeSnapshotPayload(input));
}

// Parsed entity assembled from normalized snapshot content.
export function buildParsedEntity(input: HsdataSnapshotInput): ParsedEntity {
  return {
    cardId:           input.cardId,
    dbfId:            input.dbfId,
    entityXmlVersion: input.entityXmlVersion,
    tags:             input.tags,
    extraPayload:     input.extraPayload,
    snapshotHash:     computeHsdataSnapshotHash(input),
  };
}

// Canonical sourceHash normalization shared by job imports and the legacy
// whole-archive path so source_versions.source_hash keeps one meaning.
export function normalizeHsdataSourceXml(input: string): string {
  return input
    .replace(/^\uFEFF/, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n');
}

// Canonical sourceHash for one XML payload.
export function computeHsdataSourceHash(input: string): string {
  return sha256(normalizeHsdataSourceXml(input));
}

// Child elements with a given XML tag name.
function getElements(node: XmlElement, name: string): XmlElement[] {
  return node.children.filter(child => typeof child !== 'string' && child.name === name) as XmlElement[];
}

// Trimmed text content from one XML node.
function getText(node: XmlElement): string {
  return node.children
    .filter(child => typeof child === 'string')
    .join('')
    .trim();
}

// Required integer attribute parser.
function toInt(value: string | undefined, field: string): number {
  if (value == null) {
    throw new Error(`Missing integer field: ${field}`);
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid integer field ${field}: ${value}`);
  }

  return parsed;
}

// Optional integer attribute parser.
function toOptionalInt(value: string | undefined): number | null {
  if (value == null || value.length === 0) {
    return null;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

// XML boolean attribute parser.
function toXmlBoolean(value: string | undefined, field: string): boolean {
  if (value == null) {
    throw new Error(`Missing boolean field: ${field}`);
  }

  const normalized = value.toLowerCase();
  if (normalized === 'true' || normalized === '1') return true;
  if (normalized === 'false' || normalized === '0') return false;

  throw new Error(`Invalid boolean field ${field}: ${value}`);
}

// Flag-like integers collapsed to boolean-or-number values.
function toFlagValue(value: number): ReferencedTagValue {
  if (value === 0 || value === 1) {
    return value === 1;
  }

  return value;
}

// Stable discovered-tag slug.
function slugify(rawName: string, enumId: number): string {
  const base = rawName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return `${base || 'tag'}-${enumId}`;
}

// Map key for cardId plus snapshotHash lookups.
function snapshotKey(cardId: string, snapshotHash: string): string {
  return `${cardId}\u0000${snapshotHash}`;
}

// Predictable query-sized chunks for large lists.
function chunkValues<T>(values: T[], size = 2000): T[][] {
  if (values.length <= size) {
    return [values];
  }

  const chunks: T[][] = [];

  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }

  return chunks;
}

// Sorted unique integers.
function sortUniqueIntegers(values: number[]): number[] {
  return [...new Set(values)].sort((left, right) => left - right);
}

// CARD_SET tag detection in raw tag payloads.
function isCardSetTag(tag: RawTagInput): boolean {
  return tag.enumId === cardSetEnumId || tag.rawName === cardSetRawName;
}

// Integer-like set references parsed from raw tags.
function parseTagIntValue(tag: RawTagInput): number | null {
  if (tag.rawValue == null || tag.rawValue.length === 0) {
    return null;
  }

  const parsed = Number.parseInt(tag.rawValue, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

// Distinct set dbf ids referenced by parsed entities.
function collectSetDbfIds(entities: ParsedEntity[]): number[] {
  return sortUniqueIntegers(
    entities
      .flatMap(entity => entity.tags)
      .filter(tag => isCardSetTag(tag))
      .map(tag => parseTagIntValue(tag))
      .filter((value): value is number => value != null),
  );
}

// LocString child nodes normalized into locale maps.
function normalizeLocString(tag: XmlElement): Record<string, string> {
  const value: Record<string, string> = {};

  for (const child of toArray(tag.children)) {
    if (typeof child === 'string') continue;
    value[child.name] = getText(child);
  }

  return value;
}

// Raw XML Tag node normalized into RawTagInput.
function normalizeRawTag(tag: XmlElement, tagOrder: number): RawTagInput {
  const enumId = toInt(tag.attributes.enumID, 'Tag.enumID');
  const rawName = tag.attributes.name ?? '';
  const rawType = tag.attributes.type ?? '';
  const rawValue = tag.attributes.value ?? null;
  const cardRefCardId = tag.attributes.cardID ?? null;

  const rawPayload: JsonMap = {
    attributes: { ...tag.attributes },
  };

  const locStringValue = rawType === 'LocString'
    ? normalizeLocString(tag)
    : null;

  if (locStringValue != null) {
    rawPayload.children = locStringValue;
  } else {
    const text = getText(tag);
    if (text.length > 0) {
      rawPayload.text = text;
    }
  }

  return {
    enumId,
    rawName,
    rawType,
    rawPayload,
    rawValue,
    locStringValue,
    cardRefCardId,
    tagOrder,
  };
}

// Non-Tag entity payload that still affects snapshot identity.
function normalizeExtraPayload(entity: XmlElement): JsonMap {
  const referencedTags = Object.fromEntries(
    toArray(getElements(entity, 'ReferencedTag')).map(node => {
      const enumId = String(toInt(node.attributes.enumID, 'ReferencedTag.enumID'));
      const value = toInt(node.attributes.value ?? '1', 'ReferencedTag.value');

      return [enumId, toFlagValue(value)];
    }),
  );

  const powers = toArray(getElements(entity, 'Power')).map(node => ({
    definition:       node.attributes.definition ?? '',
    playRequirements: toArray(getElements(node, 'PlayRequirement')).map(requirement => {
      const param = toOptionalInt(requirement.attributes.param);

      return {
        reqId: toInt(requirement.attributes.reqID, 'PlayRequirement.reqID'),
        ...(param != null ? { param } : {}),
      };
    }),
  }));

  const entourageCards = toArray(getElements(entity, 'EntourageCard')).map(node => ({
    cardId: node.attributes.cardID ?? '',
  }));

  const masterPowers = toArray(getElements(entity, 'MasterPower')).map(node => getText(node));

  const triggeredPowerHistoryInfo = toArray(getElements(entity, 'TriggeredPowerHistoryInfo')).map(node => ({
    effectIndex:   toInt(node.attributes.effectIndex, 'TriggeredPowerHistoryInfo.effectIndex'),
    showInHistory: toXmlBoolean(node.attributes.showInHistory, 'TriggeredPowerHistoryInfo.showInHistory'),
  }));

  return {
    referencedTags,
    powers,
    entourageCards,
    masterPowers,
    triggeredPowerHistoryInfo,
  };
}

// Duplicate card ids that point to different snapshots rejected.
function validateAndDedupeEntities(entities: ParsedEntity[]): ParsedEntity[] {
  const byCardId = new Map<string, ParsedEntity>();

  for (const entity of entities) {
    const existing = byCardId.get(entity.cardId);

    if (!existing) {
      byCardId.set(entity.cardId, entity);
      continue;
    }

    if (existing.snapshotHash !== entity.snapshotHash) {
      throw new Error(`Conflicting snapshots found for cardId ${entity.cardId}`);
    }
  }

  return [...byCardId.values()];
}

// Normalized Entity node plus computed snapshot hash.
function normalizeEntitySnapshot(entity: XmlElement): ParsedEntity {
  const cardId = entity.attributes.CardID ?? '';
  if (cardId.length === 0) {
    throw new Error('Entity.CardID is required');
  }

  const dbfId = toInt(entity.attributes.ID, 'Entity.ID');
  const entityXmlVersion = toInt(entity.attributes.version, 'Entity.version');
  const tags = toArray(getElements(entity, 'Tag')).map((tag, index) => normalizeRawTag(tag, index));
  const extraPayload = normalizeExtraPayload(entity);

  return buildParsedEntity({
    cardId,
    dbfId,
    entityXmlVersion,
    tags,
    extraPayload,
  });
}

// mini-CardDefs XML parser that returns normalized entities.
export function parseHsdataXml(xml: string): ParsedHsdata {
  const parser = new SaxesParser({ xmlns: false, position: true });
  const entityStack: XmlElement[] = [];
  const entities: ParsedEntity[] = [];
  let build: number | null = null;
  let hasRoot = false;

  function appendText(text: string) {
    if (entityStack.length === 0 || text.length === 0) return;
    entityStack[entityStack.length - 1]!.children.push(text);
  }

  function openTag(tag: SaxesTagPlain) {
    if (!hasRoot) {
      if (tag.name !== 'CardDefs') {
        throw new Error(`Unexpected root tag: ${tag.name}`);
      }

      hasRoot = true;
      build = toInt(tag.attributes.build, 'CardDefs.build');
      return;
    }

    if (entityStack.length === 0 && tag.name !== 'Entity') {
      return;
    }

    const node: XmlElement = {
      name:       tag.name,
      attributes: { ...tag.attributes },
      children:   [],
    };

    if (entityStack.length > 0) {
      entityStack[entityStack.length - 1]!.children.push(node);
    }

    entityStack.push(node);
  }

  function closeTag(tag: SaxesTagPlain) {
    if (entityStack.length === 0) {
      return;
    }

    const node = entityStack.pop();
    if (!node) {
      throw new Error(`Unexpected closing tag: ${tag.name}`);
    }

    if (entityStack.length === 0) {
      if (node.name !== 'Entity') {
        throw new Error(`Unexpected top-level closing tag: ${node.name}`);
      }

      entities.push(normalizeEntitySnapshot(node));
    }
  }

  parser.on('opentag', openTag);
  parser.on('text', appendText);
  parser.on('cdata', appendText);
  parser.on('closetag', closeTag);
  parser.on('error', error => {
    throw error;
  });

  parser.write(xml).close();

  if (build == null) {
    throw new Error('Missing CardDefs.build');
  }

  const normalizedEntities = validateAndDedupeEntities(entities);
  if (entities.length === 0) {
    throw new Error('CardDefs must contain at least one Entity');
  }

  return { build, entities: normalizedEntities };
}

// Projected value kind for one raw tag.
function guessValueKind(tag: RawTagInput, existing: ExistingTagRow | undefined): TagValueKind {
  const configured = existing?.valueKind;

  if (configured === 'bool'
    || configured === 'card_ref'
    || configured === 'int'
    || configured === 'json'
    || configured === 'loc_string'
    || configured === 'string') {
    return configured;
  }

  if (tag.rawType === 'LocString') return 'loc_string';
  if (tag.rawType === 'Card') return 'card_ref';
  if (tag.rawType === 'Int') return 'int';
  if (tag.rawType === 'String') return 'string';

  return 'json';
}

// Typed storage representation resolved from one raw tag.
function resolveTagValue(tag: RawTagInput, existing: ExistingTagRow | undefined) {
  const valueKind = guessValueKind(tag, existing);
  const parsedInt = tag.rawValue != null ? Number.parseInt(tag.rawValue, 10) : null;
  const isInt = parsedInt != null && Number.isFinite(parsedInt);

  if (valueKind === 'bool') {
    if (!isInt || (parsedInt !== 0 && parsedInt !== 1)) {
      return {
        valueKind:   'json' as const,
        parseStatus: 'fallback' as const,
        jsonValue:   { value: tag.rawValue },
      };
    }

    return {
      valueKind,
      parseStatus: 'parsed' as const,
      boolValue:   parsedInt === 1,
    };
  }

  if (valueKind === 'int') {
    if (!isInt) {
      return {
        valueKind:   'json' as const,
        parseStatus: 'fallback' as const,
        jsonValue:   { value: tag.rawValue },
      };
    }

    return {
      valueKind,
      parseStatus: 'parsed' as const,
      intValue:    parsedInt,
    };
  }

  if (valueKind === 'string') {
    return {
      valueKind,
      parseStatus: 'parsed' as const,
      stringValue: tag.rawValue ?? '',
    };
  }

  if (valueKind === 'card_ref') {
    return {
      valueKind,
      parseStatus:   tag.cardRefCardId ? 'parsed' as const : 'fallback' as const,
      cardRefCardId: tag.cardRefCardId,
      jsonValue:     tag.cardRefCardId ? null : { value: tag.rawValue },
    };
  }

  if (valueKind === 'loc_string') {
    return {
      valueKind,
      parseStatus:    tag.locStringValue ? 'parsed' as const : 'fallback' as const,
      locStringValue: tag.locStringValue,
      jsonValue:      tag.locStringValue ? null : tag.rawPayload,
    };
  }

  return {
    valueKind:   'json' as const,
    parseStatus: 'fallback' as const,
    jsonValue:   tag.locStringValue ?? tag.rawValue ?? tag.rawPayload,
  };
}

// source_versions row loader for import guards.
async function getSourceVersion(sourceTag: number): Promise<SourceVersionRow | null> {
  return await db.select({
    sourceTag:  SourceVersion.sourceTag,
    build:      SourceVersion.build,
    sourceHash: SourceVersion.sourceHash,
    importEngineVersion: SourceVersion.importEngineVersion,
    status:     SourceVersion.status,
  })
    .from(SourceVersion)
    .where(eq(SourceVersion.sourceTag, sourceTag))
    .then(rows => rows[0] ?? null);
}

// Discovered tag definitions needed by one import batch.
async function getExistingTags(tx: DbTx, enumIds: number[]): Promise<Map<number, ExistingTagRow>> {
  const rows: ExistingTagRow[] = [];

  for (const chunk of chunkValues(enumIds)) {
    if (chunk.length === 0) continue;

    const result = await tx.select({
      enumId:             Tag.enumId,
      slug:               Tag.slug,
      rawName:            Tag.rawName,
      rawType:            Tag.rawType,
      rawNames:           Tag.rawNames,
      valueKind:          Tag.valueKind,
      normalizeKind:      Tag.normalizeKind,
      projectTargetType:  Tag.projectTargetType,
      projectTargetPath:  Tag.projectTargetPath,
      projectKind:        Tag.projectKind,
      firstSeenSourceTag: Tag.firstSeenSourceTag,
      lastSeenSourceTag:  Tag.lastSeenSourceTag,
    })
      .from(Tag)
      .where(inArray(Tag.enumId, chunk));

    rows.push(...result);
  }

  return new Map(rows.map(row => [row.enumId, row]));
}

// Existing set ids needed for pre-import validation.
async function loadExistingSetDbfIds(dbfIds: number[]): Promise<Set<number>> {
  const rows: Array<{ dbfId: number | null, setId: string }> = [];

  for (const chunk of chunkValues(dbfIds)) {
    if (chunk.length === 0) continue;

    const result = await db.select({
      dbfId: HearthstoneSet.dbfId,
      setId: HearthstoneSet.setId,
    })
      .from(HearthstoneSet)
      .where(inArray(HearthstoneSet.dbfId, chunk));

    rows.push(...result);
  }

  return new Set(
    rows
      .filter((row): row is { dbfId: number, setId: string } => row.dbfId != null)
      .filter(row => isModeledSetId(row.setId))
      .map(row => row.dbfId),
  );
}

// Placeholder set ids already present for the provided dbf ids.
async function loadPlaceholderSetDbfIds(dbfIds: number[]): Promise<Set<number>> {
  const rows: Array<{ dbfId: number | null, setId: string }> = [];

  for (const chunk of chunkValues(dbfIds)) {
    if (chunk.length === 0) continue;

    const result = await db.select({
      dbfId: HearthstoneSet.dbfId,
      setId: HearthstoneSet.setId,
    })
      .from(HearthstoneSet)
      .where(inArray(HearthstoneSet.dbfId, chunk));

    rows.push(...result);
  }

  return new Set(
    rows
      .filter((row): row is { dbfId: number, setId: string } => row.dbfId != null)
      .filter(row => isHsdataPlaceholderSetId(row.setId))
      .map(row => row.dbfId),
  );
}

// Placeholder set rows inserted so missing dependencies become explicit.
async function insertPlaceholderSets(dbfIds: number[]): Promise<number> {
  if (dbfIds.length === 0) {
    return 0;
  }

  const existingPlaceholderDbfIds = await loadPlaceholderSetDbfIds(dbfIds);
  const missingPlaceholderDbfIds = dbfIds.filter(dbfId => !existingPlaceholderDbfIds.has(dbfId));

  if (missingPlaceholderDbfIds.length === 0) {
    return 0;
  }

  await db.insert(HearthstoneSet).values(
    missingPlaceholderDbfIds.map(dbfId => ({
      setId:         buildHsdataPlaceholderSetId(dbfId),
      dbfId,
      slug:          null,
      rawName:       null,
      type:          'unknown',
      releaseDate:   '',
      cardCountFull: null,
      cardCount:     null,
      group:         null,
    })),
  );

  return missingPlaceholderDbfIds.length;
}

// Set ids still missing from the model tables.
async function findMissingSetDbfIds(dbfIds: number[]): Promise<number[]> {
  if (dbfIds.length === 0) {
    return [];
  }

  const existingDbfIds = await loadExistingSetDbfIds(dbfIds);
  return dbfIds.filter(dbfId => !existingDbfIds.has(dbfId));
}

// Discovered tag metadata upserted before snapshot rows are written.
async function upsertDiscoveredTags(
  tx: DbTx,
  sourceTag: number,
  tags: RawTagInput[],
  dryRun: boolean,
): Promise<{ existing: Map<number, ExistingTagRow>, discovered: number[], updated: number }> {
  const enumIds = sortUniqueIntegers(tags.map(tag => tag.enumId));
  const existing = await getExistingTags(tx, enumIds);
  const discovered: number[] = [];
  let updated = 0;

  const firstSeenByEnum = new Map<number, RawTagInput>();
  for (const tag of tags) {
    if (!firstSeenByEnum.has(tag.enumId)) {
      firstSeenByEnum.set(tag.enumId, tag);
    }
  }

  for (const enumId of enumIds) {
    const input = firstSeenByEnum.get(enumId)!;
    const row = existing.get(enumId);
    const guessedKind = guessValueKind(input, row);

    if (!row) {
      discovered.push(enumId);

      if (!dryRun) {
        await tx.insert(Tag).values({
          enumId,
          slug:               slugify(input.rawName, enumId),
          name:               input.rawName || null,
          rawName:            input.rawName || null,
          rawType:            input.rawType || null,
          rawNames:           input.rawName ? [input.rawName] : [],
          valueKind:          guessedKind,
          normalizeKind:      'identity',
          normalizeConfig:    {},
          projectTargetType:  null,
          projectTargetPath:  null,
          projectKind:        null,
          projectConfig:      {},
          status:             'discovered',
          description:        null,
          firstSeenSourceTag: sourceTag,
          lastSeenSourceTag:  sourceTag,
        });
      }

      existing.set(enumId, {
        enumId,
        slug:               slugify(input.rawName, enumId),
        rawName:            input.rawName || null,
        rawType:            input.rawType || null,
        rawNames:           input.rawName ? [input.rawName] : [],
        valueKind:          guessedKind,
        normalizeKind:      'identity',
        projectTargetType:  null,
        projectTargetPath:  null,
        projectKind:        null,
        firstSeenSourceTag: sourceTag,
        lastSeenSourceTag:  sourceTag,
      });
      continue;
    }

    const nextRawNames = input.rawName && !row.rawNames.includes(input.rawName)
      ? [...row.rawNames, input.rawName].sort()
      : row.rawNames;

    const needsUpdate = nextRawNames !== row.rawNames
      || row.lastSeenSourceTag !== sourceTag
      || row.rawName == null
      || row.rawType == null;

    if (needsUpdate) {
      updated += 1;
    }

    if (needsUpdate && !dryRun) {
      await tx.update(Tag)
        .set({
          rawName:           row.rawName ?? input.rawName ?? null,
          rawType:           row.rawType ?? input.rawType ?? null,
          rawNames:          nextRawNames,
          lastSeenSourceTag: sourceTag,
        })
        .where(eq(Tag.enumId, enumId));
    }

    existing.set(enumId, {
      ...row,
      rawName:           row.rawName ?? input.rawName ?? null,
      rawType:           row.rawType ?? input.rawType ?? null,
      rawNames:          nextRawNames,
      lastSeenSourceTag: sourceTag,
    });
  }

  return { existing, discovered, updated };
}

// Reusable snapshots for the given card ids.
async function loadExistingSnapshots(tx: DbTx, cardIds: string[]): Promise<Map<string, SnapshotRow>> {
  const rows: SnapshotRow[] = [];

  for (const chunk of chunkValues(cardIds)) {
    if (chunk.length === 0) continue;

    const result = await tx.select({
      id:           RawEntitySnapshot.id,
      cardId:       RawEntitySnapshot.cardId,
      snapshotHash: RawEntitySnapshot.snapshotHash,
      sourceTags:   RawEntitySnapshot.sourceTags,
    })
      .from(RawEntitySnapshot)
      .where(inArray(RawEntitySnapshot.cardId, chunk));

    rows.push(...result);
  }

  return new Map(rows.map(row => [snapshotKey(row.cardId, row.snapshotHash), row]));
}

// Snapshots currently linked to one sourceTag.
async function loadSnapshotsForSourceTag(tx: DbTx, sourceTag: number): Promise<SnapshotRow[]> {
  return await tx.select({
    id:           RawEntitySnapshot.id,
    cardId:       RawEntitySnapshot.cardId,
    snapshotHash: RawEntitySnapshot.snapshotHash,
    sourceTags:   RawEntitySnapshot.sourceTags,
  })
    .from(RawEntitySnapshot)
    .where(sql<boolean>`${sourceTag} = ANY(${RawEntitySnapshot.sourceTags})`);
}

// Normalized tag rows inserted for one snapshot.
async function insertSnapshotTags(
  tx: DbTx,
  snapshotId: string,
  tags: RawTagInput[],
  tagMap: Map<number, ExistingTagRow>,
  dbfIdByCardId: Map<string, number>,
): Promise<number> {
  if (tags.length === 0) {
    return 0;
  }

  const rows = tags.map(tag => {
    const resolved = resolveTagValue(tag, tagMap.get(tag.enumId));
    const cardRefCardId = 'cardRefCardId' in resolved ? resolved.cardRefCardId ?? null : null;

    return {
      snapshotId,
      enumId:         tag.enumId,
      tagOrder:       tag.tagOrder,
      rawName:        tag.rawName,
      rawType:        tag.rawType,
      rawPayload:     tag.rawPayload,
      valueKind:      resolved.valueKind,
      boolValue:      'boolValue' in resolved ? resolved.boolValue ?? null : null,
      intValue:       'intValue' in resolved ? resolved.intValue ?? null : null,
      stringValue:    'stringValue' in resolved ? resolved.stringValue ?? null : null,
      enumValue:      null,
      locStringValue: 'locStringValue' in resolved ? resolved.locStringValue ?? null : null,
      cardRefCardId,
      cardRefDbfId:   cardRefCardId ? dbfIdByCardId.get(cardRefCardId) ?? null : null,
      jsonValue:      'jsonValue' in resolved ? resolved.jsonValue ?? null : null,
      parseStatus:    resolved.parseStatus,
    };
  });

  await tx.insert(RawEntitySnapshotTag).values(rows);
  return rows.length;
}

// Tag rows deleted for the provided snapshot ids.
async function deleteSnapshotTags(tx: DbTx, snapshotIds: string[]) {
  for (const chunk of chunkValues(snapshotIds)) {
    if (chunk.length === 0) {
      continue;
    }

    await tx.delete(RawEntitySnapshotTag)
      .where(inArray(RawEntitySnapshotTag.snapshotId, chunk));
  }
}

// source_versions moved into processing before import work begins.
async function upsertSourceVersionProcessing(
  input: SourceVersionWriteInput,
) {
  await db.insert(SourceVersion)
    .values({
      sourceTag:    input.sourceTag,
      sourceCommit: input.sourceCommit ?? '',
      build:        input.build,
      sourceHash:   input.sourceHash,
      sourceUri:    input.sourceUri ?? '',
      importEngineVersion: input.importEngineVersion ?? null,
      status:       'processing',
      importedAt:   null,
    })
    .onConflictDoUpdate({
      target: [SourceVersion.sourceTag],
      set:    {
        sourceCommit: input.sourceCommit ?? '',
        build:        input.build,
        sourceHash:   input.sourceHash,
        sourceUri:    input.sourceUri ?? '',
        importEngineVersion: input.importEngineVersion ?? null,
        status:       'processing',
        importedAt:   null,
      },
    });
}

// source_versions row marked as completed.
async function markSourceVersionCompleted(sourceTag: number, importedAt: Date) {
  await db.update(SourceVersion)
    .set({
      status: 'completed',
      importedAt,
    })
    .where(eq(SourceVersion.sourceTag, sourceTag));
}

// Failed source_versions state persisted.
async function upsertSourceVersionFailed(input: SourceVersionWriteInput) {
  await db.insert(SourceVersion)
    .values({
      sourceTag:    input.sourceTag,
      sourceCommit: input.sourceCommit ?? '',
      build:        input.build,
      sourceHash:   input.sourceHash,
      sourceUri:    input.sourceUri ?? '',
      importEngineVersion: input.importEngineVersion ?? null,
      status:       'failed',
      importedAt:   null,
    })
    .onConflictDoUpdate({
      target: [SourceVersion.sourceTag],
      set:    {
        sourceCommit: input.sourceCommit ?? '',
        build:        input.build,
        sourceHash:   input.sourceHash,
        sourceUri:    input.sourceUri ?? '',
        importEngineVersion: input.importEngineVersion ?? null,
        status:       'failed',
        importedAt:   null,
      },
    });
}

// Source version marked as failed unless the same completed import already exists.
async function markSourceVersionFailedIfNeeded(
  input: SourceVersionWriteInput,
  sourceVersion: SourceVersionRow | null,
) {
  if (sourceVersion?.status === 'completed' && sourceVersion.sourceHash === input.sourceHash) {
    return;
  }

  await upsertSourceVersionFailed(input);
}

// Skip decision for an identical completed source.
function shouldSkipSourceVersionImport(
  sourceVersion: SourceVersionRow | null,
  sourceHash: string,
  force: boolean,
): boolean {
  if (force) {
    return false;
  }

  return sourceVersion?.status === 'completed' && sourceVersion.sourceHash === sourceHash;
}

// sourceTag overwrite rules enforced before import begins.
function assertSourceVersionImportable(
  sourceVersion: SourceVersionRow | null,
  sourceTag: number,
  sourceHash: string,
  force: boolean,
) {
  if (force || !sourceVersion) {
    return;
  }

  if (sourceVersion.sourceHash !== '' && sourceVersion.sourceHash !== sourceHash) {
    throw new Error(`sourceTag ${sourceTag} already exists with a different sourceHash; rerun with force=true to overwrite`);
  }
}

// Parsed raw import applied inside one transaction.
async function applyHsdataImport(
  tx: DbTx,
  input: {
    parsed: ParsedHsdata;
    sourceTag: number;
    dryRun: boolean;
    force: boolean;
  },
): Promise<Omit<ImportHsdataReport, 'build' | 'dryRun' | 'skipped' | 'sourceHash' | 'sourceTag'>> {
  const allTags = input.parsed.entities.flatMap(entity => entity.tags);
  const dbfIdByCardId = new Map(input.parsed.entities.map(entity => [entity.cardId, entity.dbfId]));
  const { existing, discovered, updated } = await upsertDiscoveredTags(
    tx,
    input.sourceTag,
    allTags,
    input.dryRun,
  );

  const fallbackTagRowCount = input.parsed.entities.reduce((count, entity) => {
    return count + entity.tags.filter(tag => {
      const resolved = resolveTagValue(tag, existing.get(tag.enumId));
      return resolved.parseStatus === 'fallback';
    }).length;
  }, 0);

  const previousSnapshots = await loadSnapshotsForSourceTag(tx, input.sourceTag);
  const previousSnapshotIds = new Set(previousSnapshots.map(row => row.id));
  const existingSnapshots = await loadExistingSnapshots(
    tx,
    [...new Set(input.parsed.entities.map(entity => entity.cardId))],
  );

  const newEntities: ParsedEntity[] = [];
  const sourceTagUpdates: Array<{ id: string, sourceTags: number[] }> = [];
  const snapshotIdByKey = new Map<string, string>();
  const targetSnapshotIds: string[] = [];
  let insertedSnapshots = 0;
  let reusedSnapshots = 0;

  for (const entity of input.parsed.entities) {
    const key = snapshotKey(entity.cardId, entity.snapshotHash);
    const existingSnapshot = existingSnapshots.get(key);

    if (!existingSnapshot) {
      insertedSnapshots += 1;
      newEntities.push(entity);
      continue;
    }

    reusedSnapshots += 1;
    targetSnapshotIds.push(existingSnapshot.id);
    snapshotIdByKey.set(key, existingSnapshot.id);

    if (!existingSnapshot.sourceTags.includes(input.sourceTag)) {
      sourceTagUpdates.push({
        id:         existingSnapshot.id,
        sourceTags: sortUniqueIntegers([...existingSnapshot.sourceTags, input.sourceTag]),
      });
    }
  }

  const newSnapshotIds = new Map<string, string>();

  if (!input.dryRun && newEntities.length > 0) {
    const inserted = await tx.insert(RawEntitySnapshot)
      .values(newEntities.map(entity => ({
        cardId:           entity.cardId,
        dbfId:            entity.dbfId,
        sourceTags:       [input.sourceTag],
        entityXmlVersion: entity.entityXmlVersion,
        snapshotHash:     entity.snapshotHash,
        extraPayload:     entity.extraPayload,
        isLatest:         false,
      })))
      .returning({
        id:           RawEntitySnapshot.id,
        cardId:       RawEntitySnapshot.cardId,
        snapshotHash: RawEntitySnapshot.snapshotHash,
      });

    for (const row of inserted) {
      const key = snapshotKey(row.cardId, row.snapshotHash);
      newSnapshotIds.set(key, row.id);
      snapshotIdByKey.set(key, row.id);
    }
  }

  if (input.dryRun) {
    for (const entity of newEntities) {
      const key = snapshotKey(entity.cardId, entity.snapshotHash);
      const snapshotId = `dry-run:${entity.cardId}:${entity.snapshotHash}`;
      newSnapshotIds.set(key, snapshotId);
      snapshotIdByKey.set(key, snapshotId);
    }
  }

  for (const entity of newEntities) {
    const snapshotId = newSnapshotIds.get(snapshotKey(entity.cardId, entity.snapshotHash));

    if (!snapshotId) {
      throw new Error(`Inserted snapshot id not found for cardId ${entity.cardId}`);
    }

    targetSnapshotIds.push(snapshotId);
  }

  const uniqueTargetSnapshotIds = [...new Set(targetSnapshotIds)];
  let insertedTagRows = 0;
  const tagEntities = input.force ? input.parsed.entities : newEntities;

  if (!input.dryRun) {
    for (const update of sourceTagUpdates) {
      await tx.update(RawEntitySnapshot)
        .set({ sourceTags: update.sourceTags })
        .where(eq(RawEntitySnapshot.id, update.id));
    }

    for (const previousSnapshot of previousSnapshots) {
      if (uniqueTargetSnapshotIds.includes(previousSnapshot.id)) {
        continue;
      }

      const nextSourceTags = previousSnapshot.sourceTags.filter(value => value !== input.sourceTag);

      if (nextSourceTags.length === 0) {
        await tx.delete(RawEntitySnapshot)
          .where(eq(RawEntitySnapshot.id, previousSnapshot.id));
        continue;
      }

      await tx.update(RawEntitySnapshot)
        .set({
          sourceTags: nextSourceTags,
          isLatest:   false,
        })
        .where(eq(RawEntitySnapshot.id, previousSnapshot.id));
    }

    if (previousSnapshotIds.size > 0) {
      await tx.update(RawEntitySnapshot)
        .set({ isLatest: false })
        .where(inArray(RawEntitySnapshot.id, [...previousSnapshotIds]));
    }

    if (input.force) {
      await deleteSnapshotTags(tx, uniqueTargetSnapshotIds);
    }

    for (const entity of tagEntities) {
      const snapshotId = snapshotIdByKey.get(snapshotKey(entity.cardId, entity.snapshotHash))!;
      insertedTagRows += await insertSnapshotTags(tx, snapshotId, entity.tags, existing, dbfIdByCardId);
    }

    if (uniqueTargetSnapshotIds.length > 0) {
      await tx.update(RawEntitySnapshot)
        .set({ isLatest: true })
        .where(inArray(RawEntitySnapshot.id, uniqueTargetSnapshotIds));
    }
  } else {
    insertedTagRows = tagEntities.reduce((count, entity) => count + entity.tags.length, 0);
  }

  return {
    entityCount:           input.parsed.entities.length,
    insertedSnapshots,
    reusedSnapshots,
    insertedTagRows,
    discoveredTagCount:    discovered.length,
    updatedDiscoveredTags: updated,
    fallbackTagRowCount,
    latestSnapshotCount:   uniqueTargetSnapshotIds.length,
    discoveredTags:        discovered,
  };
}

// Parsed hsdata payload imported through the shared raw archive path.
export async function importParsedHsdata(input: ImportParsedHsdataInput): Promise<ImportHsdataReport> {
  const dryRun = input.dryRun ?? false;
  const force = input.force ?? false;
  const sourceVersion = await getSourceVersion(input.sourceTag);

  const missingSetDbfIds = await findMissingSetDbfIds(collectSetDbfIds(input.parsed.entities));

  if (missingSetDbfIds.length > 0) {
    const insertedPlaceholderSetCount = await insertPlaceholderSets(missingSetDbfIds);

    if (!dryRun) {
      await markSourceVersionFailedIfNeeded({
        sourceTag:    input.sourceTag,
        build:        input.parsed.build,
        sourceHash:   input.sourceHash,
        sourceCommit: input.sourceCommit,
        sourceUri:    input.sourceUri,
        importEngineVersion: input.importEngineVersion,
      }, sourceVersion);
    }

    const action = insertedPlaceholderSetCount > 0
      ? `Inserted ${insertedPlaceholderSetCount} placeholder set row(s)`
      : 'Placeholder set row(s) already exist';

    throw new Error(
      `[hearthstone][hsdata-import] missing set rows for dbfId(s): ${missingSetDbfIds.join(', ')}. ${action}. Complete set modeling before retrying import.`,
    );
  }

  if (shouldSkipSourceVersionImport(sourceVersion, input.sourceHash, force)) {
    return {
      dryRun,
      skipped:               true,
      sourceTag:             input.sourceTag,
      build:                 input.parsed.build,
      sourceHash:            input.sourceHash,
      entityCount:           input.parsed.entities.length,
      insertedSnapshots:     0,
      reusedSnapshots:       0,
      insertedTagRows:       0,
      discoveredTagCount:    0,
      updatedDiscoveredTags: 0,
      fallbackTagRowCount:   0,
      latestSnapshotCount:   0,
      discoveredTags:        [],
    };
  }

  assertSourceVersionImportable(sourceVersion, input.sourceTag, input.sourceHash, force);

  if (!dryRun) {
    await upsertSourceVersionProcessing(
      {
        sourceTag:    input.sourceTag,
        build:        input.parsed.build,
        sourceHash:   input.sourceHash,
        sourceCommit: input.sourceCommit,
        sourceUri:    input.sourceUri,
        importEngineVersion: input.importEngineVersion,
      },
    );
  }

  try {
    return await db.transaction(async tx => {
      const applied = await applyHsdataImport(tx, {
        parsed:     input.parsed,
        sourceTag:  input.sourceTag,
        dryRun,
        force,
      });

      return {
        dryRun,
        skipped:    false,
        sourceTag:  input.sourceTag,
        build:      input.parsed.build,
        sourceHash: input.sourceHash,
        ...applied,
      } satisfies ImportHsdataReport;
    }).then(async report => {
      if (!dryRun) {
        await markSourceVersionCompleted(input.sourceTag, new Date());
      }

      return report;
    });
  } catch (error) {
    if (!dryRun) {
      await markSourceVersionFailedIfNeeded({
        sourceTag:    input.sourceTag,
        build:        input.parsed.build,
        sourceHash:   input.sourceHash,
        sourceCommit: input.sourceCommit,
        sourceUri:    input.sourceUri,
        importEngineVersion: input.importEngineVersion,
      }, sourceVersion);
    }

    console.error('[hearthstone][hsdata-import] failed', {
      sourceTag: input.sourceTag,
      build:     input.parsed.build,
      error,
    });

    throw error;
  }
}

// Legacy whole-archive API kept on top of the shared import path.
export async function importHsdata(input: ImportHsdataInput): Promise<ImportHsdataReport> {
  const dryRun = input.dryRun ?? false;
  const normalizedXml = normalizeHsdataSourceXml(input.xml);
  const sourceHash = computeHsdataSourceHash(input.xml);
  const sourceVersion = await getSourceVersion(input.sourceTag);
  let parsed: ParsedHsdata;

  try {
    parsed = parseHsdataXml(normalizedXml);
  } catch (error) {
    if (!dryRun) {
      await markSourceVersionFailedIfNeeded({
        sourceTag:    input.sourceTag,
        build:        sourceVersion?.build ?? null,
        sourceHash,
        sourceCommit: input.sourceCommit,
        sourceUri:    input.sourceUri,
        importEngineVersion: input.importEngineVersion,
      }, sourceVersion);
    }

    throw error;
  }

  return await importParsedHsdata({
    parsed,
    sourceTag: input.sourceTag,
    sourceHash,
    sourceCommit: input.sourceCommit,
    sourceUri: input.sourceUri,
    importEngineVersion: input.importEngineVersion,
    dryRun,
    force: input.force,
  });
}
