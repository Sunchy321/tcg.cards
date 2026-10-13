import { beforeEach, describe, expect, mock, test } from 'bun:test';

/** Supported table names used by the set rename tests. */
type TableName
  = | 'announcement_items'
    | 'entities'
    | 'sets';

/** Simplified drizzle column descriptor for the memory db. */
interface Column {
  name: string;
}

/** Simplified drizzle table descriptor for the memory db. */
interface Table {
  tableName: TableName;
}

/** Stored Hearthstone set row used by the memory db. */
interface SetRow {
  setId:         string;
  dbfId:         number | null;
  rawName:       string | null;
  localization:  Record<string, unknown>;
  type:          string;
  releaseDate:   string;
  cardCountFull: number | null;
  cardCount:     number | null;
  group:         string | null;
}

/** Stored Hearthstone entity row used by the memory db. */
interface EntityRow {
  cardId: string;
  set:    string;
}

/** Stored Hearthstone announcement item row used by the memory db. */
interface AnnouncementItemRow {
  id:    string;
  setId: string | null;
}

/** Memory db row union used by the query builders. */
type Row
  = | AnnouncementItemRow
    | EntityRow
    | SetRow;

/** Memory db state used by the rename tests. */
interface MemoryState {
  announcementItems: AnnouncementItemRow[];
  entities:          EntityRow[];
  sets:              SetRow[];
}

/** One simplified drizzle column created for the memory db. */
function column(name: string): Column {
  return { name };
}

/** One simplified drizzle table created for the memory db. */
function table(tableName: TableName, columns: string[]): Table & Record<string, Column> {
  return Object.fromEntries([
    ['tableName', tableName],
    ...columns.map(name => [name, column(name)]),
  ]) as Table & Record<string, Column>;
}

const Set = table('sets', [
  'setId',
  'dbfId',
  'rawName',
  'localization',
  'type',
  'releaseDate',
  'cardCountFull',
  'cardCount',
  'group',
]);

const Entity = table('entities', [
  'cardId',
  'set',
]);

const AnnouncementItem = table('announcement_items', [
  'id',
  'setId',
]);

/** Table name resolved from the mocked drizzle table descriptor. */
function getTableName(tableInput: Table): TableName {
  return tableInput.tableName;
}

/** Memory state cloned for transactional rollback. */
function cloneState(state: MemoryState): MemoryState {
  return structuredClone(state);
}

/** SQL chunks extracted from the mocked drizzle condition object. */
function readSqlChunks(condition: unknown): unknown[] {
  if (!condition || typeof condition !== 'object' || !('queryChunks' in condition)) {
    return [];
  }

  return (condition as { queryChunks?: unknown[] }).queryChunks ?? [];
}

/** SQL text rebuilt from the mocked drizzle condition chunks. */
function readSqlText(chunks: unknown[]): string {
  return chunks.map(chunk => {
    if (chunk && typeof chunk === 'object' && 'value' in chunk) {
      return ((chunk as { value?: string[] }).value ?? []).join('');
    }

    return '';
  }).join('');
}

/** Target column name extracted from one mocked drizzle condition. */
function readColumn(chunks: unknown[]): string | null {
  const chunk = chunks.find(value => value && typeof value === 'object' && 'name' in value) as Column | undefined;
  return chunk?.name ?? null;
}

/** Equality value extracted from one mocked drizzle condition. */
function readEqValue(chunks: unknown[]): unknown {
  const columnIndex = chunks.findIndex(value => value && typeof value === 'object' && 'name' in value);
  return columnIndex >= 0 ? chunks[columnIndex + 2] : undefined;
}

/** Object record view used for dynamic row field access in the memory db. */
function asRecord(value: unknown): Record<string, unknown> {
  return value as Record<string, unknown>;
}

/** Row field value read through the mocked column name. */
function rowValue(row: Row, columnName: string): unknown {
  return asRecord(row)[columnName];
}

