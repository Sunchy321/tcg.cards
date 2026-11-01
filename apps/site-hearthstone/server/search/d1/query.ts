import { compileRegexCondition, nonAscii, regexCommands } from '#search/server/regex';
import { and, eq, exists, gt, gte, inArray, lt, lte, ne, not, or, sql } from 'drizzle-orm';
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
import { mercenaryFaction, mercenaryRole, rune } from '@tcg-cards/model/hearthstone/schema/entity';

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
import type { CommonServerCommand } from '#search/server/command';
import * as commands from '../command-list';
import type { SearchDrizzle } from './types';
import { hasSupportedOrder } from './order';

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
  return request.filter == null ? null : findNodeGap(request.filter);
}

/** Compiles boolean structure without weakening OR, NOT, or SQL NULL semantics. */
export function compileHearthstoneD1Filter(query: LogicalQuery | null, db: SearchDrizzle): SQL {
  if (query == null) {
    return sql`1 = 1`;
  }
  if (query.kind === 'not') {
    return not(compileHearthstoneD1Filter(query.expr, db));
  }
  if (query.kind === 'and' || query.kind === 'or') {
    const children = query.exprs.map(child => compileHearthstoneD1Filter(child, db));
    return (query.kind === 'and' ? and(...children) : or(...children))!;
  }
  if (query.kind !== 'leaf') {
    throw new Error('Unsupported logical query node.');
  }
  return compileCommand(query.command, db);
}

/** Finds the first literal whose SQLite interpretation is not covered. */
function findNodeGap(query: LogicalQuery): CapabilityGap | null {
  if (query.kind === 'not') {
    return findNodeGap(query.expr);
  }
  if (query.kind === 'and' || query.kind === 'or') {
    for (const child of query.exprs) {
      const gap = findNodeGap(child);
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
    if (
      terms.some(
        term =>
          term.includes('\\')
          || term.includes('\0')
          || [...term].some(char => char.codePointAt(0)! > 127 && /\p{Cased}/u.test(char)),
      )
    ) {
      return gap('The text case-folding or escaping form requires PostgreSQL.');
    }
    if (id !== 'name' && terms.some(term => [...term].length < 3)) {
      return gap('Short body terms cannot use the trigram candidate index.');
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
function compileCommand(command: ResolvedCommand, db: SearchDrizzle): SQL {
  if (command.textCondition != null) {
    const columns = command.commandId === 'name'
      ? [SearchCardLocalization.name]
      : command.commandId === 'text'
        ? [SearchCardLocalization.text]
        : [SearchCardLocalization.name, SearchCardLocalization.text];
    return compileRegexCondition(command, columns);
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
    // The legacy raw handler groups each source independently, then joins with OR.
    return or(
      grouped(term => textMatch(positive, term, false, db)),
      grouped(term => textMatch(positive, term, true, db)),
    )!;
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

/** Uses FTS only for body candidates, then verifies the original field with exact LIKE semantics. */
function textMatch(command: ResolvedCommand, term: string, body: boolean, db: SearchDrizzle): SQL {
  const column = body ? SearchCardLocalization.text : SearchCardLocalization.name;
  const escaped = term.replaceAll('%', '\\%').replaceAll('_', '\\_');
  const literal = command.operator === '=' ? escaped : `%${escaped}%`;
  let match = term === '' ? eq(column, '') : sql`${column} LIKE ${literal} ESCAPE '\\'`;
  if (body) {
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
export function textCaseFields(query: LogicalQuery | null): Array<'name' | 'text' | 'set'> {
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
    ? ['name', 'text']
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
  const columns = regexCommands(request.filter, allText).flatMap<SQLWrapper>(command => command.commandId === 'set'
    ? [SearchCard.set]
    : command.commandId === 'raw'
      ? [SearchCardLocalization.name, SearchCardLocalization.text]
      : [command.commandId === 'name' ? SearchCardLocalization.name : SearchCardLocalization.text]);
  return columns.length === 0 ? sql`0` : or(...columns.map(nonAscii))!;
}
