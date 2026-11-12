import { planRegexCoverage, regexRequest } from '#search/server/regex';
import { isNodeSqliteD1Binding } from '#search/server/node-sqlite-d1';
import { and, asc, eq, getColumns, gte, inArray, ne, sql } from 'drizzle-orm';
import type { SQL, SQLWrapper } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';

import {
  SearchCard,
  SearchCardLegality,
  SearchCardLocalization,
  SearchCardValue,
  SearchMeta,
} from '@tcg-cards/db/schema/sqlite/hearthstone';
import * as schema from '@tcg-cards/db/schema/sqlite/hearthstone';
import { classes, locale, types } from '@tcg-cards/model/hearthstone/schema/basic';
import { essentialCardSearchItem } from '@tcg-cards/model/hearthstone/schema/search';
import type { EssentialNormalResult } from '@tcg-cards/model/hearthstone/schema/search';
import type { CoveragePlan, DatasetDescriptor, QueryRequest, SearchAdapter } from '#search/logical';
import { AMBITS, detectAmbit } from '#search/ambit';
import type { SearchOption } from '../action';
import { detectVariant, hasLanguageCommand } from '../context';
import { getHearthstoneSearchDataset, HearthstonePgEssentialSearchAdapter } from '../accelerated-adapter';
import {
  ambitRank,
  compileHearthstoneD1Filter,
  findHearthstoneD1Gap,
  hearthstoneD1Descriptor,
  textCaseFields,
  hearthstoneRegexUnsafe,
} from './query';
import type { SearchDrizzle } from './types';
import { compileOrder } from './order';

/** Falls back to the existing PG essential path when D1 is unavailable or incompatible. */
type OriginalReader = (
  request: QueryRequest,
  options: SearchOption,
) => Promise<EssentialNormalResult>;

/** Executes covered latest searches in one D1 statement and returns essential list fields directly. */
export class HearthstoneD1EssentialSearchAdapter implements SearchAdapter<
  EssentialNormalResult,
  SearchOption
