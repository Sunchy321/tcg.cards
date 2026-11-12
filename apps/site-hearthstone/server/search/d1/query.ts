import { compileRegexCondition, compileTextCondition, nonAscii, regexCommands } from '#search/server/regex';
import type { TextCondition } from '#search/regex';
import { and, eq, exists, gt, gte, inArray, isNotNull, lt, lte, ne, not, or, sql } from 'drizzle-orm';
import type { SQL, SQLWrapper } from 'drizzle-orm';
import type { AnySQLiteColumn } from 'drizzle-orm/sqlite-core';
import {
  classes,
  locale,
  race,
  rarity,
  spellSchool,
  types,
} from '@tcg-cards/model/hearthstone/schema/basic';
import type { Locale } from '@tcg-cards/model/hearthstone/schema/basic';
import { mercenaryFaction, mercenaryRole, rune } from '@tcg-cards/model/hearthstone/schema/entity';
import { TAG_ID } from '@tcg-cards/model/hearthstone/constant/tag';

import {
  SearchCard,
  SearchCardLegality,
  SearchCardLocalization,
  SearchCardValue,
  SearchTextRow,
} from '@tcg-cards/db/schema/sqlite/hearthstone';
import type {
  CapabilityGap,
  DatasetDescriptor,
  LogicalQuery,
  QueryRequest,
  ResolvedCommand,
} from '#search/logical';
import { describeLogicalCommand } from '#search/command/semantics';
import { matchValueGroups, splitValueGroups } from '#search/server/command/terms';
import { matchesHearthstoneText, normalizeHearthstoneQuery } from '../../../shared/search/game-text';
import type { CommonServerCommand } from '#search/server/command';
import * as commands from '../command-list';
import type { SearchDrizzle } from './types';
import { hasSupportedOrder } from './order';
import { resolveHearthstoneRawCardTerm } from '../../../shared/search/localized-card-terms';

const numbers = {
  'cost':       SearchCard.cost,
  'attack':     SearchCard.attack,
  'health':     SearchCard.health,
  'durability': SearchCard.durability,
  'armor':      SearchCard.armor,
  'tech-level': SearchCard.techLevel,
  'cooldown':   SearchCard.colddown,
};
const scalars: Record<string, AnySQLiteColumn> = {
  'lang':              SearchCardLocalization.lang,
  'type':              SearchCard.type,
  'spell-school':      SearchCard.spellSchool,
  'mercenary-role':    SearchCard.mercenaryRole,
  'mercenary-faction': SearchCard.mercenaryFaction,
  'rarity':            SearchCard.rarity,
};
const enums: Record<string, readonly string[]> = {
  'lang':              locale.options,
  'type':              types.options,
  'spell-school':      spellSchool.options,
  'mercenary-role':    mercenaryRole.options,
  'mercenary-faction': mercenaryFaction.options,
  'rarity':            rarity.options,
  'class':             classes.options,
  'rune':              rune.options,
  'race':              race.options,
  'race-bucket':       race.options,
};

const arrays = {
  'class':       { field: 'classes', count: SearchCard.classCount },
  'rune':        { field: 'rune', count: SearchCard.runeCount },
  'race':        { field: 'race', count: SearchCard.raceCount },
  'race-bucket': { field: 'raceBucket', count: SearchCard.raceBucketCount },
} as const;
const supported = new Set([
  ...Object.keys(numbers),
  ...Object.keys(scalars),
  ...Object.keys(arrays),
  'raw',
  'name',
  'text',
  'full-stats',
  'stats',
  'set',
  'collectible',
  'elite',
  'in-tavern',
  'ambit',
  'format',
]);

/** Describes precisely the commands implemented by the SQLite compiler. */
export function hearthstoneD1Descriptor(): DatasetDescriptor {
  return {
    commands: (Object.values(commands) as CommonServerCommand[])
      .filter(command => supported.has(command.options.id ?? ''))
      .map(command => ({
        ...describeLogicalCommand(
          command.options,
          command.options.id ?? '',
          command.options.logical?.witness ?? [],
        ),
        allowsRegex: false,
      })),
    result: { sort: true, group: false, page: true, total: true, ambit: true, lang: true },
  };
}

