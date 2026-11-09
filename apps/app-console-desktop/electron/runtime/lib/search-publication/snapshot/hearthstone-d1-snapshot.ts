import { BaseSQLiteDatabase, SQLiteSyncDialect } from 'drizzle-orm/sqlite-core';
import type { SQLiteSession } from 'drizzle-orm/sqlite-core';
import { locale } from '@tcg-cards/model/hearthstone/schema/basic';
import {
  SearchCard,
  SearchCardLegality,
  SearchCardLocalization,
  SearchCardValue,
  SearchMeta,
  SearchTextRow,
} from '@tcg-cards/db/schema/sqlite/hearthstone';
import { hearthstoneSearchManifest } from '@tcg-cards/model/hearthstone/search/manifest';
import type { HearthstoneSearchManifest } from '@tcg-cards/model/hearthstone/search/manifest';
import { LOCAL_SEARCH_SCHEMA_VERSIONS } from '@tcg-cards/model/search/publication';
import { essentialCardSearchItem } from '@tcg-cards/model/hearthstone/schema/search';
import type { EssentialCardSearchItem } from '@tcg-cards/model/hearthstone/schema/search';

import type { SearchSnapshotBatch } from './snapshot-batch';

/** Carries approved latest card fields and one localized row for offline snapshot generation. */
export type SnapshotItem = EssentialCardSearchItem & {
  idOrder:   number;
  setOrder:  number;
  nameOrder: number;
};

/** Selects one complete snapshot or one side of the layered local package. */
export type SnapshotTarget
  = | { kind: 'combined', replace?: boolean }
    | { kind: 'base' }
    | { kind: 'locale', locale: string };

/** Tunable remote-call sizing; batches flush on either bound. */
export type HearthstoneD1SnapshotSizing = {
  maxStatements: number;
  maxBytes:      number;
};

/** Bucket order is parents-first so remote foreign keys stay satisfied per segment. */
const HEARTHSTONE_TABLE_ORDER = [
  'hearthstone_search_cards',
  'hearthstone_search_card_values',
  'hearthstone_search_card_legalities',
  'hearthstone_search_card_localizations',
  'hearthstone_search_text_rows',
] as const;

const HEARTHSTONE_SIZING: HearthstoneD1SnapshotSizing = { maxStatements: 300, maxBytes: 512 * 1024 };

