import { createHash } from 'node:crypto';

import { eq, inArray, sql } from 'drizzle-orm';

import { db } from '#db/db';
import { renderModel as renderModelSchema, type RenderModel } from '#model/hearthstone/schema/entity';
import { mainLocale, type Rarity, rarity as raritySchema, type Types, types as typeSchema } from '#model/hearthstone/schema/basic';
import {
  Entity,
  EntityLocalization,
  EntityRelation,
  RawEntitySnapshot,
  RawEntitySnapshotTag,
  SourceVersion,
  Tag,
} from '#schema/hearthstone';

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
}

interface ProjectedSnapshot {
  entity:              LocalizationlessEntityRow;
  localizations:       LocalizationRow[];
  relations:           RelationRow[];
  unprojectedTagCount: number;
}

type LocalizationlessEntityRow = Omit<EntityRow, 'version' | 'isLatest'>;
type LocalizationlessLocalizationRow = Omit<LocalizationRow, 'version' | 'isLatest'>;

interface ReconcileResult<T extends { version: number[], isLatest: boolean }> {
  finalRows: T[];
  changed:   boolean;
  inserted:  number;
  reused:    number;
  updated:   number;
}

export interface ProjectHsdataInput {
  sourceTag: number;
  dryRun?:   boolean;
  force?:    boolean;
}

export interface ProjectHsdataReport {
  dryRun:                boolean;
  skipped:               boolean;
  sourceTag:             number;
  build:                 number;
  snapshotCount:         number;
  insertedEntities:      number;
  reusedEntities:        number;
  updatedEntities:       number;
  insertedLocalizations: number;
  reusedLocalizations:   number;
  updatedLocalizations:  number;
  insertedRelations:     number;
  updatedRelations:      number;
  unprojectedTagCount:   number;
}

const strongRelationFields = [
  'heroPower',
  'buddy',
  'tripleCard',
] as const;

const weakRelationFields = ['heroicHeroPower'] as const;

const renderMechanicKeys = new Set([
  'tradable',
  'forge',
  'hide_cost',
  'hide_attack',
  'hide_health',
  'in_mini_set',
  'hide_watermark',
]);

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

function sha256(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex');
}

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

function hashCanonicalJson(value: unknown): string {
  return sha256(canonicalizeJson(value));
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
    textBuilderType:   row.textBuilderType,
    changeType:        row.changeType,
  };
}

