import { cs as create } from '#search/server/command';

import * as builtin from '#search/server/command/builtin';

import { QueryError } from '#search/command/error';
import { parseAmbitValue } from '#search/server/ambit';

import { and, asc, desc, eq, inArray, isNotNull, not, notInArray, or, sql } from 'drizzle-orm';
import type { SQLWrapper } from 'drizzle-orm';

import { model } from '#model/hearthstone/search';
import { classes as classSchema, types as typeSchema } from '#model/hearthstone/schema/basic';
import type { Locale } from '#model/hearthstone/schema/basic';
import { BaseEntityLocalization, LatestCardEntityView } from '#schema/shared/hearthstone/entity';
import { TAG_SLUG, TAG_ID } from '#model/hearthstone/constant/tag';
import { matchValueGroups, splitValueGroups } from '#search/server/command/terms';
import { pgRegexSource } from '#search/regex';
import { resolveHearthstoneRawCardTerm } from '../../shared/search/localized-card-terms';

/** Supplies either the search projection field or a correlated domain-localization field. */
type RawSearchTable = {
  cardId:        SQLWrapper;
  lang:          SQLWrapper;
  set:           SQLWrapper;
  type:          SQLWrapper;
  techLevel:     SQLWrapper;
  collectible:   SQLWrapper;
  rune:          SQLWrapper;
  revisionHash?: SQLWrapper;
  simpleTags?:   SQLWrapper;
  mechanics?:    SQLWrapper;
  localization:  { searchTerms?: SQLWrapper };
};

/** Keeps DBF terms private while allowing the raw command to match them in both PG paths. */
function rawSearchTermsColumn(table: RawSearchTable): SQLWrapper {
  if (table.localization.searchTerms != null) {
    return table.localization.searchTerms;
  }
  const revisionFilter = table.revisionHash == null
    ? undefined
    : eq(BaseEntityLocalization.revisionHash, table.revisionHash);
  return sql`(SELECT ${BaseEntityLocalization.searchTerms}
    FROM ${BaseEntityLocalization}
    WHERE ${BaseEntityLocalization.cardId} = ${table.cardId}
      AND ${BaseEntityLocalization.lang} = ${table.lang}
      ${revisionFilter == null ? sql`` : sql`AND ${revisionFilter}`}
      AND ${BaseEntityLocalization.deletedAt} IS NULL
    LIMIT 1)`;
}

/** Matches a literal against one localized DBF term without making empty entries match all cards. */
function rawSearchTermMatch(searchTerms: SQLWrapper, term: string) {
  if (term === '') {
    return sql`FALSE`;
  }
  const escaped = term.replace(/%/g, '\\%').replace(/_/g, '\\_');
  return sql`EXISTS (
    SELECT 1 FROM unnest(${searchTerms}) AS search_term(value)
    WHERE search_term.value ILIKE ${`%${escaped}%`}
  )`;
}

/** Matches a regex against any localized DBF term for raw regular-expression queries. */
function rawSearchTermRegexMatch(searchTerms: SQLWrapper, pattern: RegExp) {
  return sql`EXISTS (
    SELECT 1 FROM unnest(${searchTerms}) AS search_term(value)
    WHERE regexp_like(search_term.value, ${pgRegexSource(pattern.source)}, 'i')
  )`;
}

/** Orders classes by their public model order. */
function classOrderCase(column: ReturnType<typeof sql>) {
  const whenClauses = classSchema.options
    .map((c, i) => `WHEN '${c}' THEN ${i}`)
    .join(' ');

  return sql`CASE ${column} ${sql.raw(whenClauses)} ELSE 99 END`;
}

/** Orders card types by their public model order. */
function typeOrderCase(column: typeof LatestCardEntityView.type) {
  const whenClauses = typeSchema.options
    .flatMap((t, i) => t === 'null' ? [] : `WHEN '${t}' THEN ${i}`)
    .join(' ');

  return sql`CASE ${column} ${sql.raw(whenClauses)} ELSE 99 END`;
}

