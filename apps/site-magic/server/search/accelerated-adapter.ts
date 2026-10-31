import { and, eq, isNull, or, sql, getColumns } from 'drizzle-orm';
import { omit } from 'lodash-es';

import type { MagicSearchManifest, MagicSearchCandidatePrint } from '@tcg-cards/model/magic/search/manifest';
import type { Locale } from '@tcg-cards/model/magic/schema/basic';
import type { EssentialCardSearchItem, EssentialNormalResult, NormalResult } from '@tcg-cards/model/magic/schema/search';
import { Card, CardLocalization, CardPart, CardPartLocalization } from '@tcg-cards/db/schema/shared/magic/card';
import { Print, PrintPart } from '@tcg-cards/db/schema/shared/magic/print';
import { SearchCard, SearchCardPart, SearchCardPartLocalization } from '@tcg-cards/db/schema/shared/magic/search';

import type { CapabilityGap, CoveragePlan, DatasetDescriptor, LogicalQuery, QueryRequest, SearchAdapter } from '#search/logical';
import { describeLogicalCommand } from '#search/command/semantics';
import type { CommonServerCommand } from '#search/server/command';
import { compileQueryRequest } from '#search/server/translate';
import { db } from '#db/db';
import { detectAmbit } from '#search/ambit';
import type { Ambit } from '#search/ambit';
import { ambitCeiling, searchWithAmbitCeiling } from '#search/server/ambit';

import * as commands from './command-list';

type SearchOptions = {
  page:     number;
  pageSize: number;
  lang:     Locale;
  groupBy:  string;
  orderBy:  string;
  dsl:      string;
  ambit?:   Ambit;
};

type Candidate = {
  cardId:             string;
  version:            string;
  partIndex:          number;
  locale:             Locale;
  localizationSource: string;
  name:               string;
  rubyName:           string | null;
  print:              MagicSearchCandidatePrint;
};

type ProjectedPage = {
  total:      number;
  candidates: Candidate[];
};

type SearchTable = {
  card:                 typeof SearchCard;
  cardPart:             typeof SearchCardPart;
  cardPartLocalization: typeof SearchCardPartLocalization;
  cardId:               typeof SearchCard.cardId;
  partIndex:            typeof SearchCardPart.partIndex;
  locale:               typeof SearchCardPartLocalization.locale;
  searchAcceleration: {
    typeSymbols: ReadonlySet<string>;
    tagOwners:   MagicSearchManifest['tagOwners'];
  };
};

let activeManifest: MagicSearchManifest | null = null;

/** Replaces planner metadata together with its matching accelerated-data version. */
export function setMagicSearchManifest(manifest: MagicSearchManifest | null) {
  activeManifest = manifest;
}

/** Static manifest activation is wired by the publication lifecycle in ticket 13. */
export function getMagicSearchManifest() {
  return activeManifest;
}

const supportedCommands = new Set([
  'raw',
  'stats',
  'hash',
  'mana-value',
  'color',
  'color-identity',
  'color-indicator',
  'power',
  'toughness',
  'loyalty',
  'defense',
  'hand-modifier',
  'life-modifier',
  'name',
  'type',
  'text',
  'oracle',
  'format',
  'ambit',
]);

const supportedSortFields = new Set(['id', 'set', 'number', 'date', 'cmc', 'mv', 'cost']);
const pgCommands = Object.values(commands) as CommonServerCommand[];

