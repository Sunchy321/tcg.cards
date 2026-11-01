import { planRegexCoverage, regexRequest } from '#search/server/regex';
import { and, asc, desc, eq, lte, sql } from 'drizzle-orm';
import type { SQL, SQLWrapper } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';

import type { EssentialCardSearchItem, EssentialNormalResult, NormalResult } from '@tcg-cards/model/magic/schema/search';
import type { Locale } from '@tcg-cards/model/magic/schema/basic';
import * as magicSearchSchema from '@tcg-cards/db/schema/sqlite/magic';
import type { CoveragePlan, DatasetDescriptor, QueryRequest, SearchAdapter } from '#search/logical';
import type { Ambit } from '#search/ambit';
import { detectAmbit } from '#search/ambit';
import { searchWithAmbitCeiling } from '#search/server/ambit';
import { getMagicSearchManifest, loadMagicSearchDetails, magicPgSearchAdapter } from '../accelerated-adapter';
import type { MagicSearchCandidate, MagicSearchOptions } from '../accelerated-adapter';
import { compileMagicD1Filter, findMagicD1Gap, magicD1Descriptor, magicRegexUnsafe } from './query';
import type { MagicSearchDrizzle } from './types';

/** Represents one D1 result row before nullable left-join fields are validated. */
type D1CandidateRow = {
  regexSafe:          number;
  dataVersion:        string;
  total:              number | string;
  cardId:             string | null;
  version:            string | null;
  partIndex:          number | null;
  locale:             string | null;
  localizationSource: string | null;
  name:               string | null;
  rubyName:           string | null;
  setCode:            string | null;
  number:             string | null;
  printLang:          string | null;
  printSource:        string | null;
  releaseDate:        string | null;
  layout:             string | null;
  imageType:          string | null;
  imageStatus:        string | null;
  manaValue:          number | null;
  position:           number | null;
};

/** Carries one D1 page and the data version used to produce it. */
type D1QueryPage = {
  dataVersion: string;
  total:       number;
  candidates:  MagicSearchCandidate[];
};

/** Adds the ambit ceiling selected for the returned candidate page. */
type D1Page = D1QueryPage & {
  ambit: Ambit;
};

/** Keeps only the options required to compile one candidate page. */
type PageOptions = Pick<MagicSearchOptions, 'page' | 'pageSize' | 'lang' | 'orderBy'>;

const descriptor = magicD1Descriptor();

/** Executes an exact Magic search from D1, then batch-loads PG card details. */
export class MagicD1SearchAdapter implements SearchAdapter<NormalResult, MagicSearchOptions> {
  descriptor(): DatasetDescriptor {
    return descriptor;
  }

  plan(request: QueryRequest): CoveragePlan {
    const plan = planRegexCoverage(request, this.descriptor(),
      checked => findMagicD1Gap(checked, this.descriptor()), ['name', 'text', 'oracle']);
    return plan.type === 'candidate' && magicPgSearchAdapter.plan(request).type !== 'exact'
      ? { type: 'original', reason: plan.uncovered }
      : plan;
  }

  async execute(request: QueryRequest, options: MagicSearchOptions): Promise<NormalResult> {
    if (this.plan(request).type === 'candidate') {
      return this.executeCandidates(request, options);
    }
    const startedAt = performance.now();
    const page = await this.searchD1(request, options);
    if (page == null) {
      return magicPgSearchAdapter.execute(request, options);
    }

    const details = await loadMagicSearchDetails(page.candidates, options.lang);
    if (getMagicSearchManifest()?.dataVersion !== page.dataVersion) {
      return magicPgSearchAdapter.execute(request, options);
    }

    const detailsByCardId = new Map(details.map(row => [row.cardId, row]));
    const rows = page.candidates.map(candidate => detailsByCardId.get(candidate.cardId));

    if (rows.some(row => row == null)) {
      console.warn('[search:d1] A candidate has no matching PG detail row; using PostgreSQL.');
      return magicPgSearchAdapter.execute(request, options);
    }

    return {
      result:    rows as NonNullable<(typeof rows)[number]>[],
      total:     page.total,
      page:      options.page,
      totalPage: Math.ceil(page.total / options.pageSize),
      elapsed:   Math.round(performance.now() - startedAt),
      ambit:     page.ambit,
    };
  }