const cs = create
  .with(model)
  .table([LatestCardEntityView])
  .use({ ...builtin });

const tagSlugToId = Object.fromEntries(
  (Object.keys(TAG_SLUG) as Array<keyof typeof TAG_SLUG>).map(key => [
    TAG_SLUG[key],
    String(TAG_ID[key]),
  ]),
);

const matchText = (
  qualifier: string[],
  ...queries: Array<ReturnType<typeof builtin.text.call>>
) => (!qualifier.includes('!') ? or : and)(...queries)!;

const matchStats = (
  qualifier: string[],
  ...queries: Array<ReturnType<typeof builtin.number.call>>
) => (!qualifier.includes('!') ? and : or)(...queries)!;

export const raw = cs
  .commands.raw
  .handler(({ value, argType }, { table, meta }) => {
    const searchTerms = rawSearchTermsColumn(table as RawSearchTable);
    const searchTermQuery = typeof value === 'string'
      ? matchValueGroups(
        argType === 'id' ? splitValueGroups(value) : [[value]],
        term => rawSearchTermMatch(searchTerms, term),
      )
      : rawSearchTermRegexMatch(searchTerms, value);

    const queries: SQLWrapper[] = [
      builtin.text.call({
        column: table => table.localization.name,
        args:   { value, operator: ':', qualifier: [], argType },
        ctx:    { meta: { multiline: false, caseSensitive: false }, table },
      }),
      builtin.text.call({
        column: table => table.localization.text,
        args:   { value, operator: ':', qualifier: [], argType },
        ctx:    { meta: { multiline: true, caseSensitive: false }, table },
      }),
      searchTermQuery,
    ];

    if (typeof value === 'string' && argType === 'id') {
      const lang = ((meta as { lang?: Locale }).lang ?? 'en') as Locale;
      const cardTerm = resolveHearthstoneRawCardTerm(value, lang);
      if (cardTerm != null) {
        queries.push(rawCardTermMatch(cardTerm, table as RawSearchTable));
      }
    }

    return or(...queries)!;
  });

/** Adds the card-data predicate selected by one exact localized raw term. */
function rawCardTermMatch(
  term: NonNullable<ReturnType<typeof resolveHearthstoneRawCardTerm>>,
  table: RawSearchTable,
): SQLWrapper {
  switch (term) {
  case 'golden':
    return goldenImageEligibility(table);
  case 'diamond':
    return sql`${cardTagColumn(table)} ? ${String(TAG_ID.HAS_DIAMOND)}`;
  case 'signature':
    return sql`${cardTagColumn(table)} ? ${String(TAG_ID.HAS_SIGNATURE)}`;
  case 'whelp':
    return sql`${cardTagColumn(table)} ? ${String(TAG_ID.WHELP)}`;
  case 'imp':
    return sql`${cardTagColumn(table)} ? ${String(TAG_ID.IMP)}`;
  case 'rune-blood':
    return sql`${table.rune} @> ARRAY['blood']::text[]`;
  case 'rune-frost':
    return sql`${table.rune} @> ARRAY['frost']::text[]`;
  case 'rune-unholy':
    return sql`${table.rune} @> ARRAY['undead']::text[]`;
  }
}

/** Reads only the projected tag data needed by localized raw terms. */
function cardTagColumn(table: RawSearchTable): SQLWrapper {
  const candidate = table as { simpleTags?: SQLWrapper, mechanics?: SQLWrapper };
  const column = candidate.simpleTags ?? candidate.mechanics;
  if (column == null) {
    throw new Error('Localized Hearthstone raw terms require a tag projection.');
  }
  return column;
}

/** Mirrors the card-image selector's golden eligibility for the chosen result template. */
function goldenImageEligibility(table: RawSearchTable): SQLWrapper {
  const resultUsesBattlegroundsTemplate = or(
    eq(table.set, 'bgs'),
    inArray(table.type, ['trinket', 'anomaly']),
    and(isNotNull(table.techLevel), eq(table.collectible, false)),
  )!;
  const gameHasBattlegroundsTemplate = or(eq(table.set, 'bgs'), isNotNull(table.techLevel))!;
  const premium = enabledCardTag(table, TAG_ID.PREMIUM);

  return or(
    and(resultUsesBattlegroundsTemplate, gameHasBattlegroundsTemplate, premium),
    and(
      not(resultUsesBattlegroundsTemplate),
      notInArray(table.type, ['mercenary_ability', 'enchantment']),
    ),
  )!;
}

