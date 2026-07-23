import { and, eq, inArray, sql } from 'drizzle-orm';

import { getLocalDb } from '../../hsdata-local-db';
import {
  ExtractedCard,
  ExtractedCardTag,
  PatchState,
  RawEntitySnapshot,
  RawEntitySnapshotTag,
  Entity,
  EntityLocalization,
  EntityRelation,
  Set as HearthstoneSet,
  Tag,
} from '@tcg-cards/db/schema/local/hearthstone';
import { Locale } from '@tcg-cards/model/src/hearthstone/schema/basic';
import { textBuilderType } from '@tcg-cards/model/src/hearthstone/schema/entity';

import type {
  EntityRow,
  LocalizationRow,
  RelationRow,
  LocalizationDraft,
  LocalizationlessEntityRow,
  LocalizationlessLocalizationRow,
  TagRow,
  ExtractedCardRow,
  ExtractedCardTagRow,
  ProjectReport,
} from './types';
import { hashCanonicalJson, buildRevisionHashPayload, buildLocalizationHashPayload, buildRenderModel } from './hash';
import { entityKey, localizationKey, relationKey, reconcileEntities, reconcileLocalizations, reconcileRelations } from './reconcile';
import { copyEntitiesIntoTable, copyLocalizationsIntoTable, copyRelationsIntoTable, softDeleteEntities, softDeleteLocalizations, softDeleteRelations } from './write';
import { normalizeExtractedTagValue, isNormalizedMechanicValue, asNumberArray, asJsonMap } from './normalize';
import { getDisplayText, textFromDisplayText } from './display';
import type { DisplayContext } from './display';

const localeMap: Record<string, Locale> = {
  deDE: 'de',
  enUS: 'en',
  esES: 'es',
  esMX: 'mx',
  frFR: 'fr',
  itIT: 'it',
  jaJP: 'ja',
  koKR: 'ko',
  plPL: 'pl',
  ptBR: 'pt',
  ruRU: 'ru',
  thTH: 'th',
  zhCN: 'zhs',
  zhTW: 'zht',
};

const supportedLocaleKeys = ['enUS', 'deDE', 'esES', 'esMX', 'frFR', 'itIT', 'jaJP', 'koKR', 'plPL', 'ptBR', 'ruRU', 'thTH', 'zhCN', 'zhTW'] as const;

function uniqueStrings<S extends string>(values: S[]): S[] {
  return [...new Set(values)];
}

function extractLocString(locData: { m_locValues: string[], m_locId: number } | null, localeIndex: number): string {
  if (!locData) return '';
  return locData.m_locValues[localeIndex] ?? '';
}

function createLocalizationDraft(): LocalizationDraft {
  return {
    name:               '',
    richText:           '',
    targetText:         null,
    textInPlay:         null,
    howToEarn:          null,
    howToEarnGolden:    null,
    howToEarnSignature: null,
    howToEarnDiamond:   null,
    flavorText:         null,
    locChangeType:      'unknown',
  };
}

function createEmptyEntityDraft(cardId: string, dbfId: number): EntityRow {
  return {
    cardId, dbfId,
    version:           [],
    revisionHash:      '',
    legacyPayload:     {},
    set:               '',
    classes:           [],
    type:              'null',
    cost:              0,
    attack:            null,
    health:            null,
    durability:        null,
    armor:             null,
    rune:              null,
    race:              null,
    spellSchool:       null,
    questType:         null,
    questProgress:     null,
    questPart:         null,
    heroPower:         null,
    techLevel:         null,
    inBobsTavern:      false,
    tripleCard:        null,
    raceBucket:        null,
    armorBucket:       null,
    buddy:             null,
    bannedRace:        null,
    mercenaryRole:     null,
    mercenaryFaction:  null,
    colddown:          null,
    collectible:       false,
    elite:             false,
    rarity:            null,
    artist:            '',
    overrideWatermark: null,
    faction:           null,
    mechanics:         {},
    referencedTags:    {},
    textBuilderType:   'default',
    changeType:        'unknown',
    signatureArtist:   null,
    creditsCardName:   null,
    suggestionWeight:  null,
    changeVersion:     null,
  } as unknown as EntityRow;
}

function createEntityDraft(card: ExtractedCardRow): EntityRow {
  return {
    ...createEmptyEntityDraft(card.cardId, card.dbfId),
    artist:            card.artistName ?? '',
    overrideWatermark: card.watermarkTextureOverride ?? null,
    textBuilderType:   textBuilderType.options[card.textBuilderType] ?? 'default',
    signatureArtist:   card.signatureArtistName ?? null,
    creditsCardName:   card.creditsCardName ?? null,
    suggestionWeight:  card.suggestionWeight,
    changeVersion:     card.changeVersion,
  } as unknown as EntityRow;
}

