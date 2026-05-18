#!/usr/bin/env bun

/**
 * Import Hearthstone card data from hsdata repository
 *
 * This script downloads the hsdata repository and parses CardDefs.xml
 * to extract card data and import into PostgreSQL database.
 *
 * Usage: 
 *   - Export JSON only: bun scripts/import-hearthstone.ts
 *   - Import to DB: DATABASE_URL=postgres://... bun scripts/import-hearthstone.ts --db
 */

import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { parseStringPromise } from 'xml2js';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { Entity, EntityLocalization, Card, CardRelation } from '../packages/db/src/schema/hearthstone';

// Configuration
const HS_DATA_REPO = 'https://github.com/HearthSim/hsdata.git';
const HS_DATA_DIR = join(process.cwd(), 'temp', 'hsdata');
const STATE_FILE = join(process.cwd(), 'output', 'hsdata-import-state.json');
const OUTPUT_FILE = join(process.cwd(), 'output', 'hearthstone-cards.json');
const DATABASE_URL = process.env.DATABASE_URL
  ?? process.env['HYPERDRIVE.localConnectionString']
  ?? process.env.CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE;
const BATCH_SIZE = 50; // Insert in batches of 50 to avoid memory issues
const PLAGUE_TOKEN_IDS = ['TTN_450t', 'TTN_450t2', 'TTN_450t3'];

const IMPORT_TO_DB = process.argv.includes('--db');
const REUSE_HS_DATA = process.argv.includes('--reuse') || process.argv.includes('--skip-download');
const LIMIT_ARG = process.argv.find(arg => arg.startsWith('--limit='));
const IMPORT_LIMIT = LIMIT_ARG != null ? Number.parseInt(LIMIT_ARG.slice('--limit='.length), 10) : null;

const LOCALE_MAP: Record<string, string> = {
  enUS: 'en',
  deDE: 'de',
  esES: 'es',
  frFR: 'fr',
  itIT: 'it',
  jaJP: 'ja',
  koKR: 'ko',
  esMX: 'mx',
  plPL: 'pl',
  ptBR: 'pt',
  ruRU: 'ru',
  thTH: 'th',
  zhCN: 'zhs',
  zhTW: 'zht',
};

const MECHANIC_TAG_NAMES = new Set([
  'TAUNT',
  'STEALTH',
  'SPELLPOWER',
  'DIVINE_SHIELD',
  'CHARGE',
  'SECRET',
  'DEATHRATTLE',
  'BATTLECRY',
  'WINDFURY',
  'FREEZE',
  'SILENCE',
  'AURA',
  'COMBO',
  'OVERLOAD',
  'DISCOVER',
  'ADAPT',
  'RUSH',
  'LIFESTEAL',
  'ECHO',
  'REBORN',
  'OUTCAST',
  'TRADEABLE',
  'COLOSSAL',
  'FORGE',
  'TITAN',
  'ELUSIVE',
]);

interface ImportState {
  status: string;
  progress: number;
  currentStep: string;
  totalEntities: number;
  processedEntities: number;
  exportedEntities: number;
  insertedEntities: number;
  errors: Array<{ cardId: string; error: string }>;
  startedAt?: string;
  completedAt?: string;
}

interface EntityData {
  cardId: string;
  dbfId: number;
  version: number;
  name?: Record<string, string>;
  text?: Record<string, string>;
  flavor?: Record<string, string>;
  cost?: number;
  attack?: number;
  health?: number;
  durability?: number;
  armor?: number;
  cardType?: number;
  rarity?: number;
  faction?: number;
  race?: number;
  spellSchool?: number;
  classes?: number[];
  artist?: string;
  collectible?: boolean;
  elite?: boolean;
  set?: number;
  mechanics?: string[];
  referencedTags?: string[];
  entourages?: string[];
  relations?: Array<{ relation: string; targetId: string }>;
  relatedDbfIds?: number[];
  scriptDataNums?: number[];
  questProgress?: number | null;
  isHerald?: boolean;
  tags?: Array<Record<string, unknown>>;
}

