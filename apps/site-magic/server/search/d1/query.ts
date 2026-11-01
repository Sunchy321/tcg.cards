import { compileRegexCondition, nonAscii, regexCommands } from '#search/server/regex';
import {
  and,
  eq,
  exists,
  gt,
  gte,
  isNull,
  lt,
  lte,
  ne,
  not,
  notExists,
  or,
  sql,
} from 'drizzle-orm';
import type { SQL, SQLWrapper } from 'drizzle-orm';
import { alias } from 'drizzle-orm/sqlite-core';
import type { AnySQLiteColumn } from 'drizzle-orm/sqlite-core';

import {
  SearchCard,
  SearchCardPart,
  SearchCardPartLocalization,
  SearchCardValue,
  SearchTextRow,
} from '@tcg-cards/db/schema/sqlite/magic';
import type { CapabilityGap, DatasetDescriptor, LogicalQuery, QueryRequest, ResolvedCommand } from '#search/logical';
import { describeLogicalCommand } from '#search/command/semantics';
import type { CommonServerCommand } from '#search/server/command';
import * as commands from '../command-list';
import type { MagicSearchDrizzle } from './types';

/** Lists the first D1 field or result limitation for one resolved request. */
export function findMagicD1Gap(request: QueryRequest, descriptor: DatasetDescriptor): CapabilityGap | null {
  const supported = descriptor.commands;
  const unsupported = request.filter == null ? null : findNodeGap(request.filter, supported);
  if (unsupported != null) {
    return unsupported;
  }

  if (request.result.group != null && request.result.group !== 'card') {
    return { kind: 'result', field: 'group', detail: 'D1 has one preselected candidate print per card.' };
  }

  for (const sort of request.result.sort) {
    if (sort.kind === 'dsl') {
      return { kind: 'result', field: 'sort', detail: 'DSL order commands are not available in the D1 projection.' };
    }
    if (sort.kind === 'request') {
      const fields = sort.value.toLowerCase().split(',').map(value => value.replace(/[+-]$/, ''));
      const unsupportedField = fields.find(field => !['id', 'set', 'number', 'date', 'mv', 'cmc'].includes(field));
      if (unsupportedField != null) {
        return { kind: 'result', field: 'sort', detail: `D1 cannot sort by ${unsupportedField}.` };
      }
    }
  }

  return null;
}

/** Describes only command capabilities implemented by the D1 compiler. */
export function magicD1Descriptor(): DatasetDescriptor {
  const supportedCommands = new Set(['name', 'text', 'oracle', 'mana-value', 'rarity', 'ambit', 'format']);
  const serverCommands = Object.values(commands) as CommonServerCommand[];
  const described = serverCommands.filter(command => supportedCommands.has(command.options.id ?? ''));

  return {
    commands: described.map(command => {
      const id = command.options.id ?? '';
      const descriptor = describeLogicalCommand(
        command.options,
        id,
        command.options.logical?.witness ?? [],
        id === 'rarity' ? '~:' : undefined,
      );

      if (id === 'rarity') {
        descriptor.operators = ['~:'];
      }
      if (id === 'name' || id === 'text') {
        descriptor.modifiers = descriptor.modifiers.filter(modifier => !['printed', 'pn', 'px', 'pt'].includes(modifier));
      }
      if (['name', 'text', 'oracle'].includes(id)) {
        descriptor.allowsRegex = false;
      }

      return descriptor;
    }),
    result: {
      sort:  true,
      group: true,
      page:  true,
      total: true,
      ambit: true,
      lang:  true,
    },
  };
}

/** Compiles the resolved filter into a parameterized Drizzle SQL expression. */
export type MagicTextPackageSchemas = {
  /** Attached schema containing original, language-independent part text. */
  base:   string;
  /** Attached schema containing localized card text. */
  locale: string;
};

export function compileMagicD1Filter(
  query: LogicalQuery | null,
  db: MagicSearchDrizzle,
  textPackageSchemas?: MagicTextPackageSchemas,
): SQL {
  if (query == null) {
    return sql`1 = 1`;
  }

  return compileNode(query, db, textPackageSchemas);
}