  async executeEssential(request: QueryRequest, options: MagicSearchOptions): Promise<EssentialNormalResult> {
    if (this.plan(request).type === 'candidate') {
      return this.executeEssentialCandidates(request, options);
    }
    const startedAt = performance.now();
    const page = await this.searchD1(request, options);
    if (page == null) {
      return magicPgSearchAdapter.executeEssential(request, options);
    }
    if (getMagicSearchManifest()?.dataVersion !== page.dataVersion) {
      return magicPgSearchAdapter.executeEssential(request, options);
    }

    const result: EssentialCardSearchItem[] = page.candidates.map(candidate => ({
      cardId:               candidate.cardId,
      version:              candidate.version,
      locale:               candidate.locale,
      source:               candidate.localizationSource,
      set:                  candidate.print.set,
      number:               candidate.print.number,
      lang:                 candidate.print.lang,
      partIndex:            candidate.partIndex,
      cardPartLocalization: {
        name:     candidate.name,
        rubyName: candidate.rubyName,
      },
      print: {
        layout:      candidate.print.layout,
        imageType:   candidate.print.imageType,
        imageStatus: candidate.print.imageStatus,
      },
    }));

    return {
      result,
      total:     page.total,
      page:      options.page,
      totalPage: Math.ceil(page.total / options.pageSize),
      elapsed:   Math.round(performance.now() - startedAt),
      ambit:     page.ambit,
    };
  }

  /** Reads all safe cards, then lets PG verify the untouched query before pagination and ambit. */
  async executeCandidates(request: QueryRequest, options: MagicSearchOptions): Promise<NormalResult> {
    const candidates = await this.candidateIds(request, options);
    if (candidates == null || getMagicSearchManifest()?.dataVersion !== candidates.dataVersion) {
      return magicPgSearchAdapter.execute(request, options);
    }
    const version = candidates.dataVersion;
    const result = await magicPgSearchAdapter.execute(request, options, candidates.cardIds);
    return getMagicSearchManifest()?.dataVersion === version
      ? result
      : magicPgSearchAdapter.execute(request, options);
  }

  /** Preserves the compact result contract while PG verifies the entire candidate set. */
  async executeEssentialCandidates(request: QueryRequest, options: MagicSearchOptions): Promise<EssentialNormalResult> {
    const candidates = await this.candidateIds(request, options);
    if (candidates == null || getMagicSearchManifest()?.dataVersion !== candidates.dataVersion) {
      return magicPgSearchAdapter.executeEssential(request, options);
    }
    const version = candidates.dataVersion;
    const result = await magicPgSearchAdapter.executeEssential(request, options, candidates.cardIds);
    return getMagicSearchManifest()?.dataVersion === version
      ? result
      : magicPgSearchAdapter.executeEssential(request, options);
  }

  /** Materializes unpaged IDs with version and source-safety evidence from the same D1 statement. */
  private async candidateIds(request: QueryRequest, options: MagicSearchOptions): Promise<{ cardIds: string[], dataVersion: string } | null> {
    const plan = this.plan(request);
    const manifest = getMagicSearchManifest();
    if (plan.type !== 'candidate' || options.d1 == null || manifest == null
      || magicPgSearchAdapter.plan(request).type !== 'exact') {
      return null;
    }
    try {
      const db = drizzle(options.d1, { schema: magicSearchSchema });
      const candidate = { ...request, filter: plan.candidate };
      const rows = await db.select({
        version: sql<string>`(SELECT value FROM ${magicSearchSchema.SearchMeta} WHERE key = 'data_version')`,
        safe:    sql<number>`NOT EXISTS ${magicSource(db).where(magicRegexUnsafe(candidate, db, true))}`,
        ids:     sql<string>`(SELECT json_group_array(card_id) FROM (${magicSource(db, true)
          .where(compileMagicD1Filter(plan.candidate, db))}))`,
      }).from(magicSearchSchema.SearchMeta).limit(1);
      const row = rows[0];
      if (row?.version !== manifest.dataVersion || Number(row.safe) !== 1
        || getMagicSearchManifest()?.dataVersion !== manifest.dataVersion) {
        return null;
      }
      return { cardIds: JSON.parse(row.ids) as string[], dataVersion: manifest.dataVersion };
    } catch (error) {
      console.warn('[search:d1] Magic regex candidates unavailable; using PostgreSQL.', error);
      return null;
    }
  }

