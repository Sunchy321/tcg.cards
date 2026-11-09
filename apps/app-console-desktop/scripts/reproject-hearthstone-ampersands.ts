/**
 * One-off ampersand repair across every imported version.
 * Run without arguments for inventory, or with --apply to write and resume saved progress.
 * Audit artifacts remain in .scratch/hearthstone-ampersand-reprojection/.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { and, asc, eq, inArray, isNotNull, sql } from 'drizzle-orm';
import { EntityLocalization, ExtractedCard, PatchState, RawEntitySnapshot, RawEntitySnapshotTag } from '@tcg-cards/db/schema/local/hearthstone';
import { setLocalDatabaseUrlOverride } from '../electron/runtime/runtime-config';
import { closeLocalDb, getLocalDb } from '../electron/runtime/lib/hearthstone/hsdata-local-db';
import { hasHearthstoneSearchTables, rebuildHearthstoneSearchData } from '../electron/runtime/lib/hearthstone/search-data';
import { deriveEntityAmbits } from '../electron/runtime/lib/hearthstone/task/project/derive-ambits';
import { projectExtracted, projectHsdataFallback } from '../electron/runtime/lib/hearthstone/task/project/project';
import { CRAFTABLE_TEXT_BUILD, RENDER_HINTS } from '../electron/runtime/lib/hearthstone/task/project/constant';

/** Captures visible text and hints independently of revision/hash changes. */
interface TextState {
  cardId:            string;
  lang:              string;
  version:           number[];
  displayText:       string;
  text:              string;
  hints:             string[];
  richText?:         string;
  localizationHash?: string;
  renderHash?:       string | null;
}

/** Retains completed builds so retries compare against the original baseline. */
interface Progress {
  mode?:         string;
  hint:          string;
  completed:     number[];
  searchRebuilt: boolean;
}

const directory = resolve(import.meta.dir, '../../../.scratch/hearthstone-ampersand-reprojection');
const apply = process.argv.includes('--apply');

/** Reads a run artifact; corrupt JSON remains an error. */
async function saved<T>(name: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(resolve(directory, name), 'utf8')) as T;
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

/** Saves progress and audit data without connection credentials. */
async function save(name: string, value: unknown): Promise<void> {
  await mkdir(directory, { recursive: true });
  await writeFile(resolve(directory, name), JSON.stringify(value, null, 2));
}

/** Reads active localized text for all affected cards, including unaffected languages. */
async function readStates(cardIds: string[]): Promise<TextState[]> {
  const rows: TextState[] = [];
  for (let offset = 0; offset < cardIds.length; offset += 200) {
    const chunk = await getLocalDb().select({
      cardId:           EntityLocalization.cardId,
      lang:             EntityLocalization.lang,
      version:          EntityLocalization.version,
      displayText:      EntityLocalization.displayText,
      text:             EntityLocalization.text,
      richText:         EntityLocalization.richText,
      localizationHash: EntityLocalization.localizationHash,
      renderHash:       EntityLocalization.renderHash,
      renderModel:      EntityLocalization.renderModel,
    }).from(EntityLocalization).where(inArray(EntityLocalization.cardId, cardIds.slice(offset, offset + 200)));
    rows.push(...chunk.map(({ renderModel, ...row }) => ({ ...row, hints: renderModel?.renderHints ?? [] })));
  }
  return rows;
}

/** Indexes selected card/build/locale states without conflating different historical versions. */
function expand(rows: TextState[], targets: Map<number, Set<string>>): Map<string, TextState> {
  const result = new Map<string, TextState>();
  for (const row of rows) {
    for (const build of row.version) {
      if (!targets.get(build)?.has(row.cardId)) {
        continue;
      }
      const key = `${row.cardId}\0${build}\0${row.lang}`;
      const previous = result.get(key);
      if (previous && JSON.stringify([previous.text, previous.displayText, previous.hints]) !== JSON.stringify([row.text, row.displayText, row.hints])) {
        throw new Error(`Conflicting active text: ${row.cardId}/${build}/${row.lang}`);
      }
      result.set(key, row);
    }
  }
  return result;
}