/** Finds value-level text cases whose Unicode behavior is not proven equivalent. */
function findNodeGap(query: LogicalQuery, supported: DatasetDescriptor['commands']): CapabilityGap | null {
  switch (query.kind) {
  case 'and':
  case 'or':
    for (const child of query.exprs) {
      const gap = findNodeGap(child, supported);
      if (gap != null) {
        return gap;
      }
    }
    return null;
  case 'not':
    return findNodeGap(query.expr, supported);
  case 'leaf':
    break;
  }

  const command = query.command;
  const id = command.commandId;

  if (!supported.some(item => item.field === command.descriptor.field)) {
    return { kind: 'field', field: id, detail: 'D1 does not project this field.' };
  }

  if (['name', 'text', 'oracle'].includes(id)) {
    if (typeof command.value !== 'string') {
      return { kind: 'regex', field: id, detail: 'Regular expressions remain on the original PG path.' };
    }
    if (command.value.includes('\\')) {
      return { kind: 'text-semantics', field: id, detail: 'Backslash escaping has not been proven equivalent.' };
    }
    const terms = command.argType === 'id'
      ? command.value.split(/[|&]/)
      : [command.value];
    if (id !== 'name' && terms.some(term => [...term].length < 3)) {
      return { kind: 'text-semantics', field: id, detail: 'Short body terms use the original PG path.' };
    }
    if (terms.some(hasCasedNonAscii)) {
      return { kind: 'text-semantics', field: id, detail: 'This Unicode case-folding form uses the original PG path.' };
    }
  }

  if (id === 'rarity' && command.operator !== '~:') {
    return { kind: 'operator', field: id, detail: 'Only rarity existence is projected in D1.' };
  }

  if (
    id === 'mana-value'
    && typeof command.value === 'string'
    && (command.argType === 'id' ? command.value.split(/[|&]/) : [command.value])
      .some(value => parseFiniteNumber(value) == null)
  ) {
    return { kind: 'value-class', field: id, detail: 'D1 supports numeric mana values only.' };
  }

  return null;
}

/** Compiles boolean structure while preserving each logical operator. */
function compileNode(
  query: LogicalQuery,
  db: MagicSearchDrizzle,
  textPackageSchemas?: MagicTextPackageSchemas,
): SQL {
  if (query.kind === 'leaf') {
    return compileCommand(query.command, db, textPackageSchemas);
  }

  if (query.kind === 'not') {
    return not(compileNode(query.expr, db, textPackageSchemas));
  }

  return combine(query.kind, query.exprs.map(child => compileNode(child, db, textPackageSchemas)));
}

/** Compiles one supported command without embedding user values into SQL text. */
function compileCommand(
  command: ResolvedCommand,
  db: MagicSearchDrizzle,
  textPackageSchemas?: MagicTextPackageSchemas,
): SQL {
  switch (command.commandId) {
  case 'name':
    return compileTextCommand(command, nameSources(command), db, textPackageSchemas);
  case 'text':
    return compileTextCommand(command, textSources(command), db, textPackageSchemas);
  case 'oracle':
    return compileTextCommand(command, ['part-body', 'localization-body'], db, textPackageSchemas);
  case 'mana-value':
    return compileNumber(command);
  case 'rarity':
    return compileRarity(command, db);
  case 'ambit':
    return compileAmbit(command);
  case 'format':
    return compileFormat(command, db);
  default:
    throw new Error(`Unsupported D1 Magic command: ${command.commandId}`);
  }
}

/** Identifies one projected name or body source used by text filters. */
type TextSource = 'part-name' | 'localization-name' | 'part-body' | 'localization-body';

/** Selects the exact text sources exposed by a name or body modifier. */
function textSources(command: ResolvedCommand): TextSource[] {
  if (command.modifier === 'oracle') {
    return ['part-body'];
  }
  if (command.modifier === 'localized') {
    return ['localization-body'];
  }
  return ['part-body', 'localization-body'];
}