/** Condition match against the simplified mocked drizzle SQL. */
function matchesCondition(row: Row, condition: unknown): boolean {
  const chunks = readSqlChunks(condition);
  if (chunks.length === 0) {
    return true;
  }

  const text = readSqlText(chunks);
  const columnName = readColumn(chunks);

  if (!columnName) {
    return true;
  }

  if (text.includes(' = ')) {
    return rowValue(row, columnName) === readEqValue(chunks);
  }

  return true;
}

/** Projected rows built from one select projection. */
function projectRows(rows: Row[], projection?: Record<string, Column>) {
  if (!projection) {
    return rows.map(row => structuredClone(row));
  }

  return rows.map(row => {
    return Object.fromEntries(
      Object.keys(projection).map(key => [key, rowValue(row, key)]),
    );
  });
}

/** Select query builder used by the memory db. */
class SelectBuilder {
  private tableName: TableName | null = null;
  private condition: unknown;

  constructor(
    private readonly memoryDb: MemorySetDb,
    private readonly projection?: Record<string, Column>,
  ) {}

  from(tableInput: Table) {
    this.tableName = getTableName(tableInput);
    return this;
  }

  where(condition: unknown) {
    this.condition = condition;
    return this;
  }

  orderBy(..._args: unknown[]) {
    return this;
  }