> {
  /** Keeps fallback execution on the existing version-aware PostgreSQL path. */
  constructor(private readonly original: OriginalReader) {}

  /** Describes the capabilities shared with the SQLite compiler. */
  descriptor(): DatasetDescriptor {
    return hearthstoneD1Descriptor();
  }

  /** Requires a ready latest dataset and complete coverage before choosing D1. */
  plan(request: QueryRequest): CoveragePlan {
    if (getHearthstoneSearchDataset() == null) {
      return {
        type:   'original',
        reason: [
          { kind: 'result', field: 'dataset', detail: 'The latest search dataset is not ready.' },
        ],
      };
    }
    return planRegexCoverage(request, this.descriptor(), findHearthstoneD1Gap, ['raw', 'name', 'text']);
  }

  /** Validates the same snapshot before and after its one-statement list read. */
  async execute(request: QueryRequest, options: SearchOption): Promise<EssentialNormalResult> {
    if (this.plan(request).type === 'candidate') {
      return this.executeCandidates(request, options);
    }
    const dataset = getHearthstoneSearchDataset();
    if (options.d1 == null || dataset == null || this.plan(request).type !== 'exact') {
      return this.original(request, options);
    }
    const localDatabase = isNodeSqliteD1Binding(options.d1);
    const started = performance.now();
    try {
      const db = drizzle(options.d1, { schema });
      const rows = await queryPage(db, regexRequest(request), options);
      const metadata = rows[0];
      const current = getHearthstoneSearchDataset();
      if (
        metadata == null
        || metadata.ready !== '1'
        || metadata.caseSafe !== '1'
        || Number(metadata.regexSafe) !== 1
        || metadata.sortVersion !== '1'
        || metadata.dataVersion !== dataset.dataVersion
        || (!localDatabase && (dataset.manifest.releaseHash == null
          || metadata.releaseHash !== dataset.manifest.releaseHash))
        || Number(metadata.buildNumber) !== dataset.buildNumber
        || current?.dataVersion !== dataset.dataVersion
        || current?.manifest.releaseHash !== dataset.manifest.releaseHash
        || current.buildNumber !== dataset.buildNumber
      ) {
        return this.original(request, options);
      }
      const result = rows.flatMap(row =>
        row.item == null ? [] : [essentialCardSearchItem.parse(JSON.parse(row.item))],
      );
      const total = Number(metadata.total);
      return {
        result,
        total,
        page:      options.page,
        totalPage: Math.ceil(total / options.pageSize),
        elapsed:   Math.round(performance.now() - started),
        ambit:     AMBITS[Number(metadata.landing)]!,
        variant:   await detectVariant(options.dsl),
      };
    } catch (error) {
      console.warn('[search:d1] Hearthstone D1 search unavailable; using PostgreSQL.', error);
    }
    return this.original(request, options);
  }

  /** Reads the whole candidate set and delegates exact result shaping to PostgreSQL. */
  async executeCandidates(request: QueryRequest, options: SearchOption): Promise<EssentialNormalResult> {
    const plan = this.plan(request);
    const dataset = getHearthstoneSearchDataset();
    const pg = new HearthstonePgEssentialSearchAdapter(this.original);
    if (plan.type !== 'candidate' || options.d1 == null || dataset == null || pg.plan(request).type !== 'exact') {
      return this.original(request, options);
    }
    const localDatabase = isNodeSqliteD1Binding(options.d1);
    let ids: string[];
    try {
      const db = drizzle(options.d1, { schema });
      const candidate = { ...request, filter: plan.candidate };
      const selection = db.selectDistinct({ cardId: SearchCard.cardId }).from(SearchCard)
        .innerJoin(SearchCardLocalization, eq(SearchCard.cardId, SearchCardLocalization.cardId));
      const rows = await db.select({
        dataVersion: sql<string>`(SELECT value FROM ${SearchMeta} WHERE key = 'data_version')`,
        buildNumber: sql<string>`(SELECT value FROM ${SearchMeta} WHERE key = 'build_number')`,
        releaseHash: sql<string>`(SELECT value FROM ${SearchMeta} WHERE key = 'release_hash')`,
        ready:       sql<string>`(SELECT value FROM ${SearchMeta} WHERE key = 'ready')`,
        safe:        sql<number>`NOT EXISTS ${selection.where(hearthstoneRegexUnsafe(candidate, true))}`,
        ids:         sql<string>`(SELECT json_group_array(card_id) FROM (${db.selectDistinct({ cardId: SearchCard.cardId })
          .from(SearchCard).innerJoin(SearchCardLocalization, eq(SearchCard.cardId, SearchCardLocalization.cardId))
          .where(compileHearthstoneD1Filter(plan.candidate, db))}))`,
      }).from(SearchMeta).limit(1);
      const row = rows[0];
      if (row?.dataVersion !== dataset.dataVersion || Number(row.buildNumber) !== dataset.buildNumber
        || (!localDatabase && (dataset.manifest.releaseHash == null
          || row.releaseHash !== dataset.manifest.releaseHash))
        || row.ready !== '1' || Number(row.safe) !== 1
        || getHearthstoneSearchDataset()?.dataVersion !== dataset.dataVersion
        || getHearthstoneSearchDataset()?.manifest.releaseHash !== dataset.manifest.releaseHash) {
        return this.original(request, options);
      }
      ids = JSON.parse(row.ids) as string[];
    } catch (error) {
      console.warn('[search:d1] Hearthstone regex candidates unavailable; using PostgreSQL.', error);
      return this.original(request, options);
    }
    const result = await pg.execute(request, options, ids);
    const current = getHearthstoneSearchDataset();
    return current?.dataVersion === dataset.dataVersion
      && current.manifest.releaseHash === dataset.manifest.releaseHash
      && current.buildNumber === dataset.buildNumber
      ? result
      : this.original(request, options);
  }
}

/** Aggregates one ordered array while preserving the source NULL/empty distinction. */
function arraySql(
  db: SearchDrizzle,
  field: 'classes' | 'rune' | 'race' | 'raceBucket',
  count: SQLWrapper,
): SQL {
  const values = db
    .select({ value: SearchCardValue.value })
    .from(SearchCardValue)
    .where(and(eq(SearchCardValue.cardId, SearchCard.cardId), eq(SearchCardValue.field, field)))
    .orderBy(asc(SearchCardValue.position));
  return sql`CASE WHEN ${count} IS NULL THEN NULL ELSE (SELECT json_group_array(value) FROM (${values})) END`;
}