/** Builds PG-compatible value groups independently for every projected text source. */
function compileTextCommand(
  command: ResolvedCommand,
  sources: TextSource[],
  db: MagicSearchDrizzle,
  textPackageSchemas?: MagicTextPackageSchemas,
): SQL {
  if (command.textCondition != null) {
    return compileRegexCondition(command, sources.map(source => regexSourceColumn(source, db)));
  }
  if (typeof command.value !== 'string') {
    throw new Error('Regex values must be routed to PostgreSQL before D1 compilation.');
  }

  const groups = command.argType === 'id'
    ? command.value.split('|').map(group => group.split('&'))
    : [[command.value]];
  const negated = command.qualifier.includes('!');
  const bySource = sources.map(source => {
    const byGroup = groups.map(group => combine('and', group.map(term => {
      const match = source.endsWith('body')
        ? compileBodyMatch(command, source, term, db, textPackageSchemas)
        : compileNameMatch(command, source, term);
      return negated ? not(match) : match;
    })));

    return combine('or', byGroup);
  });

  return combine(negated ? 'and' : 'or', bySource);
}

/** Compiles exact name matching with an escaped SQLite LIKE pattern. */
function compileNameMatch(command: ResolvedCommand, source: TextSource, term: string): SQL {
  const column = nameColumn(source);
  if (term === '') {
    return or(isNull(column), eq(column, ''))!;
  }

  const escaped = escapeLike(term);
  const value = command.operator === '=' ? escaped : `%${escaped}%`;
  const match = sql`${column} LIKE ${value} ESCAPE '\\'`;

  // Source-level negation belongs to compileTextCommand, exactly once.
  return match;
}

/** Maps a name source to the corresponding Drizzle column. */
function nameColumn(source: TextSource): AnySQLiteColumn {
  return source === 'part-name' ? SearchCardPart.name : SearchCardPartLocalization.name;
}

/** Uses trigram FTS as a candidate filter and the source text as the exact test. */
function compileBodyMatch(
  command: ResolvedCommand,
  source: TextSource,
  term: string,
  db: MagicSearchDrizzle,
  textPackageSchemas?: MagicTextPackageSchemas,
): SQL {
  const body = alias(SearchTextRow, 'body');
  const escaped = escapeLike(term);
  const exact = command.operator === '=' ? escaped : `%${escaped}%`;
  const phrase = `"${term.replaceAll('"', '""')}"`;
  const identity = source === 'part-body'
    ? and(eq(body.kind, 'part'), isNull(body.locale), isNull(body.source))
    : and(
      eq(body.kind, 'localization'),
      eq(body.locale, SearchCardPartLocalization.locale),
      eq(body.source, SearchCardPartLocalization.source),
    );
  const textSchema = source === 'part-body' ? textPackageSchemas?.base : textPackageSchemas?.locale;
  if (textSchema != null && !/^[a-z_][a-z0-9_]*$/i.test(textSchema)) {
    throw new Error('Invalid attached Magic text package schema.');
  }
  const ftsTable = textSchema == null
    ? sql.raw('magic_search_text_fts')
    : sql.raw(`"${textSchema}"."magic_search_text_fts"`);
  const fts = sql`${body.textId} IN (
    SELECT rowid FROM ${ftsTable}
    WHERE ${sql.raw('magic_search_text_fts')} MATCH ${phrase}
  )`;
  const exactMatch = sql`${body.body} LIKE ${exact} ESCAPE '\\'`;

  if (textSchema != null) {
    const packageRows = sql.raw(`"${textSchema}"."magic_search_text_rows"`);
    const partBody = source === 'part-body';
    const outerIdentity = partBody
      ? sql`(${SearchCard.cardId}, ${SearchCard.version}, ${SearchCardPart.partIndex})`
      : sql`(${SearchCard.cardId}, ${SearchCard.version}, ${SearchCardPart.partIndex},
          ${SearchCardPartLocalization.locale}, ${SearchCardPartLocalization.source})`;
    const selectedIdentity = partBody
      ? sql`body.card_id, body.version, body.part_index`
      : sql`body.card_id, body.version, body.part_index, body.locale, body.source`;
    const sourceIdentity = partBody
      ? sql`body.kind = 'part' AND body.locale IS NULL AND body.source IS NULL`
      : sql`body.kind = 'localization'`;
    return sql`${outerIdentity} IN (
      SELECT ${selectedIdentity} FROM ${packageRows} AS body
      WHERE ${sourceIdentity}
        AND body.text_id IN (
          SELECT rowid FROM ${ftsTable}
          WHERE ${sql.raw('magic_search_text_fts')} MATCH ${phrase}
        )
        AND body.body LIKE ${exact} ESCAPE '\\'
    )`;
  }

  return exists(db.select({ textId: body.textId })
    .from(body)
    .where(and(
      eq(body.cardId, SearchCard.cardId),
      eq(body.version, SearchCard.version),
      eq(body.partIndex, SearchCardPart.partIndex),
      identity,
      fts,
      exactMatch,
    )));
}