/** Quotes bound SQLite values for a generated import file without touching a live database. */
function literal(value: unknown): string {
  if (value == null) {
    return 'NULL';
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  if (typeof value === 'string') {
    // Hex literals preserve embedded NUL/newline/quote characters without SQL escape ambiguity.
    return `CAST(X'${Buffer.from(value, 'utf8').toString('hex')}' AS TEXT)`;
  }
  throw new Error('Unsupported bound value in Hearthstone snapshot.');
}

/** Renders Drizzle-generated insert SQL with its encoded values. */
function statement(query: { sql: string, params: unknown[] }): string {
  let index = 0;
  const result = query.sql.replaceAll('?', () => literal(query.params[index++]));
  if (index !== query.params.length) {
    throw new Error('Snapshot SQL parameter count mismatch.');
  }
  return `${result};`;
}

/**
 * A driverless SQLite database used only for rendering insert SQL text, mirroring
 * the driver modules' `mock()` helper so Node and Bun both build identical output.
 */
function renderDatabase(): BaseSQLiteDatabase<'sync', unknown> {
  // Insert rendering never touches the session, so leaving it unset matches the driver mocks' behavior.
  const session = undefined as unknown as SQLiteSession<'sync', unknown>;
  return new BaseSQLiteDatabase('sync', new SQLiteSyncDialect(), session, {}, undefined);
}

/** Internal accumulation of one snapshot build: flat output plus per-table buckets. */
type HearthstoneSnapshotBuild = {
  flatStatements:      string[];
  buckets:             Map<string, string[]>;
  /** Actual table row counts, excluding incremental FTS companion statements. */
  bucketRowCounts:     Map<string, number>;
  clearStatements:     string[];
  ftsRebuildStatement: string | null;
  metaStatements:      string[];
};

/** Builds inserts for one complete D1 snapshot or one local SQLite package. */
function buildHearthstoneSnapshot(
  input: SnapshotItem[],
  manifestInput: HearthstoneSearchManifest,
  target: SnapshotTarget,
  options: { ftsMode: 'rebuild' | 'incremental' },
): HearthstoneSnapshotBuild {
  const manifest = hearthstoneSearchManifest.parse(manifestInput);
  if (target.kind === 'locale' && !locale.options.includes(target.locale as (typeof locale.options)[number])) {
    throw new Error(`Unsupported Hearthstone snapshot locale: ${target.locale}`);
  }
  const db = renderDatabase();
  const cards = new Map<string, string>();
  const identities = new Set<string>();
  const flatStatements: string[] = [];
  const buckets = new Map<string, string[]>();
  const bucketRowCounts = new Map<string, number>();
  const push = (table: string, text: string, isRow: boolean) => {
    flatStatements.push(text);
    const bucket = buckets.get(table);
    if (bucket == null) buckets.set(table, [text]);
    else bucket.push(text);
    if (isRow) bucketRowCounts.set(table, (bucketRowCounts.get(table) ?? 0) + 1);
  };
  const clearStatements: string[] = [];
  if (target.kind === 'combined' && target.replace === true) {
    clearStatements.push(
      'DELETE FROM hearthstone_search_meta;',
      'DELETE FROM hearthstone_search_text_rows;',
      'DELETE FROM hearthstone_search_card_legalities;',
      'DELETE FROM hearthstone_search_card_values;',
      'DELETE FROM hearthstone_search_card_localizations;',
      'DELETE FROM hearthstone_search_cards;',
    );
  }
  const safety = new Map<string, boolean>();
  for (const lang of ['all', ...locale.options]) {
    for (const field of ['name', 'text']) {
      safety.set(`case_safe:${field}:${lang}`, true);
    }
  }
  safety.set('case_safe:set:all', true);
  let textId = 0;
  for (const raw of input) {
    if (target.kind === 'locale' && target.locale !== raw.lang) {
      continue;
    }
    const { idOrder, setOrder, nameOrder, ...value } = raw;
    for (const rank of [idOrder, setOrder, nameOrder]) {
      if (!Number.isSafeInteger(rank) || rank < 1) {
        throw new Error('Snapshot sort keys must be positive PG-generated integers.');
      }
    }
    const item = essentialCardSearchItem.parse(value);
    const { lang, localization, renderHash, classes, rune, race, raceBucket, legalities, ...card }
      = item;
    safety.set(
      'case_safe:set:all',
      safety.get('case_safe:set:all')!
      && ![...card.set].some(char => char.codePointAt(0)! > 127 && /\p{Cased}/u.test(char)),
    );
    const signature = JSON.stringify({
      card,
      classes,
      rune,
      race,
      raceBucket,
      legalities,
      idOrder,
      setOrder,
    });
    const existing = cards.get(card.cardId);
    if (existing != null && existing !== signature) {
      throw new Error(`Inconsistent latest card fields: ${card.cardId}`);
    }
    if (target.kind === 'base' && existing != null) {
      continue;
    }
    if (target.kind !== 'base') {
      for (const field of ['name', 'text'] as const) {
        const safe = ![...localization[field]].some(
          char => char.codePointAt(0)! > 127 && /\p{Cased}/u.test(char),
        );
        for (const scope of ['all', lang]) {
          const key = `case_safe:${field}:${scope}`;
          safety.set(key, safety.get(key)! && safe);
        }
      }
    }
    if (identities.has(`${card.cardId}:${lang}`)) {
      throw new Error(`Duplicate latest localization: ${card.cardId}:${lang}`);
    }
    identities.add(`${card.cardId}:${lang}`);
    if (existing == null) {
      cards.set(card.cardId, signature);
      if (target.kind !== 'locale') {
        push(
          'hearthstone_search_cards',
          statement(
            db
              .insert(SearchCard)
              .values({
                ...card,
                idOrder,
                setOrder,
                classCount:      classes.length,
                runeCount:       rune?.length ?? null,
                raceCount:       race?.length ?? null,
                raceBucketCount: raceBucket?.length ?? null,
              })
              .toSQL(),
          ),
          true,
        );
      }
      for (const [field, values] of Object.entries({ classes, rune, race, raceBucket })) {
        for (const [position, value] of (values ?? []).entries()) {
          if (target.kind !== 'locale') {
            push(
              'hearthstone_search_card_values',
              statement(
                db
                  .insert(SearchCardValue)
                  .values({
                    cardId: card.cardId,
                    field:  field as (typeof SearchCardValue.$inferInsert)['field'],
                    position,
                    value,
                  })
                  .toSQL(),
              ),
              true,
            );
          }
        }
      }
      for (const [format, status] of Object.entries(legalities)) {
        if (target.kind !== 'locale') {
          push(
            'hearthstone_search_card_legalities',
            statement(db.insert(SearchCardLegality).values({ cardId: card.cardId, format, status }).toSQL()),
            true,
          );
        }
      }
    }
    if (target.kind !== 'base' && (target.kind === 'combined' || target.locale === lang)) {
      push(
        'hearthstone_search_card_localizations',
        statement(
          db
            .insert(SearchCardLocalization)
            .values({ cardId: card.cardId, lang, renderHash, nameOrder, ...localization })
            .toSQL(),
        ),
        true,
      );
      const rowTextId = ++textId;
      push(
        'hearthstone_search_text_rows',
        statement(
          db
            .insert(SearchTextRow)
            .values({ textId: rowTextId, cardId: card.cardId, lang, body: localization.text })
            .toSQL(),
        ),
        true,
      );
      if (options.ftsMode === 'incremental') {
        push(
          'hearthstone_search_text_rows',
          `INSERT INTO hearthstone_search_text_fts(rowid, body) VALUES (${rowTextId}, ${literal(localization.text)});`,
          false,
        );
      }
    }
  }
  // Readiness is written last so the new snapshot becomes visible only after its rows are complete.
  const metadata = target.kind === 'combined'
    ? [
      { key: 'data_version', value: manifest.dataVersion },
      ...(manifest.releaseHash == null ? [] : [{ key: 'release_hash', value: manifest.releaseHash }]),
      { key: 'schema_version', value: String(LOCAL_SEARCH_SCHEMA_VERSIONS.hearthstone) },
      { key: 'build_number', value: String(manifest.buildNumber) },
      { key: 'ready', value: '1' },
      { key: 'sort_version', value: '1' },
      ...[...safety].map(([key, safe]) => ({ key, value: safe ? '1' : '0' })),
    ]
    : target.kind === 'base'
      ? [
        { key: 'data_version', value: manifest.dataVersion },
        ...(manifest.releaseHash == null ? [] : [{ key: 'release_hash', value: manifest.releaseHash }]),
        { key: 'schema_version', value: String(LOCAL_SEARCH_SCHEMA_VERSIONS.hearthstone) },
        { key: 'build_number', value: String(manifest.buildNumber) },
        { key: 'ready', value: '1' },
        { key: 'sort_version', value: '1' },
        { key: 'package_role', value: 'base' },
        { key: 'case_safe:set:all', value: safety.get('case_safe:set:all')! ? '1' : '0' },
      ]
      : [
        { key: 'data_version', value: manifest.dataVersion },
        ...(manifest.releaseHash == null ? [] : [{ key: 'release_hash', value: manifest.releaseHash }]),
        { key: 'schema_version', value: String(LOCAL_SEARCH_SCHEMA_VERSIONS.hearthstone) },
        { key: 'build_number', value: String(manifest.buildNumber) },
        { key: 'ready', value: '1' },
        { key: 'sort_version', value: '1' },
        { key: 'package_role', value: 'locale' },
        { key: 'locale', value: target.locale },
        ...(['name', 'text'] as const).flatMap(field => {
          const safe = safety.get(`case_safe:${field}:${target.locale}`)!;
          return [
            { key: `case_safe:${field}:all`, value: safe ? '1' : '0' },
            { key: `case_safe:${field}:${target.locale}`, value: safe ? '1' : '0' },
          ];
        }),
      ];
  const metaStatements = [
    statement(
      db
        .insert(SearchMeta)
        .values(metadata)
        .toSQL(),
    ),
  ];
  const ftsRebuildStatement = target.kind !== 'base'
    ? 'INSERT INTO hearthstone_search_text_fts(hearthstone_search_text_fts) VALUES (\'rebuild\');'
    : null;
  return {
    flatStatements: [...clearStatements, ...flatStatements, ...(ftsRebuildStatement == null ? [] : [ftsRebuildStatement]), ...metaStatements],
    buckets,
    bucketRowCounts,
    clearStatements,
    ftsRebuildStatement,
    metaStatements,
  };
}

/** Builds inserts for one complete D1 snapshot or one local SQLite package. */
export function createSnapshotStatements(
  input: SnapshotItem[],
  manifestInput: HearthstoneSearchManifest,
  target: SnapshotTarget = { kind: 'combined' },
): string[] {
  return buildHearthstoneSnapshot(input, manifestInput, target, { ftsMode: 'rebuild' }).flatStatements;
}

/** Serializes the same generated statements for an empty database's SQL import file. */
export function createSnapshotSql(
  input: SnapshotItem[],
  manifest: HearthstoneSearchManifest,
  target: SnapshotTarget = { kind: 'combined' },
): string {
  return `${createSnapshotStatements(input, manifest, target).join('\n')}\n`;
}

/**
 * Streams one complete Hearthstone D1 snapshot as remotely applicable batches.
 * Readiness metadata is only written by the final batch so an interrupted load
 * keeps the store unready and the sites fall back to PostgreSQL.
 */
export async function* generateHearthstoneD1SnapshotBatches(input: {
  items:    SnapshotItem[];
  manifest: HearthstoneSearchManifest;
  ftsMode:  'rebuild' | 'incremental';
  sizing?:  Partial<HearthstoneD1SnapshotSizing>;
}): AsyncGenerator<SearchSnapshotBatch> {
  const sizing = { ...HEARTHSTONE_SIZING, ...input.sizing };
  const built = buildHearthstoneSnapshot(input.items, input.manifest, { kind: 'combined', replace: true }, {
    ftsMode: input.ftsMode,
  });

  yield { role: 'meta-clear', table: null, final: true, statements: ['DELETE FROM hearthstone_search_meta;'] };
  if (built.clearStatements.length > 0) {
    yield {
      role:       'clear',
      table:      null,
      final:      true,
      statements: built.clearStatements.filter(text => text !== 'DELETE FROM hearthstone_search_meta;'),
    };
  }
  if (input.ftsMode === 'incremental') {
    yield {
      role:       'fts',
      table:      null,
      final:      true,
      statements: ['INSERT INTO hearthstone_search_text_fts(hearthstone_search_text_fts) VALUES (\'delete-all\');'],
    };
  }

  for (const table of HEARTHSTONE_TABLE_ORDER) {
    const bucket = built.buckets.get(table) ?? [];
    const expectedRows = built.bucketRowCounts.get(table) ?? 0;
    const deleteStatements = [`DELETE FROM ${table};`];
    let statements: string[] = [];
    let bytes = 0;
    let first = true;
    for (const text of bucket) {
      statements.push(text);
      bytes += text.length;
      if (statements.length >= sizing.maxStatements || bytes >= sizing.maxBytes) {
        yield {
          role:  'insert',
          table,
          final: false,
          statements,
          ...(first ? { deleteStatements } : {}),
        };
        first = false;
        statements = [];
        bytes = 0;
      }
    }
    yield {
      role:  'insert',
      table,
      final: true,
      expectedRows,
      statements,
      ...(first ? { deleteStatements } : {}),
    };
  }

  if (input.ftsMode === 'rebuild' && built.ftsRebuildStatement != null) {
    yield { role: 'fts', table: null, final: true, statements: [built.ftsRebuildStatement] };
  }
  yield { role: 'meta', table: null, final: true, statements: built.metaStatements };
}
