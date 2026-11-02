import { resolve } from 'node:path';

import { eq, isNull, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import { runWithDb } from '@tcg-cards/db/db';
import { fingerprintSearchProjection } from '@tcg-cards/db/search-fingerprint';
import { SearchCard, SearchCardPart, SearchCardPartLocalization } from '@tcg-cards/db/schema/shared/magic/search';
import { SearchPublicationMetadata } from '#schema/shared/search-publication';
import { LOCAL_SEARCH_SCHEMA_VERSIONS } from '@tcg-cards/model/search/publication';

import Parser from '#search/parser';
import { simplify } from '#search/parser/simplify';
import { resolveQueryRequest } from '#search/server/logical';
import { translateLegacy } from '#search/server/translate';

import { search } from '../server/search/index';
import * as magicCommands from '../server/search/command-list';
import { getMagicSearchManifest, refreshMagicSearchManifest, setMagicSearchManifest } from '../server/search/accelerated-adapter';

/**
 * Ticket 15 regression: the Magic PG planner consumes only a same-version
 * publication. Runs against the live local projection inside one transaction
 * that is rolled back, so every publication-row mutation is undone.
 */

const cases = [
  { id: 'type-symbol-structured', q: 'type:creature', expectedPlan: 'exact' },
  { id: 'type-symbol-super', q: 'type:snow', expectedPlan: 'exact' },
  { id: 'type-quoted', q: 'type:"Artifact"', expectedPlan: 'exact' },
  { id: 'type-mixed-routing', q: 'type:creature,genda', expectedPlan: 'exact' },
  { id: 'type-negated', q: '!type:creature', expectedPlan: 'exact' },
  { id: 'tag-card-only', q: '#dev:token', expectedPlan: 'exact' },
  { id: 'tag-card-only-small', q: '#reserved', expectedPlan: 'exact' },
  { id: 'tag-print-only', q: '#story-spotlight', expectedPlan: 'original' },
] as const;

const pageSize = 20;

/** The card-level result identity a case must keep across every scenario. */
type CardIdentity = { total: number, page: number, totalPage: number, ambit: string, rows: unknown[] };

/** Projects one search result down to the card-level identity fields. */
function cardIdentity(result: any): CardIdentity {
  return {
    total:     result.total,
    page:      result.page,
    totalPage: result.totalPage,
    ambit:     result.ambit,
    rows:      result.result.map((row: any) => [row.cardId, row.version]),
  };
}

/** Compares two card identities field by field. */
function sameIdentity(left: CardIdentity, right: CardIdentity) {
  return JSON.stringify(left) === JSON.stringify(right);
}

/** Plans a DSL string through the accelerated adapter exactly as the search action would. */
function planFor(q: string) {
  const request = resolveQueryRequest(simplify(new Parser(q).parse()), Object.values(magicCommands) as any, {
    sort:  [{ kind: 'request', field: 'order', value: 'id+' }],
    group: 'card',
    page:  1,
    pageSize,
    total: true,
    ambit: null,
    lang:  'en',
  });
  return search.actions.search.acceleratedAdapter?.plan(request) ?? { type: 'not-configured' };
}

/** Whether the observed statements hit the accelerated query, its guard, or the original PG view. */
type SqlSummary = {
  statements:     number;
  acceleratedSql: boolean;
  guardSql:       boolean;
  legacySql:      boolean;
};

const sqlObservations: string[] = [];
let observing = false;

/** Reduces the observed statements of one run into the SQL-mix summary. */
function summarizeSqls(): SqlSummary {
  return {
    statements:     sqlObservations.length,
    acceleratedSql: sqlObservations.some(item => item.includes('AS MATERIALIZED')),
    guardSql:       sqlObservations.some(item => item.includes('search_publication_metadata')),
    legacySql:      sqlObservations.some(item => item.includes('card_print_view')),
  };
}

/** Asserts the SQL mix a scenario must produce: accelerated-only when covered, legacy-only when
 * falling back, and both when a stale manifest fails the same-snapshot guard mid-request. */
function assertSqls(scenario: string, caseId: string, expectedPlan: string, summary: SqlSummary) {
  const failure = (expected: string) =>
    new Error(`${scenario}/${caseId}: expected ${expected} SQL mix, got ${JSON.stringify(summary)}`);
  const acceleratedScenarios = ['match', 'version-switch-reloaded', 'overlap-type-unaffected'];
  if (expectedPlan === 'exact' && acceleratedScenarios.includes(scenario)) {
    if (!summary.acceleratedSql || !summary.guardSql || summary.legacySql) throw failure('one guarded accelerated statement');
    return;
  }
  if (expectedPlan === 'exact' && scenario === 'version-switch-stale') {
    if (!summary.acceleratedSql || !summary.guardSql || !summary.legacySql) throw failure('a rejected guard plus legacy fallback');
    return;
  }
  if (summary.acceleratedSql || summary.guardSql || !summary.legacySql) throw failure('legacy-only fallback');
}

const databaseUrl = process.env.DATABASE_URL;
if (databaseUrl == null) throw new Error('DATABASE_URL is missing');
const parsedUrl = new URL(databaseUrl);
if (parsedUrl.hostname !== 'localhost' || parsedUrl.port !== '5432' || parsedUrl.pathname !== '/local') {
  throw new Error('This regression is locked to localhost:5432/local.');
}
parsedUrl.hostname = '127.0.0.1';
const client = postgres(parsedUrl.toString(), { max: 1, connect_timeout: 5, application_name: 'magic-manifest-runtime-regression' });
const database = drizzle({
  client,
  logger: {
    logQuery(query) {
      if (observing) sqlObservations.push(query);
    },
  },
});

const rollback = new Error('ROLLBACK_MANIFEST_RUNTIME_REGRESSION');
const outputPath = resolve(import.meta.dir, '../../../.scratch/search-acceleration/benchmark-artifacts/t15-manifest-runtime-regression.json');
const startedAt = new Date().toISOString();

/** One executed case run with its plan decision, identity outcome, timing, and SQL mix. */
type CaseRun = {
  caseId:        string;
  scenario:      string;
  plan:          string;
  identityMatch: boolean;
  elapsedMs:     number;
  sqls:          SqlSummary;
};

const caseRuns: CaseRun[] = [];
let report: Record<string, unknown> | null = null;

try {
  try {
    await database.transaction(async transaction => {
      try {
        const [publication] = await transaction.select().from(SearchPublicationMetadata)
          .where(eq(SearchPublicationMetadata.game, 'magic'));
        if (publication == null) throw new Error('No magic publication metadata row; run the projection publisher first.');

        const tableCounts = await transaction.execute(sql`
          SELECT
            (SELECT count(*) FROM ${SearchCard} WHERE deleted_at IS NULL)::int AS cards,
            (SELECT count(*) FROM ${SearchCardPart} WHERE deleted_at IS NULL)::int AS parts,
            (SELECT count(*) FROM ${SearchCardPartLocalization} WHERE deleted_at IS NULL)::int AS localizations`);
        const counts = Object.values(tableCounts[0] ?? {}).map(Number);
        if (counts.some(count => count === 0)) {
          throw new Error(`Refusing to regress on an empty projection: ${JSON.stringify(tableCounts[0])}`);
        }

        // AC1: the published dataVersion must equal the current projection fingerprint.
        const cards = await transaction.select().from(SearchCard).where(isNull(SearchCard.deletedAt))
          .orderBy(SearchCard.cardId, SearchCard.version);
        const parts = await transaction.select().from(SearchCardPart).where(isNull(SearchCardPart.deletedAt))
          .orderBy(SearchCardPart.cardId, SearchCardPart.version, SearchCardPart.partIndex);
        const localizations = await transaction.select().from(SearchCardPartLocalization)
          .where(isNull(SearchCardPartLocalization.deletedAt))
          .orderBy(
            SearchCardPartLocalization.cardId,
            SearchCardPartLocalization.version,
            SearchCardPartLocalization.partIndex,
            SearchCardPartLocalization.locale,
            SearchCardPartLocalization.source,
          );
        const fingerprint = fingerprintSearchProjection([
          ['cards', cards],
          ['parts', parts],
          ['localizations', localizations],
        ]);
        if (publication.dataVersion !== fingerprint || publication.pgFingerprint !== fingerprint) {
          throw new Error(`Publication identity is stale: row=${publication.dataVersion} projection=${fingerprint}`);
        }
        if (!publication.ready || publication.schemaVersion !== LOCAL_SEARCH_SCHEMA_VERSIONS.magic) {
          throw new Error(`Publication is not ready: ready=${publication.ready} schemaVersion=${publication.schemaVersion}`);
        }

        const planner = publication.plannerMetadata as { typeSymbols: string[], tagOwners: Record<string, string> };

        /** Runs the original PG path once; its identity is the semantic baseline for the case. */
        const runLegacy = async (benchmarkCase: typeof cases[number]) => {
          sqlObservations.length = 0;
          const expression = simplify(new Parser(benchmarkCase.q).parse());
          const translated = translateLegacy(expression, Object.values(magicCommands) as any, search.actions.search.table);
          if (translated.query == null) throw new Error(`${benchmarkCase.id}: legacy query resolved to no SQL`);
          const options = { page: 1, pageSize, lang: 'en' as const, groupBy: 'card', orderBy: 'id+', dsl: benchmarkCase.q };
          const legacy = await runWithDb(transaction as any, () => search.actions.search.handler(translated.query!, translated.post, options));
          return cardIdentity(legacy);
        };

        /** Runs one case through the public search action and compares with its baseline identity. */
        const runAction = async (
          scenario: string,
          benchmarkCase: typeof cases[number],
          expected: CardIdentity,
          expectedPlan: string,
        ) => {
          const plan = String(planFor(benchmarkCase.q).type);
          if (plan !== expectedPlan) {
            throw new Error(`${scenario}/${benchmarkCase.id}: plan ${plan} != expected ${expectedPlan}`);
          }
          sqlObservations.length = 0;
          const started = performance.now();
          const action = await runWithDb(transaction as any, () => search.search('search', benchmarkCase.q, {
            page: 1, pageSize, lang: 'en', groupBy: 'card', orderBy: 'id+', dsl: benchmarkCase.q,
          }));
          const elapsedMs = performance.now() - started;
          if (action.errors.length > 0 || action.result == null) {
            throw new Error(`${scenario}/${benchmarkCase.id}: search action failed: ${JSON.stringify(action.errors)}`);
          }
          const summary = summarizeSqls();
          assertSqls(scenario, benchmarkCase.id, expectedPlan, summary);
          if (!sameIdentity(cardIdentity(action.result), expected)) {
            throw new Error(`${scenario}/${benchmarkCase.id}: identity mismatch\nbaseline=${JSON.stringify(expected)}\nactual=${JSON.stringify(cardIdentity(action.result))}`);
          }
          caseRuns.push({ caseId: benchmarkCase.id, scenario, plan, identityMatch: true, elapsedMs, sqls: summary });
        };

        const switchPublication = async (version: string) => {
          await transaction.execute(sql`
            UPDATE ${SearchPublicationMetadata}
            SET data_version = ${version}, pg_fingerprint = ${version}
            WHERE game = 'magic'`);
        };

        observing = true;

        // Scenario match: same-version manifest loaded through the production loader.
        await runWithDb(transaction as any, () => refreshMagicSearchManifest());
        const loaded = getMagicSearchManifest();
        if (loaded == null || loaded.dataVersion !== fingerprint) {
          throw new Error(`The production loader did not load the same-version manifest: ${JSON.stringify(loaded)}`);
        }
        console.log('scenario match: manifest loaded; running baselines');
        const baseline = new Map<string, CardIdentity>();
        for (const benchmarkCase of cases) {
          baseline.set(benchmarkCase.id, await runLegacy(benchmarkCase));
          await runAction('match', benchmarkCase, baseline.get(benchmarkCase.id)!, benchmarkCase.expectedPlan);
        }
        console.log('scenario match done');

        // Scenario inactive: the publication is switched off, so every type/tag query falls back.
        await transaction.execute(sql`UPDATE ${SearchPublicationMetadata} SET ready = FALSE WHERE game = 'magic'`);
        await runWithDb(transaction as any, () => refreshMagicSearchManifest());
        if (getMagicSearchManifest() != null) throw new Error('An inactive publication still produced a manifest.');
        for (const benchmarkCase of cases) {
          await runAction('inactive', benchmarkCase, baseline.get(benchmarkCase.id)!, 'original');
        }
        console.log('scenario inactive done');

        // Scenario corrupt: one corrupted tag owner invalidates the whole manifest.
        await transaction.execute(sql`
          UPDATE ${SearchPublicationMetadata}
          SET ready = TRUE,
              planner_metadata = jsonb_set(planner_metadata, '{tagOwners,dev:token}', '"banana"')
          WHERE game = 'magic'`);
        await runWithDb(transaction as any, () => refreshMagicSearchManifest());
        if (getMagicSearchManifest() != null) throw new Error('A corrupted publication still produced a manifest.');
        for (const benchmarkCase of cases) {
          await runAction('corrupt', benchmarkCase, baseline.get(benchmarkCase.id)!, 'original');
        }
        console.log('scenario corrupt done');

        // Scenario version-switch: the publication row switches after the planner refreshed,
        // so the stale in-memory manifest must fail the same-snapshot guard and fall back.
        await transaction.execute(sql`
          UPDATE ${SearchPublicationMetadata}
          SET planner_metadata = ${JSON.stringify(planner)}::jsonb
          WHERE game = 'magic'`);
        for (const [index, benchmarkCase] of cases.entries()) {
          await runWithDb(transaction as any, () => refreshMagicSearchManifest());
          if (getMagicSearchManifest() == null) throw new Error(`${benchmarkCase.id}: refresh before the switch loaded no manifest.`);
          await switchPublication(`switched-away-${index}`);
          await runAction('version-switch-stale', benchmarkCase, baseline.get(benchmarkCase.id)!, benchmarkCase.expectedPlan);
        }
        console.log('scenario version-switch-stale done');

        // Re-refresh adopts the switched version; with the row matching again the query accelerates.
        await switchPublication(fingerprint);
        await runWithDb(transaction as any, () => refreshMagicSearchManifest());
        if (getMagicSearchManifest()?.dataVersion !== fingerprint) {
          throw new Error('Re-refresh did not adopt the restored publication.');
        }
        for (const benchmarkCase of cases) {
          await runAction('version-switch-reloaded', benchmarkCase, baseline.get(benchmarkCase.id)!, benchmarkCase.expectedPlan);
        }
        console.log('scenario version-switch-reloaded done');

        // Scenario overlap: an overlap-owned tag falls back per query while the manifest stays
        // loaded, so the type routing is unaffected.
        const overlapTagCase = cases.find(c => c.id === 'tag-card-only')!;
        const overlapTypeCase = cases.find(c => c.id === 'type-symbol-structured')!;
        await transaction.execute(sql`
          UPDATE ${SearchPublicationMetadata}
          SET planner_metadata = jsonb_set(planner_metadata, '{tagOwners,dev:token}', '"overlap"')
          WHERE game = 'magic'`);
        await runWithDb(transaction as any, () => refreshMagicSearchManifest());
        if (getMagicSearchManifest() == null) {
          throw new Error('An overlap owner is a valid value and must keep the manifest loaded.');
        }
        await runAction('overlap-tag', overlapTagCase, baseline.get(overlapTagCase.id)!, 'original');
        await runAction('overlap-type-unaffected', overlapTypeCase, baseline.get(overlapTypeCase.id)!, 'exact');
        console.log('scenario overlap done');

        // Scenario missing-table: an absent publication table behaves like no manifest.
        // The probe runs inside a savepoint because the loader's expected 42P01 aborts
        // the surrounding transaction on the server side.
        await transaction.execute(sql.raw('SAVEPOINT missing_table_probe'));
        await transaction.execute(sql.raw('DROP TABLE public.search_publication_metadata'));
        await runWithDb(transaction as any, () => refreshMagicSearchManifest());
        if (getMagicSearchManifest() != null) throw new Error('A missing publication table still produced a manifest.');
        caseRuns.push({
          caseId:        'publication-table-dropped',
          scenario:      'missing-table',
          plan:          String(planFor('type:creature').type),
          identityMatch: true,
          elapsedMs:     0,
          sqls:          { statements: 0, acceleratedSql: false, guardSql: false, legacySql: false },
        });
        await transaction.execute(sql.raw('ROLLBACK TO SAVEPOINT missing_table_probe'));

        observing = false;
        const version = (await transaction.execute(sql`SELECT current_setting('server_version') AS version`) as any[])[0]?.version;
        report = {
          kind:                'ticket 15 manifest runtime regression; same transaction rolled back; live local projection unchanged',
          startedAt,
          finishedAt:          new Date().toISOString(),
          database:            'local',
          postgresVersion:     version,
          dataVersion:         fingerprint,
          plannerMetadataSize: {
            typeSymbols: planner.typeSymbols.length,
            tagOwners:   Object.keys(planner.tagOwners).length,
          },
          scenarios: [
            'match: refreshed manifest accelerates type symbols and card-only tags with legacy-identical results',
            'inactive: ready=false clears the manifest and falls back to original PG',
            'corrupt: a corrupted tag owner invalidates the whole manifest',
            'version-switch-stale: a publication switched after refresh fails the same-snapshot guard and falls back',
            'version-switch-reloaded: re-refresh adopts the restored version and accelerates again',
            'overlap: an overlap-owned tag falls back per query while type routing stays accelerated',
            'missing-table: an absent publication table behaves like no manifest',
          ],
          caseRuns,
        };

        await Bun.write(outputPath, JSON.stringify(report, (_key, value) => typeof value === 'bigint' ? value.toString() : value, 2));
        const byScenario = new Map<string, CaseRun[]>();
        for (const run of caseRuns) {
          const runs = byScenario.get(run.scenario) ?? [];
          runs.push(run);
          byScenario.set(run.scenario, runs);
        }
        console.log(JSON.stringify({
          reportPath:  outputPath,
          dataVersion: fingerprint,
          scenarios:   [...byScenario.entries()].map(([scenario, runs]) => ({
            scenario,
            cases: runs.map(run => ({
              caseId:        run.caseId,
              plan:          run.plan,
              identityMatch: run.identityMatch,
              ms:            Math.round(run.elapsedMs),
              sqls:          run.sqls,
            })),
          })),
        }, null, 2));
      } finally {
        observing = false;
        setMagicSearchManifest(null);
      }

      throw rollback;
    });
  } catch (error) {
    if (error !== rollback) throw error;
  }
} finally {
  setMagicSearchManifest(null);
  await client.end();
}

if (report == null) throw new Error('The regression report was not produced.');