/** Builds the public list object; simpleTags is copied solely for image rendering. */
function itemSql(db: SearchDrizzle): SQL<string> {
  const {
    classCount,
    runeCount,
    raceCount,
    raceBucketCount,
    simpleTags,
    idOrder: _idOrder,
    setOrder: _setOrder,
    ...columns
  } = getColumns(SearchCard);
  const booleanKeys = new Set(['collectible', 'elite', 'inBobsTavern']);
  const pairs = Object.entries(columns).flatMap(([key, column]) => [
    sql`${key}`,
    booleanKeys.has(key)
      ? sql`json(CASE WHEN ${column} THEN 'true' ELSE 'false' END)`
      : sql`${column}`,
  ]);
  const legalities = db
    .select({
      value: sql`json_group_object(${SearchCardLegality.format}, ${SearchCardLegality.status})`,
    })
    .from(SearchCardLegality)
    .where(eq(SearchCardLegality.cardId, SearchCard.cardId));
  return sql<string>`json_object(${sql.join(pairs, sql`, `)},
    'classes', json(${arraySql(db, 'classes', classCount)}),
    'rune', json(${arraySql(db, 'rune', runeCount)}),
    'race', json(${arraySql(db, 'race', raceCount)}),
    'raceBucket', json(${arraySql(db, 'raceBucket', raceBucketCount)}),
    'legalities', json((${legalities})),
    'simpleTags', json(${simpleTags}),
    'lang', ${SearchCardLocalization.lang},
    'renderHash', ${SearchCardLocalization.renderHash},
    'localization', json_object(
      'name', ${SearchCardLocalization.name},
      'text', ${SearchCardLocalization.text},
      'searchTerms', json(${SearchCardLocalization.searchTerms})
    ))`;
}