function finalizeEntityDraft(draft: EntityRow): LocalizationlessEntityRow {
  draft.classes = uniqueStrings(draft.classes);
  draft.rune = draft.rune != null && draft.rune.length > 0 ? uniqueStrings(draft.rune) : null;
  draft.race = draft.race != null && draft.race.length > 0 ? uniqueStrings(draft.race) : null;

  if (draft.type === 'minion') {
    if (draft.attack != null && draft.health == null) draft.health = 0;
    if (draft.attack == null && draft.health != null) draft.attack = 0;
  } else if (draft.type === 'weapon') {
    if (draft.attack != null && draft.durability == null) draft.durability = 0;
    if (draft.attack == null && draft.durability != null) draft.attack = 0;
  }

  const entity: LocalizationlessEntityRow = {
    cardId:            draft.cardId,
    revisionHash:      '',
    dbfId:             draft.dbfId,
    legacyPayload:     draft.legacyPayload,
    set:               draft.set,
    classes:           draft.classes,
    type:              draft.type,
    cost:              draft.cost,
    attack:            draft.attack,
    health:            draft.health,
    durability:        draft.durability,
    armor:             draft.armor,
    rune:              draft.rune,
    race:              draft.race,
    spellSchool:       draft.spellSchool,
    questType:         draft.questType,
    questProgress:     draft.questProgress,
    questPart:         draft.questPart,
    heroPower:         draft.heroPower,
    techLevel:         draft.techLevel,
    inBobsTavern:      draft.inBobsTavern,
    tripleCard:        draft.tripleCard,
    raceBucket:        draft.raceBucket,
    armorBucket:       draft.armorBucket,
    buddy:             draft.buddy,
    bannedRace:        draft.bannedRace,
    mercenaryRole:     draft.mercenaryRole,
    mercenaryFaction:  draft.mercenaryFaction,
    colddown:          draft.colddown,
    collectible:       draft.collectible,
    elite:             draft.elite,
    rarity:            draft.rarity,
    artist:            draft.artist,
    overrideWatermark: draft.overrideWatermark,
    faction:           draft.faction,
    mechanics:         draft.mechanics,
    referencedTags:    draft.referencedTags,
    textBuilderType:   draft.textBuilderType,
    changeType:        draft.changeType,
    signatureArtist:   draft.signatureArtist,
    creditsCardName:   draft.creditsCardName,
    suggestionWeight:  draft.suggestionWeight,
    changeVersion:     draft.changeVersion,
  };

  return {
    ...entity,
    revisionHash: hashCanonicalJson(buildRevisionHashPayload(entity)),
  };
}

function finalizeLocalizationRows(
  entity: LocalizationlessEntityRow,
  localizationMap: Map<Locale, LocalizationDraft>,
  tags: Map<number, number>,
  context: Omit<DisplayContext, 'locale' | 'classes' | 'tags' | 'nameByDbfId' | 'richTextByDbfId'> & {
    nameByDbfIdByLocale:     ReadonlyMap<Locale, ReadonlyMap<number, string>>;
    richTextByDbfIdByLocale: ReadonlyMap<Locale, ReadonlyMap<number, string>>;
  },
): LocalizationRow[] {
  const rows: LocalizationRow[] = [];

  for (const [lang, localization] of localizationMap.entries()) {
    const richText = localization.richText;
    const displayContext: DisplayContext = {
      ...context,
      locale:          lang,
      classes:         entity.classes,
      tags,
      nameByDbfId:     context.nameByDbfIdByLocale.get(lang) ?? new Map(),
      richTextByDbfId: context.richTextByDbfIdByLocale.get(lang) ?? new Map(),
    };
    const displayText = getDisplayText(displayContext, richText, entity.textBuilderType);
    const text = textFromDisplayText(displayText, lang);

    const row: LocalizationlessLocalizationRow = {
      cardId:             entity.cardId,
      lang,
      revisionHash:       entity.revisionHash,
      localizationHash:   '',
      renderHash:         null,
      renderModel:        null,
      name:               localization.name,
      text,
      richText,
      displayText,
      targetText:         localization.targetText,
      textInPlay:         localization.textInPlay,
      howToEarn:          localization.howToEarn,
      howToEarnGolden:    localization.howToEarnGolden,
      howToEarnSignature: localization.howToEarnSignature,
      howToEarnDiamond:   localization.howToEarnDiamond,
      flavorText:         localization.flavorText,
      locChangeType:      localization.locChangeType,
    };

    const localizationHash = hashCanonicalJson(buildLocalizationHashPayload(row));
    const renderModel = buildRenderModel(entity, row);
    const renderHash = hashCanonicalJson(renderModel);

    rows.push({
      ...row,
      localizationHash,
      renderModel,
      renderHash,
      version:  [],
    });
  }

  if (rows.length === 0) {
    if (entity.cardId === 'PlaceholderCard' && entity.dbfId === 0) {
      return [];
    }
    throw new Error(`[hearthstone][extracted-project] missing localization rows for ${entity.cardId}`);
  }

  return rows;
}

interface ProjectCardResult {
  entity:        LocalizationlessEntityRow;
  localizations: LocalizationRow[];
  relations:     RelationRow[];
}