/** Treats numeric zero and boolean false like the card-image eligibility helper. */
function enabledCardTag(table: RawSearchTable, tagId: number): SQLWrapper {
  const value = sql`${cardTagColumn(table)} -> ${String(tagId)}`;
  return sql`CASE jsonb_typeof(${value})
    WHEN 'boolean' THEN ${value} = 'true'::jsonb
    WHEN 'number' THEN (${value} #>> '{}')::numeric <> 0
    ELSE FALSE
  END`;
}

export const fullStats = cs
  .commands.fullStats
  .handler(({ pattern, operator, qualifier }, { table }) => {
    const realOperator = operator === '' ? '=' : operator;

    return matchStats(
      qualifier,
      builtin.number.call({
        column: table => table.cost,
        args:   { value: pattern?.cost ?? '', operator: realOperator, qualifier },
        ctx:    { meta: { allowFloat: false }, table },
      }),
      builtin.number.call({
        column: table => table.attack,
        args:   { value: pattern?.attack ?? '', operator: realOperator, qualifier },
        ctx:    { meta: { allowFloat: false }, table },
      }),
      builtin.number.call({
        column: table => table.health,
        args:   { value: pattern?.health ?? '', operator: realOperator, qualifier },
        ctx:    { meta: { allowFloat: false }, table },
      }),
    );
  });

export const stats = cs
  .commands.stats
  .handler(({ pattern, operator, qualifier }, { table }) => {
    const realOperator = operator === '' ? '=' : operator;

    return matchStats(
      qualifier,
      builtin.number.call({
        column: table => table.attack,
        args:   { value: pattern?.attack ?? '', operator: realOperator, qualifier },
        ctx:    { meta: { allowFloat: false }, table },
      }),
      builtin.number.call({
        column: table => table.health,
        args:   { value: pattern?.health ?? '', operator: realOperator, qualifier },
        ctx:    { meta: { allowFloat: false }, table },
      }),
    );
  });

export const hash = cs
  .commands.hash
  .handler(({ value, pattern, qualifier }, { table }) => {
    const tag = tagSlugToId[pattern?.tag ?? value] ?? (pattern?.tag ?? value);

    if (!qualifier.includes('!')) {
      return or(
        sql`${table.mechanics} ? ${tag}`,
        sql`${table.referencedTags} ? ${tag}`,
      )!;
    }

    return and(
      not(sql`${table.mechanics} ? ${tag}`),
      not(sql`${table.referencedTags} ? ${tag}`),
    )!;
  });

export const lang = cs
  .commands.lang
  .apply(table => table.lang, {});

export const name = cs
  .commands.name
  .apply(table => table.localization.name, {
    multiline:     false,
    caseSensitive: false,
  });

export const text = cs
  .commands.text
  .handler(({ value, operator, qualifier, argType }, { table }) => {
    return matchText(
      qualifier,
      builtin.text.call({
        column: table => table.localization.text,
        args:   { value, operator, qualifier, argType },
        ctx:    { meta: { multiline: true, caseSensitive: false }, table },
      }),
    );
  });

export const flavorText = cs
  .commands.flavorText
  .apply(table => table.localization.flavorText, {
    multiline:     true,
    caseSensitive: false,
  });

export const set = cs
  .commands.set
  .handler(({ value, operator, qualifier }, { table }) => {
    const column = sql<string>`lower(${table.set})`;
    const values = value.split(',').map(v => v.toLowerCase());

    switch (operator) {
    case ':':
      return !qualifier.includes('!')
        ? inArray(column, values)
        : notInArray(column, values);
    case '=':
      return !qualifier.includes('!')
        ? eq(column, value.toLowerCase())
        : not(eq(column, value.toLowerCase()));
    default:
      throw new QueryError({ type: 'invalid-query' });
    }
  });