function log(message: string, ...args: any[]) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${message}`, ...args);
}

async function ensureDatabaseObjects(databaseUrl: string) {
  const sql = postgres(databaseUrl, { max: 1 });
  const entityColumns = `
    e.dbf_id,
    e.slug,
    e.set,
    e.class,
    e.type,
    e.cost,
    e.attack,
    e.health,
    e.durability,
    e.armor,
    e.rune,
    e.race,
    e.spell_school,
    e.quest_type,
    e.quest_progress,
    e.quest_part,
    e.hero_power,
    e.heroic_hero_power,
    e.tech_level,
    e.in_bobs_tavern,
    e.triple_card,
    e.race_bucket,
    e.coin,
    e.armor_bucket,
    e.buddy,
    e.banned_race,
    e.mercenary_role,
    e.mercenary_faction,
    e.colddown,
    e.collectible,
    e.elite,
    e.rarity,
    e.artist,
    e.faction,
    e.mechanics,
    e.referenced_tags,
    e.entourages,
    e.deck_order,
    e.override_watermark,
    e.deck_size,
    e.localization_notes,
    e.text_builder_type,
    e.change_type,
    e.is_latest,
    l.name,
    l.text,
    l.rich_text,
    l.display_text,
    l.target_text,
    l.text_in_play,
    l.how_to_earn,
    l.how_to_earn_golden,
    l.flavor_text,
    l.loc_change_type`;

  try {
    await sql.unsafe('create extension if not exists intarray');
    await sql.unsafe(`create table if not exists hearthstone.card_relations (
      id uuid primary key default gen_random_uuid(),
      relation text not null,
      version integer[] not null,
      source_id text not null,
      target_id text not null
    )`);
    await sql.unsafe(`create or replace view hearthstone.entity_view as
      select e.card_id, e.version & l.version as version, l.lang, ${entityColumns}
      from hearthstone.entities e
      inner join hearthstone.entity_localizations l
        on e.card_id = l.card_id and e.version && l.version`);
    await sql.unsafe(`create or replace view hearthstone.card_entity_view as
      select e.card_id, e.version & l.version as version, l.lang, ${entityColumns}, c.legalities
      from hearthstone.entities e
      inner join hearthstone.entity_localizations l
        on e.card_id = l.card_id and e.version && l.version
      inner join hearthstone.cards c on e.card_id = c.card_id`);
  } finally {
    await sql.end();
  }
}

async function clearVersionData(databaseUrl: string, version: number) {
  const sql = postgres(databaseUrl, { max: 1 });
  try {
    await sql.unsafe(`delete from hearthstone.card_relations where version = ARRAY[${version}]::integer[]`);
    await sql.unsafe(`delete from hearthstone.entity_localizations where version = ARRAY[${version}]::integer[]`);
    await sql.unsafe(`delete from hearthstone.entities where version = ARRAY[${version}]::integer[]`);
  } finally {
    await sql.end();
  }
}

async function clearLegacyFallbackData(databaseUrl: string, sourceVersion: number) {
  if (sourceVersion === 1) return;

  const sql = postgres(databaseUrl, { max: 1 });
  try {
    await sql.unsafe('delete from hearthstone.card_relations where version = ARRAY[1]::integer[]');
    await sql.unsafe('delete from hearthstone.entity_localizations where version = ARRAY[1]::integer[]');
    await sql.unsafe('delete from hearthstone.entities where version = ARRAY[1]::integer[]');
  } finally {
    await sql.end();
  }
}

async function loadState(): Promise<ImportState> {
  if (existsSync(STATE_FILE)) {
    try {
      const content = Bun.file(STATE_FILE);
      return JSON.parse(await content.text()) as ImportState;
    } catch {
      // Ignore errors
    }
  }
  return {
    status: 'idle',
    progress: 0,
    currentStep: '',
    totalEntities: 0,
    processedEntities: 0,
    exportedEntities: 0,
    insertedEntities: 0,
    errors: [],
  };
}

async function saveState(state: ImportState) {
  const outputDir = join(process.cwd(), 'output');
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }
  await Bun.write(STATE_FILE, JSON.stringify(state, null, 2) + '\n');
}

// Step 1: Download hsdata repository
async function downloadHsdata(state: ImportState): Promise<void> {
  log('\n📥 Step 1: Downloading hsdata repository...');
  state.status = 'downloading';
  state.currentStep = 'Downloading repository';
  state.progress = 10;
  await saveState(state);

  const xmlPath = join(HS_DATA_DIR, 'CardDefs.xml');
  if (REUSE_HS_DATA && existsSync(xmlPath)) {
    log('Reusing existing hsdata repository');
    state.progress = 30;
    state.currentStep = 'Repository reused';
    await saveState(state);
    return;
  }

  // Clean up existing directory
  if (existsSync(HS_DATA_DIR)) {
    log('Removing existing hsdata directory...');
    rmSync(HS_DATA_DIR, { recursive: true, force: true });
  }

  // Create temp directory
  const tempDir = join(process.cwd(), 'temp');
  if (!existsSync(tempDir)) {
    mkdirSync(tempDir, { recursive: true });
  }

  // Clone repository (shallow clone for speed)
  log('Cloning hsdata repository (shallow clone)...');
  log(`Repository: ${HS_DATA_REPO}`);
  log(`Target: ${HS_DATA_DIR}\n`);

  try {
    execSync(`git clone --depth 1 ${HS_DATA_REPO} "${HS_DATA_DIR}"`, {
      stdio: 'inherit',
      timeout: 300000, // 5 minutes timeout
    });
    log('\n✅ Repository cloned successfully');
  } catch (error) {
    throw new Error(`Failed to clone repository: ${error instanceof Error ? error.message : String(error)}`);
  }

  state.progress = 30;
  state.currentStep = 'Repository downloaded';
  await saveState(state);
}

// Step 2: Parse CardDefs.xml and transform entities
async function parseAndTransform(state: ImportState): Promise<EntityData[]> {
  log('\n📄 Step 2: Parsing CardDefs.xml...');
  state.status = 'parsing';
  state.currentStep = 'Parsing XML';
  state.progress = 40;
  await saveState(state);

  const xmlPath = join(HS_DATA_DIR, 'CardDefs.xml');
  if (!existsSync(xmlPath)) {
    throw new Error(`CardDefs.xml not found at ${xmlPath}`);
  }

  const stats = await Bun.file(xmlPath).size;
  log(`File size: ${(stats / 1024 / 1024).toFixed(2)} MB`);

  log('Reading and parsing XML file...');
  const xmlContent = await Bun.file(xmlPath).text();
  log(`Read ${xmlContent.length.toLocaleString()} characters`);

  // Parse XML using xml2js
  let parsed: any;
  try {
    parsed = await parseStringPromise(xmlContent, {
      explicitArray: false,
      mergeAttrs: true,
      trim: true,
    });
    log('✅ XML parsed successfully');
  } catch (error) {
    throw new Error(`Failed to parse XML: ${error instanceof Error ? error.message : String(error)}`);
  }

  // Extract entities
  const entities = parsed.CardDefs?.Entity || [];
  const sourceVersion = Number.parseInt(parsed.CardDefs?.build ?? '0', 10);
  const allEntities = Array.isArray(entities) ? entities : [entities];
  const entityArray = IMPORT_LIMIT != null && Number.isFinite(IMPORT_LIMIT)
    ? allEntities.slice(0, IMPORT_LIMIT)
    : allEntities;

  state.totalEntities = allEntities.length;
  log(`Found ${allEntities.length.toLocaleString()} Entity elements`);
  log(`Source build: ${sourceVersion || 'unknown'}`);
  if (entityArray.length !== allEntities.length) {
    log(`Import limit: ${entityArray.length.toLocaleString()} Entity elements`);
  }

  // Transform entities
  log('\n🔄 Transforming entities...');
  const transformed: EntityData[] = [];
  let processedCount = 0;

  for (const entity of entityArray) {
    try {
      const data = transformEntity(entity, sourceVersion);
      if (data) {
        transformed.push(data);
      }
      processedCount++;

      // Progress update every 5000 entities
      if (processedCount % 5000 === 0) {
        log(`  Transformed ${processedCount.toLocaleString()}/${entityArray.length.toLocaleString()} entities...`);
      }
    } catch (error) {
      const cardId = entity?.CardID || 'unknown';
      state.errors.push({
        cardId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  resolveDbfRelations(transformed);
  resolveHeraldRelations(transformed);
  resolveTitanRelations(transformed);
  resolvePlagueRelations(transformed);

  state.processedEntities = processedCount;
  state.progress = 80;
  state.currentStep = 'Transformation completed';
  await saveState(state);

  log(`✅ Transformation completed: ${transformed.length.toLocaleString()} entities ready for export`);
  log(`Errors during transformation: ${state.errors.length}`);

  return transformed;
}

// Transform a single entity from XML format to our data structure
function transformEntity(entity: any, sourceVersion: number): EntityData | null {
  const cardId = entity.CardID;
  if (!cardId) {
    return null;
  }

  // Extract Tag values
  const tags = entity.Tag || [];
  const tagArray = (Array.isArray(tags) ? tags : [tags]).filter(Boolean);

  const toArray = <T>(value: T | T[] | undefined): T[] => {
    if (value == null) return [];
    return Array.isArray(value) ? value : [value];
  };

  const getTags = (name: string) => tagArray.filter((t: any) => t.name === name);

  const getTagValue = (name: string): string | undefined => {
    const tag = getTags(name)[0];
    const value = tag?.value ?? tag?._;
    return value != null ? String(value) : undefined;
  };

  const getTagValues = (name: string): number[] => {
    return getTags(name)
      .map((tag: any) => Number.parseInt(String(tag.value ?? tag._ ?? ''), 10))
      .filter(Number.isFinite);
  };

  const getNumber = (name: string): number | undefined => {
    const value = getTagValue(name);
    if (value == null) return undefined;
    const number = Number.parseInt(value, 10);
    return Number.isFinite(number) ? number : undefined;
  };

  const getLocString = (name: string): Record<string, string> | undefined => {
    const tag = getTags(name).find((t: any) => t.type === 'LocString');
    if (!tag) return undefined;

    // Extract all language fields (exclude enumID, name, type, value)
    const langs: Record<string, string> = {};
    for (const [key, value] of Object.entries(tag)) {
      const lang = LOCALE_MAP[key];
      if (lang != null && typeof value === 'string') {
        langs[lang] = value;
      }
    }
    return Object.keys(langs).length > 0 ? langs : undefined;
  };

  // Extract localized strings from tags
  const name = getLocString('CARDNAME');
  const text = getLocString('CARDTEXT');
  const flavor = getLocString('FLAVORTEXT');
  const artist = getTagValue('ARTISTNAME');

  // Extract numeric values
  const cost = getNumber('COST');
  const attack = getNumber('ATK');
  const health = getNumber('HEALTH');
  const durability = getNumber('DURABILITY');
  const armor = getNumber('ARMOR');
  const questProgress = getNumber('QUEST_PROGRESS_TOTAL');
  const scriptDataNums = [1, 2, 3, 4, 5, 6]
    .map(index => getNumber(`TAG_SCRIPT_DATA_NUM_${index}`))
    .filter((value): value is number => value != null);

  // Extract enum values
  const cardType = getNumber('CARDTYPE');
  const rarity = getNumber('RARITY');
  const faction = getNumber('FACTION');
  const race = getNumber('RACE');
  const spellSchool = getNumber('SPELL_SCHOOL');
  const set = getNumber('CARD_SET');
  const classes = getTagValues('CLASS');
  const relatedDbfIds = getTagValues('COLLECTION_RELATED_CARD_DATABASE_ID');

  // Extract boolean flags
  const collectible = getTagValue('COLLECTIBLE') === '1';
  const elite = getTagValue('ELITE') === '1';

  const mechanics = tagArray
    .filter((tag: any) => MECHANIC_TAG_NAMES.has(tag.name) && String(tag.value ?? '1') === '1')
    .map((tag: any) => String(tag.name).toLowerCase());

  const referencedTags = toArray(entity.ReferencedTag)
    .map((tag: any) => tag.name)
    .filter((value: unknown): value is string => typeof value === 'string');

  const entourages = toArray(entity.EntourageCard)
    .map((item: any) => item.cardID)
    .filter((value: unknown): value is string => typeof value === 'string');

  const relations = [
    ...tagArray
      .filter((tag: any) => tag.type === 'Card' && typeof tag.cardID === 'string')
      .map((tag: any) => ({
        relation: normalizeRelationName(String(tag.name)),
        targetId:  String(tag.cardID),
      })),
    ...entourages.map(targetId => ({
      relation: 'entourage',
      targetId,
    })),
  ];

  return {
    cardId,
    dbfId: Number.parseInt(entity.ID ?? '0', 10),
    version: sourceVersion || Number.parseInt(entity.version ?? '1', 10) || 1,
    name,
    text,
    flavor,
    cost,
    attack,
    health,
    durability,
    armor,
    cardType,
    rarity,
    faction,
    race,
    spellSchool,
    classes,
    artist,
    collectible,
    elite,
    set,
    mechanics,
    referencedTags,
    entourages,
    relations: dedupeRelations(relations),
    relatedDbfIds,
    scriptDataNums,
    questProgress: questProgress ?? scriptDataNums[0] ?? null,
    isHerald: getTagValue('HERALD') === '1',
    tags: tagArray,
  };
}

// Step 3: Export to JSON
async function exportToJson(entities: EntityData[], state: ImportState): Promise<void> {
  log('\n💾 Step 3: Exporting to JSON...');
  state.status = 'exporting';
  state.currentStep = 'Exporting to JSON';
  state.progress = 85;
  await saveState(state);

  const outputDir = join(process.cwd(), 'output');
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }

  log(`Writing ${entities.length.toLocaleString()} entities to ${OUTPUT_FILE}...`);
  await Bun.write(OUTPUT_FILE, JSON.stringify(entities, null, 2) + '\n');

  state.exportedEntities = entities.length;
  state.progress = 100;
  state.currentStep = 'Export completed';
  await saveState(state);

  log(`✅ Export completed: ${entities.length.toLocaleString()} entities exported`);
}

// Step 4: Import to Database
async function importToDatabase(entities: EntityData[], state: ImportState): Promise<void> {
  if (!DATABASE_URL) {
    throw new Error('DATABASE_URL environment variable is not set. Set it to import to database.');
  }

  log('\n💾 Step 4: Importing to PostgreSQL database...');
  log(`Database: ${DATABASE_URL.split('@')[1] || 'unknown'}`);
  state.status = 'importing';
  state.currentStep = 'Importing to database';
  state.progress = 90;
  await saveState(state);

  await ensureDatabaseObjects(DATABASE_URL);

  const db = drizzle({ connection: DATABASE_URL });

  let insertedCards = 0;
  let insertedEntities = 0;
  let insertedLocalizations = 0;
  let insertedRelations = 0;
  let failedBatches = 0;
  const importableEntities = entities.filter(e => e.name != null);
  const totalCards = importableEntities.length;
  const sourceVersion = importableEntities[0]?.version;

  if (sourceVersion != null) {
    log('Clearing legacy fallback build rows before import...');
    await clearLegacyFallbackData(DATABASE_URL, sourceVersion);
    log(`Clearing existing rows for build ${sourceVersion} before import...`);
    await clearVersionData(DATABASE_URL, sourceVersion);
  }

  log(`Total named entities to import: ${totalCards.toLocaleString()}`);
  log(`Processing in batches of ${BATCH_SIZE}...\n`);

  for (let i = 0; i < importableEntities.length; i += BATCH_SIZE) {
    const batch = importableEntities.slice(i, i + BATCH_SIZE);
    const batchNumber = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(importableEntities.length / BATCH_SIZE);

    try {
      for (const entity of batch) {
        // Skip if no name
        if (!entity.name) continue;

        const version = [entity.version];
        const localizations = buildLocalizations(entity);

        // Map card type from enumID to string
        const cardType = mapCardType(entity.cardType);
        const rarity = mapRarity(entity.rarity);
        const faction = mapFaction(entity.faction);
        const race = mapRace(entity.race);
        const classes = (entity.classes ?? []).map(mapClass).filter((value): value is string => value != null);
        const spellSchool = mapSpellSchool(entity.spellSchool);
        const set = mapSet(entity.set);

        // Insert into cards table (card_id is primary key)
        await db.insert(Card).values({
          cardId: entity.cardId,
          legalities: {},
        }).onConflictDoNothing();
        insertedCards++;

        // Insert into entities table
        await db.insert(Entity).values({
          cardId: entity.cardId,
          version,
          dbfId: entity.dbfId,
          slug: null,
          set: set || 'CORE',
          classes,
          type: cardType || 'null',
          cost: entity.cost ?? 0,
          attack: entity.attack ?? null,
          health: entity.health ?? null,
          durability: entity.durability ?? null,
          armor: entity.armor ?? null,
          rune: null,
          race: race ? [race] : null,
          spellSchool,
          questType: null,
          questProgress: entity.questProgress ?? null,
          questPart: null,
          heroPower: null,
          heroicHeroPower: null,
          techLevel: null,
          inBobsTavern: false,
          tripleCard: null,
          raceBucket: null,
          coin: null,
          armorBucket: null,
          buddy: null,
          bannedRace: null,
          mercenaryRole: null,
          mercenaryFaction: null,
          colddown: null,
          collectible: entity.collectible ?? true,
          elite: entity.elite ?? false,
          rarity,
          artist: entity.artist || '',
          faction,
          mechanics: entity.mechanics || [],
          referencedTags: entity.referencedTags || [],
          entourages: entity.entourages?.length ? entity.entourages : null,
          deckOrder: null,
          overrideWatermark: null,
          deckSize: null,
          localizationNotes: null,
          textBuilderType: 'default',
          changeType: 'unknown',
          isLatest: true,
        }).onConflictDoNothing();
        insertedEntities++;

        for (const localization of localizations) {
          await db.insert(EntityLocalization).values({
            cardId: entity.cardId,
            version,
            lang: localization.lang,
            name: localization.name,
            text: localization.text,
            richText: localization.text,
            displayText: localization.text,
            targetText: null,
            textInPlay: null,
            howToEarn: null,
            howToEarnGolden: null,
            flavorText: localization.flavor,
            locChangeType: 'unknown',
          }).onConflictDoNothing();
          insertedLocalizations++;
        }

        for (const relation of entity.relations ?? []) {
          await db.insert(CardRelation).values({
            relation: relation.relation,
            version,
            sourceId: entity.cardId,
            targetId: relation.targetId,
          });
          insertedRelations++;
        }
      }

      // Progress update
      if (batchNumber % 100 === 0 || batchNumber === totalBatches) {
        const progress = 90 + Math.floor((insertedCards / totalCards) * 10);
        log(`  Batch ${batchNumber.toLocaleString()}/${totalBatches.toLocaleString()} - Cards: ${insertedCards.toLocaleString()}, Entities: ${insertedEntities.toLocaleString()}, Localizations: ${insertedLocalizations.toLocaleString()}, Relations: ${insertedRelations.toLocaleString()}`);
        state.insertedEntities = insertedCards;
        state.progress = progress;
        await saveState(state);
      }
    } catch (error) {
      failedBatches++;
      log(`❌ Error in batch ${batchNumber}:`, error instanceof Error ? error.message : String(error));
      for (const entity of batch) {
        state.errors.push({
          cardId: entity.cardId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  if (failedBatches > 0) {
    throw new Error(`Database import failed in ${failedBatches} batch(es)`);
  }

  state.insertedEntities = insertedCards;
  state.progress = 100;
  state.currentStep = 'Database import completed';
  await saveState(state);

  log(`\n✅ Database import completed:`);
  log(`  Cards inserted: ${insertedCards.toLocaleString()}`);
  log(`  Entities inserted: ${insertedEntities.toLocaleString()}`);
  log(`  Localizations inserted: ${insertedLocalizations.toLocaleString()}`);
  log(`  Relations inserted: ${insertedRelations.toLocaleString()}`);
}

function buildLocalizations(entity: EntityData) {
  const langs = new Set([
    ...Object.keys(entity.name ?? {}),
    ...Object.keys(entity.text ?? {}),
    ...Object.keys(entity.flavor ?? {}),
  ]);

  const fallbackName = entity.name?.en ?? Object.values(entity.name ?? {})[0] ?? 'Unknown';
  const fallbackText = entity.text?.en ?? Object.values(entity.text ?? {})[0] ?? '';

  return [...langs].map(lang => {
    const text = cleanCardText(entity.text?.[lang] ?? fallbackText, entity);

    return {
      lang,
      name:   entity.name?.[lang] ?? fallbackName,
      text,
      flavor: entity.flavor?.[lang] ?? null,
    };
  });
}

function normalizeRelationName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

function cleanCardText(value: string, entity: EntityData) {
  const scriptNum = entity.scriptDataNums?.[0] ?? entity.questProgress ?? null;
  const alternateTextSeparator = /@(?=(?:\[x\])?(?:&lt;b&gt;|<b>))/;
  let text = alternateTextSeparator.test(value) ? value.split(alternateTextSeparator)[0]! : value;

  text = text
    .replace(/\[x\]/gi, '')
    .replace(/_/g, ' ')
    .replace(/\$(\d+)/g, '$1')
    .replace(/@/g, scriptNum != null ? String(scriptNum) : '')
    .replace(/\{(\d+)\}/g, (match, index: string, offset: number, input: string) => {
      const before = input.slice(Math.max(0, offset - 24), offset);
      if (/(?:Herald|兆示|预兆|預兆)(?:<\/b>)?\s*$/.test(before)) return '';

      const number = entity.scriptDataNums?.[Number.parseInt(index, 10)] ?? scriptNum;
      return number != null ? String(number) : match;
    })
    .replace(/\|4\(([^)]*)\)/g, (_match, options: string) => {
      const forms = options.split(',').map(part => part.trim()).filter(Boolean);
      return forms.at(-1) ?? '';
    })
    .replace(/[ \t]+\n/g, '\n')
    .trim();

  return text;
}

function resolveDbfRelations(entities: EntityData[]) {
  const cardIdByDbf = new Map(entities.map(entity => [entity.dbfId, entity.cardId]));

  for (const entity of entities) {
    const collectionRelations = (entity.relatedDbfIds ?? [])
      .map(dbfId => cardIdByDbf.get(dbfId))
      .filter((targetId): targetId is string => targetId != null && targetId !== entity.cardId)
      .map(targetId => ({
        relation: 'collection_related',
        targetId,
      }));

    if (collectionRelations.length > 0) {
      entity.relations = dedupeRelations([
        ...(entity.relations ?? []),
        ...collectionRelations,
      ]);
    }
  }
}

function resolveHeraldRelations(entities: EntityData[]) {
  const tokenByClass = new Map<string, EntityData[]>();
  const allTokens: EntityData[] = [];

  for (const entity of entities) {
    if (!isHeraldToken(entity)) continue;

    const classes = getEntityClasses(entity);
    for (const klass of classes) {
      const tokens = tokenByClass.get(klass) ?? [];
      tokens.push(entity);
      tokenByClass.set(klass, tokens);
    }
    allTokens.push(entity);
  }

  for (const entity of entities) {
    if (!entity.isHerald || !entity.collectible) continue;

    const classes = getEntityClasses(entity);
    const tokens = classes.length === 0
      ? allTokens
      : classes.flatMap(klass => tokenByClass.get(klass) ?? []);

    const heraldRelations = dedupeHeraldTokens(tokens).map(token => ({
      relation: 'herald_token',
      targetId:  token.cardId,
    }));

    if (heraldRelations.length > 0) {
      entity.relations = dedupeRelations([
        ...(entity.relations ?? []),
        ...heraldRelations,
      ]);
    }
  }
}

function resolveTitanRelations(entities: EntityData[]) {
  const entitiesByPrefix = new Map<string, EntityData[]>();

  for (const entity of entities) {
    const prefix = entity.cardId.replace(/[et]\d*$/, '');
    const group = entitiesByPrefix.get(prefix) ?? [];
    group.push(entity);
    entitiesByPrefix.set(prefix, group);
  }

  for (const entity of entities) {
    if (!entity.collectible || !entity.mechanics?.includes('titan')) continue;

    const titanAbilities = (entitiesByPrefix.get(entity.cardId) ?? [])
      .filter(card => card.cardId !== entity.cardId)
      .filter(card => card.cardId.startsWith(`${entity.cardId}t`))
      .filter(card => card.cardType === 5);

    if (titanAbilities.length === 0) continue;

    entity.relations = dedupeRelations([
      ...(entity.relations ?? []),
      ...titanAbilities.map(card => ({
        relation: 'titan_ability',
        targetId:  card.cardId,
      })),
    ]);
  }
}

function resolvePlagueRelations(entities: EntityData[]) {
  const tokenIds = new Set(PLAGUE_TOKEN_IDS);
  const plagueTokens = entities.filter(entity => tokenIds.has(entity.cardId));

  if (plagueTokens.length === 0) return;

  for (const entity of entities) {
    if (tokenIds.has(entity.cardId) || !mentionsPlague(entity)) continue;

    entity.relations = dedupeRelations([
      ...(entity.relations ?? []),
      ...plagueTokens.map(token => ({
        relation: 'plague_token',
        targetId:  token.cardId,
      })),
    ]);
  }
}

function mentionsPlague(entity: EntityData) {
  const text = Object.values(entity.text ?? {}).join('\n');
  return /\bPlagues?\b|疫病|瘟疫/.test(text);
}

function isHeraldToken(entity: EntityData) {
  const text = `${entity.text?.en ?? ''}\n${entity.text?.zhs ?? ''}`;
  return entity.collectible !== true
    && entity.cardType === 4
    && /(?:Herald|兆示|预兆|預兆)/.test(text);
}

function getEntityClasses(entity: EntityData) {
  return (entity.classes ?? []).map(mapClass).filter((value): value is string => value != null);
}

function dedupeHeraldTokens(tokens: EntityData[]) {
  const seen = new Set<string>();
  const result: EntityData[] = [];

  for (const token of tokens) {
    const key = token.name?.en ?? token.cardId;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(token);
  }

  return result;
}

function dedupeRelations(relations: Array<{ relation: string; targetId: string }>) {
  const seen = new Set<string>();
  const result: Array<{ relation: string; targetId: string }> = [];

  for (const relation of relations) {
    const key = `${relation.relation}:${relation.targetId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(relation);
  }

  return result;
}