/** Uses the same public PG command handlers over the three accelerated tables. */
export class MagicPgSearchAdapter implements SearchAdapter<NormalResult, SearchOptions> {
  descriptor(): DatasetDescriptor {
    const manifest = getMagicSearchManifest();
    const supported = pgCommands.filter(command => {
      const id = command.options.id ?? '';
      return supportedCommands.has(id)
        && ((id !== 'type' && id !== 'hash') || manifest != null);
    });

    return {
      commands: supported.map(command => {
        const descriptor = describeLogicalCommand(
          command.options,
          command.options.id ?? '',
          command.options.logical?.witness ?? [],
        );
        if (['name', 'text'].includes(command.options.id ?? '')) {
          descriptor.modifiers = descriptor.modifiers.filter(modifier => !['printed', 'pn', 'px'].includes(modifier));
        }
        if (command.options.id === 'type') {
          descriptor.modifiers = descriptor.modifiers.filter(modifier => !['printed', 'pt', 'localized', 'lt'].includes(modifier));
          descriptor.expansion = [
            'card-part.typeline',
            'card-part-localization.typeline',
            'card-part.typeSuper',
            'card-part.typeMain',
            'card-part.typeSub',
          ];
        }
        if (command.options.id === 'raw') {
          descriptor.expansion = [
            'card-part.name',
            'card-part-localization.name',
            'card-part.text',
            'card-part-localization.text',
          ];
        }
        if (command.options.id === 'hash') {
          descriptor.expansion = ['card.tags'];
        }
        if (command.options.id === 'name') {
          descriptor.expansion = ['card-part.name', 'card-part-localization.name'];
        }
        if (command.options.id === 'text') {
          descriptor.expansion = ['card-part.text', 'card-part-localization.text'];
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

  plan(request: QueryRequest): CoveragePlan {
    const manifest = getMagicSearchManifest();
    const gap = findCoverageGap(request, manifest);

    return gap == null
      ? { type: 'exact' }
      : { type: 'original', reason: [gap] };
  }

  async execute(request: QueryRequest, options: SearchOptions): Promise<NormalResult> {
    const startedAt = performance.now();
    const query = this.compileFilter(request);
    const { landing, result } = await this.searchCandidates(query, options);

    const details = await loadCandidateDetails(result.candidates, options.lang);
    const detailsByCardId = new Map(details.map(row => [row.cardId, row]));
    const rows = result.candidates.map(candidate => detailsByCardId.get(candidate.cardId));

    if (rows.some(row => row == null)) {
      throw new Error('A Magic search candidate has no matching detail row.');
    }

    return {
      result:    rows as NonNullable<(typeof rows)[number]>[],
      total:     result.total,
      page:      options.page,
      totalPage: Math.ceil(result.total / options.pageSize),
      elapsed:   Math.round(performance.now() - startedAt),
      ambit:     landing,
    };
  }

  async executeEssential(request: QueryRequest, options: SearchOptions): Promise<EssentialNormalResult> {
    const startedAt = performance.now();
    const query = this.compileFilter(request);
    const { landing, result } = await this.searchCandidates(query, options);
    const rows: EssentialCardSearchItem[] = result.candidates.map(candidate => ({
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
      result:    rows,
      total:     result.total,
      page:      options.page,
      totalPage: Math.ceil(result.total / options.pageSize),
      elapsed:   Math.round(performance.now() - startedAt),
      ambit:     landing,
    };
  }

  private compileFilter(request: QueryRequest) {
    const manifest = getMagicSearchManifest();
    if (this.plan(request).type !== 'exact') {
      throw new Error('The Magic accelerated search plan is no longer exact.');
    }

    const table: SearchTable = {
      card:                 SearchCard,
      cardPart:             SearchCardPart,
      cardPartLocalization: SearchCardPartLocalization,
      cardId:               SearchCard.cardId,
      partIndex:            SearchCardPart.partIndex,
      locale:               SearchCardPartLocalization.locale,
      searchAcceleration:   {
        typeSymbols: new Set((manifest?.typeSymbols ?? []).map(symbol => symbol.toLowerCase())),
        tagOwners:   manifest?.tagOwners ?? {},
      },
    };
    const compiled = compileQueryRequest(request, pgCommands, table);
    if (compiled.query == null || compiled.post.length > 0) {
      throw new Error('A fully covered Magic accelerated request must compile to a filter only.');
    }

    return compiled.query;
  }

  private async searchCandidates(query: import('drizzle-orm').SQL, options: SearchOptions) {
    const { explicit, pinned } = detectAmbit(options.dsl);
    return searchWithAmbitCeiling({
      pinned,
      explicit,
      start: options.ambit,
      run:   ceiling => this.queryCandidates(query, options, ceiling),
    });
  }

  private async queryCandidates(query: import('drizzle-orm').SQL, options: SearchOptions, ceiling: Ambit | null): Promise<ProjectedPage> {
    const locale = options.lang;
    const candidateJson = sql<MagicSearchCandidatePrint>`(${SearchCard.candidatePrintsByLocale} -> ${locale})`;
    const activeLocalization = and(
      eq(SearchCardPartLocalization.cardId, SearchCardPart.cardId),
      eq(SearchCardPartLocalization.version, SearchCardPart.version),
      eq(SearchCardPartLocalization.partIndex, SearchCardPart.partIndex),
      isNull(SearchCardPartLocalization.deletedAt),
    );
    const filtered = db.selectDistinctOn([SearchCard.cardId], {
      cardId:             SearchCard.cardId,
      version:            SearchCard.version,
      partIndex:          SearchCardPart.partIndex,
      locale:             SearchCardPartLocalization.locale,
      localizationSource: SearchCardPartLocalization.source,
      name:               sql<string>`${SearchCardPartLocalization.name}`.as('localization_name'),
      rubyName:           sql<string | null>`${SearchCardPartLocalization.rubyName}`.as('localization_ruby_name'),
      candidate:          candidateJson.as('candidate'),
      ambit:              SearchCard.ambit,
      manaValue:          SearchCard.manaValue,
      set:                sql<string>`${candidateJson} ->> 'set'`.as('set'),
      number:             sql<string>`${candidateJson} ->> 'number'`.as('number'),
      releaseDate:        sql<string>`${candidateJson} ->> 'releaseDate'`.as('releaseDate'),
    })
      .from(SearchCard)
      .innerJoin(SearchCardPart, and(
        eq(SearchCardPart.cardId, SearchCard.cardId),
        eq(SearchCardPart.version, SearchCard.version),
        isNull(SearchCardPart.deletedAt),
      ))
      .innerJoin(SearchCardPartLocalization, activeLocalization)
      .where(and(
        isNull(SearchCard.deletedAt),
        query,
        sql`${candidateJson} IS NOT NULL`,
        ceiling == null ? undefined : ambitCeiling(SearchCard.ambit, ceiling),
      ))
      .orderBy(
        SearchCard.cardId,
        SearchCardPart.partIndex,
        sql`CASE WHEN ${SearchCardPartLocalization.locale} = ${locale} THEN 0 WHEN ${SearchCardPartLocalization.locale} = 'en' THEN 1 ELSE 2 END`,
        sql`CASE ${SearchCardPartLocalization.source} WHEN 'manual' THEN 0 WHEN '' THEN 1 WHEN 'mtgch' THEN 2 ELSE 3 END`,
        SearchCardPartLocalization.source,
      );

    const orderBy = orderSql(options.orderBy);
    const rows = await db.execute<{ total: number, candidates: Candidate[] }>(sql`
      WITH filtered AS MATERIALIZED (${filtered}),
      totals AS (
        SELECT count(*)::int AS total FROM filtered
      ),
      page AS (
        SELECT f.*, row_number() OVER (ORDER BY ${orderBy}) AS position
        FROM filtered f
        ORDER BY ${orderBy}
        LIMIT ${options.pageSize}
        OFFSET ${(options.page - 1) * options.pageSize}
      )
      SELECT
        totals.total,
        COALESCE(
          jsonb_agg(
            jsonb_build_object(
              'cardId', page.card_id,
              'version', page.version,
              'partIndex', page.part_index,
              'locale', page.locale,
              'localizationSource', page.source,
              'name', page.localization_name,
              'rubyName', page.localization_ruby_name,
              'print', page.candidate
            ) ORDER BY page.position
          ) FILTER (WHERE page.card_id IS NOT NULL),
          '[]'::jsonb
        ) AS candidates
      FROM totals
      LEFT JOIN page ON TRUE
      GROUP BY totals.total`);

    return {
      total:      Number(rows[0]?.total ?? 0),
      candidates: rows[0]?.candidates ?? [],
    };
  }
}

/** The ticket 13 loader will provide a version-matched manifest when available. */
export const magicPgSearchAdapter = new MagicPgSearchAdapter();
export class MagicPgEssentialSearchAdapter implements SearchAdapter<EssentialNormalResult, SearchOptions> {
  constructor(private readonly fullAdapter = new MagicPgSearchAdapter()) {}

  descriptor(): DatasetDescriptor {
    return this.fullAdapter.descriptor();
  }

  plan(request: QueryRequest): CoveragePlan {
    return this.fullAdapter.plan(request);
  }

  execute(request: QueryRequest, options: SearchOptions): Promise<EssentialNormalResult> {
    return this.fullAdapter.executeEssential(request, options);
  }
}

export const magicPgEssentialSearchAdapter = new MagicPgEssentialSearchAdapter(magicPgSearchAdapter);

function findCoverageGap(request: QueryRequest, manifest: MagicSearchManifest | null): CapabilityGap | null {
  const filterGap = request.filter == null ? null : findNodeGap(request.filter, manifest);
  if (filterGap != null) return filterGap;

  if (request.result.group != null && request.result.group !== 'card') {
    return { kind: 'result', field: 'group', detail: 'Only card grouping has one preselected candidate print.' };
  }

  for (const sort of request.result.sort) {
    if (sort.kind === 'dsl') {
      return { kind: 'result', field: 'sort', detail: 'DSL order commands require the original Magic query path.' };
    }
    if (sort.kind === 'request') {
      const parts = sort.value.toLowerCase().split(',').map(value => value.replace(/[+-]$/, ''));
      const unsupported = parts.find(value => !supportedSortFields.has(value));
      if (unsupported != null) {
        return { kind: 'result', field: 'sort', detail: `Sort field ${unsupported} is not available in the accelerated projection.` };
      }
    }
  }

  return null;
}

function findNodeGap(query: LogicalQuery, manifest: MagicSearchManifest | null): CapabilityGap | null {
  switch (query.kind) {
  case 'and':
  case 'or':
    for (const child of query.exprs) {
      const gap = findNodeGap(child, manifest);
      if (gap != null) return gap;
    }
    return null;
  case 'not':
    return findNodeGap(query.expr, manifest);
  case 'leaf':
    break;
  }

  const command = query.command;
  const id = command.commandId;
  const unsupported = (detail: string): CapabilityGap => ({ kind: 'field', field: id, detail });

  if (!supportedCommands.has(id)) return unsupported('Field is not available in the accelerated projection.');
  if (['name', 'type', 'text'].includes(id) && command.modifier === 'printed') {
    return unsupported('Printed values require the original Magic query path.');
  }
  if (id === 'raw' && typeof command.value === 'string' && /^(\{[^}]+\})+$/.test(command.value)) {
    return unsupported('Raw mana-cost searches require the original Magic query path.');
  }
  if (id === 'type') {
    if (manifest == null) return unsupported('The matching type-symbol manifest is not loaded.');
    if (command.modifier === 'localized') return unsupported('Localized type searches use typeline text only.');
    if (command.operator !== ':' && command.operator !== '') return unsupported('Structured type symbols support the type search operator only.');
  }
  if (id === 'hash') {
    if (manifest == null) return unsupported('The matching tag-owner manifest is not loaded.');
    const tag = command.pattern?.tag ?? command.value;
    if (typeof tag !== 'string' || manifest.tagOwners[tag] !== 'card-only') {
      return unsupported('Only tags classified as card-only use the accelerated projection.');
    }
  }

  return null;
}

function orderSql(value: string) {
  const parts = value.toLowerCase().split(',').map(part => ({
    type:      part.endsWith('+') || part.endsWith('-') ? part.slice(0, -1) : part,
    direction: part.endsWith('-') ? 'DESC' : 'ASC',
  }));
  const terms: import('drizzle-orm').SQL[] = [];

  const pushNumber = (direction: string) => {
    terms.push(sql.raw(`f."set" ${direction}`));
    terms.push(sql.raw(`(CASE WHEN f."number" ~ '^[0-9]+' THEN regexp_replace(f."number", '[^0-9].*$', '')::int ELSE 0 END) ${direction}`));
    terms.push(sql.raw(`regexp_replace(f."number", '^[0-9]+', '') ${direction}`));
  };

  for (const part of parts) {
    switch (part.type) {
    case 'id':
      terms.push(sql.raw(`f.card_id ${part.direction}`));
      break;
    case 'set':
    case 'number':
      pushNumber(part.direction);
      break;
    case 'date':
      terms.push(sql.raw(`f."releaseDate" ${part.direction}`));
      break;
    case 'mv':
    case 'cmc':
    case 'cost':
      terms.push(sql.raw(`f."manaValue" ${part.direction}`));
      break;
    default:
      throw new Error(`Unsupported Magic accelerated sort field: ${part.type}`);
    }
  }

  if (!parts.some(part => part.type === 'id')) terms.push(sql.raw('f.card_id ASC'));
  terms.push(sql.raw('f."set" ASC'), sql.raw('f."number" ASC'));

  return sql.join(terms, sql`, `);
}

async function loadCandidateDetails(candidates: Candidate[], locale: Locale) {
  if (candidates.length === 0) return [];

  const candidateFilters = candidates.map(candidate => and(
    eq(Print.cardId, candidate.cardId),
    eq(Print.version, candidate.version),
    eq(Print.set, candidate.print.set),
    eq(Print.number, candidate.print.number),
    eq(Print.lang, candidate.print.lang),
    eq(Print.source, candidate.print.source),
    eq(CardPart.partIndex, candidate.partIndex),
    eq(CardLocalization.locale, candidate.locale),
    eq(CardLocalization.source, candidate.localizationSource),
  ));
  const printKey = [Print.cardId, Print.version, Print.set, Print.number, Print.lang, Print.source];

  return db.selectDistinctOn(printKey, {
    cardId:    Card.cardId,
    version:   Card.version,
    locale:    CardLocalization.locale,
    source:    CardLocalization.source,
    partIndex: CardPart.partIndex,
    set:       Print.set,
    number:    Print.number,
    lang:      Print.lang,
    card:      {
      ...omit(getColumns(Card), ['cardId', 'version', 'createdAt', 'updatedAt', 'deletedAt']),
    },
    cardLocalization: {
      ...omit(getColumns(CardLocalization), ['cardId', 'version', 'locale', 'source', 'createdAt', 'updatedAt', 'deletedAt']),
    },
    cardPart: {
      ...omit(getColumns(CardPart), ['cardId', 'version', 'partIndex', 'createdAt', 'updatedAt', 'deletedAt']),
    },
    cardPartLocalization: {
      ...omit(getColumns(CardPartLocalization), ['cardId', 'version', 'locale', 'source', 'partIndex', 'createdAt', 'updatedAt', 'deletedAt']),
    },
    print: {
      ...omit(getColumns(Print), ['cardId', 'version', 'set', 'number', 'lang', 'source', 'createdAt', 'updatedAt', 'deletedAt']),
    },
    printPart: {
      ...omit(getColumns(PrintPart), ['cardId', 'version', 'set', 'number', 'lang', 'source', 'partIndex', 'createdAt', 'updatedAt', 'deletedAt']),
    },
  })
    .from(Print)
    .innerJoin(PrintPart, and(
      eq(PrintPart.cardId, Print.cardId),
      eq(PrintPart.version, Print.version),
      eq(PrintPart.set, Print.set),
      eq(PrintPart.number, Print.number),
      eq(PrintPart.lang, Print.lang),
      eq(PrintPart.source, Print.source),
      isNull(PrintPart.deletedAt),
    ))
    .innerJoin(Card, and(
      eq(Card.cardId, Print.cardId),
      eq(Card.version, Print.version),
      isNull(Card.deletedAt),
    ))
    .innerJoin(CardPart, and(
      eq(CardPart.cardId, Card.cardId),
      eq(CardPart.version, Card.version),
      eq(CardPart.partIndex, PrintPart.partIndex),
      isNull(CardPart.deletedAt),
    ))
    .innerJoin(CardLocalization, and(
      eq(CardLocalization.cardId, Card.cardId),
      eq(CardLocalization.version, Card.version),
      isNull(CardLocalization.deletedAt),
    ))
    .innerJoin(CardPartLocalization, and(
      eq(CardPartLocalization.cardId, CardPart.cardId),
      eq(CardPartLocalization.version, CardPart.version),
      eq(CardPartLocalization.partIndex, CardPart.partIndex),
      eq(CardPartLocalization.locale, CardLocalization.locale),
      eq(CardPartLocalization.source, CardLocalization.source),
      isNull(CardPartLocalization.deletedAt),
    ))
    .where(and(
      isNull(Print.deletedAt),
      or(...candidateFilters),
    ))
    .orderBy(
      ...printKey,
      CardPart.partIndex,
      sql`CASE WHEN ${CardLocalization.locale} = ${locale} THEN 0 WHEN ${CardLocalization.locale} = 'en' THEN 1 ELSE 2 END`,
      sql`CASE ${CardLocalization.source} WHEN 'manual' THEN 0 WHEN '' THEN 1 WHEN 'mtgch' THEN 2 ELSE 3 END`,
      CardLocalization.source,
    );
}
