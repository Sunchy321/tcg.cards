#!/usr/bin/env bun

/**
 * Syncs Hearthstone set localization from the game's string tables.
 *
 * Set names are NOT stored in the DBF; they live in GameStrings.cs static maps
 * (TAG_CARD_SET enum -> localization key) combined with the game's string table
 * files (Strings/{locale}/GLOBAL.txt). The key mapping is irregular and must be
 * extracted by decompiling the game assembly with ilspy.
 *
 * Flow:
 *   1. ilspy decompiles `TAG_CARD_SET` (member -> value) and `GameStrings`
 *      (member -> { full/short/initials/mini keys }).
 *   2. Reads `GLOBAL.txt` for all 14 locales.
 *   3. For each enum member, upserts the matching set row by dbfId/rawName
 *      (creating a placeholder row when missing) and overwrites its
 *      `localization` JSONB with the current names.
 *
 * Usage:
 *   bun --env-file=scripts/.env run scripts/hearthstone/sync-set-localization.ts --dry-run
 *   bun --env-file=scripts/.env run scripts/hearthstone/sync-set-localization.ts
 *
 * `--dry-run` prints the would-be updates/creates without touching the DB.
 *
 * Env:
 *   HSDATA_STRINGS_DIR  path to the hsdata `Strings` directory (default:
 *                       ../data/hearthstone/hsdata/Strings)
 *   HEARTHSTONE_ASSEMBLY path to Assembly-CSharp.dll (default:
 *                       /Applications/Hearthstone/Hearthstone.app/Contents/Resources/Data/Managed/Assembly-CSharp.dll)
 *   ILSPYCMD            ilspy binary (default: ilspycmd)
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { eq, inArray } from 'drizzle-orm';

import { createDb } from '@tcg-cards/db';
import { Set } from '@tcg-cards/db/schema/shared/hearthstone/set';
import type { SetLocalization, SetLocalizationNames } from '@tcg-cards/model/hearthstone/schema/set';

const REPO_ROOT = join(import.meta.dir, '..', '..');
const STRINGS_DIR = process.env.HSDATA_STRINGS_DIR ?? join(REPO_ROOT, '..', 'data', 'hearthstone', 'hsdata', 'Strings');
const ASSEMBLY = process.env.HEARTHSTONE_ASSEMBLY
  ?? '/Applications/Hearthstone/Hearthstone.app/Contents/Resources/Data/Managed/Assembly-CSharp.dll';
const ILSPYCMD = process.env.ILSPYCMD ?? 'ilspycmd';

/** Game string-table directory code -> DB locale code. */
const LOCALE_MAP: Record<string, string> = {
  deDE: 'de', enUS: 'en', esES: 'es', esMX: 'mx', frFR: 'fr', itIT: 'it',
  jaJP: 'ja', koKR: 'ko', plPL: 'pl', ptBR: 'pt', ruRU: 'ru', thTH: 'th',
  zhCN: 'zhs', zhTW: 'zht',
};

/** Placeholder setId convention reused from the hsdata import flow. */
function placeholderSetId(dbfId: number): string {
  return `__hsdata_missing_set_dbf_${dbfId}`;
}

function runIlspy(typeName: string): string {
  const result = Bun.spawnSync([ILSPYCMD, '-t', typeName, ASSEMBLY], { stdout: 'pipe', stderr: 'pipe' });
  if (result.exitCode !== 0) {
    throw new Error(`ilspy failed for ${typeName}: ${new TextDecoder().decode(result.stderr)}`);
  }
  return new TextDecoder().decode(result.stdout);
}

/** Parses `NAME = value` lines from the decompiled TAG_CARD_SET enum. */
function parseEnum(source: string): Map<string, number> {
  const members = new Map<string, number>();
  const pattern = /^\s*([A-Z][A-Z0-9_]*)\s*=\s*(\d+)\s*,?\s*$/gm;
  for (const match of source.matchAll(pattern)) {
    members.set(match[1]!, Number(match[2]));
  }
  return members;
}

/** Extracts `{ TAG_CARD_SET.NAME, "KEY" }` entries from one map declaration block. */
function parseMapBlock(source: string, varName: string): Map<string, string> {
  const start = source.indexOf(`${varName} = new Map<TAG_CARD_SET, string>`);
  if (start < 0) {
    throw new Error(`Map ${varName} not found in GameStrings decompilation`);
  }
  const block = source.slice(start);
  const close = block.indexOf('};');
  if (close < 0) {
    throw new Error(`Map ${varName} block has no closing '};'`);
  }
  const entries = new Map<string, string>();
  const pattern = /TAG_CARD_SET\.([A-Z][A-Z0-9_]*),\s*"([^"]*)"/g;
  for (const match of block.slice(0, close).matchAll(pattern)) {
    entries.set(match[1]!, match[2]!);
  }
  return entries;
}