/** Escapes LIKE metacharacters using SQLite's explicit escape character. */
function escapeLike(value: string): string {
  return value.replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_');
}

/** Compiles the numeric mana-value operators supported by the shared DSL. */
function compileNumber(command: ResolvedCommand): SQL {
  const groups = command.argType === 'id'
    ? command.value.toString().split('|').map(group => group.split('&'))
    : [[command.value.toString()]];
  const predicates = groups.map(group => combine('and', group.map(value => {
    const number = parseFiniteNumber(value);
    const originalOperator = command.operator;
    const operator = originalOperator === ':' ? '=' : originalOperator;
    if (number == null) {
      throw new Error('Unsupported D1 numeric value.');
    }

    if (operator === '=' && command.qualifier.includes('!')) {
      return ne(SearchCard.manaValue, number);
    }
    switch (operator) {
    case '=':
      return eq(SearchCard.manaValue, number);
    case '>':
      return gt(SearchCard.manaValue, number);
    case '>=':
      return gte(SearchCard.manaValue, number);
    case '<':
      return lt(SearchCard.manaValue, number);
    case '<=':
      return lte(SearchCard.manaValue, number);
    default:
      throw new Error('Unsupported D1 numeric operator.');
    }
  })));

  return combine('or', predicates);
}

/** Parses the finite decimal forms accepted by PostgreSQL numeric comparisons. */
function parseFiniteNumber(value: string): number | null {
  const normalized = value.trim();
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(normalized)) {
    return null;
  }

  const number = Number(normalized);
  return Number.isFinite(number) ? number : null;
}

/** Compiles the card-level print-rarity existence summary. */
function compileRarity(command: ResolvedCommand, db: MagicSearchDrizzle): SQL {
  const rarity = resolveRarity(String(command.value));
  const matching = db.select({ cardId: SearchCardValue.cardId })
    .from(SearchCardValue)
    .where(and(
      eq(SearchCardValue.cardId, SearchCard.cardId),
      eq(SearchCardValue.version, SearchCard.version),
      eq(SearchCardValue.field, 'rarity'),
      eq(SearchCardValue.value, rarity),
    ));

  return command.qualifier.includes('!') ? notExists(matching) : exists(matching);
}

/** Expands public one-letter rarity values to their stored names. */
function resolveRarity(value: string): string {
  return ({
    c: 'common',
    u: 'uncommon',
    r: 'rare',
    m: 'mythic',
    s: 'special',
  } as Record<string, string>)[value] ?? value;
}

/** Compiles the cumulative card-ambit ladder into numeric rank comparisons. */
function compileAmbit(command: ResolvedCommand): SQL {
  const ranks: Record<string, number> = { primary: 0, additional: 1, full: 2 };
  const value = ranks[String(command.value).toLowerCase()];
  if (value == null) {
    throw new Error('Unsupported D1 ambit value.');
  }
  const operator = command.operator === ':' ? '<=' : command.operator;
  const rank = sql<number>`CASE ${SearchCard.ambit} WHEN 'primary' THEN 0 WHEN 'additional' THEN 1 WHEN 'full' THEN 2 END`;
  switch (operator) {
  case '=':
    return eq(rank, value);
  case '<':
    return lt(rank, value);
  case '<=':
    return lte(rank, value);
  case '>':
    return gt(rank, value);
  case '>=':
    return gte(rank, value);
  default:
    throw new Error('Unsupported D1 ambit operator.');
  }
}

