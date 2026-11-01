import { DatabaseSync } from 'node:sqlite';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { nodeSqliteD1Binding } from '#search/server/node-sqlite-d1';
import Parser from '#search/parser';
import { simplify } from '#search/parser/simplify';
import { resolveQueryRequest } from '#search/server/logical';
import { regexCommands } from '#search/server/regex';
import type { CommonServerCommand } from '#search/server/command';
import { locale } from '@tcg-cards/model/magic/schema/basic';
import { setMagicSearchManifest } from '../server/search/accelerated-adapter';
import type { MagicSearchOptions } from '../server/search/accelerated-adapter';
import { MagicD1SearchAdapter } from '../server/search/d1/adapter';
import type { MagicSearchD1Database } from '../server/search/d1/types';
import * as commands from '../server/search/command-list';

/** Runs one exact local Magic DSL query over a base package and one locale delta. */
async function main(): Promise<void> {
  const [basePath, localePath, requestedLocale, ...dslParts] = process.argv.slice(2);
  const dsl = dslParts.join(' ');
  if (basePath == null || localePath == null || requestedLocale == null || dsl === '') {
    throw new Error('Usage: search:local <base.sqlite> <locale.sqlite> <locale> <DSL>');
  }
  if (!locale.options.includes(requestedLocale as (typeof locale.options)[number])) {
    throw new Error(`Unsupported Magic locale: ${requestedLocale}`);
  }

  const database = new DatabaseSync(':memory:');
  try {
    database.prepare('ATTACH DATABASE ? AS search_locale').run(readOnlyUri(localePath));
    database.prepare('ATTACH DATABASE ? AS search_base').run(readOnlyUri(basePath));
    const dataVersion = assertPackages(database, requestedLocale);
    createSearchViews(database);
    database.exec('PRAGMA query_only = ON');

    setMagicSearchManifest({ dataVersion, typeSymbols: [], tagOwners: {} });
    const options: MagicSearchOptions = {
      dsl,
      lang:     requestedLocale as MagicSearchOptions['lang'],
      page:     1,
      pageSize: 20,
      groupBy:  'card',
      orderBy:  'id+',
      d1:       nodeSqliteD1Binding(database) as MagicSearchD1Database,
    };
    const request = resolveQueryRequest(
      simplify(new Parser(dsl).parse()),
      Object.values(commands) as CommonServerCommand[],
      {
        group:    'card',
        sort:     [{ kind: 'request', field: 'order', value: options.orderBy }],
        lang:     options.lang,
        page:     options.page,
        pageSize: options.pageSize,
      },
    );
    const adapter = new MagicD1SearchAdapter();
    if (regexCommands(request.filter).length > 0) {
      console.log(JSON.stringify({
        status: 'unsupported',
        reason: 'Local regex matching is not enabled until its text capability scope is approved.',
      }));
      process.exitCode = 2;
      return;
    }
    const plan = adapter.plan(request);
    if (plan.type !== 'exact') {
      console.log(JSON.stringify({ status: 'unsupported', reason: plan.type === 'candidate' ? plan.uncovered : plan.reason }));
      process.exitCode = 2;
      return;
    }

    const result = await adapter.executeEssentialLocal(request, options, {
      base:   'search_base',
      locale: 'search_locale',
    });
    console.log(JSON.stringify({
      status:         'exact',
      dataVersion,
      locale:         requestedLocale,
      memoryRssBytes: process.memoryUsage().rss,
      result,
    }));
  } finally {
    setMagicSearchManifest(null);
    database.close();
  }
}

function readOnlyUri(path: string): string {
  return `${pathToFileURL(resolve(path)).href}?mode=ro`;
}

function readMeta(database: DatabaseSync, schema: 'search_base' | 'search_locale', key: string): string {
  const row = database.prepare(`SELECT value FROM ${schema}.magic_search_meta WHERE key = ?`).get(key);
  if (typeof row?.value !== 'string') {
    throw new Error(`Missing Magic package metadata: ${schema}.${key}`);
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
    throw new Error('Magic local search packages have mismatched versions, roles, or locale.');
  }
  return baseVersion;
}

function createSearchViews(database: DatabaseSync): void {
  database.exec(`
    CREATE TEMP VIEW magic_search_cards AS SELECT * FROM search_base.magic_search_cards;
    CREATE TEMP VIEW magic_search_card_parts AS SELECT * FROM search_base.magic_search_card_parts;
    CREATE TEMP VIEW magic_search_card_values AS SELECT * FROM search_base.magic_search_card_values;
    CREATE TEMP VIEW magic_search_part_values AS SELECT * FROM search_base.magic_search_part_values;
    CREATE TEMP VIEW magic_search_candidates AS SELECT * FROM search_locale.magic_search_candidates;
    CREATE TEMP VIEW magic_search_card_part_localizations AS SELECT * FROM search_locale.magic_search_card_part_localizations;
    CREATE TEMP VIEW magic_search_meta AS
      SELECT key, value FROM search_base.magic_search_meta
      UNION ALL
      SELECT key, value FROM search_locale.magic_search_meta
      WHERE key NOT IN ('data_version', 'ready', 'package_role');
  `);
}

await main();