function projectExtractedCard(
  card: ExtractedCardRow,
  tags: ExtractedCardTagRow[],
  tagMap: Map<number, TagRow>,
  context: {
    cardIdByDbfId:           Map<number, string>;
    setIdByDbfId:            Map<number, string>;
    nameByDbfIdByLocale:     ReadonlyMap<Locale, ReadonlyMap<number, string>>;
    richTextByDbfIdByLocale: ReadonlyMap<Locale, ReadonlyMap<number, string>>;
  },
): ProjectCardResult {
  const entityDraft = createEntityDraft(card);
  const localizations = new Map<Locale, LocalizationDraft>();
  const weakRelationTargets = new Map<string, string>();

  // Extract localization from JSONB loc fields
  for (let i = 0; i < supportedLocaleKeys.length; i++) {
    const locale = localeMap[supportedLocaleKeys[i]!]!;
    const loc = createLocalizationDraft();
    loc.name = extractLocString(card.name, i);
    loc.richText = extractLocString(card.textInHand, i);
    loc.flavorText = extractLocString(card.flavorText, i);
    loc.howToEarn = extractLocString(card.howToGetCard, i);
    loc.howToEarnGolden = extractLocString(card.howToGetGoldCard, i);
    loc.howToEarnSignature = extractLocString(card.howToGetSignatureCard, i);
    loc.howToEarnDiamond = extractLocString(card.howToGetDiamondCard, i);
    loc.targetText = extractLocString(card.targetArrowText, i);
    localizations.set(locale, loc);
  }

  // Process tags
  const displayTags = new Map<number, number>();
  for (const tag of tags) {
    displayTags.set(tag.tagId, tag.tagValue);
    const tagRow = tagMap.get(tag.tagId);
    const normalized = normalizeExtractedTagValue(tag.tagValue, tagRow, context);
    if (normalized == null) continue;

    // (1,*) reference tags go to referencedTags
    if (tag.isReferenceTag) {
      if (isNormalizedMechanicValue(normalized)) {
        entityDraft.referencedTags[String(tag.tagId)] = normalized;
      }
      // (1,1) also goes to mechanics
      if (tag.isPowerKeywordTag) {
        if (isNormalizedMechanicValue(normalized)) {
          entityDraft.mechanics[String(tag.tagId)] = normalized;
        }
      }
      continue;
    }

    // (0,*) non-reference tags: route via Tag table projectKind
    const projectKind = tagRow?.projectKind;
    const targetPath = tagRow?.projectTargetPath;

    if (!projectKind || !targetPath) {
      continue;
    }

    if (projectKind === 'assign_mechanic') {
      if (isNormalizedMechanicValue(normalized)) {
        entityDraft.mechanics[String(tag.tagId)] = normalized;
      }
      continue;
    }

    if (projectKind === 'assign_legacy') {
      entityDraft.legacyPayload[targetPath] = normalized;
      continue;
    }

    if (projectKind === 'assign_value') {
      const path = targetPath as keyof EntityRow;
      if (path in entityDraft) {
        (entityDraft as unknown as Record<string, unknown>)[path] = normalized;
      }
      continue;
    }

    if (projectKind === 'append_string_array') {
      const path = targetPath as keyof EntityRow;
      const arr = (entityDraft as unknown as Record<string, unknown>)[path];
      if (Array.isArray(arr) && typeof normalized === 'string') {
        arr.push(normalized);
      }
      continue;
    }

    if (projectKind === 'assign_card_ref') {
      if (typeof normalized === 'object' && normalized != null && 'cardId' in normalized) {
        const ref = normalized as { cardId: string | null, dbfId: number | null };
        const path = targetPath as keyof EntityRow;
        if (ref.cardId && path in entityDraft) {
          (entityDraft as unknown as Record<string, unknown>)[path] = ref.cardId;
          weakRelationTargets.set(path, ref.cardId);
        }
      }
      continue;
    }
  }

  const entity = finalizeEntityDraft(entityDraft);
  const localizationRows = finalizeLocalizationRows(entity, localizations, displayTags, {
    cardId:                  entity.cardId,
    dbfId:                   entity.dbfId,
    cardIdByDbfId:           context.cardIdByDbfId,
    nameByDbfIdByLocale:     context.nameByDbfIdByLocale,
    richTextByDbfIdByLocale: context.richTextByDbfIdByLocale,
  });

  // Build relation rows
  const relationRows: RelationRow[] = [];
  if (entity.heroPower) {
    relationRows.push({
      sourceId:           entity.cardId,
      sourceRevisionHash: entity.revisionHash,
      relation:           'hero_power',
      targetId:           entity.heroPower,
      version:            [],
    });
  }
  if (entity.tripleCard) {
    relationRows.push({
      sourceId:           entity.cardId,
      sourceRevisionHash: entity.revisionHash,
      relation:           'triple_card',
      targetId:           entity.tripleCard,
      version:            [],
    });
  }
  if (entity.buddy) {
    relationRows.push({
      sourceId:           entity.cardId,
      sourceRevisionHash: entity.revisionHash,
      relation:           'buddy',
      targetId:           entity.buddy,
      version:            [],
    });
  }

  return { entity, localizations: localizationRows, relations: relationRows };
}