/** Compiles exact legality or format-availability checks from relation rows. */
function compileFormat(command: ResolvedCommand, db: MagicSearchDrizzle): SQL {
  const [format, status] = String(command.value).split('=');
  const prefix = `${format ?? ''}=`;
  const matching = (value: string) => db.select({ cardId: SearchCardValue.cardId })
    .from(SearchCardValue)
    .where(and(
      eq(SearchCardValue.cardId, SearchCard.cardId),
      eq(SearchCardValue.version, SearchCard.version),
      eq(SearchCardValue.field, 'legality'),
      eq(SearchCardValue.value, value),
    ));
  const anyStatus = db.select({ cardId: SearchCardValue.cardId })
    .from(SearchCardValue)
    .where(and(
      eq(SearchCardValue.cardId, SearchCard.cardId),
      eq(SearchCardValue.version, SearchCard.version),
      eq(SearchCardValue.field, 'legality'),
      sql`substr(${SearchCardValue.value}, 1, length(${prefix})) = ${prefix}`,
    ));

  if (status == null) {
    const positive = or(exists(matching(`${prefix}legal`)), exists(matching(`${prefix}restricted`)))!;
    return command.qualifier.includes('!')
      ? and(exists(anyStatus), not(positive))!
      : positive;
  }

  const positive = exists(matching(`${prefix}${status}`));
  return command.qualifier.includes('!')
    ? and(exists(anyStatus), not(positive))!
    : positive;
}

/** Combines Drizzle predicates without losing their bound values. */
function combine(operator: 'and' | 'or', predicates: SQL[]): SQL {
  if (predicates.length === 0) {
    return operator === 'and' ? sql`1 = 1` : sql`0 = 1`;
  }
  if (predicates.length === 1) {
    return predicates[0]!;
  }
  return operator === 'and' ? and(...predicates)! : or(...predicates)!;
}

/** Recognizes cased non-ASCII input that may differ under PostgreSQL ILIKE. */
function hasCasedNonAscii(value: string): boolean {
  return [...value].some(character => character.codePointAt(0)! > 0x7f && /\p{Cased}/u.test(character));
}

/** Rejects non-ASCII regex sources until cross-engine case-folding has been proven. */
export function magicRegexUnsafe(request: QueryRequest, db: MagicSearchDrizzle, allText = false): SQL {
  const columns = regexCommands(request.filter, allText).flatMap(command => {
    if (command.commandId === 'name') {
      return nameSources(command).map(nameColumn);
    }
    return textSources(command).map(source => regexSourceColumn(source, db));
  });
  return columns.length === 0 ? sql`0` : or(...columns.map(nonAscii))!;
}

/** Resolves a body as a nullable scalar so missing text retains PG three-valued negation. */
function regexSourceColumn(source: TextSource, db: MagicSearchDrizzle): SQLWrapper {
  if (!source.endsWith('body')) {
    return nameColumn(source);
  }
  const body = alias(SearchTextRow, 'regex_body');
  return sql`(${db.select({ body: body.body }).from(body).where(and(
    eq(body.cardId, SearchCard.cardId),
    eq(body.version, SearchCard.version),
    eq(body.partIndex, SearchCardPart.partIndex),
    source === 'part-body'
      ? eq(body.kind, 'part')
      : and(
        eq(body.kind, 'localization'),
        eq(body.locale, SearchCardPartLocalization.locale),
        eq(body.source, SearchCardPartLocalization.source),
      ),
  ))})`;
}

/** Selects original or localized names without broadening the PG command's source modifier. */
function nameSources(command: ResolvedCommand): TextSource[] {
  return command.modifier === 'oracle'
    ? ['part-name']
    : command.modifier === 'localized'
      ? ['localization-name']
      : ['part-name', 'localization-name'];
}