// Helper functions for enum mapping
function mapCardType(enumId?: number): string | undefined {
  if (enumId === undefined) return undefined;
  const typeMap: Record<number, string> = {
    0: 'null',
    1: 'game',
    2: 'player',
    3: 'hero',
    4: 'minion',
    5: 'spell',
    6: 'enchantment',
    7: 'weapon',
    8: 'item',
    9: 'token',
    10: 'hero_power',
    11: 'blank',
    12: 'game_mode_button',
    22: 'move_minion_hover_target',
    23: 'mercenary_ability',
    24: 'buddy_meter',
    39: 'location',
    40: 'quest_reward',
    42: 'tavern_spell',
    43: 'anomaly',
    44: 'trinket',
    45: 'pet',
  };
  return typeMap[enumId];
}

function mapClass(enumId?: number): string | undefined {
  if (enumId === undefined) return undefined;
  const classMap: Record<number, string> = {
    1:  'death_knight',
    2:  'druid',
    3:  'hunter',
    4:  'mage',
    5:  'paladin',
    6:  'priest',
    7:  'rogue',
    8:  'shaman',
    9:  'warlock',
    10: 'warrior',
    11: 'dream',
    12: 'neutral',
    13: 'whizbang',
    14: 'demon_hunter',
  };
  return classMap[enumId];
}