export const classes = cs
  .commands.classes
  .apply(table => table.classes, {});

export const type = cs
  .commands.type
  .apply(table => table.type, {});

export const cost = cs
  .commands.cost
  .apply(table => table.cost, { allowFloat: false });

export const attack = cs
  .commands.attack
  .apply(table => table.attack, { allowFloat: false });

export const health = cs
  .commands.health
  .apply(table => table.health, { allowFloat: false });

export const durability = cs
  .commands.durability
  .apply(table => table.durability, { allowFloat: false });

export const armor = cs
  .commands.armor
  .apply(table => table.armor, { allowFloat: false });

export const rune = cs
  .commands.rune
  .apply(table => table.rune, {});

export const race = cs
  .commands.race
  .apply(table => table.race, {});

export const spellSchool = cs
  .commands.spellSchool
  .apply(table => table.spellSchool, {});

export const techLevel = cs
  .commands.techLevel
  .apply(table => table.techLevel, { allowFloat: false });

export const raceBucket = cs
  .commands.raceBucket
  .apply(table => table.raceBucket, {});

export const mercenaryRole = cs
  .commands.mercenaryRole
  .apply(table => table.mercenaryRole, {});

const factionTags = ['grimy_goons', 'jade_lotus', 'kabal', 'zerg', 'human', 'protoss'];

const normalizeFaction = (value: string) => value === 'terran' ? 'human' : value;

const getFactionValues = (value: string) => {
  const faction = normalizeFaction(value.toLowerCase());
  return faction === 'all' ? factionTags : [faction];
};

export const faction = cs
  .commands.faction
  .handler(({ value, qualifier }, { table }) => {
    const values = getFactionValues(value);

    if (!qualifier.includes('!')) {
      return or(...values.map(faction => or(
        sql`${table.mechanics} ? ${faction}`,
        sql`${table.referencedTags} ? ${faction}`,
      )!))!;
    }

    return and(...values.map(faction => and(
      not(sql`${table.mechanics} ? ${faction}`),
      not(sql`${table.referencedTags} ? ${faction}`),
    )!))!;
  });

export const mercenaryFaction = cs
  .commands.mercenaryFaction
  .apply(table => table.mercenaryFaction, {});

export const rarity = cs
  .commands.rarity
  .apply(table => table.rarity, {});

export const artist = cs
  .commands.artist
  .apply(table => table.artist, {
    multiline:     false,
    caseSensitive: false,
  });

export const collectible = cs
  .commands.collectible
  .handler(({ value }, { table }) => {
    switch (value.toLowerCase()) {
    case 'true':
      return eq(table.collectible, true);
    case 'false':
      return eq(table.collectible, false);
    case 'all':
      return sql`true`;
    default:
      throw new QueryError({ type: 'invalid-query' });
    }
  });

/** Validates explicit boolean values without adding collectible's all sentinel. */
function booleanValue(value: string, qualifier: string[]): boolean {
  switch (value.toLowerCase()) {
  case 'true':
    return !qualifier.includes('!');
  case 'false':
    return qualifier.includes('!');
  default:
    throw new QueryError({ type: 'invalid-query' });
  }
}

export const elite = cs.commands.elite
  .handler(({ value, qualifier }, { table }) => eq(table.elite, booleanValue(value, qualifier)));

export const inTavern = cs.commands.inTavern
  .handler(({ value, qualifier }, { table }) => eq(table.inBobsTavern, booleanValue(value, qualifier)));

export const cooldown = cs.commands.cooldown
  .apply(table => table.colddown, { allowFloat: false });