  private async searchD1(request: QueryRequest, options: MagicSearchOptions): Promise<D1Page | null> {
    const database = options.d1;
    const manifest = getMagicSearchManifest();
    if (database == null || manifest == null || manifest.dataVersion === '') {
      return null;
    }

    try {
      const db = drizzle(database, { schema: magicSearchSchema });
      if (this.plan(request).type !== 'exact') {
        return null;
      }
      const rewritten = regexRequest(request);
      const filter = compileMagicD1Filter(rewritten.filter, db);
      const { explicit, pinned } = detectAmbit(options.dsl);
      const searched = await searchWithAmbitCeiling({
        pinned,
        explicit,
        start: options.ambit,
        run:   async ceiling => {
          const page = await queryPage(db, filter, options, ceiling, magicRegexUnsafe(rewritten, db));
          if (page.dataVersion !== manifest.dataVersion) {
            throw new Error('D1 Magic search data version does not match the active manifest.');
          }
          return page;
        },
      });

      if (getMagicSearchManifest()?.dataVersion !== manifest.dataVersion) {
        return null;
      }

      return { ...searched.result, ambit: searched.landing };
    } catch (error) {
      console.warn('[search:d1] D1 search unavailable; using PostgreSQL.', error);
      return null;
    }
  }
}

/** Adapts the full D1 search to the existing compact Magic search result. */
export class MagicD1EssentialSearchAdapter implements SearchAdapter<EssentialNormalResult, MagicSearchOptions> {
  constructor(private readonly fullAdapter = new MagicD1SearchAdapter()) {}

  descriptor(): DatasetDescriptor {
    return this.fullAdapter.descriptor();
  }

  plan(request: QueryRequest): CoveragePlan {
    return this.fullAdapter.plan(request);
  }

  execute(request: QueryRequest, options: MagicSearchOptions): Promise<EssentialNormalResult> {
    return this.fullAdapter.executeEssential(request, options);
  }

  /** Delegates unpaged candidate verification to the shared full adapter. */
  executeCandidates(request: QueryRequest, options: MagicSearchOptions): Promise<EssentialNormalResult> {
    return this.fullAdapter.executeEssentialCandidates(request, options);
  }
}