/** Rejects unproven collation, text, and value cases before executing any D1 read. */
export function findHearthstoneD1Gap(request: QueryRequest): CapabilityGap | null {
  if (!hasSupportedOrder(request)) {
    return {
      kind:   'result',
      field:  'sort',
      detail: 'The sort requires fields outside the D1 projection.',
    };
  }
  return request.filter == null
    ? null
    : findNodeGap(request.filter, (request.result.lang ?? 'en') as Locale);
}

/** Compiles boolean structure without weakening OR, NOT, or SQL NULL semantics. */
export function compileHearthstoneD1Filter(
  query: LogicalQuery | null,
  db: SearchDrizzle,
  lang: Locale = 'en',
): SQL {
  if (query == null) {
    return sql`1 = 1`;
  }
  if (query.kind === 'not') {
    return not(compileHearthstoneD1Filter(query.expr, db, lang));
  }
  if (query.kind === 'and' || query.kind === 'or') {
    const children = query.exprs.map(child => compileHearthstoneD1Filter(child, db, lang));
    return (query.kind === 'and' ? and(...children) : or(...children))!;
  }
  if (query.kind !== 'leaf') {
    throw new Error('Unsupported logical query node.');
  }
  return compileCommand(query.command, db, lang);
}

/** Identifies ordinary text leaves that require the locale-aware runtime matcher. */
export function isHearthstoneLiteralText(command: ResolvedCommand): boolean {
  return ['raw', 'name', 'text'].includes(command.commandId) && typeof command.value === 'string';
}

/** Compiles one non-text leaf for the D1 runtime text matcher and boolean evaluator. */
export function compileHearthstoneD1Command(
  command: ResolvedCommand,
  db: SearchDrizzle,
  lang: Locale,
): SQL {
  return compileCommand(command, db, lang);
}

/** Compiles the localized card-data predicate that accompanies a raw text leaf. */
export function compileHearthstoneD1RawSpecialTerm(
  command: ResolvedCommand,
  db: SearchDrizzle,
  lang: Locale,
): SQL | undefined {
  if (!isHearthstoneLiteralText(command) || command.commandId !== 'raw' || command.argType !== 'id') {
    return undefined;
  }
  const term = resolveHearthstoneRawCardTerm(command.value as string, lang);
  return term == null ? undefined : rawCardTermMatch(term, db);
}

/** Compiles a safe prefilter while leaving ordinary text decisions to Unicode matching. */
export function compileHearthstoneD1CandidateFilter(
  query: LogicalQuery | null,
  db: SearchDrizzle,
  lang: Locale = 'en',
): SQL {
  return compileCandidateNode(query, db, lang) ?? sql`1 = 1`;
}

/** Matches one text leaf after candidate rows have been loaded locally. */
export function matchesHearthstoneD1TextCommand(
  command: ResolvedCommand,
  row: { name: string, text: string, searchTerms: string[] | null },
  lang: Locale,
): boolean {
  if (!isHearthstoneLiteralText(command)) {
    return false;
  }
  const value = command.value as string;
  const groups = command.argType === 'id' ? splitValueGroups(value) : [[value]];
  const operator: ':' | '=' = command.commandId === 'raw' || command.operator !== '=' ? ':' : '=';
  const negated = command.commandId !== 'raw' && command.qualifier.includes('!');
  const matchesSource = (source: string): boolean => groups.some(group => group.every(term => {
    const matched = matchesHearthstoneText(source, term, lang, operator);
    return negated ? !matched : matched;
  }));
  if (command.commandId === 'name') {
    return matchesSource(row.name);
  }
  if (command.commandId === 'text') {
    return matchesSource(row.text);
  }
  return matchesSource(row.name)
    || matchesSource(row.text)
    || groups.some(group => group.every(term =>
      term !== '' && (row.searchTerms ?? []).some(searchTerm =>
        matchesHearthstoneText(searchTerm, term, lang, ':')),
    ));
}

/** Compiles one boolean node into a candidate superset, dropping unsafe negated text tests. */
function compileCandidateNode(
  query: LogicalQuery | null,
  db: SearchDrizzle,
  lang: Locale,
): SQL | null {
  if (query == null) {
    return null;
  }
  if (query.kind === 'leaf') {
    return isHearthstoneLiteralText(query.command)
      ? compileTextCandidate(query.command, db, lang)
      : compileCommand(query.command, db, lang);
  }
  if (query.kind === 'not') {
    return hasLiteralText(query.expr)
      ? null
      : not(compileHearthstoneD1Filter(query.expr, db, lang));
  }
  const children = query.exprs.map(child => compileCandidateNode(child, db, lang));
  if (query.kind === 'or' && children.some(child => child == null)) {
    return null;
  }
  const constrained = children.filter((child): child is SQL => child != null);
  if (constrained.length === 0) {
    return null;
  }
  return (query.kind === 'and' ? and(...constrained) : or(...constrained))!;
}