function buildLocalizationHashPayload(row: LocalizationlessLocalizationRow): JsonMap {
  return {
    lang:            row.lang,
    name:            row.name,
    text:            row.text,
    richText:        row.richText,
    displayText:     row.displayText,
    targetText:      row.targetText,
    textInPlay:      row.textInPlay,
    howToEarn:       row.howToEarn,
    howToEarnGolden: row.howToEarnGolden,
    flavorText:      row.flavorText,
    locChangeType:   row.locChangeType,
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
  slugByEnumId: Map<number, string>,
): RenderModel {
  const renderMechanics = Object.fromEntries(
    Object.entries(entity.mechanics)
      .map(([enumId, value]) => [slugByEnumId.get(Number(enumId)) ?? enumId, value] as const)
      .filter(([slug, value]) => renderMechanicKeys.has(slug) && isMechanicValue(value)),
  );

  const payload = {
    cardId: entity.cardId,
    lang:   localization.lang,

    variant:         'normal',
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
    mercenaryFaction:  entity.mercenaryFaction,
    set:               entity.set,
    overrideWatermark: entity.overrideWatermark,
    rarity:            entity.rarity,
    elite:             entity.elite,
    techLevel:         entity.techLevel,
    rune:              entity.rune,
    renderMechanics,
  };
  const result = renderModelSchema.safeParse(payload);

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

function relationKey(
  row: Pick<RelationRow, 'sourceId' | 'sourceRevisionHash' | 'relation' | 'targetId'>,
): RowKey {
  return `${row.sourceId}\u0000${row.sourceRevisionHash}\u0000${row.relation}\u0000${row.targetId}`;
}

function cloneRow<T>(row: T): T {
  return structuredClone(row);
}

function recomputeLatest<T extends { version: number[], isLatest: boolean }>(
  rows: Map<RowKey, T>,
  groupKey: (row: T) => string,
) {
  const latestByGroup = new Map<string, number>();

  for (const row of rows.values()) {
    const maxVersion = Math.max(...row.version);
    const current = latestByGroup.get(groupKey(row));
    if (current == null || maxVersion > current) {
      latestByGroup.set(groupKey(row), maxVersion);
    }
  }

  for (const row of rows.values()) {
    const latest = latestByGroup.get(groupKey(row));
    row.isLatest = latest != null && row.version.includes(latest);
  }
}

function reconcileRows<T extends { version: number[], isLatest: boolean }>(
  existingRows: T[],
  targetRows: T[],
  options: {
    build:    number;
    keyOf:    (row: T) => RowKey;
    groupKey: (row: T) => string;
  },
): ReconcileResult<T> {
  const existingByKey = new Map(existingRows.map(row => [options.keyOf(row), cloneRow(row)]));
  const finalByKey = new Map<RowKey, T>();

  for (const row of existingRows) {
    const nextVersion = row.version.filter(value => value !== options.build);

    if (nextVersion.length === 0) {
      continue;
    }

    finalByKey.set(options.keyOf(row), {
      ...cloneRow(row),
      version:  nextVersion,
      isLatest: false,
    });
  }

  let inserted = 0;
  let reused = 0;
  let updated = 0;

  for (const row of targetRows) {
    const key = options.keyOf(row);
    const existing = existingByKey.get(key);
    const current = finalByKey.get(key);

    if (!existing) {
      inserted += 1;
      finalByKey.set(key, {
        ...cloneRow(row),
        version:  [options.build],
        isLatest: false,
      });
      continue;
    }

    if (existing.version.includes(options.build)) {
      reused += 1;
    } else {
      updated += 1;
    }

    finalByKey.set(key, {
      ...(current ?? cloneRow(row)),
      ...cloneRow(row),
      version:  mergeVersion(current?.version ?? [], options.build),
      isLatest: false,
    });
  }

  recomputeLatest(finalByKey, options.groupKey);

  const finalRows = [...finalByKey.values()];
  const finalState = new Map(finalRows.map(row => [options.keyOf(row), canonicalizeJson(row)]));
  const existingState = new Map(existingRows.map(row => [options.keyOf(row), canonicalizeJson(row)]));
  const changed = finalState.size !== existingState.size
    || [...finalState.entries()].some(([key, value]) => existingState.get(key) !== value);

  return {
    finalRows,
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
    const renderModel = buildRenderModel(entity, row, slugByEnumId);
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
    const projectConfig = tag.projectConfig ?? {};
    const cleaned = cleanNullValue(normalized, projectConfig);

    if (cleaned == null) {
      unprojectedTagCount += 1;
      continue;
    }

    if (
      projectKind === 'assign_scalar'
      || projectKind === 'assign_bool'
      || projectKind === 'assign_int'
      || projectKind === 'assign_string'
      || projectKind === 'assign_enum'
    ) {
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

async function loadSnapshots(sourceTag: number): Promise<RawSnapshotRow[]> {
  return await db.select({
    id:               RawEntitySnapshot.id,
    cardId:           RawEntitySnapshot.cardId,
    dbfId:            RawEntitySnapshot.dbfId,
    entityXmlVersion: RawEntitySnapshot.entityXmlVersion,
    snapshotHash:     RawEntitySnapshot.snapshotHash,
    extraPayload:     RawEntitySnapshot.extraPayload,
  })
    .from(RawEntitySnapshot)
    .where(sql<boolean>`${sourceTag} = ANY(${RawEntitySnapshot.sourceTags})`);
}

async function loadSnapshotTags(snapshotIds: string[]): Promise<RawSnapshotTagRow[]> {
  const rows: RawSnapshotTagRow[] = [];

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

async function loadExistingEntities(cardIds: string[]): Promise<EntityRow[]> {
  const rows: EntityRow[] = [];

  for (const chunk of chunkValues(cardIds)) {
    if (chunk.length === 0) {
      continue;
    }

    const result = await db.select({
      cardId:            Entity.cardId,
      version:           Entity.version,
      revisionHash:      Entity.revisionHash,
      dbfId:             Entity.dbfId,
      legacyPayload:     Entity.legacyPayload,
      set:               Entity.set,
      classes:           Entity.classes,
      type:              Entity.type,
      cost:              Entity.cost,
      attack:            Entity.attack,
      health:            Entity.health,
      durability:        Entity.durability,
      armor:             Entity.armor,
      rune:              Entity.rune,
      race:              Entity.race,
      spellSchool:       Entity.spellSchool,
      questType:         Entity.questType,
      questProgress:     Entity.questProgress,
      questPart:         Entity.questPart,
      heroPower:         Entity.heroPower,
      techLevel:         Entity.techLevel,
      inBobsTavern:      Entity.inBobsTavern,
      tripleCard:        Entity.tripleCard,
      raceBucket:        Entity.raceBucket,
      armorBucket:       Entity.armorBucket,
      buddy:             Entity.buddy,
      bannedRace:        Entity.bannedRace,
      mercenaryRole:     Entity.mercenaryRole,
      mercenaryFaction:  Entity.mercenaryFaction,
      colddown:          Entity.colddown,
      collectible:       Entity.collectible,
      elite:             Entity.elite,
      rarity:            Entity.rarity,
      artist:            Entity.artist,
      overrideWatermark: Entity.overrideWatermark,
      faction:           Entity.faction,
      mechanics:         Entity.mechanics,
      referencedTags:    Entity.referencedTags,
      textBuilderType:   Entity.textBuilderType,
      changeType:        Entity.changeType,
      isLatest:          Entity.isLatest,
    })
      .from(Entity)
      .where(inArray(Entity.cardId, chunk));

    rows.push(...result);
  }

  return rows;
}

async function loadExistingLocalizations(cardIds: string[]): Promise<LocalizationRow[]> {
  const rows: LocalizationRow[] = [];

  for (const chunk of chunkValues(cardIds)) {
    if (chunk.length === 0) {
      continue;
    }

    const result = await db.select({
      cardId:           EntityLocalization.cardId,
      version:          EntityLocalization.version,
      lang:             EntityLocalization.lang,
      revisionHash:     EntityLocalization.revisionHash,
      localizationHash: EntityLocalization.localizationHash,
      renderHash:       EntityLocalization.renderHash,
      renderModel:      EntityLocalization.renderModel,
      isLatest:         EntityLocalization.isLatest,
      name:             EntityLocalization.name,
      text:             EntityLocalization.text,
      richText:         EntityLocalization.richText,
      displayText:      EntityLocalization.displayText,
      targetText:       EntityLocalization.targetText,
      textInPlay:       EntityLocalization.textInPlay,
      howToEarn:        EntityLocalization.howToEarn,
      howToEarnGolden:  EntityLocalization.howToEarnGolden,
      flavorText:       EntityLocalization.flavorText,
      locChangeType:    EntityLocalization.locChangeType,
    })
      .from(EntityLocalization)
      .where(inArray(EntityLocalization.cardId, chunk));

    rows.push(...result);
  }

  return rows;
}

async function loadExistingRelations(sourceIds: string[]): Promise<RelationRow[]> {
  const rows: RelationRow[] = [];

  for (const chunk of chunkValues(sourceIds)) {
    if (chunk.length === 0) {
      continue;
    }

    const result = await db.select({
      sourceId:           EntityRelation.sourceId,
      sourceRevisionHash: EntityRelation.sourceRevisionHash,
      relation:           EntityRelation.relation,
      targetId:           EntityRelation.targetId,
      version:            EntityRelation.version,
      isLatest:           EntityRelation.isLatest,
    })
      .from(EntityRelation)
      .where(inArray(EntityRelation.sourceId, chunk));

    rows.push(...result);
  }

  return rows;
}

async function deleteByCardIds(tx: DbTx, cardIds: string[]) {
  for (const chunk of chunkValues(cardIds)) {
    if (chunk.length === 0) {
      continue;
    }

    await tx.delete(Entity).where(inArray(Entity.cardId, chunk));
    await tx.delete(EntityLocalization).where(inArray(EntityLocalization.cardId, chunk));
  }
}

async function deleteBySourceIds(tx: DbTx, sourceIds: string[]) {
  for (const chunk of chunkValues(sourceIds)) {
    if (chunk.length === 0) {
      continue;
    }

    await tx.delete(EntityRelation).where(inArray(EntityRelation.sourceId, chunk));
  }
}

async function insertEntities(tx: DbTx, rows: EntityRow[]) {
  for (const chunk of chunkValues(rows)) {
    if (chunk.length === 0) {
      continue;
    }

    await tx.insert(Entity).values(chunk as Array<typeof Entity.$inferInsert>);
  }
}

async function insertLocalizations(tx: DbTx, rows: LocalizationRow[]) {
  for (const chunk of chunkValues(rows)) {
    if (chunk.length === 0) {
      continue;
    }

    await tx.insert(EntityLocalization).values(chunk as Array<typeof EntityLocalization.$inferInsert>);
  }
}

async function insertRelations(tx: DbTx, rows: RelationRow[]) {
  for (const chunk of chunkValues(rows)) {
    if (chunk.length === 0) {
      continue;
    }

    await tx.insert(EntityRelation).values(chunk as Array<typeof EntityRelation.$inferInsert>);
  }
}

export async function projectHsdata(input: ProjectHsdataInput): Promise<ProjectHsdataReport> {
  const sourceVersion = await getSourceVersion(input.sourceTag);

  if (!sourceVersion) {
    throw new Error(`[hearthstone][hsdata-project] sourceTag ${input.sourceTag} does not exist`);
  }

  if (sourceVersion.status !== 'completed') {
    throw new Error(`[hearthstone][hsdata-project] sourceTag ${input.sourceTag} is not completed`);
  }

  if (sourceVersion.build == null) {
    throw new Error(`[hearthstone][hsdata-project] sourceTag ${input.sourceTag} is missing build`);
  }

  const snapshots = await loadSnapshots(input.sourceTag);

  if (snapshots.length === 0) {
    throw new Error(`[hearthstone][hsdata-project] no raw snapshots found for sourceTag ${input.sourceTag}`);
  }

  const snapshotIdSet = new Set(snapshots.map(snapshot => snapshot.id));
  const rawTags = await loadSnapshotTags([...snapshotIdSet]);
  const enumIds = [...new Set(rawTags.map(row => row.enumId))].sort((left, right) => left - right);
  const tagMap = await loadTagRows(enumIds);
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
  const context: ProjectionContext = {
    slugByEnumId,
    cardIdByDbfId,
  };

  const projected = snapshots.map(snapshot => {
    return projectSnapshot(
      snapshot,
      rawTagsBySnapshotId.get(snapshot.id) ?? [],
      tagMap,
      context,
    );
  });

  const targetEntities = projected.map(item => ({
    ...item.entity,
    version:  [sourceVersion.build!],
    isLatest: false,
  }));
  const targetLocalizations = projected.flatMap(item => item.localizations.map(row => ({
    ...row,
    version:  [sourceVersion.build!],
    isLatest: false,
  })));
  const targetRelations = projected.flatMap(item => item.relations.map(row => ({
    ...row,
    version:  [sourceVersion.build!],
    isLatest: false,
  })));

  const cardIds = [...new Set(targetEntities.map(row => row.cardId))].sort();
  const sourceIds = [...cardIds];
  const [existingEntities, existingLocalizations, existingRelations] = await Promise.all([
    loadExistingEntities(cardIds),
    loadExistingLocalizations(cardIds),
    loadExistingRelations(sourceIds),
  ]);

  const entityResult = reconcileRows(existingEntities, targetEntities, {
    build:    sourceVersion.build,
    keyOf:    entityKey,
    groupKey: row => row.cardId,
  });
  const localizationResult = reconcileRows(existingLocalizations, targetLocalizations, {
    build:    sourceVersion.build,
    keyOf:    localizationKey,
    groupKey: row => `${row.cardId}\u0000${row.lang}`,
  });
  const relationResult = reconcileRows(existingRelations, targetRelations, {
    build:    sourceVersion.build,
    keyOf:    relationKey,
    groupKey: row => row.sourceId,
  });

  const changed = entityResult.changed || localizationResult.changed || relationResult.changed;
  const skipped = !changed && !(input.force ?? false);

  if (!input.dryRun && !skipped) {
    await db.transaction(async tx => {
      await deleteByCardIds(tx, cardIds);
      await deleteBySourceIds(tx, sourceIds);
      await insertEntities(tx, entityResult.finalRows);
      await insertLocalizations(tx, localizationResult.finalRows);
      await insertRelations(tx, relationResult.finalRows);
    });
  }

  return {
    dryRun:                input.dryRun ?? false,
    skipped,
    sourceTag:             input.sourceTag,
    build:                 sourceVersion.build,
    snapshotCount:         snapshots.length,
    insertedEntities:      entityResult.inserted,
    reusedEntities:        entityResult.reused,
    updatedEntities:       entityResult.updated,
    insertedLocalizations: localizationResult.inserted,
    reusedLocalizations:   localizationResult.reused,
    updatedLocalizations:  localizationResult.updated,
    insertedRelations:     relationResult.inserted,
    updatedRelations:      relationResult.updated,
    unprojectedTagCount:   projected.reduce((count, item) => count + item.unprojectedTagCount, 0),
  };
}