function mapRarity(enumId?: number): string | undefined {
  if (enumId === undefined) return undefined;
  const rarityMap: Record<number, string> = {
    1: 'free',
    2: 'common',
    3: 'rare',
    4: 'epic',
    5: 'legendary',
  };
  return rarityMap[enumId];
}

function mapFaction(enumId?: number): string | undefined {
  if (enumId === undefined) return undefined;
  const factionMap: Record<number, string> = {
    1: 'alliance',
    2: 'horde',
    3: 'neutral',
  };
  return factionMap[enumId];
}

function mapRace(enumId?: number): string | undefined {
  if (enumId === undefined) return undefined;
  const raceMap: Record<number, string> = {
    1:   'bloodelf',
    2:   'draenei',
    3:   'dwarf',
    4:   'gnome',
    5:   'goblin',
    6:   'human',
    7:   'nightelf',
    8:   'orc',
    9:   'tauren',
    10:  'troll',
    11:  'undead',
    12:  'worgen',
    13:  'goblin2',
    14:  'murloc',
    15:  'demon',
    16:  'scourge',
    17:  'mech',
    18:  'elemental',
    19:  'ogre',
    20:  'beast',
    21:  'totem',
    22:  'nerubian',
    23:  'pirate',
    24:  'dragon',
    25:  'blank',
    26:  'all',
    38:  'egg',
    43:  'quilboar',
    80:  'centaur',
    84:  'treant',
    89:  'lock',
    92:  'naga',
    93:  'old_god',
    94:  'pandaren',
    95:  'gronn',
    96:  'celestial',
    97:  'gnoll',
    98:  'golem',
    100: 'vulpera',
  };
  return raceMap[enumId];
}