/** Loads `key -> value` for a GLOBAL.txt string table file. */
function loadStringTable(localeDir: string): Map<string, string> {
  const filePath = join(STRINGS_DIR, localeDir, 'GLOBAL.txt');
  const map = new Map<string, string>();
  const content = readFileSync(filePath, 'utf8');
  for (const line of content.split('\n')) {
    const tab = line.indexOf('\t');
    if (tab <= 0) continue;
    const key = line.slice(0, tab);
    const value = line.slice(tab + 1).split('\t')[0] ?? '';
    if (key.startsWith('GLOBAL_CARD_SET_') || key.startsWith('GLOBAL_MINI_SET_')) {
      map.set(key, value);
    }
  }
  return map;
}

interface SetMemberInfo {
  name: string;
  value: number;
  fullKey: string;
  shortKey: string | null;
  initialsKey: string | null;
  miniKey: string | null;
}

async function main() {
  const dryRun = Bun.argv.includes('--dry-run');
  const db = createDb(process.env.DATABASE_URL!);

  const enumSource = runIlspy('TAG_CARD_SET');
  const gameStringsSource = runIlspy('GameStrings');

  const enumValues = parseEnum(enumSource);
  const fullKeys = parseMapBlock(gameStringsSource, 's_cardSetNames');
  const shortKeys = parseMapBlock(gameStringsSource, 's_cardSetNamesShortened');
  const initialsKeys = parseMapBlock(gameStringsSource, 's_cardSetNamesInitials');
  const miniKeys = parseMapBlock(gameStringsSource, 's_miniSetNames');

  const members: SetMemberInfo[] = [...enumValues.entries()].map(([name, value]) => {
    const fullKey = fullKeys.get(name);
    if (fullKey == null) return null;
    return {
      name,
      value,
      fullKey,
      shortKey: shortKeys.get(name) ?? null,
      initialsKey: initialsKeys.get(name) ?? null,
      miniKey: miniKeys.get(name) ?? null,
    };
  }).filter((member): member is SetMemberInfo => member != null);

  const localeDirs = readdirSync(STRINGS_DIR).filter(dir => LOCALE_MAP[dir] != null);
  const stringTables = new Map<string, Map<string, string>>();
  for (const dir of localeDirs) stringTables.set(dir, loadStringTable(dir));

  // Locate existing set rows once, keyed by dbfId and rawName.
  const existingRows = await db.select({
    setId: Set.setId,
    dbfId: Set.dbfId,
    rawName: Set.rawName,
  }).from(Set);
  const byDbfId = new Map<number, typeof existingRows[number]>();
  const byRawName = new Map<string, typeof existingRows[number]>();
  for (const row of existingRows) {
    if (row.dbfId != null) byDbfId.set(row.dbfId, row);
    if (row.rawName != null) byRawName.set(row.rawName, row);
  }

  let created = 0;
  let updated = 0;

  for (const member of members) {
    const localization: Record<string, SetLocalizationNames> = {};
    for (const [dir, table] of stringTables) {
      const names: SetLocalizationNames = { full: table.get(member.fullKey) ?? '' };
      if (member.shortKey && table.has(member.shortKey)) names.short = table.get(member.shortKey);
      if (member.initialsKey && table.has(member.initialsKey)) names.initials = table.get(member.initialsKey);
      if (member.miniKey && table.has(member.miniKey)) names.mini = table.get(member.miniKey);
      localization[LOCALE_MAP[dir]!] = names;
    }

    const existing = byDbfId.get(member.value) ?? byRawName.get(member.name);
    const targetSetId = existing?.setId ?? placeholderSetId(member.value);
    const preview = localization.zhs?.full ?? localization.en?.full ?? '';

    if (dryRun) {
      console.log(`[dry-run] ${existing ? 'update' : 'create'} ${targetSetId} (${member.name}, dbfId ${member.value}) -> ${preview}`);
      if (existing) updated += 1;
      else created += 1;
      continue;
    }

    if (existing) {
      await db.update(Set)
        .set({ rawName: member.name, localization, })
        .where(eq(Set.setId, existing.setId));
      updated += 1;
    } else {
      await db.insert(Set).values({
        setId: placeholderSetId(member.value),
        dbfId: member.value,
        rawName: member.name,
        localization,
        type: 'unknown',
        releaseDate: '',
        cardCountFull: null,
        cardCount: null,
        group: null,
      });
      created += 1;
    }
  }

  console.log(`[sync-set-localization] ${members.length} members, ${updated} updated, ${created} created${dryRun ? ' (dry-run)' : ''}`);
  await db.$client.end({ timeout: 1 });
}

await main();
