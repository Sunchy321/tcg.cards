#!/usr/bin/env bun

/**
 * Generates a self-contained single-card projection test fixture.
 *
 * Loads one card at one build from the local database, runs the same pure
 * projection the unpack pipeline uses, and writes a test.ts that replays the
 * projection offline (no database) and asserts the full projected result.
 *
 * Usage:
 *   DESKTOP_LOCAL_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/local \
 *     bun run apps/service-desktop-runtime/scripts/generate-card-test.ts \
 *     --card CS2_029 --build 240397 --name fireball-spell-school
 *
 *   --tables  comma-separated list of projected tables to assert (default: all).
 *             Supported: entity, localizations, relations.
 */

import { execSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { and, eq, inArray, isNotNull, sql } from 'drizzle-orm';
import canonicalize from 'canonicalize';

import { getLocalDb } from '../src/lib/hearthstone/hsdata-local-db';
import {
  ExtractedCard,
  ExtractedCardTag,
  Tag,
  Set as HearthstoneSet,
  RawEntitySnapshot,
  RawEntitySnapshotTag,
} from '@tcg-cards/db/schema/local/hearthstone';
import { Locale } from '@tcg-cards/model/src/hearthstone/schema/basic';

import {
  projectExtractedCard,
  supportedLocaleKeys,
  localeMap,
  type ProjectCardResult,
} from '../src/lib/hearthstone/task/project/project';
import type {
  ExtractedCardRow,
  ExtractedCardTagRow,
  TagRow,
} from '../src/lib/hearthstone/task/project/types';
import type {
  CardProjectionInput,
  CardProjectionExpected,
  ExtractedCardFixture,
  ExtractedCardTagFixture,
  TagFixture,
} from '../src/lib/hearthstone/task/project/cards/runner';

process.env.DESKTOP_LOCAL_DATABASE_URL ??= 'postgresql://postgres:postgres@localhost:5432/local';

const PROJECT_CARDS_DIR = join(import.meta.dir, '..', 'src', 'lib', 'hearthstone', 'task', 'project', 'cards');

function parseArgs(argv: string[]) {
  const value = (name: string) => {
    const index = argv.indexOf(`--${name}`);
    return index >= 0 && index + 1 < argv.length ? argv[index + 1] : undefined;
  };
  const tables = value('tables') ?? 'entity,localizations,relations';
  const cardId = value('card');
  const build = Number(value('build'));
  const name = value('name');
  if (!cardId || !Number.isSafeInteger(build) || build <= 0 || !name) {
    throw new Error('Usage: --card <cardId> --build <build> --name <name> [--tables entity,localizations,relations]');
  }
  const tableSet = new Set(tables.split(',').map(t => t.trim()).filter(Boolean));
  for (const t of tableSet) {
    if (t !== 'entity' && t !== 'localizations' && t !== 'relations') {
      throw new Error(`Unknown table: ${t}`);
    }
  }
  return { cardId, build, name, tables: tableSet };
}

function extractLocString(locData: { m_locValues: string[], m_locId: number } | null, index: number): string {
  if (!locData) return '';
  return locData.m_locValues[index] ?? '';
}

function cardFixture(card: ExtractedCardRow): ExtractedCardFixture {
  return {
    cardId:                   card.cardId,
    dbfId:                    card.dbfId,
    textBuilderType:          card.textBuilderType,
    artistName:               card.artistName,
    signatureArtistName:      card.signatureArtistName,
    creditsCardName:          card.creditsCardName,
    watermarkTextureOverride: card.watermarkTextureOverride,
    suggestionWeight:         card.suggestionWeight,
    changeVersion:            card.changeVersion,
    name:                     card.name,
    textInHand:               card.textInHand,
    flavorText:               card.flavorText,
    howToGetCard:             card.howToGetCard,
    howToGetGoldCard:         card.howToGetGoldCard,
    howToGetSignatureCard:    card.howToGetSignatureCard,
    howToGetDiamondCard:      card.howToGetDiamondCard,
    targetArrowText:          card.targetArrowText,
  };
}

function tagFixture(tag: TagRow): TagFixture {
  return {
    enumId:            tag.enumId,
    slug:              tag.slug,
    normalizeKind:     tag.normalizeKind,
    normalizeConfig:   tag.normalizeConfig,
    projectTargetType: tag.projectTargetType,
    projectTargetPath: tag.projectTargetPath,
    projectKind:       tag.projectKind,
    projectConfig:     tag.projectConfig,
  };
}

/** Tracks which keys each context map is actually read through during projection. */
function trackedMap<K, V>(map: ReadonlyMap<K, V>) {
  const read = new Set<string>();
  const proxy = {
    get(key: K): V | undefined {
      read.add(String(key));
      return map.get(key);
    },
    has(key: K): boolean {
      read.add(String(key));
      return map.has(key);
    },
    read,
  };
  return proxy;
}

/** Tracks (locale, dbfId) reads into a nested locale -> dbfId map. */
function trackedLocaleMap(map: ReadonlyMap<Locale, ReadonlyMap<number, string>>) {
  const read = new Set<string>();
  const proxy = {
    get(locale: Locale): ReadonlyMap<number, string> | undefined {
      const inner = map.get(locale);
      if (!inner) return undefined;
      const readLocale = read;
      return {
        get(dbfId: number): string | undefined {
          readLocale.add(`${locale}\x00${dbfId}`);
          return inner.get(dbfId);
        },
        has(dbfId: number): boolean {
          readLocale.add(`${locale}\x00${dbfId}`);
          return inner.has(dbfId);
        },
        get size() { return inner.size; },
        entries() { return inner.entries(); },
        keys() { return inner.keys(); },
        values() { return inner.values(); },
        forEach(fn: (v: string, k: number) => void) { inner.forEach(fn); },
        [Symbol.iterator]() { return inner[Symbol.iterator](); },
      } as ReadonlyMap<number, string>;
    },
    has(locale: Locale): boolean {
      return map.has(locale);
    },
    read,
  };
  return proxy;
}

const { cardId, build, name, tables } = parseArgs(process.argv);
const db = getLocalDb();

// Load the target card snapshot that contains this build.
const [card] = await db.select()
  .from(ExtractedCard)
  .where(and(
    eq(ExtractedCard.cardId, cardId),
    sql<boolean>`${build} = any(${ExtractedCard.buildNumbers})`,
  ));
if (!card) throw new Error(`No extracted_card for ${cardId} at build ${build}`);

// Load tags and their tag configuration.
const tags = await db.select()
  .from(ExtractedCardTag)
  .where(eq(ExtractedCardTag.snapshotId, card.id));
const enumIds = [...new Set(tags.map(t => t.tagId))].sort((a, b) => a - b);
const tagRows = enumIds.length > 0
  ? await db.select().from(Tag).where(inArray(Tag.enumId, enumIds))
  : [];
const tagMap = new Map(tagRows.map(r => [r.enumId, r]));

// Full build snapshot: cardId/dbfId resolution + per-locale names for displayText.
const buildCards = await db.select()
  .from(ExtractedCard)
  .where(sql<boolean>`${build} = any(${ExtractedCard.buildNumbers})`) as ExtractedCardRow[];

const cardIdByDbfId = new Map(buildCards.map(c => [c.dbfId, c.cardId]));
const nameByDbfIdByLocale = new Map<Locale, Map<number, string>>();
const richTextByDbfIdByLocale = new Map<Locale, Map<number, string>>();
for (let index = 0; index < supportedLocaleKeys.length; index++) {
  const locale = localeMap[supportedLocaleKeys[index]!]!;
  const names = new Map<number, string>();
  const richTexts = new Map<number, string>();
  for (const c of buildCards) {
    const name = extractLocString(c.name, index);
    if (name.length > 0) names.set(c.dbfId, name);
    const richText = extractLocString(c.textInHand, index);
    if (richText.length > 0) richTexts.set(c.dbfId, richText);
  }
  nameByDbfIdByLocale.set(locale, names);
  richTextByDbfIdByLocale.set(locale, richTexts);
}

// Set resolution: TAG 183 value -> setId, plus hsdata TAG 183 fallback for set backfill.
const setRows = await db.select({
  dbfId: HearthstoneSet.dbfId,
  setId: HearthstoneSet.setId,
}).from(HearthstoneSet).then(items => items.filter(item => item.dbfId != null));
const setIdByDbfId = new Map(setRows.map(row => [row.dbfId!, row.setId]));

const hsdataSetTags = await db.select({
  dbfId:    RawEntitySnapshot.dbfId,
  intValue: RawEntitySnapshotTag.intValue,
}).from(RawEntitySnapshotTag)
  .innerJoin(RawEntitySnapshot, eq(RawEntitySnapshotTag.snapshotId, RawEntitySnapshot.id))
  .where(and(eq(RawEntitySnapshotTag.enumId, 183), isNotNull(RawEntitySnapshotTag.intValue)));
const hsdataSetByDbfId = new Map(hsdataSetTags.map(r => [r.dbfId, r.intValue!]));

// Run the projection while tracking which context entries are actually read.
const trackedCardIdByDbfId = trackedMap(cardIdByDbfId);
const trackedSetIdByDbfId = trackedMap(setIdByDbfId);
const trackedHsdataSetByDbfId = trackedMap(hsdataSetByDbfId);
const trackedNameByDbfIdByLocale = trackedLocaleMap(nameByDbfIdByLocale);
const trackedRichTextByDbfIdByLocale = trackedLocaleMap(richTextByDbfIdByLocale);

const result: ProjectCardResult = projectExtractedCard(
  card,
  tags as ExtractedCardTagRow[],
  tagMap,
  build,
  {
    cardIdByDbfId:           trackedCardIdByDbfId as unknown as Map<number, string>,
    setIdByDbfId:            trackedSetIdByDbfId as unknown as Map<number, string>,
    hsdataSetByDbfId:        trackedHsdataSetByDbfId as unknown as ReadonlyMap<number, number>,
    nameByDbfIdByLocale:     trackedNameByDbfIdByLocale as unknown as ReadonlyMap<Locale, ReadonlyMap<number, string>>,
    richTextByDbfIdByLocale: trackedRichTextByDbfIdByLocale as unknown as ReadonlyMap<Locale, ReadonlyMap<number, string>>,
  },
);

// Prune context to only the entries that were actually read during projection.
function pruneNumberMap<V>(map: ReadonlyMap<number, V>, read: Set<string>): Record<string, V> {
  const out: Record<string, V> = {};
  for (const key of read) {
    const num = Number(key);
    const value = map.get(num);
    if (value != null) out[key] = value;
  }
  return out;
}

function pruneLocaleMap(
  map: ReadonlyMap<Locale, ReadonlyMap<number, string>>,
  read: Set<string>,
): Record<string, Record<string, string>> {
  const out: Record<string, Record<string, string>> = {};
  for (const entry of read) {
    const [locale, dbfId] = entry.split(' ');
    const inner = map.get(locale as Locale);
    const value = inner?.get(Number(dbfId));
    if (value == null) continue;
    out[locale] ??= {};
    out[locale]![dbfId] = value;
  }
  return out;
}

const input: CardProjectionInput = {
  build,
  card: cardFixture(card),
  tags: tags.map(t => ({
    dbfId:             t.dbfId,
    tagId:             t.tagId,
    tagValue:          t.tagValue,
    isReferenceTag:    t.isReferenceTag,
    isPowerKeywordTag: t.isPowerKeywordTag,
  })) as ExtractedCardTagFixture[],
  tagMap: Object.fromEntries(
    [...tagMap.entries()].map(([key, row]) => [String(key), tagFixture(row)]),
  ),
  context: {
    cardIdByDbfId:           pruneNumberMap(cardIdByDbfId, trackedCardIdByDbfId.read),
    setIdByDbfId:            pruneNumberMap(setIdByDbfId, trackedSetIdByDbfId.read),
    hsdataSetByDbfId:        pruneNumberMap(hsdataSetByDbfId, trackedHsdataSetByDbfId.read),
    nameByDbfIdByLocale:     pruneLocaleMap(nameByDbfIdByLocale, trackedNameByDbfIdByLocale.read),
    richTextByDbfIdByLocale: pruneLocaleMap(richTextByDbfIdByLocale, trackedRichTextByDbfIdByLocale.read),
  },
};

// Build the expected payload from the projected result.
const expected: CardProjectionExpected = {};
if (tables.has('entity')) expected.entity = result.entity;
if (tables.has('localizations')) expected.localizations = result.localizations;
if (tables.has('relations')) expected.relations = result.relations;

// Serialize the fixture as a standalone test.ts.
const indent = (value: unknown): string => {
  const json = JSON.stringify(value, null, 2) ?? 'null';
  return json.split('\n').map(line => `  ${line}`).join('\n');
};

const expectedAssertions: string[] = [];
for (const key of Object.keys(expected)) {
  expectedAssertions.push(`  expect(result.${key}).toEqual(expected.${key});`);
}

const source = `import { describe, expect, test } from 'bun:test';

import { runProjection } from './runner';
import type { CardProjectionInput, CardProjectionExpected } from './runner';

// Generated by scripts/generate-card-test.ts — do not hand-edit.
// Card: ${cardId} (dbfId ${card.dbfId}) at build ${build}
const input: CardProjectionInput = ${indent(input)};

const expected: CardProjectionExpected = ${indent(expected)};

describe('${name} (${cardId} @ ${build})', () => {
  test('projects the full card result', () => {
    const result = runProjection(input);
${expectedAssertions.join('\n')}
  });
});
`;

const outputPath = join(PROJECT_CARDS_DIR, `${name}.test.ts`);
mkdirSync(PROJECT_CARDS_DIR, { recursive: true });
writeFileSync(outputPath, source);
console.log(`Wrote ${outputPath}`);
console.log(`input hash ${canonicalize(input)!.slice(0, 16)}`);

// Fix formatting/style on the generated fixture.
const appDir = resolve(import.meta.dir, '..');
try {
  execSync(`bunx eslint ${outputPath} --fix`, { cwd: appDir, stdio: 'inherit' });
} catch (error) {
  console.error(`eslint fix failed: ${error}`);
}

// Close the local DB connection so the process can exit.
await (db as unknown as { $client: { end(): Promise<void> } }).$client.end();