export async function projectExtracted(build: number, cardIds: string[], dryRun = false): Promise<ProjectReport> {
  const localDb = getLocalDb();

  if (cardIds.length === 0) {
    return {
      dryRun,
      skipped:               true,
      sourceTag:             build,
      build,
      snapshotCount:         0,
      totalSnapshotCount:    0,
      skippedSnapshotCount:  0,
      insertedEntities:      0,
      reusedEntities:        0,
      updatedEntities:       0,
      insertedLocalizations: 0,
      reusedLocalizations:   0,
      updatedLocalizations:  0,
      insertedRelations:     0,
      reusedRelations:       0,
      updatedRelations:      0,
      cardRowCount:          0,
      unprojectedTagCount:   0,
      entityPlan:            { upsert: 0, delete: 0 },
      localizationPlan:      { upsert: 0, delete: 0 },
      relationPlan:          { upsert: 0, delete: 0 },
      entityDiff:            { versionMatch: 0, versionChanged: 0, orphanVersionChanged: 0 },
      localizationDiff:      { versionMatch: 0, versionChanged: 0, orphanVersionChanged: 0, renderHashChanged: 0, renderHashNullExisting: 0 },
      relationDiff:          { versionMatch: 0, versionChanged: 0, orphanVersionChanged: 0 },
      sampleDiffPath:        null,
    };
  }

  // Load extracted cards for this build (filtered by cardIds)
  const cards = await localDb.select()
    .from(ExtractedCard)
    .where(and(
      sql<boolean>`${build} = any(${ExtractedCard.buildNumbers})`,
      inArray(ExtractedCard.cardId, cardIds),
    ));

  // Builders resolve referenced definitions against the same extracted build.
  const buildCards = await localDb.select()
    .from(ExtractedCard)
    .where(sql<boolean>`${build} = any(${ExtractedCard.buildNumbers})`);

  // Load tags via snapshot IDs
  const snapshotIds = cards.map(c => c.id);
  const cardTags = snapshotIds.length > 0
    ? await localDb.select()
      .from(ExtractedCardTag)
      .where(inArray(ExtractedCardTag.snapshotId, snapshotIds))
    : [];

  const tagsByDbfId = new Map<number, ExtractedCardTagRow[]>();
  for (const t of cardTags) {
    const list = tagsByDbfId.get(t.dbfId) ?? [];
    list.push(t);
    tagsByDbfId.set(t.dbfId, list);
  }

  // Load Tag table rules
  const enumIds = [...new Set(cardTags.map(t => t.tagId))].sort((a, b) => a - b);
  const tagRows = await localDb.select()
    .from(Tag)
    .where(inArray(Tag.enumId, enumIds));
  const tagMap = new Map(tagRows.map(r => [r.enumId, r]));

  // Build context
  const cardIdByDbfId = new Map(buildCards.map(c => [c.dbfId, c.cardId]));
  const nameByDbfIdByLocale = new Map<Locale, Map<number, string>>();
  const richTextByDbfIdByLocale = new Map<Locale, Map<number, string>>();
  for (let index = 0; index < supportedLocaleKeys.length; index++) {
    const locale = localeMap[supportedLocaleKeys[index]!]!;
    const names = new Map<number, string>();
    const richTexts = new Map<number, string>();
    for (const card of buildCards) {
      const name = extractLocString(card.name, index);
      if (name.length > 0) names.set(card.dbfId, name);
      const richText = extractLocString(card.textInHand, index);
      if (richText.length > 0) richTexts.set(card.dbfId, richText);
    }
    nameByDbfIdByLocale.set(locale, names);
    richTextByDbfIdByLocale.set(locale, richTexts);
  }

  const setRows = await getLocalDb().select({
    dbfId: HearthstoneSet.dbfId,
    setId: HearthstoneSet.setId,
  }).from(HearthstoneSet)
    .then(items => items.filter(item => item.dbfId != null));
  const setIdByDbfId = new Map(setRows.map(row => [row.dbfId!, row.setId]));

  const projectedEntities: EntityRow[] = [];
  const projectedLocalizations: LocalizationRow[] = [];
  const projectedRelations: RelationRow[] = [];

  for (const card of cards) {
    const tags = tagsByDbfId.get(card.dbfId) ?? [];
    const result = projectExtractedCard(card as ExtractedCardRow, tags, tagMap, { cardIdByDbfId, setIdByDbfId, nameByDbfIdByLocale, richTextByDbfIdByLocale });

    projectedEntities.push({
      ...result.entity,
      version:  [build],

    });
    projectedLocalizations.push(...result.localizations.map(loc => ({
      ...loc,
      version:  [build],

    })));
    projectedRelations.push(...result.relations.map(rel => ({
      ...rel,
      version:  [build],

    })));
  }

  // Load existing rows for reconciliation
  const entityCardIds = [...new Set(projectedEntities.map(r => r.cardId))].sort();

  // Load existing entity states
  const existingEntityStates = await localDb.select({
    cardId:       Entity.cardId,
    version:      Entity.version,
    revisionHash: Entity.revisionHash,
  }).from(Entity)
    .where(inArray(Entity.cardId, entityCardIds));

  // Load existing localization states
  const existingLocStates = await localDb.select({
    cardId:           EntityLocalization.cardId,
    version:          EntityLocalization.version,
    lang:             EntityLocalization.lang,
    revisionHash:     EntityLocalization.revisionHash,
    localizationHash: EntityLocalization.localizationHash,
    renderHash:       EntityLocalization.renderHash,
    renderModel:      EntityLocalization.renderModel,
  }).from(EntityLocalization)
    .where(inArray(EntityLocalization.cardId, entityCardIds));

  // Load existing relations
  const sourceIds = [...entityCardIds];
  const existingRelations = await localDb.select()
    .from(EntityRelation)
    .where(inArray(EntityRelation.sourceId, sourceIds));

  // Get global latest build
  const [maxBuildRow] = await localDb.select({
    maxBuild: sql<number>`MAX(${PatchState.buildNumber})`,
  }).from(PatchState)
    .where(eq(PatchState.projectionStatus, 'completed'));
  const globalLatest = maxBuildRow?.maxBuild ?? build;

  // Reconcile
  const targetEntityStates = projectedEntities.map(r => ({
    cardId: r.cardId, version: r.version, revisionHash: r.revisionHash,
  }));
  const targetLocStates = projectedLocalizations.map(r => ({
    cardId:           r.cardId, version:          r.version, lang:             r.lang, revisionHash:     r.revisionHash,
    localizationHash: r.localizationHash, renderHash:       r.renderHash, renderModel:      r.renderModel,
  }));
  const entityResult = await reconcileEntities(existingEntityStates, targetEntityStates, build, globalLatest);
  const localizationResult = await reconcileLocalizations(existingLocStates as any, targetLocStates as any, build, globalLatest);
  const relationResult = await reconcileRelations(existingRelations, projectedRelations, build, globalLatest);

  // Build full row lookups from projections
  const entityByKey = new Map(projectedEntities.map(r => [entityKey(r), r]));
  const locByKey = new Map(projectedLocalizations.map(r => [localizationKey(r), r]));
  const relByKey = new Map(projectedRelations.map(r => [relationKey(r), r]));

  const upsertEntities = entityResult.syncPlan.upsertRows
    .map(r => entityByKey.get(entityKey(r)))
    .filter((r): r is EntityRow => r != null);
  const upsertLocalizations = localizationResult.syncPlan.upsertRows
    .map(r => locByKey.get(localizationKey(r as any)))
    .filter((r): r is LocalizationRow => r != null);
  const upsertRelations = relationResult.syncPlan.upsertRows
    .map(r => relByKey.get(relationKey(r)))
    .filter((r): r is RelationRow => r != null);

  // Build delete rows
  const deleteEntities = entityResult.syncPlan.deleteRows.map(r => ({
    cardId: r.cardId, revisionHash: r.revisionHash,
  }));
  const deleteLocalizations = localizationResult.syncPlan.deleteRows.map(r => ({
    cardId: r.cardId, lang: r.lang, revisionHash: r.revisionHash, localizationHash: r.localizationHash,
  }));
  const deleteRelations = relationResult.syncPlan.deleteRows;

  // Write
  if (!dryRun) {
    await localDb.transaction(async tx => {
      if (deleteEntities.length > 0) {
        await softDeleteEntities(tx as any, deleteEntities);
      }
      if (deleteLocalizations.length > 0) {
        await softDeleteLocalizations(tx as any, deleteLocalizations);
      }
      if (deleteRelations.length > 0) {
        await softDeleteRelations(tx as any, deleteRelations);
      }
      if (upsertEntities.length > 0) {
        await copyEntitiesIntoTable(tx as any, upsertEntities, 'hearthstone.entities');
      }
      if (upsertLocalizations.length > 0) {
        await copyLocalizationsIntoTable(tx as any, upsertLocalizations, 'hearthstone.entity_localizations');
      }
      if (upsertRelations.length > 0) {
        await copyRelationsIntoTable(tx as any, upsertRelations, 'hearthstone.entity_relations');
      }
    });

    // Mark snapshots as projected
    await localDb.update(ExtractedCard)
      .set({ projectionState: 'projected' })
      .where(inArray(ExtractedCard.id, snapshotIds));
  }

  return {
    dryRun,
    skipped:               false,
    sourceTag:             build,
    build,
    snapshotCount:         cards.length,
    totalSnapshotCount:    cards.length,
    skippedSnapshotCount:  0,
    insertedEntities:      entityResult.inserted,
    reusedEntities:        entityResult.reused,
    updatedEntities:       entityResult.updated,
    insertedLocalizations: localizationResult.inserted,
    reusedLocalizations:   localizationResult.reused,
    updatedLocalizations:  localizationResult.updated,
    insertedRelations:     relationResult.inserted,
    reusedRelations:       relationResult.reused,
    updatedRelations:      relationResult.updated,
    cardRowCount:          cards.length,
    unprojectedTagCount:   0,
    entityPlan:            { upsert: entityResult.syncPlan.upsertRows.length, delete: entityResult.syncPlan.deleteRows.length },
    localizationPlan:      { upsert: localizationResult.syncPlan.upsertRows.length, delete: localizationResult.syncPlan.deleteRows.length },
    relationPlan:          { upsert: relationResult.syncPlan.upsertRows.length, delete: relationResult.syncPlan.deleteRows.length },
    entityDiff:            { versionMatch: 0, versionChanged: 0, orphanVersionChanged: 0 },
    localizationDiff:      { versionMatch: 0, versionChanged: 0, orphanVersionChanged: 0, renderHashChanged: 0, renderHashNullExisting: 0 },
    relationDiff:          { versionMatch: 0, versionChanged: 0, orphanVersionChanged: 0 },
    sampleDiffPath:        null,
  };
}

