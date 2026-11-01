import { and, eq, getColumns, isNull, ne, sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';

import { SearchCard, SearchCardLocalization } from '@tcg-cards/db/schema/shared/hearthstone/search';
import { hearthstoneSearchManifest } from '@tcg-cards/model/hearthstone/search/manifest';
import type { HearthstoneSearchManifest } from '@tcg-cards/model/hearthstone/search/manifest';
import type { EssentialNormalResult } from '@tcg-cards/model/hearthstone/schema/search';

import { db } from '#db/db';
import { AMBITS, detectAmbit } from '#search/ambit';
import { planCoverage } from '#search/logical';
import type { CoveragePlan, DatasetDescriptor, QueryRequest, SearchAdapter } from '#search/logical';
import { describeLogicalCommand } from '#search/command/semantics';
import type { CommonServerCommand } from '#search/server/command';
import { compileQueryRequest } from '#search/server/translate';

import type { SearchOption } from './action';
import { detectVariant, hasLanguageCommand } from './context';
import * as commands from './command-list';

/** Binds a manifest to independently known dataset readiness and version metadata. */
export type HearthstoneSearchDataset = {
  manifest:    HearthstoneSearchManifest;
  dataVersion: string;
  buildNumber: number;
  ready:       boolean;
};

let activeDataset: HearthstoneSearchDataset | null = null;

/** Activates only metadata supplied by the version-aware publication loader. */
export function setHearthstoneSearchDataset(dataset: HearthstoneSearchDataset | null): void {
  activeDataset = dataset == null
    ? null
    : {
      ...dataset,
      manifest: hearthstoneSearchManifest.parse(dataset.manifest),
    };
}

/** Requires a complete latest dataset and its matching sidecar before planning acceleration. */
function datasetReady(): boolean {
  return activeDataset != null
    && activeDataset.ready
    && activeDataset.dataVersion === activeDataset.manifest.dataVersion
    && activeDataset.buildNumber === activeDataset.manifest.buildNumber;
}

/** Returns matching latest metadata without exposing mutable activation state. */
export function getHearthstoneSearchDataset(): HearthstoneSearchDataset | null {
  return datasetReady() ? { ...activeDataset!, manifest: { ...activeDataset!.manifest } } : null;
}

const supportedCommands = new Set([
  'raw', 'full-stats', 'stats', 'lang', 'name', 'text', 'set', 'class', 'type',
  'cost', 'attack', 'health', 'durability', 'armor', 'rune', 'race', 'spell-school',
  'tech-level', 'race-bucket', 'mercenary-role', 'mercenary-faction', 'rarity',
  'collectible', 'elite', 'in-tavern', 'cooldown', 'ambit', 'format', 'order',
]);
const supportedSortFields = new Set(['name', 'type', 'class', 'cost', 'attack', 'health', 'stats', 'set', 'id']);
const pgCommands = Object.values(commands) as CommonServerCommand[];

const { createdAt: _createdAt, updatedAt: _updatedAt, deletedAt: _deletedAt, ...cardColumns } = getColumns(SearchCard);
const searchTable = {
  ...cardColumns,
  lang:         SearchCardLocalization.lang,
  renderHash:   SearchCardLocalization.renderHash,
  localization: {
    name: SearchCardLocalization.name,
    text: SearchCardLocalization.text,
  },
};

/** Builds camel-case essential JSON directly from approved accelerated columns. */
function itemSql(): SQL {
  const pairs = Object.entries(cardColumns).flatMap(([key, column]) => [sql`${key}::text`, sql`${column}`]);
  return sql`jsonb_build_object(${sql.join(pairs, sql`, `)},
    'lang', ${SearchCardLocalization.lang},
    'renderHash', ${SearchCardLocalization.renderHash},
    'localization', jsonb_build_object(
      'name', ${SearchCardLocalization.name}, 'text', ${SearchCardLocalization.text}
    ))`;
}

/** Executes an exact essential search without domain-table or detail reads. */
export class HearthstonePgEssentialSearchAdapter implements SearchAdapter<EssentialNormalResult, SearchOption> {
  /** Binds the original essential reader for a dataset removed after planning. */
  constructor(private readonly original?: (request: QueryRequest, options: SearchOption) => Promise<EssentialNormalResult>) {}

  /** Describes only the selected fields supported by the same PG command handlers. */
  descriptor(): DatasetDescriptor {
    return {
      commands: pgCommands
        .filter(command => supportedCommands.has(command.options.id ?? ''))
        .map(command => describeLogicalCommand(command.options, command.options.id ?? '', command.options.logical?.witness ?? [])),
      result: { sort: true, group: false, page: true, total: true, ambit: true, lang: true },
    };
  }

  /** Routes every uncovered request wholly to PG, including mixed hashtag predicates. */
  plan(request: QueryRequest): CoveragePlan {
    if (!datasetReady()) {
      return { type: 'original', reason: [{ kind: 'result', field: 'dataset', detail: 'The matching latest search dataset is not ready.' }] };
    }
    const coverage = planCoverage(request, this.descriptor());
    if (coverage.type !== 'exact') {
      return { type: 'original', reason: coverage.type === 'candidate' ? coverage.uncovered : coverage.reason };
    }
    for (const sort of request.result.sort) {
      const value = sort.kind === 'dsl' ? sort.command.value : sort.kind === 'request' ? sort.value : 'name+';
      if (typeof value !== 'string' || value.toLowerCase().split(',').some(term => !supportedSortFields.has(term.replace(/[+-]$/, '')))) {
        return { type: 'original', reason: [{ kind: 'result', field: 'sort', detail: 'The sort requires fields outside the accelerated projection.' }] };
      }
    }
    return { type: 'exact' };
  }

  /** Compiles an exact request into one statement including scope selection and empty-page totals. */
  compile(request: QueryRequest, options: SearchOption): SQL {
    if (this.plan(request).type !== 'exact') {
      throw new Error('The Hearthstone essential dataset or coverage is not exact.');
    }
    const compiled = compileQueryRequest(request, pgCommands, searchTable);
    const sorter = compiled.post.find(post => post.phase === 'order-by')?.action
      ?? commands.order.call({ value: options.orderBy, operator: ':', qualifier: [] }, { meta: {}, table: searchTable as never });
    const predicates = and(
      compiled.query,
      eq(SearchCard.cardId, SearchCardLocalization.cardId),
      isNull(SearchCard.deletedAt),
      isNull(SearchCardLocalization.deletedAt),
      ne(SearchCard.type, 'enchantment'),
      hasLanguageCommand(options.dsl) ? undefined : eq(SearchCardLocalization.lang, options.lang),
    );
    const { explicit, pinned } = detectAmbit(options.dsl);
    const start = AMBITS.indexOf(options.ambit ?? 'primary');
    const level = sql`CASE ${SearchCard.ambit}::text WHEN 'primary' THEN 0 WHEN 'additional' THEN 1 ELSE 2 END`;
    const landing = pinned != null
      ? sql`${AMBITS.indexOf(pinned)}::int`
      : explicit ? sql`0` : sql`COALESCE((SELECT min(GREATEST(level, ${start}::int)) FROM filtered), 2)`;
    // Rank before pagination, then choose the first nonempty ambit ceiling in this same statement.
    return sql`
      WITH filtered AS MATERIALIZED (
        SELECT ${itemSql()} AS item, ${level} AS level,
          row_number() OVER (ORDER BY ${sql.join(sorter as SQL[], sql`, `)}) AS position
        FROM ${SearchCard} INNER JOIN ${SearchCardLocalization}
          ON ${SearchCard.cardId} = ${SearchCardLocalization.cardId}
        WHERE ${predicates}
      ), landing AS (SELECT ${landing} AS level),
      visible AS MATERIALIZED (
        SELECT f.* FROM filtered f CROSS JOIN landing l
        WHERE ${pinned != null ? sql`TRUE` : sql`f.level <= l.level`}
      ), totals AS (SELECT count(*)::int AS total FROM visible),
      page AS (
        SELECT item, position FROM visible ORDER BY position
        LIMIT ${options.pageSize} OFFSET ${(options.page - 1) * options.pageSize}
      )
      SELECT totals.total,
        CASE landing.level WHEN 0 THEN 'primary' WHEN 1 THEN 'additional' ELSE 'full' END AS ambit,
        COALESCE(jsonb_agg(page.item ORDER BY page.position) FILTER (WHERE page.position IS NOT NULL), '[]'::jsonb) AS result
      FROM totals CROSS JOIN landing LEFT JOIN page ON TRUE
      GROUP BY totals.total, landing.level`;
  }

  /** Returns only list fields after one accelerated database round trip. */
  async execute(request: QueryRequest, options: SearchOption): Promise<EssentialNormalResult> {
    const startedAt = performance.now();
    let rows;
    try {
      rows = await db.execute<Pick<EssentialNormalResult, 'result' | 'total' | 'ambit'>>(this.compile(request, options));
    } catch (error) {
      // A deployment can remove a projection after metadata was loaded. Only a
      // missing relation triggers this fallback; query or connection errors stay visible.
      const cause = error as { code?: string, cause?: { code?: string } };
      if ((cause.code === '42P01' || cause.cause?.code === '42P01') && this.original != null) {
        setHearthstoneSearchDataset(null);
        return this.original(request, options);
      }
      throw error;
    }
    const row = rows[0]!;
    return {
      result:    row.result,
      total:     Number(row.total),
      ambit:     row.ambit,
      page:      options.page,
      totalPage: Math.ceil(Number(row.total) / options.pageSize),
      elapsed:   Math.round(performance.now() - startedAt),
      variant:   await detectVariant(options.dsl),
    };
  }
}