/** Executes one page and total query, preserving the D1 snapshot version. */
async function queryPage(
  db: MagicSearchDrizzle,
  filter: SQL,
  options: PageOptions,
  ceiling: Ambit | null,
  regexUnsafe: SQL,
): Promise<D1QueryPage> {
  const {
    SearchCard,
    SearchCardCandidate,
    SearchCardPart,
    SearchCardPartLocalization,
    SearchMeta,
  } = magicSearchSchema;
  const metadata = db.$with('metadata').as(db.select({
    dataVersion: sql<string>`coalesce(max(case when ${SearchMeta.key} = 'data_version' then ${SearchMeta.value} end), '')`.as('data_version'),
    regexSafe:   sql<number>`NOT EXISTS ${magicSource(db).where(regexUnsafe)}`.as('regex_safe'),
  }).from(SearchMeta));
  const ambitFilter = ceiling == null ? null : lte(ambitRankSql(SearchCard.ambit), ambitRank(ceiling));
  const ranked = db.$with('ranked').as(db.select({
    cardId:             SearchCard.cardId,
    version:            SearchCard.version,
    partIndex:          SearchCardPart.partIndex,
    locale:             SearchCardPartLocalization.locale,
    localizationSource: SearchCardPartLocalization.source,
    name:               SearchCardPartLocalization.name,
    rubyName:           SearchCardPartLocalization.rubyName,
    setCode:            SearchCardCandidate.setCode,
    number:             SearchCardCandidate.number,
    printLang:          SearchCardCandidate.printLang,
    printSource:        SearchCardCandidate.printSource,
    releaseDate:        SearchCardCandidate.releaseDate,
    layout:             SearchCardCandidate.layout,
    imageType:          SearchCardCandidate.imageType,
    imageStatus:        SearchCardCandidate.imageStatus,
    manaValue:          SearchCard.manaValue,
    resultRank:         sql<number>`row_number() over (
      partition by ${SearchCard.cardId}
      order by
        ${SearchCardPart.partIndex},
        case when ${SearchCardPartLocalization.locale} = ${options.lang} then 0 when ${SearchCardPartLocalization.locale} = 'en' then 1 else 2 end,
        case ${SearchCardPartLocalization.source} when 'manual' then 0 when '' then 1 when 'mtgch' then 2 else 3 end,
        ${SearchCardPartLocalization.source}
    )`.as('result_rank'),
  })
    .from(SearchCard)
    .innerJoin(SearchCardPart, and(
      eq(SearchCardPart.cardId, SearchCard.cardId),
      eq(SearchCardPart.version, SearchCard.version),
    ))
    .innerJoin(SearchCardPartLocalization, and(
      eq(SearchCardPartLocalization.cardId, SearchCardPart.cardId),
      eq(SearchCardPartLocalization.version, SearchCardPart.version),
      eq(SearchCardPartLocalization.partIndex, SearchCardPart.partIndex),
    ))
    .innerJoin(SearchCardCandidate, and(
      eq(SearchCardCandidate.cardId, SearchCard.cardId),
      eq(SearchCardCandidate.version, SearchCard.version),
      eq(SearchCardCandidate.requestLocale, options.lang),
    ))
    .where(ambitFilter == null ? filter : and(filter, ambitFilter)));
  const filtered = db.$with('filtered').as(db.select().from(ranked).where(eq(ranked.resultRank, 1)));
  const totals = db.$with('totals').as(db.select({ total: sql<number>`count(*)`.as('total') }).from(filtered));
  const order = d1OrderBy(options.orderBy, filtered);
  const page = db.$with('page').as(db.select({
    cardId:             filtered.cardId,
    version:            filtered.version,
    partIndex:          filtered.partIndex,
    locale:             filtered.locale,
    localizationSource: filtered.localizationSource,
    name:               filtered.name,
    rubyName:           filtered.rubyName,
    setCode:            filtered.setCode,
    number:             filtered.number,
    printLang:          filtered.printLang,
    printSource:        filtered.printSource,
    releaseDate:        filtered.releaseDate,
    layout:             filtered.layout,
    imageType:          filtered.imageType,
    imageStatus:        filtered.imageStatus,
    manaValue:          filtered.manaValue,
    position:           sql<number>`row_number() over (order by ${sql.join(order, sql`, `)})`.as('position'),
  })
    .from(filtered)
    .orderBy(...order)
    .limit(options.pageSize)
    .offset((options.page - 1) * options.pageSize));
  const rows = await db.with(metadata, ranked, filtered, totals, page)
    .select({
      regexSafe:          metadata.regexSafe,
      dataVersion:        metadata.dataVersion,
      total:              totals.total,
      cardId:             page.cardId,
      version:            page.version,
      partIndex:          page.partIndex,
      locale:             page.locale,
      localizationSource: page.localizationSource,
      name:               page.name,
      rubyName:           page.rubyName,
      setCode:            page.setCode,
      number:             page.number,
      printLang:          page.printLang,
      printSource:        page.printSource,
      releaseDate:        page.releaseDate,
      layout:             page.layout,
      imageType:          page.imageType,
      imageStatus:        page.imageStatus,
      manaValue:          page.manaValue,
      position:           page.position,
    })
    .from(metadata)
    .crossJoin(totals)
    .leftJoin(page, sql`true`)
    .orderBy(asc(page.position))
    .all();
  const first = rows[0];
  if (Number(first?.regexSafe) !== 1) {
    throw new Error('Regex sources exceed the proven ASCII case-folding subset.');
  }
  const candidates = rows.flatMap(row => row.cardId == null ? [] : [toCandidate(row)]);

  return {
    dataVersion: first?.dataVersion ?? '',
    total:       Number(first?.total ?? 0),
    candidates,
  };
}

