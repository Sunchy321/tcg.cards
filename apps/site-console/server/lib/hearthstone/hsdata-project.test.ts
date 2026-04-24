import { beforeEach, describe, expect, mock, test } from 'bun:test';

type TableName
  = | 'entities'
    | 'entity_localizations'
    | 'entity_relations'
    | 'raw_entity_snapshot_tags'
    | 'raw_entity_snapshots'
    | 'sets'
    | 'source_versions'
    | 'tags';

interface Column {
  name: string;
}

interface Table {
  tableName: TableName;
}

interface SourceVersionRow {
  sourceTag: number;
  build:     number | null;
  status:    string;
}

interface TagRow {
  enumId:            number;
  slug:              string;
  valueKind:         string;
  normalizeKind:     string;
  normalizeConfig:   Record<string, unknown>;
  projectTargetType: string | null;
  projectTargetPath: string | null;
  projectKind:       string | null;
  projectConfig:     Record<string, unknown>;
}

interface SnapshotRow {
  id:               string;
  cardId:           string;
  dbfId:            number;
  sourceTags:       number[];
  entityXmlVersion: number;
  snapshotHash:     string;
  extraPayload:     Record<string, unknown>;
}

interface SnapshotTagRow {
  snapshotId:     string;
  enumId:         number;
  tagOrder:       number;
  rawName:        string;
  rawType:        string;
  rawPayload:     Record<string, unknown>;
  valueKind:      string;
  boolValue:      boolean | null;
  intValue:       number | null;
  stringValue:    string | null;
  enumValue:      string | null;
  locStringValue: Record<string, string> | null;
  cardRefCardId:  string | null;
  cardRefDbfId:   number | null;
  jsonValue:      unknown;
  parseStatus:    string;
}

interface EntityRow {
  cardId:            string;
  version:           number[];
  revisionHash:      string;
  dbfId:             number;
  legacyPayload:     Record<string, unknown>;
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
  mechanics:         Record<string, unknown>;
  referencedTags:    Record<string, unknown>;
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
  renderModel:      Record<string, unknown> | null;
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

interface SetRow {
  setId:         string;
  dbfId:         number | null;
  slug:          string | null;
  type:          string;
  releaseDate:   string;
  cardCountFull: number | null;
  cardCount:     number | null;
  group:         string | null;
}

interface MemoryState {
  sourceVersions: SourceVersionRow[];
  sets:           SetRow[];
  tags:           TagRow[];
  snapshots:      SnapshotRow[];
  snapshotTags:   SnapshotTagRow[];
  entities:       EntityRow[];
  localizations:  LocalizationRow[];
  relations:      RelationRow[];
}

type Row
  = | SourceVersionRow
    | SetRow
    | TagRow
    | SnapshotRow
    | SnapshotTagRow
    | EntityRow
    | LocalizationRow
    | RelationRow;

function column(name: string): Column {
  return { name };
}

function table(tableName: TableName, columns: string[]): Table & Record<string, Column> {
  return Object.fromEntries([
    ['tableName', tableName],
    ...columns.map(name => [name, column(name)]),
  ]) as Table & Record<string, Column>;
}

const SourceVersion = table('source_versions', [
  'sourceTag',
  'build',
  'status',
]);

const HearthstoneSet = table('sets', [
  'setId',
  'dbfId',
  'slug',
  'type',
  'releaseDate',
  'cardCountFull',
  'cardCount',
  'group',
]);

const Tag = table('tags', [
  'enumId',
  'slug',
  'valueKind',
  'normalizeKind',
  'normalizeConfig',
  'projectTargetType',
  'projectTargetPath',
  'projectKind',
  'projectConfig',
]);

const RawEntitySnapshot = table('raw_entity_snapshots', [
  'id',
  'cardId',
  'dbfId',
  'sourceTags',
  'entityXmlVersion',
  'snapshotHash',
  'extraPayload',
]);

const RawEntitySnapshotTag = table('raw_entity_snapshot_tags', [
  'snapshotId',
  'enumId',
  'tagOrder',
  'rawName',
  'rawType',
  'rawPayload',
  'valueKind',
  'boolValue',
  'intValue',
  'stringValue',
  'enumValue',
  'locStringValue',
  'cardRefCardId',
  'cardRefDbfId',
  'jsonValue',
  'parseStatus',
]);

const Entity = table('entities', [
  'cardId',
  'version',
  'revisionHash',
  'dbfId',
  'legacyPayload',
  'set',
  'classes',
  'type',
  'cost',
  'attack',
  'health',
  'durability',
  'armor',
  'rune',
  'race',
  'spellSchool',
  'questType',
  'questProgress',
  'questPart',
  'heroPower',
  'techLevel',
  'inBobsTavern',
  'tripleCard',
  'raceBucket',
  'armorBucket',
  'buddy',
  'bannedRace',
  'mercenaryRole',
  'mercenaryFaction',
  'colddown',
  'collectible',
  'elite',
  'rarity',
  'artist',
  'overrideWatermark',
  'faction',
  'mechanics',
  'referencedTags',
  'textBuilderType',
  'changeType',
  'isLatest',
]);

const EntityLocalization = table('entity_localizations', [
  'cardId',
  'version',
  'lang',
  'revisionHash',
  'localizationHash',
  'renderHash',
  'renderModel',
  'isLatest',
  'name',
  'text',
  'richText',
  'displayText',
  'targetText',
  'textInPlay',
  'howToEarn',
  'howToEarnGolden',
  'flavorText',
  'locChangeType',
]);

const EntityRelation = table('entity_relations', [
  'sourceId',
  'sourceRevisionHash',
  'relation',
  'targetId',
  'version',
  'isLatest',
]);

function getTableName(tableInput: Table): TableName {
  return tableInput.tableName;
}

function readSqlChunks(condition: unknown): unknown[] {
  if (!condition || typeof condition !== 'object' || !('queryChunks' in condition)) {
    return [];
  }

  return (condition as { queryChunks?: unknown[] }).queryChunks ?? [];
}

function readSqlText(chunks: unknown[]): string {
  return chunks.map(chunk => {
    if (chunk && typeof chunk === 'object' && 'value' in chunk) {
      return ((chunk as { value?: string[] }).value ?? []).join('');
    }

    return '';
  }).join('');
}

function readColumn(chunks: unknown[]): string | null {
  const chunk = chunks.find(value => value && typeof value === 'object' && 'name' in value) as Column | undefined;
  return chunk?.name ?? null;
}

function readEqValue(chunks: unknown[]): unknown {
  const columnIndex = chunks.findIndex(value => value && typeof value === 'object' && 'name' in value);
  return columnIndex >= 0 ? chunks[columnIndex + 2] : undefined;
}

function readInValues(chunks: unknown[]): unknown[] {
  return chunks.find(Array.isArray) as unknown[] ?? [];
}

function readAnyValue(chunks: unknown[]): number | null {
  const value = chunks.find(chunk => typeof chunk === 'number');
  return typeof value === 'number' ? value : null;
}

function rowValue(row: Row, columnName: string): unknown {
  return (row as unknown as Record<string, unknown>)[columnName];
}

function matchesCondition(row: Row, condition: unknown): boolean {
  const chunks = readSqlChunks(condition);
  if (chunks.length === 0) {
    return true;
  }

  const text = readSqlText(chunks);
  const columnName = readColumn(chunks);

  if (text.includes(' = ANY(')) {
    const sourceTag = readAnyValue(chunks);
    return sourceTag == null
      ? true
      : Array.isArray((row as SnapshotRow).sourceTags) && (row as SnapshotRow).sourceTags.includes(sourceTag);
  }

  if (!columnName) {
    return true;
  }

  if (text.includes(' in ')) {
    return readInValues(chunks).includes(rowValue(row, columnName));
  }

  if (text.includes(' = ')) {
    return rowValue(row, columnName) === readEqValue(chunks);
  }

  return true;
}

function projectRows(rows: Row[], projection: Record<string, Column>): Array<Record<string, unknown>> {
  return rows.map(row => {
    return Object.fromEntries(
      Object.keys(projection).map(key => [key, rowValue(row, key)]),
    );
  });
}

function cloneState(state: MemoryState): MemoryState {
  return structuredClone(state);
}

class SelectBuilder {
  private tableName: TableName | null = null;
  private condition: unknown;