/** Checks whether a subtree contains plain text before candidate negation is applied. */
function hasLiteralText(query: LogicalQuery): boolean {
  if (query.kind === 'leaf') {
    return isHearthstoneLiteralText(query.command);
  }
  if (query.kind === 'not') {
    return hasLiteralText(query.expr);
  }
  return query.exprs.some(hasLiteralText);
}

/** Builds candidates from base matches plus every source requiring game text fallback. */
function compileTextCandidate(command: ResolvedCommand, db: SearchDrizzle, lang: Locale): SQL | null {
  if (command.commandId !== 'raw' && command.qualifier.includes('!')) {
    return null;
  }
  const value = command.value as string;
  const terms = command.argType === 'id' ? splitValueGroups(value).flat() : [value];
  const sources = command.commandId === 'name'
    ? [SearchCardLocalization.name]
    : command.commandId === 'text'
      ? [SearchCardLocalization.text]
      : [SearchCardLocalization.name, SearchCardLocalization.text];
  const conditions: SQL[] = [];

  for (const term of terms) {
    const query = normalizeHearthstoneQuery(term, lang);
    if (query === '' || [...query].some(char => char.codePointAt(0)! > 127 && /\p{Cased}/u.test(char))) {
      return null;
    }
    const escaped = query.replaceAll('%', '\\%').replaceAll('_', '\\_');
    const operator = command.commandId === 'raw' ? ':' : command.operator;
    const literal = operator === '=' ? escaped : `%${escaped}%`;
    const useFts = command.commandId !== 'name' && [...query].length >= 3;

    for (const column of sources) {
      if (column !== SearchCardLocalization.text || !useFts) {
        conditions.push(sql`${column} LIKE ${literal} ESCAPE '\\'`);
      }
      conditions.push(textSourceFallback(column));
    }
    if (command.commandId === 'raw') {
      conditions.push(searchTermCandidate(query));
      conditions.push(searchTermFallback());
    }
    if (useFts) {
      conditions.push(textFtsCandidate(query, db));
    }
  }

  if (command.commandId === 'raw' && command.argType === 'id') {
    const special = compileHearthstoneD1RawSpecialTerm(command, db, lang);
    if (special != null) {
      conditions.push(special);
    }
  }
  return conditions.length === 0 ? null : or(...conditions)!;
}

/** Includes markup, Unicode, and whitespace variants that a literal FTS query cannot see. */
function textSourceFallback(column: SQLWrapper): SQL {
  return sql`${nonAscii(column)} OR instr(${column}, '<') > 0 OR ${column} GLOB '*[^ -~]*' OR instr(${column}, '  ') > 0`;
}

/** Matches ASCII-sized body literals through the existing trigram index. */
function textFtsCandidate(term: string, db: SearchDrizzle): SQL {
  const phrase = `"${term.replaceAll('"', '""')}"`;
  return exists(
    db
      .select({ id: SearchTextRow.textId })
      .from(SearchTextRow)
      .where(
        and(
          eq(SearchTextRow.cardId, SearchCard.cardId),
          eq(SearchTextRow.lang, SearchCardLocalization.lang),
          sql`${SearchTextRow.textId} IN (SELECT rowid FROM ${sql.raw('hearthstone_search_text_fts')}
        WHERE ${sql.raw('hearthstone_search_text_fts')} MATCH ${phrase})`,
        ),
      ),
  );
}

/** Keeps DBF terms in the same candidate superset as names and rules text. */
function searchTermCandidate(query: string): SQL {
  const escaped = query.replaceAll('%', '\\%').replaceAll('_', '\\_');
  return sql`EXISTS (
    SELECT 1 FROM json_each(${SearchCardLocalization.searchTerms}) AS search_term
    WHERE search_term.value LIKE ${`%${escaped}%`} ESCAPE '\\'
  )`;
}