/** Converts one D1 row to the shared PG-detail lookup key. */
function toCandidate(row: D1CandidateRow): MagicSearchCandidate {
  if (
    row.cardId == null || row.version == null || row.partIndex == null || row.locale == null
    || row.localizationSource == null || row.name == null || row.setCode == null
    || row.number == null || row.printLang == null || row.printSource == null
    || row.releaseDate == null || row.layout == null || row.imageType == null || row.imageStatus == null
  ) {
    throw new Error('D1 returned an incomplete Magic search candidate.');
  }

  return {
    cardId:             row.cardId,
    version:            row.version,
    partIndex:          row.partIndex,
    locale:             row.locale as Locale,
    localizationSource: row.localizationSource,
    name:               row.name,
    rubyName:           row.rubyName,
    print:              {
      set:         row.setCode,
      number:      row.number,
      lang:        row.printLang as Locale,
      source:      row.printSource,
      releaseDate: row.releaseDate,
      layout:      row.layout as MagicSearchCandidate['print']['layout'],
      imageType:   row.imageType as MagicSearchCandidate['print']['imageType'],
      imageStatus: row.imageStatus as MagicSearchCandidate['print']['imageStatus'],
    },
  };
}

/** Produces Drizzle sort expressions from the supported public sort fields. */
function d1OrderBy(value: string, columns: {
  cardId:      SQLWrapper;
  setCode:     SQLWrapper;
  number:      SQLWrapper;
  releaseDate: SQLWrapper;
  manaValue:   SQLWrapper;
}): SQL[] {
  const parts = value.toLowerCase().split(',').map(part => ({
    type:      part.endsWith('+') || part.endsWith('-') ? part.slice(0, -1) : part,
    direction: part.endsWith('-') ? 'DESC' as const : 'ASC' as const,
  }));
  const terms: SQL[] = [];
  const numberPrefixLength = sql`(length(${columns.number}) - length(ltrim(${columns.number}, '0123456789')))`;
  const pushNumber = (direction: 'ASC' | 'DESC') => {
    const order = direction === 'DESC' ? desc : asc;
    terms.push(order(columns.setCode));
    terms.push(order(sql`CAST(substr(${columns.number}, 1, ${numberPrefixLength}) AS INTEGER)`));
    terms.push(order(sql`substr(${columns.number}, ${numberPrefixLength} + 1)`));
  };

  for (const part of parts) {
    switch (part.type) {
    case 'id':
      terms.push(part.direction === 'DESC' ? desc(columns.cardId) : asc(columns.cardId));
      break;
    case 'set':
    case 'number':
      pushNumber(part.direction);
      break;
    case 'date':
      terms.push(part.direction === 'DESC' ? desc(columns.releaseDate) : asc(columns.releaseDate));
      break;
    case 'mv':
    case 'cmc':
      terms.push(part.direction === 'DESC' ? desc(columns.manaValue) : asc(columns.manaValue));
      break;
    default:
      throw new Error(`Unsupported D1 Magic sort field: ${part.type}`);
    }
  }

  if (!parts.some(part => part.type === 'id')) {
    terms.push(asc(columns.cardId));
  }
  terms.push(asc(columns.setCode), asc(columns.number));
  return terms;
}

/** Ranks the cumulative ambit values for comparison. */
function ambitRankSql(column: SQLWrapper): SQL<number> {
  return sql<number>`CASE ${column} WHEN 'primary' THEN 0 WHEN 'additional' THEN 1 WHEN 'full' THEN 2 END`;
}

/** Maps an ambit ladder value to its SQLite numeric rank. */
function ambitRank(value: Ambit): number {
  return ({ primary: 0, additional: 1, full: 2 } as Record<Ambit, number>)[value];
}

/** Serves the existing Magic endpoints with exact D1 coverage when available. */
export const magicD1SearchAdapter = new MagicD1SearchAdapter();

/** Serves the existing compact Magic endpoint from the same D1 candidate query. */
export const magicD1EssentialSearchAdapter = new MagicD1EssentialSearchAdapter(magicD1SearchAdapter);

/** Keeps candidate and safety scans on the same unfiltered card/part/localization domain. */
function magicSource(db: MagicSearchDrizzle, distinct = false) {
  const { SearchCard: card, SearchCardPart: part, SearchCardPartLocalization: localization } = magicSearchSchema;
  const query = distinct ? db.selectDistinct({ cardId: card.cardId }) : db.select({ cardId: card.cardId });
  return query.from(card).innerJoin(part, and(eq(part.cardId, card.cardId), eq(part.version, card.version)))
    .innerJoin(localization, and(eq(localization.cardId, part.cardId), eq(localization.version, part.version), eq(localization.partIndex, part.partIndex)));
}