/** Selects language, ambit, page, total, and version metadata in one snapshot statement. */
function queryPage(db: SearchDrizzle, request: QueryRequest, options: SearchOption) {
  const scope = hasLanguageCommand(options.dsl) ? 'all' : options.lang;
  const caseKeys = textCaseFields(request.filter).map(
    field => `case_safe:${field}:${field === 'set' ? 'all' : scope}`,
  );
  const checkedKey = caseKeys.length === 0 ? sql`0` : inArray(SearchMeta.key, caseKeys);
  const metadata = db.$with('metadata').as(
    db
      .select({
        dataVersion:
          sql<string>`coalesce(max(case when ${SearchMeta.key} = 'data_version' then ${SearchMeta.value} end), '')`.as(
            'data_version',
          ),
        releaseHash:
          sql<string>`coalesce(max(case when ${SearchMeta.key} = 'release_hash' then ${SearchMeta.value} end), '')`.as(
            'release_hash',
          ),
        buildNumber:
          sql<string>`coalesce(max(case when ${SearchMeta.key} = 'build_number' then ${SearchMeta.value} end), '')`.as(
            'build_number',
          ),
        ready:
          sql<string>`coalesce(max(case when ${SearchMeta.key} = 'ready' then ${SearchMeta.value} end), '')`.as(
            'ready',
          ),
        sortVersion:
          sql<string>`coalesce(max(case when ${SearchMeta.key} = 'sort_version' then ${SearchMeta.value} end), '')`.as(
            'sort_version',
          ),
        regexSafe: sql<number>`NOT EXISTS ${db.select({ id: SearchCard.cardId }).from(SearchCard)
          .innerJoin(SearchCardLocalization, eq(SearchCard.cardId, SearchCardLocalization.cardId))
          .where(hearthstoneRegexUnsafe(request))}`.as('regex_safe'),
        caseSafe: (caseKeys.length === 0
          ? sql<string>`'1'`
          : sql<string>`CASE WHEN count(CASE WHEN ${checkedKey} THEN 1 END) = ${caseKeys.length}
      THEN min(CASE WHEN ${checkedKey} THEN ${SearchMeta.value} END) ELSE '0' END`
        ).as('case_safe'),
      })
      .from(SearchMeta),
  );
  const filtered = db.$with('filtered').as(
    db
      .select({
        cardId:        SearchCard.cardId,
        lang:          SearchCardLocalization.lang,
        idOrder:       SearchCard.idOrder,
        setOrder:      SearchCard.setOrder,
        nameOrder:     SearchCardLocalization.nameOrder,
        type:          SearchCard.type,
        cost:          SearchCard.cost,
        attack:        SearchCard.attack,
        health:        SearchCard.health,
        durability:    SearchCard.durability,
        armor:         SearchCard.armor,
        languageOrder: enumRank(SearchCardLocalization.lang, locale.options).as('language_order'),
        typeOrder:     enumRank(SearchCard.type, types.options).as('type_order'),
        classOrder:    enumRank(
          sql`(${db
            .select({ value: SearchCardValue.value })
            .from(SearchCardValue)
            .where(
              and(
                eq(SearchCardValue.cardId, SearchCard.cardId),
                eq(SearchCardValue.field, 'classes'),
                eq(SearchCardValue.position, 0),
              ),
            )})`,
          classes.options,
        ).as('class_order'),
        level: ambitRank().as('level'),
      })
      .from(SearchCard)
      .innerJoin(SearchCardLocalization, eq(SearchCard.cardId, SearchCardLocalization.cardId))
      .where(
        and(
          compileHearthstoneD1Filter(request.filter, db),
          ne(SearchCard.type, 'enchantment'),
          hasLanguageCommand(options.dsl)
            ? undefined
            : eq(SearchCardLocalization.lang, options.lang),
        ),
      ),
  );
  const { explicit, pinned } = detectAmbit(options.dsl);
  const start = AMBITS.indexOf(options.ambit ?? 'primary');
  const landing = db.$with('landing').as(
    db
      .select({
        level: (pinned != null
          ? sql<number>`coalesce(max(${AMBITS.indexOf(pinned)}), ${AMBITS.indexOf(pinned)})`
          : explicit
            ? sql<number>`coalesce(max(0), 0)`
            : sql<number>`coalesce(min(max(${filtered.level}, ${start})), 2)`
        ).as('landing_level'),
      })
      .from(filtered),
  );
  const visible = db.$with('visible').as(
    db
      .select({
        cardId:        filtered.cardId,
        lang:          filtered.lang,
        idOrder:       filtered.idOrder,
        setOrder:      filtered.setOrder,
        nameOrder:     filtered.nameOrder,
        type:          filtered.type,
        cost:          filtered.cost,
        attack:        filtered.attack,
        health:        filtered.health,
        durability:    filtered.durability,
        armor:         filtered.armor,
        languageOrder: filtered.languageOrder,
        typeOrder:     filtered.typeOrder,
        classOrder:    filtered.classOrder,
      })
      .from(filtered)
      .crossJoin(landing)
      .where(pinned != null ? sql`1 = 1` : gte(landing.level, filtered.level)),
  );
  const sorter = compileOrder(request, visible);
  const page = db.$with('page').as(
    db
      .select({
        cardId:   visible.cardId,
        lang:     visible.lang,
        position: sql<number>`row_number() over (order by ${sql.join(sorter, sql`, `)})`.as(
          'position',
        ),
      })
      .from(visible)
      .orderBy(...sorter)
      .limit(options.pageSize)
      .offset((options.page - 1) * options.pageSize),
  );
  const total = db
    .$with('total')
    .as(db.select({ total: sql<number>`count(*)`.as('total') }).from(visible));
  return (
    db
      .with(metadata, filtered, landing, visible, page, total)
      .select({
        dataVersion: metadata.dataVersion,
        releaseHash: metadata.releaseHash,
        buildNumber: metadata.buildNumber,
        ready:       metadata.ready,
        sortVersion: metadata.sortVersion,
        caseSafe:    metadata.caseSafe,
        regexSafe:   metadata.regexSafe,
        landing:     landing.level,
        total:       total.total,
        item:        sql<
          string | null
        >`CASE WHEN ${page.cardId} IS NULL THEN NULL ELSE ${itemSql(db)} END`,
      })
      .from(metadata)
      .crossJoin(landing)
      .crossJoin(total)
      .leftJoin(page, sql`1 = 1`)
      // Materialize display arrays and JSON only for the selected page, not the entire result set.
      .leftJoin(SearchCard, eq(SearchCard.cardId, page.cardId))
      .leftJoin(
        SearchCardLocalization,
        and(
          eq(SearchCardLocalization.cardId, page.cardId),
          eq(SearchCardLocalization.lang, page.lang),
        ),
      )
      .orderBy(asc(page.position))
  );
}

/** Maps trusted model enum literals to the same fixed business order used by PostgreSQL. */
function enumRank(column: SQLWrapper, values: readonly string[]): SQL<number> {
  // These literals come only from the static model, avoiding dozens of repeated D1 bind parameters.
  const clauses = values
    .flatMap((value, rank) => (value === 'null' ? [] : [`WHEN '${value}' THEN ${rank}`]))
    .join(' ');
  return sql<number>`CASE ${column} ${sql.raw(clauses)} ELSE 99 END`;
}