/** Includes raw DBF terms whose Unicode, markup, or whitespace needs query-time handling. */
function searchTermFallback(): SQL {
  return sql`EXISTS (
    SELECT 1 FROM json_each(${SearchCardLocalization.searchTerms}) AS search_term
    WHERE ${textSourceFallback(sql`search_term.value`)}
  )`;
}

/** Finds the first literal whose SQLite interpretation is not covered. */
function findNodeGap(query: LogicalQuery, lang: Locale): CapabilityGap | null {
  if (query.kind === 'not') {
    return findNodeGap(query.expr, lang);
  }
  if (query.kind === 'and' || query.kind === 'or') {
    for (const child of query.exprs) {
      const gap = findNodeGap(child, lang);
      if (gap != null) {
        return gap;
      }
    }
    return null;
  }
  if (query.kind !== 'leaf') {
    throw new Error('Unsupported logical query node.');
  }
  const command = query.command;
  const id = command.commandId;
  /** Records a value requiring the original PG validator or evaluator. */
  const gap = (detail: string): CapabilityGap => ({ kind: 'value-class', field: id, detail });
  if (!supported.has(id)) {
    return gap('The field is not projected in D1.');
  }
  if (typeof command.value !== 'string') {
    return gap('Regular expressions remain on PostgreSQL.');
  }
  if (command.value.includes('\0')) {
    return gap('Embedded NUL requires PostgreSQL validation.');
  }
  const enumValues = enums[id];
  if (enumValues != null) {
    const terms = command.argType === 'id' ? command.value.split(/[|&]/) : [command.value];
    const values = terms.flatMap(term =>
      id in arrays ? arrayWords(id, term) : command.operator === ':' ? term.split(',') : [term],
    );
    if (values.some(value => !enumValues.includes(value))) {
      return gap('Unknown enum values require the original PostgreSQL validator.');
    }
  }
  // eslint-disable-next-line no-control-regex
  if (id === 'set' && /[^\x00-\x7f]/.test(command.value)) {
    return gap('Non-ASCII set case conversion requires PostgreSQL.');
  }
  if (['raw', 'name', 'text'].includes(id)) {
    const terms = command.argType === 'id' ? command.value.split(/[|&]/) : [command.value];
    if (terms.some(term => term.includes('\\') || term.includes('\0'))) {
      return gap('The text escaping form requires PostgreSQL.');
    }
  }
  if (id in numbers && command.value.split(/[|&]/).some(value => !validInteger(value))) {
    return gap('The numeric form requires the original validator.');
  }
  if (
    ['stats', 'full-stats'].includes(id)
    && Object.values(command.pattern ?? {}).some(value => !validInteger(value))
  ) {
    return gap('The stats pattern requires the original validator.');
  }
  if (
    ['elite', 'in-tavern'].includes(id)
    && !['true', 'false'].includes(command.value.toLowerCase())
  ) {
    return gap('The boolean value requires the original validator.');
  }
  if (id === 'collectible' && !['true', 'false', 'all'].includes(command.value.toLowerCase())) {
    return gap('The collectible value requires the original validator.');
  }
  if (id === 'ambit' && !['primary', 'additional', 'full'].includes(command.value.toLowerCase())) {
    return gap('The ambit value requires the original validator.');
  }
  return null;
}