  constructor(
    private readonly memoryDb: MemoryProjectDb,
    private readonly projection: Record<string, Column>,
  ) {}

  from(tableInput: Table) {
    this.tableName = getTableName(tableInput);
    return this;
  }

  where(condition: unknown) {
    this.condition = condition;
    return this;
  }

  then<TResult1 = Array<Record<string, unknown>>, TResult2 = never>(
    onfulfilled?: ((value: Array<Record<string, unknown>>) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return Promise.resolve(this.execute()).then(onfulfilled, onrejected);
  }

  private execute() {
    if (!this.tableName) {
      return [];
    }

    const rows = this.memoryDb.readRows(this.tableName)
      .filter(row => matchesCondition(row, this.condition));

    return projectRows(rows, this.projection);
  }
}

class InsertBuilder {
  private rows: Row[] = [];

  constructor(
    private readonly memoryDb: MemoryProjectDb,
    private readonly tableName: TableName,
  ) {}

  values(values: Row | Row[]) {
    this.rows = Array.isArray(values) ? values : [values];
    return Promise.resolve(this.execute());
  }

  then<TResult1 = Row[], TResult2 = never>(
    onfulfilled?: ((value: Row[]) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return Promise.resolve(this.execute()).then(onfulfilled, onrejected);
  }

  private execute() {
    if (this.tableName === 'entities') {
      this.memoryDb.state.entities.push(...this.rows as EntityRow[]);
    } else if (this.tableName === 'entity_localizations') {
      this.memoryDb.state.localizations.push(...this.rows as LocalizationRow[]);
    } else if (this.tableName === 'entity_relations') {
      this.memoryDb.state.relations.push(...this.rows as RelationRow[]);
    } else if (this.tableName === 'sets') {
      this.memoryDb.state.sets.push(...this.rows as SetRow[]);
    } else if (this.tableName === 'source_versions') {
      this.memoryDb.state.sourceVersions.push(...this.rows as SourceVersionRow[]);
    } else if (this.tableName === 'tags') {
      this.memoryDb.state.tags.push(...this.rows as TagRow[]);
    } else if (this.tableName === 'raw_entity_snapshots') {
      this.memoryDb.state.snapshots.push(...this.rows as SnapshotRow[]);
    } else if (this.tableName === 'raw_entity_snapshot_tags') {
      this.memoryDb.state.snapshotTags.push(...this.rows as SnapshotTagRow[]);
    }

    return this.rows;
  }
}

class DeleteBuilder {
  constructor(
    private readonly memoryDb: MemoryProjectDb,
    private readonly tableName: TableName,
  ) {}

