import { cs as create } from '#search/server/command';

import * as builtin from '#search/server/command/builtin';

import { QueryError } from '#search/command/error';

import { and, asc, desc, eq, inArray, not, notInArray, or, sql } from 'drizzle-orm';

import { model } from '#model/hearthstone/search';
import { classes as classSchema, types as typeSchema } from '#model/hearthstone/schema/basic';
import { CardEntityView } from '#schema/shared/hearthstone/entity';
import { TAG_SLUG, TAG_ID } from '#model/hearthstone/constant/tag';

function classOrderCase(column: ReturnType<typeof sql>) {
  const whenClauses = classSchema.options
    .map((c, i) => `WHEN '${c}' THEN ${i}`)
    .join(' ');

  return sql`CASE ${column} ${sql.raw(whenClauses)} ELSE 99 END`;
}

function typeOrderCase(column: typeof CardEntityView.type) {
  const whenClauses = typeSchema.options
    .flatMap((t, i) => t === 'null' ? [] : `WHEN '${t}' THEN ${i}`)
    .join(' ');

  return sql`CASE ${column} ${sql.raw(whenClauses)} ELSE 99 END`;
}

const cs = create
  .with(model)
  .table([CardEntityView])
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
  .handler(({ value }, { table }) => {
    return or(
      builtin.text.call({
        column: table => table.localization.name,
        args:   { value, operator: ':', qualifier: [] },
        ctx:    { meta: { multiline: false, caseSensitive: false }, table },
      }),
      builtin.text.call({
        column: table => table.localization.text,
        args:   { value, operator: ':', qualifier: [] },
        ctx:    { meta: { multiline: true, caseSensitive: false }, table },
      }),
      builtin.text.call({
        column: table => table.localization.displayText,
        args:   { value, operator: ':', qualifier: [] },
        ctx:    { meta: { multiline: true, caseSensitive: false }, table },
      }),
    )!;
  });

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
  .handler(({ value, operator, qualifier }, { table }) => {
    return matchText(
      qualifier,
      builtin.text.call({
        column: table => table.localization.text,
        args:   { value, operator, qualifier },
        ctx:    { meta: { multiline: true, caseSensitive: false }, table },
      }),
      builtin.text.call({
        column: table => table.localization.displayText,
        args:   { value, operator, qualifier },
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

    return sorter;
  });