/** Dispatches supported commands using the same value grouping as the PG handlers. */
function compileCommand(command: ResolvedCommand, db: SearchDrizzle, lang: Locale): SQL {
  if (command.textCondition != null) {
    const columns = command.commandId === 'name'
      ? [SearchCardLocalization.name]
      : command.commandId === 'text'
        ? [SearchCardLocalization.text]
        : [SearchCardLocalization.name, SearchCardLocalization.text];
    const textMatch = compileRegexCondition(command, columns);
    if (command.commandId !== 'raw') {
      return textMatch;
    }
    const termMatch = searchTermsTextCondition(command.textCondition);
    return command.qualifier.includes('!')
      ? and(textMatch, not(termMatch))!
      : or(textMatch, termMatch)!;
  }
  const value = String(command.value);
  const id = command.commandId;
  const negated = command.qualifier.includes('!');
  /** Applies the PG handler's bare-id groups without splitting quoted strings. */
  const grouped = (match: (term: string) => SQL): SQL =>
    matchValueGroups(command.argType === 'id' ? splitValueGroups(value) : [[value]], match);
  if (id in numbers) {
    return grouped(term => numberMatch(numbers[id as keyof typeof numbers], term, command));
  }
  if (id in scalars) {
    return grouped(term => {
      const column = scalars[id]!;
      const match = command.operator === ':' ? inArray(column, term.split(',')) : eq(column, term);
      return negated ? not(match) : match;
    });
  }
  if (id in arrays) {
    return grouped(term => arrayMatch(command, term, db));
  }
  switch (id) {
  case 'name':
  case 'text':
    return grouped(term => textMatch(command, term, id === 'text', db));
  case 'raw': {
    const positive: ResolvedCommand = { ...command, operator: ':', qualifier: [] };
    const rawCardTerm = command.argType === 'id'
      ? resolveHearthstoneRawCardTerm(value, lang)
      : undefined;
    // The legacy raw handler groups each source independently, then joins with OR.
    const queries = [
      grouped(term => textMatch(positive, term, false, db)),
      grouped(term => textMatch(positive, term, true, db, rawCardTerm != null)),
      grouped(term => searchTermMatch(term)),
    ];
    const cardTerm = rawCardTermMatch(rawCardTerm, db);
    return or(...queries, ...(cardTerm == null ? [] : [cardTerm]))!;
  }
  case 'stats':
  case 'full-stats': {
    const fields
      = id === 'stats' ? (['attack', 'health'] as const) : (['cost', 'attack', 'health'] as const);
    const predicates = fields.map(field =>
      numberMatch(numbers[field], command.pattern?.[field] ?? '', {
        ...command,
        operator: command.operator === '' ? '=' : command.operator,
      }),
    );
    return (negated ? or(...predicates) : and(...predicates))!;
  }
  case 'set': {
    const column = sql`lower(${SearchCard.set})`;
    const match
      = command.operator === ':'
        ? inArray(column, value.toLowerCase().split(','))
        : eq(column, value.toLowerCase());
    return negated ? not(match) : match;
  }
  case 'collectible':
    return value.toLowerCase() === 'all'
      ? sql`1 = 1`
      : eq(SearchCard.collectible, value.toLowerCase() === 'true');
  case 'elite':
  case 'in-tavern':
    return eq(
      id === 'elite' ? SearchCard.elite : SearchCard.inBobsTavern,
      (value.toLowerCase() === 'true') !== negated,
    );
  case 'ambit': {
    const ranks = { primary: 0, additional: 1, full: 2 };
    return compare(
      ambitRank(),
      ranks[value.toLowerCase() as keyof typeof ranks],
      command.operator === ':' ? '<=' : command.operator,
    );
  }
  case 'format': {
    const [format, status] = value.split('=');
    // A scalar subquery returns NULL for a missing format, preserving PG NOT semantics.
    const stored = sql`(${db
      .select({ status: SearchCardLegality.status })
      .from(SearchCardLegality)
      .where(
        and(
          eq(SearchCardLegality.cardId, SearchCard.cardId),
          eq(SearchCardLegality.format, format!),
        ),
      )})`;
    const match
      = status == null ? inArray(stored, ['derived', 'legal', 'minor']) : eq(stored, status);
    return negated ? not(match) : match;
  }
  default:
    throw new Error(`Unsupported Hearthstone D1 command: ${id}`);
  }
}

/** Adds the card-data predicate selected by one exact localized raw term. */
function rawCardTermMatch(
  term: ReturnType<typeof resolveHearthstoneRawCardTerm>,
  db: SearchDrizzle,
): SQL | undefined {
  switch (term) {
  case 'golden':
    return goldenImageEligibility();
  case 'diamond':
    return hasSimpleTag(TAG_ID.HAS_DIAMOND);
  case 'signature':
    return hasSimpleTag(TAG_ID.HAS_SIGNATURE);
  case 'whelp':
    return hasSimpleTag(TAG_ID.WHELP);
  case 'imp':
    return hasSimpleTag(TAG_ID.IMP);
  case 'rune-blood':
    return runeMatch('blood', db);
  case 'rune-frost':
    return runeMatch('frost', db);
  case 'rune-unholy':
    return runeMatch('undead', db);
  default:
    return undefined;
  }
}

/** Tests only whether a projected tag key exists, matching the game's HasCardTag checks. */
function hasSimpleTag(tagId: number): SQL {
  const path = '$.' + JSON.stringify(String(tagId));
  return sql`json_type(${SearchCard.simpleTags}, ${path}) IS NOT NULL`;
}