  where(condition: unknown) {
    this.memoryDb.deleteRows(this.tableName, condition);
    return Promise.resolve([]);
  }
}

class MemoryProjectDb {
  state: MemoryState = this.createState();

  reset() {
    this.state = this.createState();
  }

  select(projection: Record<string, Column>) {
    return new SelectBuilder(this, projection);
  }

  insert(tableInput: Table) {
    return new InsertBuilder(this, getTableName(tableInput));
  }

  delete(tableInput: Table) {
    return new DeleteBuilder(this, getTableName(tableInput));
  }

  async transaction<T>(callback: (tx: MemoryProjectDb) => Promise<T>) {
    const snapshot = cloneState(this.state);

    try {
      return await callback(this);
    } catch (error) {
      this.state = snapshot;
      throw error;
    }
  }

  readRows(tableName: TableName): Row[] {
    if (tableName === 'source_versions') return this.state.sourceVersions;
    if (tableName === 'sets') return this.state.sets;
    if (tableName === 'tags') return this.state.tags;
    if (tableName === 'raw_entity_snapshots') return this.state.snapshots;
    if (tableName === 'raw_entity_snapshot_tags') return this.state.snapshotTags;
    if (tableName === 'entities') return this.state.entities;
    if (tableName === 'entity_localizations') return this.state.localizations;
    return this.state.relations;
  }

  deleteRows(tableName: TableName, condition: unknown) {
    if (tableName === 'entities') {
      this.state.entities = this.state.entities.filter(row => !matchesCondition(row, condition));
      return;
    }

    if (tableName === 'entity_localizations') {
      this.state.localizations = this.state.localizations.filter(row => !matchesCondition(row, condition));
      return;
    }

    if (tableName === 'entity_relations') {
      this.state.relations = this.state.relations.filter(row => !matchesCondition(row, condition));
    }
  }