function mapSpellSchool(enumId?: number): string | undefined {
  if (enumId === undefined) return undefined;
  const schoolMap: Record<number, string> = {
    1:  'arcane',
    2:  'fire',
    3:  'frost',
    4:  'nature',
    5:  'holy',
    6:  'shadow',
    7:  'fel',
    8:  'physical_combat',
    9:  'tavern_spell',
    10: 'spellcraft',
    11: 'lesser_trinket',
    12: 'greater_trinket',
    13: 'upgrade',
  };
  return schoolMap[enumId];
}

function mapSet(enumId?: number): string | undefined {
  if (enumId === undefined) return undefined;
  return `SET_${enumId}`;
}

// Main execution
async function main() {
  log('🚀 Starting Hearthstone data import from hsdata...\n');
  
  if (IMPORT_TO_DB) {
    log('Mode: Database Import');
    log('This script will:');
    log('  1. Clone the hsdata repository from GitHub');
    log('  2. Parse CardDefs.xml and transform entities');
    log('  3. Export entities to JSON file');
    log('  4. Import collectible cards to PostgreSQL database\n');
    
    if (!DATABASE_URL) {
      log('❌ ERROR: DATABASE_URL environment variable is not set');
      log('Set it using: DATABASE_URL=postgres://user:pass@host/db bun scripts/import-hearthstone.ts --db\n');
      process.exit(1);
    }
  } else {
    log('Mode: JSON Export Only');
    log('This script will:');
    log('  1. Clone the hsdata repository from GitHub');
    log('  2. Parse CardDefs.xml and transform entities');
    log('  3. Export entities to JSON file\n');
    log('To import to database, add --db flag and set DATABASE_URL:\n');
    log('  DATABASE_URL=postgres://... bun scripts/import-hearthstone.ts --db\n');
  }

  const state = await loadState();
  state.startedAt = new Date().toISOString();
  state.errors = [];
  state.exportedEntities = 0;
  state.insertedEntities = 0;

  try {
    // Step 1: Download
    await downloadHsdata(state);

    // Step 2: Parse and transform
    const entities = await parseAndTransform(state);

    // Step 3: Export to JSON
    await exportToJson(entities, state);

    // Step 4: Import to database (if requested)
    if (IMPORT_TO_DB) {
      await importToDatabase(entities, state);
    }

    // Mark as completed
    state.status = 'completed';
    state.completedAt = new Date().toISOString();
    state.progress = 100;
    state.currentStep = IMPORT_TO_DB ? 'Database import completed' : 'JSON export completed';
    await saveState(state);

    log('\n' + '='.repeat(60));
    log('✅ Import completed successfully!');
    log('='.repeat(60));
    log(`Total entities found: ${state.totalEntities.toLocaleString()}`);
    log(`Entities processed: ${state.processedEntities.toLocaleString()}`);
    log(`Entities exported: ${state.exportedEntities.toLocaleString()}`);
    
    if (IMPORT_TO_DB) {
      log(`Entities inserted: ${state.insertedEntities.toLocaleString()}`);
    }
    
    log(`Errors: ${state.errors.length}`);

    if (state.errors.length > 0 && state.errors.length <= 10) {
      log('\nSample errors:');
      state.errors.slice(0, 10).forEach(err => {
        log(`  - ${err.cardId}: ${err.error}`);
      });
    }

    log(`\nOutput file: ${OUTPUT_FILE}`);
    log('='.repeat(60) + '\n');

  } catch (error) {
    log('\n❌ Import failed:', error);
    state.status = 'failed';
    state.errors.push({
      cardId: 'N/A',
      error: error instanceof Error ? error.message : String(error),
    });
    await saveState(state);
    process.exit(1);
  }
}

// Run
main()
  .then(() => process.exit(0))
  .catch((error) => {
    log('Fatal error:', error);
    process.exit(1);
  });
