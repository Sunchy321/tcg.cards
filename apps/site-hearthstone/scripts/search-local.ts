import { DatabaseSync } from 'node:sqlite';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { nodeSqliteD1Binding } from '#search/server/node-sqlite-d1';
import Parser from '#search/parser';
import { simplify } from '#search/parser/simplify';
import { resolveQueryRequest } from '#search/server/logical';
import type { CommonServerCommand } from '#search/server/command';
import { locale } from '@tcg-cards/model/hearthstone/schema/basic';
import { hearthstoneSearchManifest } from '@tcg-cards/model/hearthstone/search/manifest';
import { hasLanguageCommand } from '../server/search/context';
import type { SearchOption } from '../server/search/action';
import { HearthstoneD1EssentialSearchAdapter } from '../server/search/d1/adapter';
import type { HearthstoneSearchD1Database } from '../server/search/d1/types';
import { setHearthstoneSearchDataset } from '../server/search/accelerated-adapter';
import * as commands from '../server/search/command-list';

/** Runs one exact local Hearthstone DSL query over a base package and one locale delta. */
async function main(): Promise<void> {
  const [basePath, localePath, requestedLocale, ...dslParts] = process.argv.slice(2);
  const dsl = dslParts.join(' ');
  if (basePath == null || localePath == null || requestedLocale == null || dsl === '') {
    throw new Error('Usage: search:local <base.sqlite> <locale.sqlite> <locale> <DSL>');
  }
  if (!locale.options.includes(requestedLocale as (typeof locale.options)[number])) {
    throw new Error(`Unsupported Hearthstone locale: ${requestedLocale}`);
  }

  const database = new DatabaseSync(':memory:');
  try {
    database.prepare('ATTACH DATABASE ? AS search_locale').run(readOnlyUri(localePath));
    database.prepare('ATTACH DATABASE ? AS search_base').run(readOnlyUri(basePath));
    const dataVersion = assertPackages(database, requestedLocale);
    createSearchViews(database);
    database.exec('PRAGMA query_only = ON');

    const buildNumber = Number(readMeta(database, 'search_base', 'build_number'));
    const manifest = hearthstoneSearchManifest.parse({ dataVersion, buildNumber });
    setHearthstoneSearchDataset({ manifest, dataVersion, buildNumber, ready: true });
    const options: SearchOption = {
      dsl,
      lang:     requestedLocale as SearchOption['lang'],
      page:     1,
      pageSize: 20,
      orderBy:  'id+',
      d1:       nodeSqliteD1Binding(database) as HearthstoneSearchD1Database,
    };
    const request = resolveQueryRequest(
      simplify(new Parser(dsl).parse()),
      Object.values(commands) as CommonServerCommand[],
      { sort: [{ kind: 'request', field: 'order', value: options.orderBy }], lang: options.lang, page: options.page, pageSize: options.pageSize },
    );

    if (hasLanguageCommand(dsl)) {
      console.log(JSON.stringify({
        status: 'unsupported',
        reason: 'This locale package contains one language; explicit lang commands need the approved fallback scope.',
      }));
      process.exitCode = 2;
      return;
    }

    const adapter = new HearthstoneD1EssentialSearchAdapter(async () => {
      throw new Error('Local search never falls back to PostgreSQL.');
    });
    const plan = adapter.plan(request);
    if (plan.type !== 'exact') {
      console.log(JSON.stringify({ status: 'unsupported', reason: plan.type === 'candidate' ? plan.uncovered : plan.reason }));
      process.exitCode = 2;
      return;
    }

    const result = await adapter.execute(request, options);
    console.log(JSON.stringify({
      status:         'exact',
      dataVersion,
      locale:         requestedLocale,
      memoryRssBytes: process.memoryUsage().rss,
      result,
    }));
  } finally {
    setHearthstoneSearchDataset(null);
    database.close();
  }
}

function readOnlyUri(path: string): string {
  return `${pathToFileURL(resolve(path)).href}?mode=ro`;
}

function readMeta(database: DatabaseSync, schema: 'search_base' | 'search_locale', key: string): string {
  const row = database.prepare(`SELECT value FROM ${schema}.hearthstone_search_meta WHERE key = ?`).get(key);
  if (typeof row?.value !== 'string') {
    throw new Error(`Missing Hearthstone package metadata: ${schema}.${key}`);
  }
  return row.value;
}

function assertPackages(database: DatabaseSync, requestedLocale: string): string {
  const baseVersion = readMeta(database, 'search_base', 'data_version');
  const localeVersion = readMeta(database, 'search_locale', 'data_version');
  if (baseVersion !== localeVersion
    || readMeta(database, 'search_base', 'package_role') !== 'base'
    || readMeta(database, 'search_locale', 'package_role') !== 'locale'
    || readMeta(database, 'search_locale', 'locale') !== requestedLocale) {
    throw new Error('Hearthstone local search packages have mismatched versions, roles, or locale.');
  }
  return baseVersion;
}

function createSearchViews(database: DatabaseSync): void {
  database.exec(`
    CREATE TEMP VIEW hearthstone_search_cards AS SELECT * FROM search_base.hearthstone_search_cards;
    CREATE TEMP VIEW hearthstone_search_card_values AS SELECT * FROM search_base.hearthstone_search_card_values;
    CREATE TEMP VIEW hearthstone_search_card_legalities AS SELECT * FROM search_base.hearthstone_search_card_legalities;
    CREATE TEMP VIEW hearthstone_search_card_localizations AS SELECT * FROM search_locale.hearthstone_search_card_localizations;
    CREATE TEMP VIEW hearthstone_search_text_rows AS SELECT * FROM search_locale.hearthstone_search_text_rows;
    CREATE TEMP VIEW hearthstone_search_meta AS
      SELECT key, value FROM search_base.hearthstone_search_meta
      UNION ALL
      SELECT key, value FROM search_locale.hearthstone_search_meta
      WHERE key NOT IN ('data_version', 'schema_version', 'build_number', 'ready', 'sort_version', 'package_role');
  `);
}

await main();