// ── hsdata fallback ──

function normalizeHsdataScalarValue(row: { boolValue: boolean | null, intValue: number | null, stringValue: string | null, locStringValue: Record<string, string> | null, cardValue: string | null, jsonValue: unknown }): unknown {
  if (row.boolValue != null) return row.boolValue;
  if (row.intValue != null) return row.intValue;
  if (row.stringValue != null) return row.stringValue;
  if (row.locStringValue != null) return row.locStringValue;
  if (row.cardValue != null) return { cardId: row.cardValue, dbfId: row.intValue ?? null };
  return row.jsonValue == null ? null : row.jsonValue;
}

function normalizeHsdataTagValue(
  row: { intValue: number | null, boolValue: boolean | null, stringValue: string | null, locStringValue: Record<string, string> | null, cardValue: string | null, jsonValue: unknown },
  tag: TagRow | undefined,
  context: { cardIdByDbfId: Map<number, string>, setIdByDbfId: Map<number, string> },
): unknown {
  const normalizeKind = tag?.normalizeKind ?? 'identity';

  if (normalizeKind === 'identity' || normalizeKind === '' || normalizeKind === 'identity_int' || normalizeKind === 'identity_string') {
    return normalizeHsdataScalarValue(row);
  }

  if (normalizeKind === 'identity_loc_string') {
    return row.locStringValue;
  }

  if (normalizeKind === 'bool_from_int') {
    const config = tag?.normalizeConfig ?? {};
    const trueValues = asNumberArray(config.trueValues);
    const falseValues = asNumberArray(config.falseValues);
    const value = row.intValue;
    if (value == null) return row.boolValue;
    if (trueValues.length > 0 || falseValues.length > 0) {
      if (trueValues.includes(value)) return true;
      if (falseValues.includes(value)) return false;
      return null;
    }
    if (value === 1) return true;
    if (value === 0) return false;
    return null;
  }

  if (normalizeKind === 'enum_from_int') {
    const config = tag?.normalizeConfig ?? {};
    const enumMap = asJsonMap(config.enumMap);
    const value = row.intValue;
    if (value == null) return null;

    if (tag?.slug === 'card_set') {
      return context.setIdByDbfId.get(value) ?? null;
    }

    const mapped = enumMap[String(value)];
    if (typeof mapped === 'string') return mapped;
    if (Array.isArray(mapped)) return mapped.filter(item => typeof item === 'string') as string[];
    return config.allowUnknownEnumValue === true ? String(value) : null;
  }

  if (normalizeKind === 'card_ref_from_int') {
    if (row.cardValue != null) return { cardId: row.cardValue, dbfId: row.intValue ?? null };
    if (row.intValue == null) return null;
    return { cardId: context.cardIdByDbfId.get(row.intValue) ?? null, dbfId: row.intValue };
  }

  if (normalizeKind === 'json_wrap') {
    return row.jsonValue != null ? row.jsonValue : {};
  }

  return normalizeHsdataScalarValue(row);
}