  then<TResult1 = unknown[], TResult2 = never>(
    onfulfilled?: ((value: unknown[]) => TResult1 | PromiseLike<TResult1>) | null,
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

/** Insert query builder used by the memory db. */
class InsertBuilder {
  private rows: Row[] = [];

  constructor(
    private readonly memoryDb: MemorySetDb,
    private readonly tableName: TableName,
  ) {}

  values(values: Row | Row[]) {
    this.rows = Array.isArray(values) ? values : [values];
    return this;
  }

  then<TResult1 = Row[], TResult2 = never>(
    onfulfilled?: ((value: Row[]) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return Promise.resolve(this.execute()).then(onfulfilled, onrejected);
  }

  private execute(): Row[] {
    this.memoryDb.insertRows(this.tableName, this.rows);
    return this.rows;
  }
}

/** Update query builder used by the memory db. */
class UpdateBuilder {
  private values: Partial<Row> = {};
  private condition: unknown;

  constructor(
    private readonly memoryDb: MemorySetDb,
    private readonly tableName: TableName,
  ) {}

  set(values: Partial<Row>) {
    this.values = values;
    return this;
  }

  where(condition: unknown) {
    this.condition = condition;
    return this;
  }

  then<TResult1 = Row[], TResult2 = never>(
    onfulfilled?: ((value: Row[]) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return Promise.resolve(this.execute()).then(onfulfilled, onrejected);
  }

  private execute(): Row[] {
    return this.memoryDb.updateRows(this.tableName, this.condition, this.values);
  }
}

/** Delete query builder used by the memory db. */
class DeleteBuilder {
  private condition: unknown;

  constructor(
    private readonly memoryDb: MemorySetDb,
    private readonly tableName: TableName,
  ) {}

  where(condition: unknown) {
    this.condition = condition;
    return this;
  }

  then<TResult1 = Row[], TResult2 = never>(
    onfulfilled?: ((value: Row[]) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return Promise.resolve(this.execute()).then(onfulfilled, onrejected);
  }

  private execute(): Row[] {
    return this.memoryDb.deleteRows(this.tableName, this.condition);
  }
}

/** In-memory db facade used by the set rename tests. */
class MemorySetDb {
  state: MemoryState = this.createState();

  reset() {
    this.state = this.createState();
  }

  select(projection?: Record<string, Column>) {
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

  async transaction<T>(callback: (tx: MemorySetDb) => Promise<T>) {
    const snapshot = cloneState(this.state);

    try {
      return await callback(this);
    } catch (error) {
      this.state = snapshot;
      throw error;
    }
  }

  /** Stored rows read for one mocked table. */
  readRows(tableName: TableName): Row[] {
    if (tableName === 'sets') return this.state.sets;
    if (tableName === 'entities') return this.state.entities;
    return this.state.announcementItems;
  }

  /** Stored rows inserted into one mocked table. */
  insertRows(tableName: TableName, rows: Row[]) {
    if (tableName === 'sets') this.state.sets.push(...rows as SetRow[]);
    else if (tableName === 'entities') this.state.entities.push(...rows as EntityRow[]);
    else this.state.announcementItems.push(...rows as AnnouncementItemRow[]);
  }

  /** Stored rows updated for one mocked table. */
  updateRows(tableName: TableName, condition: unknown, values: Partial<Row>): Row[] {
    const rows = this.readRows(tableName).filter(row => matchesCondition(row, condition));
    for (const row of rows) {
      Object.assign(row, values);
    }
    return rows.map(row => structuredClone(row));
  }

  /** Stored rows deleted from one mocked table. */
  deleteRows(tableName: TableName, condition: unknown): Row[] {
    const rows = this.readRows(tableName);
    const kept = rows.filter(row => !matchesCondition(row, condition));
    const deleted = rows.filter(row => matchesCondition(row, condition)).map(row => structuredClone(row));

    if (tableName === 'sets') this.state.sets = kept as SetRow[];
    else if (tableName === 'entities') this.state.entities = kept as EntityRow[];
    else this.state.announcementItems = kept as AnnouncementItemRow[];

    return deleted;
  }

  /** Empty memory db state created for each test. */
  private createState(): MemoryState {
    return {
      announcementItems: [],
      entities:          [],
      sets:              [],
    };
  }
}

const memoryDb = new MemorySetDb();

mock.module('@tcg-cards/db/db', () => ({ db: memoryDb }));
mock.module('@tcg-cards/db/schema/shared/hearthstone', () => ({
  AnnouncementItem,
  BaseEntity: Entity,
  Entity,
  Set,
}));

const { updateSetProfile } = await import('./set');

/** Default set row used by the rename tests. */
function makeSet(setId: string): SetRow {
  return {
    setId,
    dbfId:         10,
    rawName:       null,
    localization:  {},
    type:          'unknown',
    releaseDate:   '',
    cardCountFull: null,
    cardCount:     null,
    group:         null,
  };
}

beforeEach(() => {
  memoryDb.reset();
});

describe('updateSetProfile', () => {
  test('renames setId and syncs dependent tables', async () => {
    memoryDb.state.sets.push(makeSet('__hsdata_missing_set_dbf_10'));
    memoryDb.state.entities.push({ cardId: 'CARD_001', set: '__hsdata_missing_set_dbf_10' });
    memoryDb.state.announcementItems.push({ id: 'announcement-1', setId: '__hsdata_missing_set_dbf_10' });

    const result = await updateSetProfile({
      originalSetId: '__hsdata_missing_set_dbf_10',
      setId:         'CORE',
      dbfId:         10,
      rawName:       'CORE',
      type:          'core',
      releaseDate:   '2024-01-01',
      cardCountFull: 145,
      cardCount:     145,
      group:         null,
      localization:  {
        en:  { full: 'Core' },
        zhs: { full: '核心' },
      },
    });

    expect(result).toMatchObject({
      setId:       'CORE',
      dbfId:       10,
      rawName:     'CORE',
      type:        'core',
      releaseDate: '2024-01-01',
    });
    expect(result.localization).toEqual({
      en:  { full: 'Core' },
      zhs: { full: '核心' },
    });
    expect(memoryDb.state.sets).toEqual([
      expect.objectContaining({
        setId:       'CORE',
        rawName:     'CORE',
        type:        'core',
        releaseDate: '2024-01-01',
      }),
    ]);
    expect(memoryDb.state.entities[0]?.set).toBe('CORE');
    expect(memoryDb.state.announcementItems[0]?.setId).toBe('CORE');
  });

  test('rejects conflicting target setId', async () => {
    memoryDb.state.sets.push(makeSet('CORE'));
    memoryDb.state.sets.push(makeSet('EXPERT1'));
    const snapshot = structuredClone(memoryDb.state);

    await expect(updateSetProfile({
      originalSetId: 'CORE',
      setId:         'EXPERT1',
      dbfId:         10,
      rawName:       null,
      type:          'core',
      releaseDate:   '',
      cardCountFull: null,
      cardCount:     null,
      group:         null,
      localization:  {},
    })).rejects.toThrow('Set EXPERT1 already exists');

    expect(memoryDb.state).toEqual(snapshot);
  });
});
