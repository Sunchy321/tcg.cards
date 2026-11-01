import { drizzle } from 'drizzle-orm/bun-sqlite';
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
import { essentialCardSearchItem } from '@tcg-cards/model/hearthstone/schema/search';
import type { EssentialCardSearchItem } from '@tcg-cards/model/hearthstone/schema/search';

/** Carries approved latest card fields and one localized row for offline snapshot generation. */
export type SnapshotItem = EssentialCardSearchItem & {
  idOrder:   number;
  setOrder:  number;
  nameOrder: number;
};

/** Selects one complete snapshot or one side of the layered local package. */
export type SnapshotTarget
  = | { kind: 'combined' }
    | { kind: 'base' }
    | { kind: 'locale', locale: string };

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

/** Builds independently executable inserts for one immutable, separately managed snapshot. */
export function createSnapshotStatements(
  input: SnapshotItem[],
  manifestInput: HearthstoneSearchManifest,
  target: SnapshotTarget = { kind: 'combined' },
): string[] {
  const manifest = hearthstoneSearchManifest.parse(manifestInput);
  if (target.kind === 'locale' && !locale.options.includes(target.locale as (typeof locale.options)[number])) {
    throw new Error(`Unsupported Hearthstone snapshot locale: ${target.locale}`);
  }
  const db = drizzle.mock();
  const cards = new Map<string, string>();
  const identities = new Set<string>();
  const inserts: string[] = [];
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
        inserts.push(
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
        );
      }
      for (const [field, values] of Object.entries({ classes, rune, race, raceBucket })) {
        for (const [position, value] of (values ?? []).entries()) {
          if (target.kind !== 'locale') {
            inserts.push(
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
            );
          }
        }
      }
      for (const [format, status] of Object.entries(legalities)) {
        if (target.kind !== 'locale') {
          inserts.push(
            statement(
              db.insert(SearchCardLegality).values({ cardId: card.cardId, format, status }).toSQL(),
            ),
          );
        }
      }
    }
    if (target.kind !== 'base' && (target.kind === 'combined' || target.locale === lang)) {
      inserts.push(
        statement(
          db
            .insert(SearchCardLocalization)
            .values({ cardId: card.cardId, lang, renderHash, nameOrder, ...localization })
            .toSQL(),
        ),
      );
      inserts.push(
        statement(
          db
            .insert(SearchTextRow)
            .values({ textId: ++textId, cardId: card.cardId, lang, body: localization.text })
            .toSQL(),
        ),
      );
    }
  }
  if (target.kind !== 'base') {
    inserts.push(
      'INSERT INTO hearthstone_search_text_fts(hearthstone_search_text_fts) VALUES (\'rebuild\');',
    );
  }
  // Readiness is written last. Publishing or switching a live database remains T13's responsibility.
  const metadata = target.kind === 'combined'
    ? [
      { key: 'data_version', value: manifest.dataVersion },
      { key: 'build_number', value: String(manifest.buildNumber) },
      { key: 'ready', value: '1' },
      { key: 'sort_version', value: '1' },
      ...[...safety].map(([key, safe]) => ({ key, value: safe ? '1' : '0' })),
    ]
    : target.kind === 'base'
      ? [
        { key: 'data_version', value: manifest.dataVersion },
        { key: 'build_number', value: String(manifest.buildNumber) },
        { key: 'ready', value: '1' },
        { key: 'sort_version', value: '1' },
        { key: 'package_role', value: 'base' },
        { key: 'case_safe:set:all', value: safety.get('case_safe:set:all')! ? '1' : '0' },
      ]
      : [
        { key: 'data_version', value: manifest.dataVersion },
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
  inserts.push(
    statement(
      db
        .insert(SearchMeta)
        .values(metadata)
        .toSQL(),
    ),
  );
  return inserts;
}

/** Serializes the same generated statements for an empty database's SQL import file. */
export function createSnapshotSql(
  input: SnapshotItem[],
  manifest: HearthstoneSearchManifest,
  target: SnapshotTarget = { kind: 'combined' },
): string {
  return `${createSnapshotStatements(input, manifest, target).join('\n')}\n`;
}

/** Exports schema SQL directly from Drizzle definitions, without generating migration files. */
export function snapshotDdl(): string {
  const result = Bun.spawnSync([
    'bun',
    'run',
    '--filter',
    '@tcg-cards/db',
    'db:export:hearthstone-search',
  ]);
  if (result.exitCode !== 0) {
    throw new Error(`Drizzle schema export failed: ${result.stderr.toString()}`);
  }
  const prefix = '@tcg-cards/db db:export:hearthstone-search: ';
  return result.stdout
    .toString()
    .split('\n')
    .filter(line => line.startsWith(prefix) && line !== `${prefix}Exited with code 0`)
    .map(line => line.slice(prefix.length))
    .join('\n');
}