  private createState(): MemoryState {
    return {
      sourceVersions: [],
      sets:           [],
      tags:           [],
      snapshots:      [],
      snapshotTags:   [],
      entities:       [],
      localizations:  [],
      relations:      [],
    };
  }
}

const memoryDb = new MemoryProjectDb();

mock.module('#db/db', () => ({ db: memoryDb }));
mock.module('#model/hearthstone/schema/basic', async () => {
  return await import('@tcg-cards/model/src/hearthstone/schema/basic');
});
mock.module('#model/hearthstone/schema/entity', async () => {
  return await import('@tcg-cards/model/src/hearthstone/schema/entity');
});
mock.module('#schema/hearthstone', () => ({
  Entity,
  EntityLocalization,
  EntityRelation,
  RawEntitySnapshot,
  RawEntitySnapshotTag,
  Set: HearthstoneSet,
  SourceVersion,
  Tag,
}));

const { projectHsdata } = await import('./hsdata-project');

const enumId = {
  attack:          47,
  cardName:        185,
  cardSet:         183,
  cardText:        184,
  cardType:        202,
  class:           199,
  collectible:     321,
  cost:            48,
  elite:           114,
  flavorText:      351,
  health:          45,
  heroPower:       9001,
  heroicHeroPower: 9002,
  hideCost:        684,
  rarity:          203,
  race:            200,
  tripleCard:      9003,
  artist:          342,
  dualRaceDragon:  2523,
  dualRaceBeast:   2542,
  unknown:         9999,
} as const;

function addSourceVersion(sourceTag: number, build: number) {
  memoryDb.state.sourceVersions.push({
    sourceTag,
    build,
    status: 'completed',
  });
}

function addSet(row: SetRow) {
  memoryDb.state.sets.push(row);
}

function addTag(row: TagRow) {
  memoryDb.state.tags.push(row);
}

function makeTag(
  input: Partial<TagRow> & Pick<TagRow, 'enumId' | 'slug' | 'projectKind' | 'projectTargetPath'>,
): TagRow {
  return {
    valueKind:         'int',
    normalizeKind:     'identity_int',
    normalizeConfig:   {},
    projectTargetType: 'entity',
    projectConfig:     {},
    ...input,
  };
}

function addSnapshot(row: SnapshotRow) {
  memoryDb.state.snapshots.push(row);
}

function addSnapshotTag(row: SnapshotTagRow) {
  memoryDb.state.snapshotTags.push(row);
}

function addLocalizedTag(
  snapshotId: string,
  enumValue: number,
  tagOrder: number,
  value: Record<string, string>,
  rawName: string,
) {
  addSnapshotTag({
    snapshotId,
    enumId:         enumValue,
    tagOrder,
    rawName,
    rawType:        'LocString',
    rawPayload:     { children: value },
    valueKind:      'loc_string',
    boolValue:      null,
    intValue:       null,
    stringValue:    null,
    enumValue:      null,
    locStringValue: value,
    cardRefCardId:  null,
    cardRefDbfId:   null,
    jsonValue:      null,
    parseStatus:    'parsed',
  });
}

function addIntTag(
  snapshotId: string,
  enumValue: number,
  tagOrder: number,
  value: number,
  rawName: string,
) {
  addSnapshotTag({
    snapshotId,
    enumId:         enumValue,
    tagOrder,
    rawName,
    rawType:        'Int',
    rawPayload:     { attributes: { value: String(value) } },
    valueKind:      'int',
    boolValue:      null,
    intValue:       value,
    stringValue:    null,
    enumValue:      null,
    locStringValue: null,
    cardRefCardId:  null,
    cardRefDbfId:   null,
    jsonValue:      null,
    parseStatus:    'parsed',
  });
}

function addStringTag(
  snapshotId: string,
  enumValue: number,
  tagOrder: number,
  value: string,
  rawName: string,
) {
  addSnapshotTag({
    snapshotId,
    enumId:         enumValue,
    tagOrder,
    rawName,
    rawType:        'String',
    rawPayload:     { text: value },
    valueKind:      'string',
    boolValue:      null,
    intValue:       null,
    stringValue:    value,
    enumValue:      null,
    locStringValue: null,
    cardRefCardId:  null,
    cardRefDbfId:   null,
    jsonValue:      null,
    parseStatus:    'parsed',
  });
}

function addCardRefTag(
  snapshotId: string,
  enumValue: number,
  tagOrder: number,
  cardId: string,
  dbfId: number | null,
  rawName: string,
) {
  addSnapshotTag({
    snapshotId,
    enumId:         enumValue,
    tagOrder,
    rawName,
    rawType:        'Card',
    rawPayload:     { attributes: { cardID: cardId } },
    valueKind:      'card_ref',
    boolValue:      null,
    intValue:       null,
    stringValue:    null,
    enumValue:      null,
    locStringValue: null,
    cardRefCardId:  cardId,
    cardRefDbfId:   dbfId,
    jsonValue:      null,
    parseStatus:    'parsed',
  });
}

function seedTagConfig() {
  addTag(makeTag({
    enumId:            enumId.cardName,
    slug:              'card_name',
    valueKind:         'loc_string',
    normalizeKind:     'identity_loc_string',
    projectTargetType: 'entity_localization',
    projectKind:       'assign_localized_text',
    projectTargetPath: 'name',
  }));
  addTag(makeTag({
    enumId:            enumId.cardText,
    slug:              'card_text',
    valueKind:         'loc_string',
    normalizeKind:     'identity_loc_string',
    projectTargetType: 'entity_localization',
    projectKind:       'assign_localized_text',
    projectTargetPath: 'richText',
  }));
  addTag(makeTag({
    enumId:            enumId.flavorText,
    slug:              'flavor_text',
    valueKind:         'loc_string',
    normalizeKind:     'identity_loc_string',
    projectTargetType: 'entity_localization',
    projectKind:       'assign_localized_text',
    projectTargetPath: 'flavorText',
  }));
  addTag(makeTag({
    enumId:            enumId.artist,
    slug:              'artist_name',
    valueKind:         'string',
    normalizeKind:     'identity_string',
    projectKind:       'assign_string',
    projectTargetPath: 'artist',
  }));
  addTag(makeTag({
    enumId:            enumId.cardSet,
    slug:              'card_set',
    normalizeKind:     'enum_from_int',
    normalizeConfig:   { enumMap: 'set' },
    projectKind:       'assign_string',
    projectTargetPath: 'set',
  }));
  addTag(makeTag({
    enumId:            enumId.class,
    slug:              'class',
    normalizeKind:     'enum_from_int',
    normalizeConfig:   { enumMap: { 4: 'mage', 12: 'neutral' } },
    projectKind:       'append_string_array',
    projectTargetPath: 'classes',
  }));
  addTag(makeTag({
    enumId:            enumId.race,
    slug:              'race',
    normalizeKind:     'enum_from_int',
    normalizeConfig:   { enumMap: { 20: 'beast' } },
    projectKind:       'append_string_array',
    projectTargetPath: 'race',
  }));
  addTag(makeTag({
    enumId:            enumId.dualRaceDragon,
    slug:              'dual_race_dragon',
    normalizeKind:     'bool_from_int',
    projectKind:       'append_string_array',
    projectTargetPath: 'race',
    projectConfig:     { value: 'dragon' },
  }));
  addTag(makeTag({
    enumId:            enumId.dualRaceBeast,
    slug:              'dual_race_beast',
    normalizeKind:     'bool_from_int',
    projectKind:       'append_string_array',
    projectTargetPath: 'race',
    projectConfig:     { value: 'beast' },
  }));
  addTag(makeTag({
    enumId:            enumId.cardType,
    slug:              'card_type',
    normalizeKind:     'enum_from_int',
    normalizeConfig:   { enumMap: { 4: 'minion', 5: 'spell' } },
    projectKind:       'assign_string',
    projectTargetPath: 'type',
  }));
  addTag(makeTag({
    enumId:            enumId.cost,
    slug:              'cost',
    projectKind:       'assign_int',
    projectTargetPath: 'cost',
  }));
  addTag(makeTag({
    enumId:            enumId.attack,
    slug:              'attack',
    projectKind:       'assign_int',
    projectTargetPath: 'attack',
  }));
  addTag(makeTag({
    enumId:            enumId.health,
    slug:              'health',
    projectKind:       'assign_int',
    projectTargetPath: 'health',
  }));
  addTag(makeTag({
    enumId:            enumId.rarity,
    slug:              'rarity',
    normalizeKind:     'enum_from_int',
    normalizeConfig:   { enumMap: { 3: 'rare', 5: 'legendary' } },
    projectKind:       'assign_string',
    projectTargetPath: 'rarity',
  }));
  addTag(makeTag({
    enumId:            enumId.collectible,
    slug:              'collectible',
    normalizeKind:     'bool_from_int',
    projectKind:       'assign_bool',
    projectTargetPath: 'collectible',
  }));
  addTag(makeTag({
    enumId:            enumId.elite,
    slug:              'elite',
    normalizeKind:     'bool_from_int',
    projectKind:       'assign_bool',
    projectTargetPath: 'elite',
  }));
  addTag(makeTag({
    enumId:            enumId.hideCost,
    slug:              'hide_cost',
    normalizeKind:     'bool_from_int',
    projectKind:       'assign_mechanic',
    projectTargetPath: 'mechanics',
  }));
  addTag(makeTag({
    enumId:            enumId.heroPower,
    slug:              'hero_power',
    valueKind:         'card_ref',
    normalizeKind:     'identity_card_ref',
    projectKind:       'assign_card_ref',
    projectTargetPath: 'heroPower',
  }));
  addTag(makeTag({
    enumId:            enumId.heroicHeroPower,
    slug:              'heroic_hero_power',
    valueKind:         'card_ref',
    normalizeKind:     'identity_card_ref',
    projectKind:       'assign_card_ref',
    projectTargetPath: 'heroicHeroPower',
  }));
  addTag(makeTag({
    enumId:            enumId.tripleCard,
    slug:              'triple_card',
    normalizeKind:     'card_ref_from_int',
    projectKind:       'assign_card_ref',
    projectTargetPath: 'tripleCard',
  }));
  addTag(makeTag({
    enumId:            enumId.unknown,
    slug:              'unknown_tag',
    projectKind:       null,
    projectTargetPath: null,
  }));
}

function seedSource(sourceTag: number, build: number, zhText: string) {
  addSourceVersion(sourceTag, build);

  addSnapshot({
    id:               `snapshot-main-${sourceTag}`,
    cardId:           'MAIN_001',
    dbfId:            1001,
    sourceTags:       [sourceTag],
    entityXmlVersion: 1,
    snapshotHash:     `main-${sourceTag}`,
    extraPayload:     { referencedTags: { 777: true } },
  });

  addSnapshot({
    id:               `snapshot-token-${sourceTag}`,
    cardId:           'TOKEN_001',
    dbfId:            1002,
    sourceTags:       [sourceTag],
    entityXmlVersion: 1,
    snapshotHash:     `token-${sourceTag}`,
    extraPayload:     { referencedTags: {} },
  });

  addLocalizedTag(`snapshot-main-${sourceTag}`, enumId.cardName, 0, {
    enUS: 'Arcane Construct',
    zhCN: '奥术构造体',
  }, 'CARDNAME');
  addLocalizedTag(`snapshot-main-${sourceTag}`, enumId.cardText, 1, {
    enUS: 'Spellburst: Gain +2 Attack.',
    zhCN: zhText,
  }, 'CARDTEXT');
  addLocalizedTag(`snapshot-main-${sourceTag}`, enumId.flavorText, 2, {
    enUS: 'Built for precise spellwork.',
    zhCN: '为精准施法而造。',
  }, 'FLAVORTEXT');
  addStringTag(`snapshot-main-${sourceTag}`, enumId.artist, 3, 'Studio Lantern', 'ARTISTNAME');
  addIntTag(`snapshot-main-${sourceTag}`, enumId.cardSet, 4, 10, 'CARD_SET');
  addIntTag(`snapshot-main-${sourceTag}`, enumId.class, 5, 4, 'CLASS');
  addIntTag(`snapshot-main-${sourceTag}`, enumId.race, 6, 20, 'CARDRACE');
  addIntTag(`snapshot-main-${sourceTag}`, enumId.dualRaceDragon, 7, 1, 'DUAL_RACE_DRAGON');
  addIntTag(`snapshot-main-${sourceTag}`, enumId.dualRaceBeast, 8, 1, 'DUAL_RACE_BEAST');
  addIntTag(`snapshot-main-${sourceTag}`, enumId.cardType, 9, 4, 'CARDTYPE');
  addIntTag(`snapshot-main-${sourceTag}`, enumId.cost, 10, 3, 'COST');
  addIntTag(`snapshot-main-${sourceTag}`, enumId.attack, 11, 2, 'ATK');
  addIntTag(`snapshot-main-${sourceTag}`, enumId.health, 12, 4, 'HEALTH');
  addIntTag(`snapshot-main-${sourceTag}`, enumId.rarity, 13, 3, 'RARITY');
  addIntTag(`snapshot-main-${sourceTag}`, enumId.collectible, 14, 1, 'COLLECTIBLE');
  addIntTag(`snapshot-main-${sourceTag}`, enumId.elite, 15, 0, 'ELITE');
  addIntTag(`snapshot-main-${sourceTag}`, enumId.hideCost, 16, 1, 'HIDE_COST');
  addCardRefTag(`snapshot-main-${sourceTag}`, enumId.heroPower, 17, 'HERO_POWER_001', null, 'HERO_POWER');
  addCardRefTag(`snapshot-main-${sourceTag}`, enumId.heroicHeroPower, 18, 'HERO_POWER_002', null, 'HEROIC_HERO_POWER');
  addIntTag(`snapshot-main-${sourceTag}`, enumId.tripleCard, 19, 1002, 'TRIPLE_CARD');
  addIntTag(`snapshot-main-${sourceTag}`, enumId.unknown, 20, 9, 'UNKNOWN_TAG');

  addLocalizedTag(`snapshot-token-${sourceTag}`, enumId.cardName, 0, {
    enUS: 'Construct Token',
  }, 'CARDNAME');
  addLocalizedTag(`snapshot-token-${sourceTag}`, enumId.cardText, 1, {
    enUS: 'A fragile helper.',
  }, 'CARDTEXT');
  addStringTag(`snapshot-token-${sourceTag}`, enumId.artist, 2, 'Studio Lantern', 'ARTISTNAME');
  addIntTag(`snapshot-token-${sourceTag}`, enumId.cardSet, 3, 10, 'CARD_SET');
  addIntTag(`snapshot-token-${sourceTag}`, enumId.class, 4, 12, 'CLASS');
  addIntTag(`snapshot-token-${sourceTag}`, enumId.cardType, 5, 4, 'CARDTYPE');
  addIntTag(`snapshot-token-${sourceTag}`, enumId.cost, 6, 1, 'COST');
  addIntTag(`snapshot-token-${sourceTag}`, enumId.attack, 7, 1, 'ATK');
  addIntTag(`snapshot-token-${sourceTag}`, enumId.health, 8, 1, 'HEALTH');
  addIntTag(`snapshot-token-${sourceTag}`, enumId.rarity, 9, 3, 'RARITY');
  addIntTag(`snapshot-token-${sourceTag}`, enumId.collectible, 10, 0, 'COLLECTIBLE');
}

beforeEach(() => {
  memoryDb.reset();
  addSet({
    setId:         'CORE',
    dbfId:         10,
    slug:          'core',
    type:          'core',
    releaseDate:   '2024-01-01',
    cardCountFull: 0,
    cardCount:     0,
    group:         null,
  });
  seedTagConfig();
});

describe('projectHsdata', () => {
  test('projects raw snapshots into entities, localizations and relations', async () => {
    seedSource(50001, 31001, '法术迸发：获得 +2 攻击力。');

    const report = await projectHsdata({ sourceTag: 50001 });

    expect(report).toMatchObject({
      skipped:               false,
      build:                 31001,
      snapshotCount:         2,
      insertedEntities:      2,
      insertedLocalizations: 3,
      insertedRelations:     3,
      unprojectedTagCount:   1,
    });

    expect(memoryDb.state.entities).toHaveLength(2);
    expect(memoryDb.state.localizations).toHaveLength(3);
    expect(memoryDb.state.relations).toHaveLength(3);

    const main = memoryDb.state.entities.find(row => row.cardId === 'MAIN_001');
    expect(main).toMatchObject({
      set:            'CORE',
      classes:        ['mage'],
      race:           ['beast', 'dragon'],
      type:           'minion',
      cost:           3,
      attack:         2,
      health:         4,
      heroPower:      'HERO_POWER_001',
      tripleCard:     'TOKEN_001',
      collectible:    true,
      elite:          false,
      mechanics:      { 684: true },
      referencedTags: { 777: true },
      isLatest:       true,
    });
    expect(main?.revisionHash).toHaveLength(64);

    const zh = memoryDb.state.localizations.find(row => row.cardId === 'MAIN_001' && row.lang === 'zhs');
    expect(zh).toMatchObject({
      name:        '奥术构造体',
      text:        '法术迸发：获得 +2 攻击力。',
      richText:    '法术迸发：获得 +2 攻击力。',
      displayText: '法术迸发：获得 +2 攻击力。',
      flavorText:  '为精准施法而造。',
      isLatest:    true,
    });
    expect(zh?.renderHash).toHaveLength(64);
    expect(zh?.renderModel).toMatchObject({
      cardId:       'MAIN_001',
      lang:         'zhs',
      type:         'minion',
      cost:         3,
      classes:      ['mage'],
      localization: {
        name:     '奥术构造体',
        richText: '法术迸发：获得 +2 攻击力。',
      },
      renderMechanics: {
        hide_cost: true,
      },
    });

    expect(memoryDb.state.relations).toEqual(expect.arrayContaining([
      expect.objectContaining({
        sourceId: 'MAIN_001',
        relation: 'hero_power',
        targetId: 'HERO_POWER_001',
        version:  [31001],
        isLatest: true,
      }),
      expect.objectContaining({
        sourceId: 'MAIN_001',
        relation: 'heroic_hero_power',
        targetId: 'HERO_POWER_002',
        version:  [31001],
        isLatest: true,
      }),
      expect.objectContaining({
        sourceId: 'MAIN_001',
        relation: 'triple_card',
        targetId: 'TOKEN_001',
        version:  [31001],
        isLatest: true,
      }),
    ]));
  });

  test('falls back to built-in type and rarity normalization when enum maps are missing', async () => {
    seedSource(50001, 31001, '法术迸发：获得 +2 攻击力。');

    const cardTypeTag = memoryDb.state.tags.find(row => row.slug === 'card_type');
    const rarityTag = memoryDb.state.tags.find(row => row.slug === 'rarity');

    if (!cardTypeTag || !rarityTag) {
      throw new Error('Expected card_type and rarity tags to exist');
    }

    cardTypeTag.normalizeConfig = {};
    rarityTag.normalizeConfig = {};

    const tokenType = memoryDb.state.snapshotTags.find(row =>
      row.snapshotId === 'snapshot-token-50001' && row.enumId === enumId.cardType,
    );
    const tokenRarity = memoryDb.state.snapshotTags.find(row =>
      row.snapshotId === 'snapshot-token-50001' && row.enumId === enumId.rarity,
    );

    if (!tokenType || !tokenRarity) {
      throw new Error('Expected token type and rarity rows to exist');
    }

    const report = await projectHsdata({ sourceTag: 50001 });

    expect(report.skipped).toBe(false);

    const main = memoryDb.state.entities.find(row => row.cardId === 'MAIN_001');
    const token = memoryDb.state.entities.find(row => row.cardId === 'TOKEN_001');
    const tokenLoc = memoryDb.state.localizations.find(row => row.cardId === 'TOKEN_001' && row.lang === 'en');

    expect(main).toMatchObject({
      type:   'minion',
      rarity: 'rare',
    });
    expect(token).toMatchObject({
      type:   'minion',
      rarity: 'rare',
    });
    expect(tokenLoc?.renderModel).toMatchObject({
      type:   'minion',
      rarity: 'rare',
    });
  });

  test('applies legacy defaults for missing projected fields', async () => {
    addSourceVersion(50010, 31010);

    addSnapshot({
      id:               'snapshot-fallback-minion',
      cardId:           'FALLBACK_MINION_001',
      dbfId:            2001,
      sourceTags:       [50010],
      entityXmlVersion: 1,
      snapshotHash:     'fallback-minion',
      extraPayload:     { referencedTags: {} },
    });
    addLocalizedTag('snapshot-fallback-minion', enumId.cardName, 0, {
      zhCN: '缺失随从',
    }, 'CARDNAME');
    addLocalizedTag('snapshot-fallback-minion', enumId.cardText, 1, {
      zhCN: '<b>造成 $2 点伤害。</b>[x]',
    }, 'CARDTEXT');
    addIntTag('snapshot-fallback-minion', enumId.cardType, 2, 4, 'CARDTYPE');
    addIntTag('snapshot-fallback-minion', enumId.attack, 3, 3, 'ATK');

    addSnapshot({
      id:               'snapshot-fallback-weapon',
      cardId:           'FALLBACK_WEAPON_001',
      dbfId:            2002,
      sourceTags:       [50010],
      entityXmlVersion: 1,
      snapshotHash:     'fallback-weapon',
      extraPayload:     { referencedTags: {} },
    });
    addLocalizedTag('snapshot-fallback-weapon', enumId.cardName, 0, {
      enUS: 'Fallback Weapon',
    }, 'CARDNAME');
    addLocalizedTag('snapshot-fallback-weapon', enumId.cardText, 1, {
      enUS: '<i>Gain #1 Attack.</i>',
    }, 'CARDTEXT');
    addIntTag('snapshot-fallback-weapon', enumId.cardType, 2, 7, 'CARDTYPE');
    addIntTag('snapshot-fallback-weapon', enumId.attack, 3, 2, 'ATK');

    addSnapshot({
      id:               'snapshot-fallback-blank',
      cardId:           'FALLBACK_BLANK_001',
      dbfId:            2003,
      sourceTags:       [50010],
      entityXmlVersion: 1,
      snapshotHash:     'fallback-blank',
      extraPayload:     { referencedTags: {} },
    });
    addLocalizedTag('snapshot-fallback-blank', enumId.cardName, 0, {
      enUS: 'Fallback Blank',
    }, 'CARDNAME');

    const report = await projectHsdata({ sourceTag: 50010 });

    expect(report.skipped).toBe(false);

    const minion = memoryDb.state.entities.find(row => row.cardId === 'FALLBACK_MINION_001');
    expect(minion).toMatchObject({
      set:             '',
      type:            'minion',
      cost:            0,
      attack:          3,
      health:          0,
      collectible:     false,
      elite:           false,
      artist:          '',
      textBuilderType: 'default',
    });

    const minionLoc = memoryDb.state.localizations.find(row => row.cardId === 'FALLBACK_MINION_001' && row.lang === 'zhs');
    expect(minionLoc).toMatchObject({
      name:        '缺失随从',
      text:        '造成 2 点伤害。',
      richText:    '<b>造成 $2 点伤害。</b>[x]',
      displayText: '<b>造成 $2 点伤害。</b>[x]',
    });

    const weapon = memoryDb.state.entities.find(row => row.cardId === 'FALLBACK_WEAPON_001');
    expect(weapon).toMatchObject({
      set:        '',
      type:       'weapon',
      cost:       0,
      attack:     2,
      durability: 0,
    });

    const blank = memoryDb.state.entities.find(row => row.cardId === 'FALLBACK_BLANK_001');
    expect(blank).toMatchObject({
      set:  '',
      type: 'null',
      cost: 0,
    });

    const blankLoc = memoryDb.state.localizations.find(row => row.cardId === 'FALLBACK_BLANK_001' && row.lang === 'en');
    expect(blankLoc).toMatchObject({
      name:        'Fallback Blank',
      text:        '',
      richText:    '',
      displayText: '',
    });
  });

  test('skips repeated projection when the projected state is unchanged', async () => {
    seedSource(50001, 31001, '法术迸发：获得 +2 攻击力。');

    await projectHsdata({ sourceTag: 50001 });
    const before = structuredClone(memoryDb.state);

    const report = await projectHsdata({ sourceTag: 50001 });

    expect(report.skipped).toBe(true);
    expect(memoryDb.state).toEqual(before);
  });

  test('merges versions across builds and reuses matching hashes', async () => {
    seedSource(50001, 31001, '法术迸发：获得 +2 攻击力。');
    seedSource(50002, 31002, '法术迸发：获得 +3 攻击力。');

    await projectHsdata({ sourceTag: 50001 });
    const report = await projectHsdata({ sourceTag: 50002 });

    expect(report).toMatchObject({
      skipped:               false,
      insertedEntities:      0,
      updatedEntities:       2,
      reusedEntities:        0,
      insertedLocalizations: 1,
      updatedLocalizations:  2,
      insertedRelations:     0,
      updatedRelations:      3,
    });

    const main = memoryDb.state.entities.find(row => row.cardId === 'MAIN_001');
    const token = memoryDb.state.entities.find(row => row.cardId === 'TOKEN_001');
    expect(main?.version).toEqual([31001, 31002]);
    expect(token?.version).toEqual([31001, 31002]);
    expect(main?.isLatest).toBe(true);

    const enRows = memoryDb.state.localizations.filter(row => row.cardId === 'MAIN_001' && row.lang === 'en');
    const zhRows = memoryDb.state.localizations.filter(row => row.cardId === 'MAIN_001' && row.lang === 'zhs');

    expect(enRows).toHaveLength(1);
    expect(enRows[0]?.version).toEqual([31001, 31002]);
    expect(enRows[0]?.isLatest).toBe(true);

    expect(zhRows).toHaveLength(2);
    expect(zhRows.map(row => row.version).sort()).toEqual([[31001], [31002]]);
    expect(zhRows.find(row => row.version.includes(31001))?.isLatest).toBe(false);
    expect(zhRows.find(row => row.version.includes(31002))?.isLatest).toBe(true);
    expect(zhRows.find(row => row.version.includes(31001))?.renderHash)
      .not.toEqual(zhRows.find(row => row.version.includes(31002))?.renderHash);

    const relation = memoryDb.state.relations.find(row => row.relation === 'triple_card');
    expect(relation?.version).toEqual([31001, 31002]);
    expect(relation?.isLatest).toBe(true);
  });

  test('rejects projection when set enum resolves to an empty setId', async () => {
    memoryDb.state.sets = [{
      setId:         '',
      dbfId:         10,
      slug:          null,
      type:          'unknown',
      releaseDate:   '',
      cardCountFull: null,
      cardCount:     null,
      group:         null,
    }];
    seedSource(50001, 31001, '法术迸发：获得 +2 攻击力。');

    await expect(projectHsdata({ sourceTag: 50001 }))
      .rejects.toThrow('unresolved setId for card MAIN_001 (1001) from set dbfId 10');

    expect(memoryDb.state.entities).toHaveLength(0);
    expect(memoryDb.state.localizations).toHaveLength(0);
    expect(memoryDb.state.relations).toHaveLength(0);
  });
});