export async function projectHsdataFallback(build: number, cardIds: string[], dryRun = false): Promise<ProjectReport> {
  const localDb = getLocalDb();

  if (cardIds.length === 0) {
    return {
      dryRun, skipped:               true, sourceTag:             build, build,
      snapshotCount:         0, totalSnapshotCount:    0, skippedSnapshotCount:  0,
      insertedEntities:      0, reusedEntities:        0, updatedEntities:       0,
      insertedLocalizations: 0, reusedLocalizations:   0, updatedLocalizations:  0,
      insertedRelations:     0, reusedRelations:       0, updatedRelations:      0,
      cardRowCount:          0, unprojectedTagCount:   0,
      entityPlan:            { upsert: 0, delete: 0 }, localizationPlan:      { upsert: 0, delete: 0 }, relationPlan:          { upsert: 0, delete: 0 },
      entityDiff:            { versionMatch: 0, versionChanged: 0, orphanVersionChanged: 0 },
      localizationDiff:      { versionMatch: 0, versionChanged: 0, orphanVersionChanged: 0, renderHashChanged: 0, renderHashNullExisting: 0 },
      relationDiff:          { versionMatch: 0, versionChanged: 0, orphanVersionChanged: 0 },
      sampleDiffPath:        null,
    };
  }

  console.warn(`[hearthstone][hsdata-fallback] build ${build}: using hsdata with textBuilderType=default, unpack-only fields set to null`);

  // Load snapshots
  const snapshots = await localDb.select()
    .from(RawEntitySnapshot)
    .where(and(
      sql<boolean>`${build} = any(${RawEntitySnapshot.sourceTags})`,
      inArray(RawEntitySnapshot.cardId, cardIds),
    ));

  const snapshotIds = snapshots.map(s => s.id);

  // Load tags
  const rawTags = snapshotIds.length > 0
    ? await localDb.select().from(RawEntitySnapshotTag).where(inArray(RawEntitySnapshotTag.snapshotId, snapshotIds))
    : [];
  const tagsBySnapshotId = new Map<string, typeof rawTags>();
  for (const t of rawTags) {
    const list = tagsBySnapshotId.get(t.snapshotId) ?? [];
    list.push(t);
    tagsBySnapshotId.set(t.snapshotId, list);
  }

  // Load Tag table rules
  const enumIds = [...new Set(rawTags.map(t => t.enumId))].sort((a, b) => a - b);
  const tagRows = await localDb.select().from(Tag).where(inArray(Tag.enumId, enumIds));
  const tagMap = new Map(tagRows.map(r => [r.enumId, r]));

  // Build context
  const cardIdByDbfId = new Map(snapshots.map(s => [s.dbfId, s.cardId]));
  const nameByDbfIdByLocale = new Map<Locale, Map<number, string>>();
  const richTextByDbfIdByLocale = new Map<Locale, Map<number, string>>();
  for (const locale of Object.values(localeMap)) nameByDbfIdByLocale.set(locale, new Map());
  for (const locale of Object.values(localeMap)) richTextByDbfIdByLocale.set(locale, new Map());
  const setRows = await getLocalDb().select({
    dbfId: HearthstoneSet.dbfId, setId: HearthstoneSet.setId,
  }).from(HearthstoneSet).then(items => items.filter(item => item.dbfId != null));
  const setIdByDbfId = new Map(setRows.map(row => [row.dbfId!, row.setId]));

  const projectedEntities: EntityRow[] = [];
  const projectedLocalizations: LocalizationRow[] = [];
  const projectedRelations: RelationRow[] = [];

  for (const snapshot of snapshots) {
    const snapshotTags = tagsBySnapshotId.get(snapshot.id) ?? [];

    // Create entity draft with hsdata defaults
    const entityDraft = createEmptyEntityDraft(snapshot.cardId, snapshot.dbfId);

    // Seed referencedTags from extraPayload
    const extraRefs = (snapshot.extraPayload as Record<string, unknown>).referencedTags;
    if (extraRefs && typeof extraRefs === 'object') {
      for (const [key, value] of Object.entries(extraRefs)) {
        if (typeof value === 'boolean' || (typeof value === 'number' && Number.isSafeInteger(value))) {
          entityDraft.referencedTags[key] = value;
        }
      }
    }

    const localizations = new Map<Locale, LocalizationDraft>();
    const weakRelationTargets = new Map<string, string>();
    const sortedTags = [...snapshotTags].sort((a, b) => a.tagOrder - b.tagOrder);
    const displayTags = new Map<number, number>();

    for (const row of sortedTags) {
      if (row.intValue != null) displayTags.set(row.enumId, row.intValue);
      const tag = tagMap.get(row.enumId);
      const normalized = normalizeHsdataTagValue(row, tag, { cardIdByDbfId, setIdByDbfId });
      if (normalized == null) continue;

      const projectKind = tag?.projectKind;
      const targetPath = tag?.projectTargetPath;

      if (!projectKind || !targetPath) continue;

      if (projectKind === 'assign_mechanic') {
        if (isNormalizedMechanicValue(normalized as boolean | number)) {
          entityDraft.mechanics[String(row.enumId)] = normalized as boolean | number;
        }
        continue;
      }

      if (projectKind === 'assign_legacy') {
        (entityDraft.legacyPayload as Record<string, unknown>)[targetPath] = normalized;
        continue;
      }

      if (projectKind === 'assign_localized_text') {
        if (typeof normalized === 'object' && normalized != null && !Array.isArray(normalized)) {
          const locText = normalized as Record<string, string>;
          for (const [rawLang, text] of Object.entries(locText)) {
            if (typeof text !== 'string') continue;
            const lang = localeMap[rawLang] ?? rawLang as Locale;
            const draft = localizations.get(lang) ?? createLocalizationDraft();
            if (targetPath === 'name') draft.name = text;
            else if (targetPath === 'richText') draft.richText = text;
            else if (targetPath === 'flavorText') draft.flavorText = text;
            else if (targetPath === 'howToEarn') draft.howToEarn = text;
            else if (targetPath === 'howToEarnGolden') draft.howToEarnGolden = text;
            else if (targetPath === 'textInPlay') draft.textInPlay = text;
            else if (targetPath === 'targetText') draft.targetText = text;
            localizations.set(lang, draft);
          }
        }
        continue;
      }

      if (projectKind === 'assign_value') {
        (entityDraft as unknown as Record<string, unknown>)[targetPath] = normalized;
        continue;
      }

      if (projectKind === 'append_string_array') {
        const arr = (entityDraft as unknown as Record<string, unknown>)[targetPath];
        if (Array.isArray(arr) && typeof normalized === 'string') {
          arr.push(normalized);
        }
        continue;
      }

      if (projectKind === 'assign_card_ref') {
        if (typeof normalized === 'object' && normalized != null && 'cardId' in normalized) {
          const ref = normalized as { cardId: string | null, dbfId: number | null };
          if (ref.cardId) {
            (entityDraft as unknown as Record<string, unknown>)[targetPath] = ref.cardId;
            weakRelationTargets.set(targetPath, ref.cardId);
          }
        }
        continue;
      }
    }

    // Ensure main locale has a localization draft
    if (!localizations.has('en')) {
      localizations.set('en', createLocalizationDraft());
    }

    const entity = finalizeEntityDraft(entityDraft);
    const localizationRows = finalizeLocalizationRows(entity, localizations, displayTags, {
      cardId: entity.cardId,
      dbfId:  entity.dbfId,
      cardIdByDbfId,
      nameByDbfIdByLocale,
      richTextByDbfIdByLocale,
    });

    // Build relation rows
    const relationRows: RelationRow[] = [];
    for (const [field, relation] of [['heroPower', 'hero_power'], ['tripleCard', 'triple_card'], ['buddy', 'buddy']] as const) {
      const target = (entity as unknown as Record<string, unknown>)[field];
      if (typeof target === 'string' && target) {
        relationRows.push({
          sourceId:           entity.cardId,
          sourceRevisionHash: entity.revisionHash,
          relation,
          targetId:           target,
          version:            [],
        } as RelationRow);
      }
    }

    projectedEntities.push({ ...entity, version: [build] } as unknown as EntityRow);
    projectedLocalizations.push(...localizationRows.map(loc => ({ ...loc, version: [build] } as unknown as LocalizationRow)));
    projectedRelations.push(...relationRows.map(rel => ({ ...rel, version: [build] } as unknown as RelationRow)));
  }

  // Load existing rows for reconciliation
  const entityCardIds = [...new Set(projectedEntities.map(r => r.cardId))].sort();
  const existingEntityStates = await localDb.select({
    cardId: Entity.cardId, version: Entity.version, revisionHash: Entity.revisionHash,
  }).from(Entity).where(inArray(Entity.cardId, entityCardIds));

  const existingLocStates = await localDb.select({
    cardId:           EntityLocalization.cardId, version:          EntityLocalization.version, lang:             EntityLocalization.lang,
    revisionHash:     EntityLocalization.revisionHash, localizationHash: EntityLocalization.localizationHash,
    renderHash:       EntityLocalization.renderHash, renderModel:      EntityLocalization.renderModel,
  }).from(EntityLocalization).where(inArray(EntityLocalization.cardId, entityCardIds));

  const existingRelations = await localDb.select().from(EntityRelation).where(inArray(EntityRelation.sourceId, entityCardIds));

  const [maxBuildRow] = await localDb.select({
    maxBuild: sql<number>`MAX(${PatchState.buildNumber})`,
  }).from(PatchState).where(eq(PatchState.projectionStatus, 'completed'));
  const globalLatest = maxBuildRow?.maxBuild ?? build;

  // Reconcile
  const targetEntityStates = projectedEntities.map(r => ({
    cardId: r.cardId, version: r.version, revisionHash: r.revisionHash,
  }));
  const targetLocStates = projectedLocalizations.map(r => ({
    cardId:           r.cardId, version:          r.version, lang:             r.lang, revisionHash:     r.revisionHash,
    localizationHash: r.localizationHash, renderHash:       r.renderHash, renderModel:      r.renderModel,
  }));
  const entityResult = await reconcileEntities(existingEntityStates, targetEntityStates, build, globalLatest);
  const localizationResult = await reconcileLocalizations(existingLocStates as any, targetLocStates as any, build, globalLatest);
  const relationResult = await reconcileRelations(existingRelations, projectedRelations, build, globalLatest);

  const entityByKey = new Map(projectedEntities.map(r => [entityKey(r), r]));
  const locByKey = new Map(projectedLocalizations.map(r => [localizationKey(r), r]));
  const relByKey = new Map(projectedRelations.map(r => [relationKey(r), r]));

  const upsertEntities = entityResult.syncPlan.upsertRows.map(r => entityByKey.get(entityKey(r))).filter((r): r is EntityRow => r != null);
  const upsertLocalizations = localizationResult.syncPlan.upsertRows.map(r => locByKey.get(localizationKey(r as any))).filter((r): r is LocalizationRow => r != null);
  const upsertRelations = relationResult.syncPlan.upsertRows.map(r => relByKey.get(relationKey(r))).filter((r): r is RelationRow => r != null);

  const deleteEntities = entityResult.syncPlan.deleteRows.map(r => ({ cardId: r.cardId, revisionHash: r.revisionHash }));
  const deleteLocalizations = localizationResult.syncPlan.deleteRows.map(r => ({
    cardId: r.cardId, lang: r.lang, revisionHash: r.revisionHash, localizationHash: r.localizationHash,
  }));
  const deleteRelations = relationResult.syncPlan.deleteRows;

  if (!dryRun) {
    await localDb.transaction(async tx => {
      if (deleteEntities.length > 0) await softDeleteEntities(tx as any, deleteEntities);
      if (deleteLocalizations.length > 0) await softDeleteLocalizations(tx as any, deleteLocalizations);
      if (deleteRelations.length > 0) await softDeleteRelations(tx as any, deleteRelations);
      if (upsertEntities.length > 0) await copyEntitiesIntoTable(tx as any, upsertEntities, 'hearthstone.entities');
      if (upsertLocalizations.length > 0) await copyLocalizationsIntoTable(tx as any, upsertLocalizations, 'hearthstone.entity_localizations');
      if (upsertRelations.length > 0) await copyRelationsIntoTable(tx as any, upsertRelations, 'hearthstone.entity_relations');
    });
  }

  return {
    dryRun, skipped:               false, sourceTag:             build, build,
    snapshotCount:         snapshots.length, totalSnapshotCount:    snapshots.length, skippedSnapshotCount:  0,
    insertedEntities:      entityResult.inserted, reusedEntities:        entityResult.reused, updatedEntities:       entityResult.updated,
    insertedLocalizations: localizationResult.inserted, reusedLocalizations:   localizationResult.reused, updatedLocalizations:  localizationResult.updated,
    insertedRelations:     relationResult.inserted, reusedRelations:       relationResult.reused, updatedRelations:      relationResult.updated,
    cardRowCount:          snapshots.length, unprojectedTagCount:   0,
    entityPlan:            { upsert: upsertEntities.length, delete: deleteEntities.length },
    localizationPlan:      { upsert: upsertLocalizations.length, delete: deleteLocalizations.length },
    relationPlan:          { upsert: upsertRelations.length, delete: deleteRelations.length },
    entityDiff:            { versionMatch: 0, versionChanged: 0, orphanVersionChanged: 0 },
    localizationDiff:      { versionMatch: 0, versionChanged: 0, orphanVersionChanged: 0, renderHashChanged: 0, renderHashNullExisting: 0 },
    relationDiff:          { versionMatch: 0, versionChanged: 0, orphanVersionChanged: 0 },
    sampleDiffPath:        null,
  };
}