/** Mirrors the image selector's template choice and golden eligibility in SQLite. */
function goldenImageEligibility(): SQL {
  const resultUsesBattlegroundsTemplate = or(
    eq(SearchCard.set, 'bgs'),
    inArray(SearchCard.type, ['trinket', 'anomaly']),
    and(isNotNull(SearchCard.techLevel), eq(SearchCard.collectible, false)),
  )!;
  const gameHasBattlegroundsTemplate = or(eq(SearchCard.set, 'bgs'), isNotNull(SearchCard.techLevel))!;
  const premium = enabledSimpleTag(TAG_ID.PREMIUM);

  return or(
    and(resultUsesBattlegroundsTemplate, gameHasBattlegroundsTemplate, premium),
    and(
      not(resultUsesBattlegroundsTemplate),
      ne(SearchCard.type, 'mercenary_ability'),
      ne(SearchCard.type, 'enchantment'),
    ),
  )!;
}

/** Treats numeric zero and boolean false like the card-image eligibility helper. */
function enabledSimpleTag(tagId: number): SQL {
  const path = '$.' + JSON.stringify(String(tagId));
  const value = sql`json_extract(${SearchCard.simpleTags}, ${path})`;
  return sql`CASE
    WHEN json_type(${SearchCard.simpleTags}, ${path}) IN ('true', 'integer', 'real')
      THEN CAST(${value} AS REAL) <> 0
    ELSE 0
  END`;
}

/** Preserves PostgreSQL's NULL array behavior when no rune projection exists. */
function runeMatch(value: string, db: SearchDrizzle): SQL {
  const contains = exists(
    db
      .select({ cardId: SearchCardValue.cardId })
      .from(SearchCardValue)
      .where(
        and(
          eq(SearchCardValue.cardId, SearchCard.cardId),
          eq(SearchCardValue.field, 'rune'),
          eq(SearchCardValue.value, value),
        ),
      ),
  );
  return sql`CASE WHEN ${SearchCard.runeCount} IS NULL THEN NULL ELSE ${contains} END`;
}

/** Preserves integer parsing and qualifier behavior from the existing numeric handler. */
function numberMatch(column: SQLWrapper, value: string, command: ResolvedCommand): SQL {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isSafeInteger(parsed)) {
    throw new Error('Unsupported Hearthstone D1 numeric value.');
  }
  const operator = command.operator === ':' ? '=' : command.operator;
  if (operator === '=' && command.qualifier.includes('!')) {
    return ne(column, parsed);
  }
  return compare(column, parsed, operator);
}

/** Compiles a validated comparison without interpolating user-controlled operators. */
function compare(column: SQLWrapper, value: number, operator: string): SQL {
  switch (operator) {
  case '=':
    return eq(column, value);
  case '>':
    return gt(column, value);
  case '>=':
    return gte(column, value);
  case '<':
    return lt(column, value);
  case '<=':
    return lte(column, value);
  default:
    throw new Error('Unsupported Hearthstone D1 comparison.');
  }
}

/** Converts the cumulative ambit order to its portable numeric rank. */
export function ambitRank(): SQL<number> {
  return sql<number>`CASE ${SearchCard.ambit} WHEN 'primary' THEN 0 WHEN 'additional' THEN 1 WHEN 'full' THEN 2 END`;
}

/** Matches arrays through relation rows, retaining ordered equality and nullable negation. */
function arrayMatch(command: ResolvedCommand, value: string, db: SearchDrizzle): SQL {
  const spec = arrays[command.commandId as keyof typeof arrays];
  const words = arrayWords(command.commandId, value);
  const equality = command.operator === '=';
  const predicates = (equality ? words : [...new Set(words)]).map((word, position) =>
    exists(
      db
        .select({ cardId: SearchCardValue.cardId })
        .from(SearchCardValue)
        .where(
          and(
            eq(SearchCardValue.cardId, SearchCard.cardId),
            eq(SearchCardValue.field, spec.field),
            eq(SearchCardValue.value, word),
            equality ? eq(SearchCardValue.position, position) : undefined,
          ),
        ),
    ),
  );
  const match = and(equality ? eq(spec.count, words.length) : undefined, ...predicates)!;
  const nullable = sql`CASE WHEN ${spec.count} IS NULL THEN NULL ELSE ${match} END`;
  return command.qualifier.includes('!') ? not(nullable) : nullable;
}

