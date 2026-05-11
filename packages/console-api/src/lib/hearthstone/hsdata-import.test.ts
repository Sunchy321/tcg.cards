import { beforeEach, describe, expect, mock, test } from 'bun:test';

type TableName
  = | 'raw_entity_snapshot_tags'
    | 'raw_entity_snapshots'
    | 'entities'
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
  sourceTag:           number;
  sourceCommit:        string;
  build:               number | null;
  sourceHash:          string;
  sourceUri:    string;
  importEngineVersion: string | null;
  status:              string;
  projectionStatus:    string;
  projectionError:     string | null;
  importedAt:          Date | null;
  projectedAt:         Date | null;
}

interface TagRow {
  enumId:             number;
  slug:               string;
  name:               string | null;
  rawName:            string | null;
  rawType:            string | null;
  rawNames:           string[];
  valueKind:          string;
  normalizeKind:      string;
  normalizeConfig:    Record<string, unknown>;
  projectTargetType:  string | null;
  projectTargetPath:  string | null;
  projectKind:        string | null;
  projectConfig:      Record<string, unknown>;
  status:             string;
  description:        string | null;
  firstSeenSourceTag: number | null;
  lastSeenSourceTag:  number | null;
}

interface SnapshotRow {
  id:               string;
  cardId:           string;
  dbfId:            number;
  sourceTags:       number[];
  entityXmlVersion: number;
  snapshotHash:     string;
  extraPayload:     Record<string, unknown>;
  isLatest:         boolean;
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
  cardId:   string;
  dbfId:    number;
  isLatest: boolean;
}

interface SetRow {
  setId:         string;
  dbfId:         number | null;
  slug:          string | null;
  rawName:       string | null;
  type:          string;
  releaseDate:   string;
  cardCountFull: number | null;
  cardCount:     number | null;
  group:         string | null;
}

interface MemoryState {
  sourceVersions: Map<number, SourceVersionRow>;
  sets:           Map<string, SetRow>;
  tags:           Map<number, TagRow>;
  snapshots:      Map<string, SnapshotRow>;
  snapshotTags:   SnapshotTagRow[];
  entities:       Map<string, EntityRow>;
  nextSnapshotId: number;
}

type Row = SourceVersionRow | SetRow | TagRow | SnapshotRow | SnapshotTagRow | EntityRow;

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
  'sourceCommit',
  'build',
  'sourceHash',
  'sourceUri',
  'importEngineVersion',
  'status',
  'projectionStatus',
  'projectionError',
  'importedAt',
  'projectedAt',
]);

const HearthstoneSet = table('sets', [
  'setId',
  'dbfId',
  'slug',
  'rawName',
  'type',
  'releaseDate',
  'cardCountFull',
  'cardCount',
  'group',
]);

const Tag = table('tags', [
  'enumId',
  'slug',
  'name',
  'rawName',
  'rawType',
  'rawNames',
  'valueKind',
  'normalizeKind',
  'projectTargetType',
  'projectTargetPath',
  'projectKind',
  'firstSeenSourceTag',
  'lastSeenSourceTag',
]);