/** Reprojects every imported source description containing ampersands; --apply enables writes. */
async function main(): Promise<void> {
  const settings = JSON.parse(await readFile(resolve(homedir(), 'Library/Application Support/tcg-cards-console-desktop/settings.json'), 'utf8'));
  const connection = process.env.DESKTOP_LOCAL_DATABASE_URL ?? settings.config?.database;
  if (!connection) {
    throw new Error('Configure the desktop local database first.');
  }
  setLocalDatabaseUrlOverride(connection);
  const database = getLocalDb();
  try {
    console.log('[ampersands] discovering all source card/build pairs');
    const pairs = await database.execute<{ card_id: string, build: number }>(sql`
      SELECT DISTINCT card_id, unnest(build_numbers) AS build
      FROM hearthstone_data.extracted_card WHERE strpos(text_in_hand::text, '&') > 0
      UNION
      SELECT DISTINCT s.card_id, unnest(s.source_tags) AS build
      FROM hearthstone_data.raw_entity_snapshots s
      JOIN hearthstone_data.raw_entity_snapshot_tags t ON t.snapshot_id = s.id
      WHERE t.enum_id = 184 AND strpos(t.loc_string_value::text, '&') > 0`);
    const patches = await database.select().from(PatchState).orderBy(asc(PatchState.buildNumber));
    const ready = new Map(patches.filter(row => row.unpackStatus === 'completed' || row.importStatus === 'completed').map(row => [row.buildNumber, row]));
    const targets = new Map<number, Set<string>>();
    for (const pair of pairs) {
      if (!ready.has(pair.build)) {
        throw new Error(`Source build ${pair.build} is not ready for projection.`);
      }
      const ids = targets.get(pair.build) ?? new Set<string>();
      ids.add(pair.card_id);
      targets.set(pair.build, ids);
    }
    const cardIds = [...new Set(pairs.map(row => row.card_id))].sort();
    console.log(JSON.stringify({ apply, candidateCards: cardIds.length, builds: targets.size, cardBuilds: pairs.length }));
    if (!apply || cardIds.length === 0) {
      return;
    }
    let progress = await saved<Progress>('progress.json');
    if (progress && progress.hint !== RENDER_HINTS.LEGACY_TEXT_AMPERSAND) {
      throw new Error('Saved progress uses a different hint.');
    }
    const baseline = await saved<TextState[]>('baseline.json') ?? await readStates(cardIds);
    await save('baseline.json', baseline);
    if (progress?.mode !== 'standard-pipeline-localization-hints') {
      if (progress) {
        await save('progress-before-standard-pipeline.json', progress);
        await save('report-before-standard-pipeline.json', await saved('report.json'));
      }
      progress = { mode: 'standard-pipeline-localization-hints', hint: RENDER_HINTS.LEGACY_TEXT_AMPERSAND, completed: [], searchRebuilt: false };
    }
    progress ??= { hint: RENDER_HINTS.LEGACY_TEXT_AMPERSAND, completed: [], searchRebuilt: false };
    await save('progress.json', progress);
    await save('targets.json', [...targets].map(([build, ids]) => ({ build, cardIds: [...ids].sort() })));
    const setTags = await database.select({ dbfId: RawEntitySnapshot.dbfId, value: RawEntitySnapshotTag.intValue })
      .from(RawEntitySnapshotTag).innerJoin(RawEntitySnapshot, eq(RawEntitySnapshotTag.snapshotId, RawEntitySnapshot.id))
      .where(and(eq(RawEntitySnapshotTag.enumId, 183), isNotNull(RawEntitySnapshotTag.intValue)));
    const setCache = new Map(setTags.map(row => [row.dbfId, row.value!]));
    for (const [build, ids] of [...targets].sort(([a], [b]) => a - b)) {
      if (progress.completed.includes(build)) {
        continue;
      }
      const selected = [...ids].sort();
      console.log(`[ampersands] build ${build}: ${selected.length} cards (${progress.completed.length + 1}/${targets.size})`);
      if (ready.get(build)!.unpackStatus === 'completed') {
        const cards = await database.select().from(ExtractedCard).where(sql`${build} = any(${ExtractedCard.buildNumbers})`);
        const available = new Set(cards.map(card => card.cardId));
        if (selected.some(cardId => !available.has(cardId))) {
          throw new Error(`Build ${build} is missing selected extracted cards.`);
        }
        await projectExtracted(build, selected, false, cards, setCache);
      } else {
        await projectHsdataFallback(build, selected, false);
      }
      progress.completed.push(build);
      await save('progress.json', progress);
    }
    const before = expand(baseline, targets);
    const afterRows = await readStates(cardIds);
    await save('after.json', afterRows);
    const after = expand(afterRows, targets);
    for (const [key, row] of after) {
      const old = before.get(key);
      const build = Number(key.split('\0')[1]);
      if (row.richText?.includes('&') && build < CRAFTABLE_TEXT_BUILD) {
        if (!row.hints.includes(RENDER_HINTS.LEGACY_TEXT_AMPERSAND) || row.version.some(version => version >= CRAFTABLE_TEXT_BUILD)) {
          throw new Error(`Legacy text still shares a new-format identity: ${key}`);
        }
        if (old?.displayText.includes('&') && !row.richText.includes('$&') && !row.displayText.includes('&')) {
          throw new Error(`Legacy literal ampersand disappeared: ${key}`);
        }
      }
      if (build >= CRAFTABLE_TEXT_BUILD && row.hints.includes(RENDER_HINTS.LEGACY_TEXT_AMPERSAND)) {
        throw new Error(`New-format text carries a legacy render hint: ${key}`);
      }
    }
    const textCards = new Set<string>();
    const newFormatTextCards = new Set<string>();
    const oldFormatTextCards = new Set<string>();
    const hintCards = new Set<string>();
    let textLocales = 0;
    let hintLocales = 0;
    for (const [key, row] of after) {
      const old = before.get(key);
      if (old && (old.displayText !== row.displayText || old.text !== row.text)) {
        textCards.add(row.cardId);
        (Number(key.split('\0')[1]) >= CRAFTABLE_TEXT_BUILD ? newFormatTextCards : oldFormatTextCards).add(row.cardId);
        textLocales++;
      }
      if (row.hints.includes(RENDER_HINTS.LEGACY_TEXT_AMPERSAND) && !old?.hints.includes(RENDER_HINTS.LEGACY_TEXT_AMPERSAND)) {
        hintCards.add(row.cardId);
        hintLocales++;
      }
    }
    for (const key of before.keys()) {
      if (!after.has(key)) {
        throw new Error(`Previously active text disappeared: ${key.replaceAll('\0', '/')}`);
      }
    }
    const report = {
      candidateCards:            cardIds.length,
      completedBuilds:           progress.completed.length,
      cardBuilds:                pairs.length,
      displayTextOrTextChanged:  { cards: textCards.size, cardBuildLocales: textLocales, cardIds: [...textCards].sort() },
      newFormatTextChangedCards: [...newFormatTextCards].sort(),
      oldFormatTextChangedCards: [...oldFormatTextCards].sort(),
      renderHintAdded:           { cards: hintCards.size, cardBuildLocales: hintLocales, cardIds: [...hintCards].sort() },
      affectedCards:             new Set([...textCards, ...hintCards]).size,
      overlapCards:              [...textCards].filter(cardId => hintCards.has(cardId)).length,
    };
    await save('report.json', report);
    if (!progress.searchRebuilt) {
      console.log('[ampersands] deriving ambits and rebuilding local search data');
      await deriveEntityAmbits();
      if (await hasHearthstoneSearchTables(database)) {
        await rebuildHearthstoneSearchData(database);
      }
      progress.searchRebuilt = true;
      await save('progress.json', progress);
    }
    console.log(JSON.stringify(report));
    console.log(`[ampersands] completed; report: ${resolve(directory, 'report.json')}`);
  } finally {
    await closeLocalDb();
  }
}

await main();