export const ambit = cs
  .commands.ambit
  .handler(({ value, operator }, { table }) => {
    // `:` is the ceiling, a legacy alias of `<=` (ADR 0015).
    const comparison = ({ ':': '<=', '<=': '<=', '<': '<', '=': '=', '>': '>', '>=': '>=' } as Record<string, string>)[operator];

    if (comparison == null) {
      throw new QueryError({ type: 'invalid-operator', payload: { operator } });
    }

    return sql`${table.ambit} ${sql.raw(comparison)} ${parseAmbitValue(value)}`;
  });

export const change = cs
  .commands.change
  .handler(({ value }, { table }) => {
    return or(
      eq(table.changeType, value as any),
      eq(table.localization.locChangeType, value as any),
    )!;
  });

export const format = cs
  .commands.format
  .handler(({ value, qualifier }, { table }) => {
    if (value.includes('=')) {
      const [formatName, status] = value.split('=');

      if (formatName == null || status == null) {
        throw new QueryError({ type: 'invalid-query' });
      }

      if (!qualifier.includes('!')) {
        return eq(sql`${table.legalities} ->> ${formatName}`, status);
      }

      return not(eq(sql`${table.legalities} ->> ${formatName}`, status));
    }

    if (!qualifier.includes('!')) {
      return inArray(sql`${table.legalities} ->> ${value}`, ['derived', 'legal', 'minor']);
    }

    return notInArray(sql`${table.legalities} ->> ${value}`, ['derived', 'legal', 'minor']);
  });

export const order = cs
  .commands.order
  .action('order-by', ({ value }, { table }) => {
    const parts = value.toLowerCase().split(',').map(v => {
      if (v.endsWith('+')) {
        return { type: v.slice(0, -1), dir: 1 as const };
      }

      if (v.endsWith('-')) {
        return { type: v.slice(0, -1), dir: -1 as const };
      }

      return { type: v, dir: 1 as const };
    });

    const sorter = [];

    for (const { type, dir } of parts) {
      const sort = dir === 1 ? asc : desc;

      switch (type) {
      case 'name':
        sorter.push(sort(table.localization.name));
        break;
      case 'type':
        sorter.push(sort(typeOrderCase(table.type)));
        sorter.push(asc(table.localization.name));
        break;
      case 'class':
        sorter.push(sort(classOrderCase(sql`${table.classes}[1]`)));
        sorter.push(asc(table.localization.name));
        break;
      case 'cost':
        sorter.push(sort(table.cost));
        sorter.push(asc(table.localization.name));
        break;
      case 'attack':
        sorter.push(sort(table.attack));
        sorter.push(asc(table.localization.name));
        break;
      case 'health':
        sorter.push(sort(table.health));
        sorter.push(asc(table.localization.name));
        break;
      case 'stats': {
        const secondStat = sql`COALESCE(${table.health}, ${table.durability}, ${table.armor}, 0)`;
        const sumExpr = sql`CASE WHEN ${table.type} = 'hero'
          THEN NULL
          ELSE (${table.attack} + ${secondStat})
        END`;
        const nullsLast = (e: ReturnType<typeof sql>) =>
          dir === 1 ? sql`${e} ASC NULLS LAST` : sql`${e} DESC NULLS LAST`;
        sorter.push(nullsLast(sumExpr));
        sorter.push(nullsLast(sql`${table.attack}`));
        sorter.push(asc(table.localization.name));
        break;
      }
      case 'set':
        sorter.push(sort(table.set));
        sorter.push(asc(table.localization.name));
        break;
      case 'artist':
        sorter.push(sort(table.artist));
        sorter.push(asc(table.localization.name));
        break;
      case 'id':
        sorter.push(sort(table.cardId));
        break;
      default:
        throw new QueryError({ type: 'invalid-query' });
      }
    }

    // Deterministic tail keys: tied sort values (e.g. identical names) get a
    // stable total order, so pagination cannot shuffle rows between requests.
    if (!parts.some(({ type }) => type === 'id')) {
      sorter.push(asc(table.cardId));
    }
    sorter.push(asc(table.lang));
    // Essential rows have one identity per language and do not store revision hashes.
    if (table.revisionHash != null) {
      sorter.push(asc(table.revisionHash), asc(table.localizationHash));
    }

    return sorter;
  });