/** Uses FTS for body candidates except short localized raw terms, which need exact LIKE scans. */
function textMatch(
  command: ResolvedCommand,
  term: string,
  body: boolean,
  db: SearchDrizzle,
  allowShortBodyScan = false,
): SQL {
  const column = body ? SearchCardLocalization.text : SearchCardLocalization.name;
  const escaped = term.replaceAll('%', '\\%').replaceAll('_', '\\_');
  const literal = command.operator === '=' ? escaped : `%${escaped}%`;
  let match = term === '' ? eq(column, '') : sql`${column} LIKE ${literal} ESCAPE '\\'`;
  if (body && (!allowShortBodyScan || [...term].length >= 3)) {
    const phrase = `"${term.replaceAll('"', '""')}"`;
    const candidate = exists(
      db
        .select({ id: SearchTextRow.textId })
        .from(SearchTextRow)
        .where(
          and(
            eq(SearchTextRow.cardId, SearchCard.cardId),
            eq(SearchTextRow.lang, SearchCardLocalization.lang),
            sql`${SearchTextRow.textId} IN (SELECT rowid FROM ${sql.raw('hearthstone_search_text_fts')}
        WHERE ${sql.raw('hearthstone_search_text_fts')} MATCH ${phrase})`,
          ),
        ),
    );
    match = and(candidate, match)!;
  }
  return command.qualifier.includes('!') ? not(match) : match;
}

/** Matches one literal against the current localization's DBF term array. */
function searchTermMatch(term: string): SQL {
  if (term === '') {
    return sql`0`;
  }
  const escaped = term.replaceAll('%', '\\%').replaceAll('_', '\\_');
  return sql`EXISTS (
    SELECT 1 FROM json_each(${SearchCardLocalization.searchTerms}) AS search_term
    WHERE search_term.value LIKE ${`%${escaped}%`} ESCAPE '\\'
  )`;
}

/** Builds a regex candidate check against one search term at a time. */
function searchTermsTextCondition(condition: TextCondition): SQL {
  return sql`EXISTS (
    SELECT 1 FROM json_each(${SearchCardLocalization.searchTerms}) AS search_term
    WHERE ${compileTextCondition(condition, sql`search_term.value`)}
  )`;
}

/** Preserves the PG array decoder, including the existing undead rune alias spelling. */
function arrayWords(id: string, value: string): string[] {
  const decoded = value
    .split('')
    .map(char => (({ b: 'blood', f: 'frost', u: 'undead' }) as Record<string, string>)[char]);
  return id === 'rune' && decoded.every(word => word != null)
    ? (decoded as string[])
    : value.split(',');
}

/** Accepts only parsed values representable by the source PostgreSQL integer columns. */
function validInteger(value: string): boolean {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed >= -2147483648 && parsed <= 2147483647;
}

/** Identifies source fields whose case-folding must be safe across the entire language scope. */
export function textCaseFields(query: LogicalQuery | null): Array<'name' | 'searchTerms' | 'text' | 'set'> {
  if (query == null) {
    return [];
  }
  if (query.kind === 'not') {
    return textCaseFields(query.expr);
  }
  if (query.kind !== 'leaf') {
    return [...new Set(query.exprs.flatMap(textCaseFields))];
  }
  const id = query.command.commandId;
  return id === 'raw'
    ? ['name', 'text', 'searchTerms']
    : id === 'name'
      ? ['name']
      : id === 'text'
        ? ['text']
        : id === 'set'
          ? ['set']
          : [];
}

/** Checks every regex source before relying on ASCII SQLite LIKE semantics. */
export function hearthstoneRegexUnsafe(request: QueryRequest, allText = false): SQL {
  const unsafe = regexCommands(request.filter, allText).flatMap<SQL>(command => command.commandId === 'set'
    ? [nonAscii(SearchCard.set)]
    : command.commandId === 'raw'
      ? [
        nonAscii(SearchCardLocalization.name),
        nonAscii(SearchCardLocalization.text),
        sql`EXISTS (
          SELECT 1 FROM json_each(${SearchCardLocalization.searchTerms}) AS search_term
          WHERE ${nonAscii(sql`search_term.value`)}
        )`,
      ]
      : [nonAscii(command.commandId === 'name' ? SearchCardLocalization.name : SearchCardLocalization.text)]);
  return unsafe.length === 0 ? sql`0` : or(...unsafe)!;
}