const RawEntitySnapshot = table('raw_entity_snapshots', [
  'id',
  'cardId',
  'dbfId',
  'sourceTags',
  'entityXmlVersion',
  'snapshotHash',
  'extraPayload',
  'isLatest',
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

function getTableName(tableInput: Table): TableName {
  return tableInput.tableName;
}

function cloneMap<T>(map: Map<number | string, T>): Map<number | string, T> {
  return new Map([...map.entries()].map(([key, value]) => [key, structuredClone(value)]));
}

function cloneState(state: MemoryState): MemoryState {
  return {
    sourceVersions: cloneMap(state.sourceVersions) as Map<number, SourceVersionRow>,
    sets:           cloneMap(state.sets) as Map<string, SetRow>,
    tags:           cloneMap(state.tags) as Map<number, TagRow>,
    snapshots:      cloneMap(state.snapshots) as Map<string, SnapshotRow>,
    snapshotTags:   structuredClone(state.snapshotTags),
    entities:       cloneMap(state.entities) as Map<string, EntityRow>,
    nextSnapshotId: state.nextSnapshotId,
  };
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

class SelectBuilder {
  private tableName: TableName | null = null;
  private condition: unknown;

  constructor(
    private readonly memoryDb: MemoryHsdataDb,
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
    return this.execute().then(onfulfilled, onrejected);
  }

  private async execute() {
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
    private readonly memoryDb: MemoryHsdataDb,
    private readonly tableName: TableName,
  ) {}

  values(values: Row | Row[]) {
    this.rows = Array.isArray(values) ? values : [values];
    return this;
  }

  onConflictDoUpdate(options: { set: Partial<SourceVersionRow> }) {
    if (this.tableName !== 'source_versions') {
      return Promise.resolve([]);
    }

    for (const row of this.rows as SourceVersionRow[]) {
      const existing = this.memoryDb.state.sourceVersions.get(row.sourceTag);
      this.memoryDb.state.sourceVersions.set(row.sourceTag, {
        ...(existing ?? row),
        ...options.set,
        sourceTag: row.sourceTag,
      } as SourceVersionRow);
    }

    return Promise.resolve([]);
  }

  returning(projection: Record<string, Column>) {
    const inserted = this.executeInsert();
    return Promise.resolve(projectRows(inserted, projection));
  }

  then<TResult1 = Row[], TResult2 = never>(
    onfulfilled?: ((value: Row[]) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return Promise.resolve(this.executeInsert()).then(onfulfilled, onrejected);
  }

  private executeInsert(): Row[] {
    if (this.tableName === 'source_versions') {
      for (const row of this.rows as SourceVersionRow[]) {
        this.memoryDb.state.sourceVersions.set(row.sourceTag, row);
      }
      return this.rows;
    }

    if (this.tableName === 'tags') {
      for (const row of this.rows as TagRow[]) {
        this.memoryDb.state.tags.set(row.enumId, row);
      }
      return this.rows;
    }

    if (this.tableName === 'sets') {
      for (const row of this.rows as SetRow[]) {
        this.memoryDb.state.sets.set(`${row.setId}\u0000${row.dbfId ?? 'null'}`, row);
      }
      return this.rows;
    }

    if (this.tableName === 'raw_entity_snapshots') {
      const inserted = (this.rows as SnapshotRow[]).map(row => ({
        ...row,
        id: `snapshot-${this.memoryDb.state.nextSnapshotId++}`,
      }));

      for (const row of inserted) {
        this.memoryDb.state.snapshots.set(row.id, row);
      }

      return inserted;
    }

    if (this.tableName === 'raw_entity_snapshot_tags') {
      for (const row of this.rows as SnapshotTagRow[]) {
        const duplicate = this.memoryDb.state.snapshotTags.some(existing => {
          return existing.snapshotId === row.snapshotId
            && existing.enumId === row.enumId
            && existing.tagOrder === row.tagOrder;
        });

        if (duplicate) {
          throw new Error(`Duplicate snapshot tag ${row.snapshotId}:${row.enumId}:${row.tagOrder}`);
        }

        this.memoryDb.state.snapshotTags.push(row);
      }
    }

    return this.rows;
  }
}

class UpdateBuilder {
  private valuesToSet: Partial<Row> = {};

  constructor(
    private readonly memoryDb: MemoryHsdataDb,
    private readonly tableName: TableName,
  ) {}

  set(values: Partial<Row>) {
    this.valuesToSet = values;
    return this;
  }

  where(condition: unknown) {
    this.memoryDb.updateRows(this.tableName, condition, this.valuesToSet);
    return Promise.resolve([]);
  }
}

class DeleteBuilder {
  constructor(
    private readonly memoryDb: MemoryHsdataDb,
    private readonly tableName: TableName,
  ) {}

  where(condition: unknown) {
    if (this.tableName === 'raw_entity_snapshots') {
      const rows = [...this.memoryDb.state.snapshots.values()].filter(row => matchesCondition(row, condition));
      for (const row of rows) {
        this.memoryDb.state.snapshots.delete(row.id);
      }

      const deletedIds = new Set(rows.map(row => row.id));
      this.memoryDb.state.snapshotTags = this.memoryDb.state.snapshotTags.filter(row => !deletedIds.has(row.snapshotId));
    }

    if (this.tableName === 'raw_entity_snapshot_tags') {
      this.memoryDb.state.snapshotTags = this.memoryDb.state.snapshotTags
        .filter(row => !matchesCondition(row, condition));
    }

    return Promise.resolve([]);
  }
}

class MemoryHsdataDb {
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

  update(tableInput: Table) {
    return new UpdateBuilder(this, getTableName(tableInput));
  }

  delete(tableInput: Table) {
    return new DeleteBuilder(this, getTableName(tableInput));
  }

  async transaction<T>(callback: (tx: MemoryHsdataDb) => Promise<T>) {
    const snapshot = cloneState(this.state);

    try {
      return await callback(this);
    } catch (error) {
      this.state = snapshot;
      throw error;
    }
  }

  readRows(tableName: TableName): Row[] {
    if (tableName === 'source_versions') {
      return [...this.state.sourceVersions.values()];
    }

    if (tableName === 'tags') {
      return [...this.state.tags.values()];
    }

    if (tableName === 'sets') {
      return [...this.state.sets.values()];
    }

    if (tableName === 'raw_entity_snapshots') {
      return [...this.state.snapshots.values()];
    }

    if (tableName === 'entities') {
      return [...this.state.entities.values()];
    }

    return this.state.snapshotTags;
  }

  updateRows(tableName: TableName, condition: unknown, values: Partial<Row>) {
    if (tableName === 'source_versions') {
      for (const row of this.state.sourceVersions.values()) {
        if (matchesCondition(row, condition)) {
          Object.assign(row, values);
        }
      }
      return;
    }

    if (tableName === 'tags') {
      for (const row of this.state.tags.values()) {
        if (matchesCondition(row, condition)) {
          Object.assign(row, values);
        }
      }
      return;
    }

    if (tableName === 'raw_entity_snapshots') {
      for (const row of this.state.snapshots.values()) {
        if (matchesCondition(row, condition)) {
          Object.assign(row, values);
        }
      }
    }
  }

  private createState(): MemoryState {
    return {
      sourceVersions: new Map(),
      sets:           new Map(),
      tags:           new Map(),
      snapshots:      new Map(),
      snapshotTags:   [],
      entities:       new Map(),
      nextSnapshotId: 1,
    };
  }
}

const memoryDb = new MemoryHsdataDb();

mock.module('@tcg-cards/db/db', () => ({ db: memoryDb }));
const hsdataCardModelSchemaMock = {
  RawEntitySnapshot,
  RawEntitySnapshotTag,
  SourceVersion,
};
const hsdataSetSchemaMock = {
  Set: HearthstoneSet,
};
const hsdataTagSchemaMock = {
  Tag,
};
mock.module('@tcg-cards/db/schema/hearthstone/data/card-model', () => hsdataCardModelSchemaMock);
mock.module('@tcg-cards/db/schema/hearthstone/set', () => hsdataSetSchemaMock);
mock.module('@tcg-cards/db/schema/hearthstone/tag', () => hsdataTagSchemaMock);

const {
  buildParsedEntity,
  importParsedHsdata,
} = await import('./hsdata-import');
const { buildHsdataPlaceholderSetId } = await import('./hsdata-set-placeholder');

function createLocStringTag(
  enumId: number,
  rawName: string,
  values: Record<string, string>,
  tagOrder: number,
) {
  return {
    enumId,
    rawName,
    rawType:        'LocString',
    rawPayload:     {
      attributes: {
        enumID: String(enumId),
        name:   rawName,
        type:   'LocString',
      },
      children: values,
    },
    rawValue:       null,
    locStringValue: values,
    cardRefCardId:  null,
    tagOrder,
  };
}

function createIntTag(
  enumId: number,
  rawName: string,
  value: number,
  tagOrder: number,
) {
  return {
    enumId,
    rawName,
    rawType:        'Int',
    rawPayload:     {
      attributes: {
        enumID: String(enumId),
        name:   rawName,
        type:   'Int',
        value:  String(value),
      },
    },
    rawValue:       String(value),
    locStringValue: null,
    cardRefCardId:  null,
    tagOrder,
  };
}

function createCardRefTag(
  enumId: number,
  rawName: string,
  cardRefCardId: string,
  tagOrder: number,
) {
  return {
    enumId,
    rawName,
    rawType:        'Card',
    rawPayload:     {
      attributes: {
        enumID: String(enumId),
        name:   rawName,
        type:   'Card',
        cardID: cardRefCardId,
      },
    },
    rawValue:       null,
    locStringValue: null,
    cardRefCardId,
    tagOrder,
  };
}

function createFixtureParsed() {
  return {
    build:    12345,
    entities: [
      buildParsedEntity({
        cardId:           'CORE_TEST_001',
        dbfId:            1001,
        entityXmlVersion: 3,
        tags:             [
          createLocStringTag(48, 'CardName', { enUS: 'Test Minion', zhCN: '测试随从' }, 0),
          createIntTag(185, 'COST', 2, 1),
          createIntTag(47, 'CARDTYPE', 4, 2),
          createIntTag(999001, 'CUSTOM_FLAG', 1, 3),
        ],
        extraPayload:     {
          referencedTags:            { 999002: true },
          powers:                    [{ definition: 'POWER_TEST', playRequirements: [{ reqId: 1, param: 2 }] }],
          entourageCards:            [{ cardId: 'CORE_TEST_002' }],
          masterPowers:              [],
          triggeredPowerHistoryInfo: [],
        },
      }),
      buildParsedEntity({
        cardId:           'CORE_TEST_002',
        dbfId:            1002,
        entityXmlVersion: 1,
        tags:             [
          createLocStringTag(48, 'CardName', { enUS: 'Token' }, 0),
          createCardRefTag(999003, 'CARD_REF', 'CORE_TEST_001', 1),
        ],
        extraPayload:     {
          referencedTags:            {},
          powers:                    [],
          entourageCards:            [],
          masterPowers:              [],
          triggeredPowerHistoryInfo: [],
        },
      }),
    ],
  };
}

function createMissingSetParsed() {
  return {
    build:    12346,
    entities: [
      buildParsedEntity({
        cardId:           'CORE_TEST_MISSING_SET',
        dbfId:            2001,
        entityXmlVersion: 1,
        tags:             [
          createLocStringTag(48, 'CardName', { enUS: 'Missing Set Card' }, 0),
          createIntTag(183, 'CARD_SET', 10, 1),
          createIntTag(185, 'COST', 2, 2),
        ],
        extraPayload:     {
          referencedTags:            {},
          powers:                    [],
          entourageCards:            [],
          masterPowers:              [],
          triggeredPowerHistoryInfo: [],
        },
      }),
    ],
  };
}

const fixtureSourceHash = 'fixture-hash';
const missingSetSourceHash = 'missing-set-hash';

function counts() {
  return {
    sourceVersions: memoryDb.state.sourceVersions.size,
    sets:           memoryDb.state.sets.size,
    tags:           memoryDb.state.tags.size,
    snapshots:      memoryDb.state.snapshots.size,
    snapshotTags:   memoryDb.state.snapshotTags.length,
  };
}

beforeEach(() => {
  memoryDb.reset();
});

describe('importParsedHsdata', () => {
  test('imports parsed fixture into raw archive tables', async () => {
    const report = await importParsedHsdata({
      parsed:       createFixtureParsed(),
      sourceTag:    12345,
      sourceHash:   fixtureSourceHash,
      sourceCommit: 'abc123',
      sourceUri:    'fixture://carddefs.json',
    });

    expect(report.skipped).toBe(false);
    expect(report.build).toBe(12345);
    expect(report.entityCount).toBe(2);
    expect(report.insertedSnapshots).toBe(2);
    expect(report.reusedSnapshots).toBe(0);
    expect(report.insertedTagRows).toBe(6);
    expect(report.discoveredTagCount).toBe(5);
    expect(report.fallbackTagRowCount).toBe(0);
    expect(report.latestSnapshotCount).toBe(2);

    expect(memoryDb.state.sourceVersions.get(12345)).toMatchObject({
      sourceCommit: 'abc123',
      build:        12345,
      sourceHash:   fixtureSourceHash,
      sourceUri:    'fixture://carddefs.json',
      status:       'completed',
      projectionStatus: 'not_started',
      projectionError:  null,
      projectedAt:      null,
    });

    const snapshots = [...memoryDb.state.snapshots.values()];
    expect(snapshots).toHaveLength(2);
    expect(snapshots.every(snapshot => snapshot.isLatest)).toBe(true);
    expect(snapshots.map(snapshot => snapshot.sourceTags)).toEqual([[12345], [12345]]);

    const firstSnapshot = snapshots.find(snapshot => snapshot.cardId === 'CORE_TEST_001');
    expect(firstSnapshot?.extraPayload).toMatchObject({
      referencedTags: { 999002: true },
      powers:         [{ definition: 'POWER_TEST', playRequirements: [{ reqId: 1, param: 2 }] }],
      entourageCards: [{ cardId: 'CORE_TEST_002' }],
    });

    const locStringTag = memoryDb.state.snapshotTags.find(tag => tag.enumId === 48 && tag.snapshotId === firstSnapshot?.id);
    expect(locStringTag).toMatchObject({
      valueKind:      'loc_string',
      parseStatus:    'parsed',
      locStringValue: {
        enUS: 'Test Minion',
        zhCN: '测试随从',
      },
    });

    const cardRefTag = memoryDb.state.snapshotTags.find(tag => tag.enumId === 999003);
    expect(cardRefTag).toMatchObject({
      valueKind:     'card_ref',
      parseStatus:   'parsed',
      cardRefCardId: 'CORE_TEST_001',
      cardRefDbfId:  1001,
    });

    expect(memoryDb.state.tags.get(999001)).toMatchObject({
      rawName:            'CUSTOM_FLAG',
      rawType:            'Int',
      status:             'discovered',
      firstSeenSourceTag: 12345,
      lastSeenSourceTag:  12345,
    });
  });

  test('skips repeated import of the same completed source version', async () => {
    await importParsedHsdata({
      parsed:     createFixtureParsed(),
      sourceTag:  12345,
      sourceHash: fixtureSourceHash,
    });
    const beforeCounts = counts();

    const report = await importParsedHsdata({
      parsed:     createFixtureParsed(),
      sourceTag:  12345,
      sourceHash: fixtureSourceHash,
    });

    expect(report.skipped).toBe(true);
    expect(counts()).toEqual(beforeCounts);
  });

  test('records importEngineVersion on parsed imports', async () => {
    await importParsedHsdata({
      parsed:               createFixtureParsed(),
      sourceTag:           12345,
      sourceHash:          'fixture-hash',
      importEngineVersion: 'desktop-rust-v1',
    });

    expect(memoryDb.state.sourceVersions.get(12345)).toMatchObject({
      sourceHash:          'fixture-hash',
      importEngineVersion: 'desktop-rust-v1',
      status:              'completed',
      projectionStatus:    'not_started',
    });
  });

  test('force rebuilds reused raw snapshot tags', async () => {
    await importParsedHsdata({
      parsed:     createFixtureParsed(),
      sourceTag:  12345,
      sourceHash: fixtureSourceHash,
    });

    const snapshots = [...memoryDb.state.snapshots.values()];
    const snapshotIds = snapshots.map(snapshot => snapshot.id).sort();
    const firstSnapshot = snapshots.find(snapshot => snapshot.cardId === 'CORE_TEST_001');
    const costTag = memoryDb.state.snapshotTags.find(tag => tag.snapshotId === firstSnapshot?.id && tag.enumId === 185);
    const costConfig = memoryDb.state.tags.get(185);

    expect(costTag).toBeDefined();
    expect(costConfig).toBeDefined();

    costTag!.valueKind = 'enum';
    costTag!.intValue = null;
    costTag!.enumValue = '2';
    costConfig!.valueKind = 'enum';

    const report = await importParsedHsdata({
      parsed:     createFixtureParsed(),
      sourceTag:  12345,
      sourceHash: fixtureSourceHash,
      force:      true,
    });

    expect(report.skipped).toBe(false);
    expect(report.insertedSnapshots).toBe(0);
    expect(report.reusedSnapshots).toBe(2);
    expect(report.insertedTagRows).toBe(6);
    expect([...memoryDb.state.snapshots.values()].map(snapshot => snapshot.id).sort()).toEqual(snapshotIds);
    expect(memoryDb.state.snapshotTags).toHaveLength(6);

    const refreshedCostTag = memoryDb.state.snapshotTags
      .find(tag => tag.snapshotId === firstSnapshot?.id && tag.enumId === 185);
    expect(refreshedCostTag).toMatchObject({
      valueKind: 'int',
      intValue:  2,
      enumValue: null,
    });
  });

  test('reuses equal snapshots across source versions and merges sourceTags', async () => {
    await importParsedHsdata({
      parsed:     createFixtureParsed(),
      sourceTag:  12345,
      sourceHash: fixtureSourceHash,
    });

    const report = await importParsedHsdata({
      parsed:     createFixtureParsed(),
      sourceTag:  12346,
      sourceHash: fixtureSourceHash,
    });

    expect(report.skipped).toBe(false);
    expect(report.insertedSnapshots).toBe(0);
    expect(report.reusedSnapshots).toBe(2);
    expect(report.insertedTagRows).toBe(0);
    expect(counts()).toEqual({
      sourceVersions: 2,
      sets:           0,
      tags:           5,
      snapshots:      2,
      snapshotTags:   6,
    });

    for (const snapshot of memoryDb.state.snapshots.values()) {
      expect(snapshot.sourceTags).toEqual([12345, 12346]);
      expect(snapshot.isLatest).toBe(true);
    }
  });

  test('inserts a placeholder set row and rejects import when set mapping is missing', async () => {
    await expect(importParsedHsdata({
      parsed:     createMissingSetParsed(),
      sourceTag:  12346,
      sourceHash: missingSetSourceHash,
    })).rejects.toThrow('missing set rows for dbfId(s): 10');

    expect(memoryDb.state.sets.size).toBe(1);
    expect([...memoryDb.state.sets.values()][0]).toMatchObject({
      setId:         buildHsdataPlaceholderSetId(10),
      dbfId:         10,
      slug:          null,
      rawName:       null,
      type:          'unknown',
      releaseDate:   '',
      cardCountFull: null,
      cardCount:     null,
      group:         null,
    });
    expect(memoryDb.state.sourceVersions.get(12346)).toMatchObject({
      build:            12346,
      sourceHash:       missingSetSourceHash,
      status:           'failed',
      projectionStatus: 'not_started',
      projectionError:  null,
      importedAt:       null,
      projectedAt:      null,
    });
    expect(memoryDb.state.snapshots.size).toBe(0);
    expect(memoryDb.state.snapshotTags).toHaveLength(0);
  });

  test('syncs placeholder set rows during dry run validation', async () => {
    await expect(importParsedHsdata({
      parsed:     createMissingSetParsed(),
      sourceTag:  12347,
      sourceHash: missingSetSourceHash,
      dryRun:     true,
    })).rejects.toThrow('missing set rows for dbfId(s): 10');

    expect(memoryDb.state.sets.size).toBe(1);
    expect([...memoryDb.state.sets.values()][0]).toMatchObject({
      setId: buildHsdataPlaceholderSetId(10),
      dbfId: 10,
    });
    expect(memoryDb.state.sourceVersions.size).toBe(0);
    expect(memoryDb.state.snapshots.size).toBe(0);
    expect(memoryDb.state.snapshotTags).toHaveLength(0);
  });

  test('keeps placeholder set rows unresolved across retries', async () => {
    await expect(importParsedHsdata({
      parsed:     createMissingSetParsed(),
      sourceTag:  12348,
      sourceHash: missingSetSourceHash,
      dryRun:     true,
    })).rejects.toThrow('missing set rows for dbfId(s): 10');

    await expect(importParsedHsdata({
      parsed:     createMissingSetParsed(),
      sourceTag:  12349,
      sourceHash: missingSetSourceHash,
      dryRun:     true,
    })).rejects.toThrow('Placeholder set row(s) already exist');

    expect(memoryDb.state.sets.size).toBe(1);
    expect([...memoryDb.state.sets.values()][0]).toMatchObject({
      setId: buildHsdataPlaceholderSetId(10),
      dbfId: 10,
    });
  });
});
