import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

import { db } from '@tcg-cards/db/db';

import type { EntityRow, LocalizationRow, RelationRow } from './types';

type DbTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

type CopyCapableClient = {
  unsafe(query: string): {
    writable(): Promise<NodeJS.WritableStream>;
  };
};
type CopyTx = DbTx & { session: { client: CopyCapableClient } };

function encodeCopyCsvField(value: string | null): string {
  if (value == null) {
    return '\\N';
  }

  return `"${value.replace(/"/g, '""')}"`;
}

function encodeCopyIntArray(values: number[]): string {
  return `{${values.join(',')}}`;
}

function encodeCopyTextArray(values: string[]): string {
  return `{${values.map(value => `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`).join(',')}}`;
}

function encodeCopyJson(value: unknown): string | null {
  if (value == null) {
    return null;
  }

  return JSON.stringify(value);
}

function encodeEntityCopyRow(row: EntityRow): string {
  return [
    encodeCopyCsvField(row.cardId),
    encodeCopyCsvField(encodeCopyIntArray(row.version)),
    encodeCopyCsvField(row.revisionHash),
    encodeCopyCsvField(String(row.dbfId)),
    encodeCopyCsvField(encodeCopyJson(row.legacyPayload)),
    encodeCopyCsvField(row.set),
    encodeCopyCsvField(encodeCopyTextArray(row.classes)),
    encodeCopyCsvField(row.type),
    encodeCopyCsvField(String(row.cost)),
    encodeCopyCsvField(row.attack == null ? null : String(row.attack)),
    encodeCopyCsvField(row.health == null ? null : String(row.health)),
    encodeCopyCsvField(row.durability == null ? null : String(row.durability)),
    encodeCopyCsvField(row.armor == null ? null : String(row.armor)),
    encodeCopyCsvField(row.rune == null ? null : encodeCopyTextArray(row.rune)),
    encodeCopyCsvField(row.race == null ? null : encodeCopyTextArray(row.race)),
    encodeCopyCsvField(row.spellSchool),
    encodeCopyCsvField(row.questType),
    encodeCopyCsvField(row.questProgress == null ? null : String(row.questProgress)),
    encodeCopyCsvField(row.questPart == null ? null : String(row.questPart)),
    encodeCopyCsvField(row.heroPower),
    encodeCopyCsvField(row.techLevel == null ? null : String(row.techLevel)),
    encodeCopyCsvField(row.inBobsTavern ? 't' : 'f'),
    encodeCopyCsvField(row.tripleCard),
    encodeCopyCsvField(row.raceBucket),
    encodeCopyCsvField(row.armorBucket == null ? null : String(row.armorBucket)),
    encodeCopyCsvField(row.buddy),
    encodeCopyCsvField(row.bannedRace),
    encodeCopyCsvField(row.mercenaryRole),
    encodeCopyCsvField(row.mercenaryFaction),
    encodeCopyCsvField(row.colddown == null ? null : String(row.colddown)),
    encodeCopyCsvField(row.collectible ? 't' : 'f'),
    encodeCopyCsvField(row.elite ? 't' : 'f'),
    encodeCopyCsvField(row.rarity),
    encodeCopyCsvField(row.artist),
    encodeCopyCsvField(row.overrideWatermark),
    encodeCopyCsvField(row.faction),
    encodeCopyCsvField(encodeCopyJson(row.mechanics)),
    encodeCopyCsvField(encodeCopyJson(row.referencedTags)),
    encodeCopyCsvField(row.textBuilderType),
    encodeCopyCsvField(row.changeType),
    encodeCopyCsvField(row.signatureArtist),
    encodeCopyCsvField(row.creditsCardName),
    encodeCopyCsvField(row.suggestionWeight == null ? null : String(row.suggestionWeight)),
    encodeCopyCsvField(row.changeVersion == null ? null : String(row.changeVersion)),
  ].join('\t') + '\n';
}

function encodeLocalizationCopyRow(row: LocalizationRow): string {
  return [
    encodeCopyCsvField(row.cardId),
    encodeCopyCsvField(encodeCopyIntArray(row.version)),
    encodeCopyCsvField(row.lang),
    encodeCopyCsvField(row.revisionHash),
    encodeCopyCsvField(row.localizationHash),
    encodeCopyCsvField(row.renderHash),
    encodeCopyCsvField(encodeCopyJson(row.renderModel)),
    encodeCopyCsvField(row.name),
    encodeCopyCsvField(row.text),
    encodeCopyCsvField(row.richText),
    encodeCopyCsvField(row.displayText),
    encodeCopyCsvField(row.targetText),
    encodeCopyCsvField(row.textInPlay),
    encodeCopyCsvField(row.howToEarn),
    encodeCopyCsvField(row.howToEarnGolden),
    encodeCopyCsvField(row.howToEarnSignature),
    encodeCopyCsvField(row.howToEarnDiamond),
    encodeCopyCsvField(row.flavorText),
    encodeCopyCsvField(row.locChangeType),
  ].join('\t') + '\n';
}

function encodeRelationCopyRow(row: RelationRow): string {
  return [
    encodeCopyCsvField(row.sourceId),
    encodeCopyCsvField(row.sourceRevisionHash),
    encodeCopyCsvField(row.relation),
    encodeCopyCsvField(row.targetId),
    encodeCopyCsvField(encodeCopyIntArray(row.version)),
  ].join('\t') + '\n';
}

export async function copyEntitiesIntoTable(
  tx: CopyTx,
  rows: EntityRow[],
  targetTable: string,
) {
  const writable = await tx.session.client.unsafe(`
    copy ${targetTable} (
      card_id,
      version,
      revision_hash,
      dbf_id,
      legacy_payload,
      set,
      class,
      type,
      cost,
      attack,
      health,
      durability,
      armor,
      rune,
      race,
      spell_school,
      quest_type,
      quest_progress,
      quest_part,
      hero_power,
      tech_level,
      in_bobs_tavern,
      triple_card,
      race_bucket,
      armor_bucket,
      buddy,
      banned_race,
      mercenary_role,
      mercenary_faction,
      colddown,
      collectible,
      elite,
      rarity,
      artist,
      override_watermark,
      faction,
      mechanics,
      referenced_tags,
      text_builder_type,
      change_type,
      signature_artist,
      credits_card_name,
      suggestion_weight,
      change_version
    ) from stdin with (
      format csv,
      delimiter E'\\t',
      null '\\N'
    )
  `).writable();

  async function* generateEntityCopyLines() {
    for (const row of rows) {
      yield encodeEntityCopyRow(row);
    }
  }

  await pipeline(
    Readable.from(generateEntityCopyLines()),
    writable,
  );
}

export async function copyLocalizationsIntoTable(
  tx: CopyTx,
  rows: LocalizationRow[],
  targetTable: string,
) {
  const writable = await tx.session.client.unsafe(`
    copy ${targetTable} (
      card_id,
      version,
      lang,
      revision_hash,
      localization_hash,
      render_hash,
      render_model,
      name,
      text,
      rich_text,
      display_text,
      target_text,
      text_in_play,
      how_to_earn,
      how_to_earn_golden,
      how_to_earn_signature,
      how_to_earn_diamond,
      flavor_text,
      loc_change_type
    ) from stdin with (
      format csv,
      delimiter E'\\t',
      null '\\N'
    )
  `).writable();

  async function* generateLocalizationCopyLines() {
    for (const row of rows) {
      yield encodeLocalizationCopyRow(row);
    }
  }

  await pipeline(
    Readable.from(generateLocalizationCopyLines()),
    writable,
  );
}

export async function copyRelationsIntoTable(
  tx: CopyTx,
  rows: RelationRow[],
  targetTable: string,
) {
  const writable = await tx.session.client.unsafe(`
    copy ${targetTable} (
      source_id,
      source_revision_hash,
      relation,
      target_id,
      version
    ) from stdin with (
      format csv,
      delimiter E'\\t',
      null '\\N'
    )
  `).writable();

  async function* generateRelationCopyLines() {
    for (const row of rows) {
      yield encodeRelationCopyRow(row);
    }
  }

  await pipeline(
    Readable.from(generateRelationCopyLines()),
    writable,
  );
}

function encodeEntityPkRow(row: Pick<EntityRow, 'cardId' | 'revisionHash'>): string {
  return [
    encodeCopyCsvField(row.cardId),
    encodeCopyCsvField(row.revisionHash),
  ].join('\t') + '\n';
}

function encodeLocalizationPkRow(
  row: Pick<LocalizationRow, 'cardId' | 'lang' | 'revisionHash' | 'localizationHash'>,
): string {
  return [
    encodeCopyCsvField(row.cardId),
    encodeCopyCsvField(row.lang),
    encodeCopyCsvField(row.revisionHash),
    encodeCopyCsvField(row.localizationHash),
  ].join('\t') + '\n';
}

function encodeRelationPkRow(row: RelationRow): string {
  return [
    encodeCopyCsvField(row.sourceId),
    encodeCopyCsvField(row.relation),
    encodeCopyCsvField(row.targetId),
    encodeCopyCsvField(row.sourceRevisionHash),
  ].join('\t') + '\n';
}

export async function softDeleteEntities(
  tx: CopyTx,
  rows: Pick<EntityRow, 'cardId' | 'revisionHash'>[],
) {
  await tx.session.client.unsafe(`
    create temp table hsdata_projection_entity_delete_stage
    on commit drop as
    select card_id, revision_hash
    from hearthstone.entities
    with no data
  `);

  const writable = await tx.session.client.unsafe(`
    copy hsdata_projection_entity_delete_stage (card_id, revision_hash)
    from stdin with (format csv, delimiter E'\\t', null '\\N')
  `).writable();

  async function* generateLines() {
    for (const row of rows) yield encodeEntityPkRow(row);
  }

  await pipeline(Readable.from(generateLines()), writable);

  await tx.session.client.unsafe(`
    update hearthstone.entities as target
    set deleted_at = now()
    from hsdata_projection_entity_delete_stage as stage
    where target.card_id = stage.card_id
      and target.revision_hash = stage.revision_hash
      and target.deleted_at is null
  `);
}

export async function softDeleteLocalizations(
  tx: CopyTx,
  rows: Pick<LocalizationRow, 'cardId' | 'lang' | 'revisionHash' | 'localizationHash'>[],
) {
  await tx.session.client.unsafe(`
    create temp table hsdata_projection_localization_delete_stage
    on commit drop as
    select card_id, lang, revision_hash, localization_hash
    from hearthstone.entity_localizations
    with no data
  `);

  const writable = await tx.session.client.unsafe(`
    copy hsdata_projection_localization_delete_stage (card_id, lang, revision_hash, localization_hash)
    from stdin with (format csv, delimiter E'\\t', null '\\N')
  `).writable();

  async function* generateLines() {
    for (const row of rows) yield encodeLocalizationPkRow(row);
  }

  await pipeline(Readable.from(generateLines()), writable);

  await tx.session.client.unsafe(`
    update hearthstone.entity_localizations as target
    set deleted_at = now()
    from hsdata_projection_localization_delete_stage as stage
    where target.card_id = stage.card_id
      and target.lang = stage.lang
      and target.revision_hash = stage.revision_hash
      and target.localization_hash = stage.localization_hash
      and target.deleted_at is null
  `);
}

export async function softDeleteRelations(
  tx: CopyTx,
  rows: RelationRow[],
) {
  await tx.session.client.unsafe(`
    create temp table hsdata_projection_relation_delete_stage
    on commit drop as
    select source_id, relation, target_id, source_revision_hash
    from hearthstone.entity_relations
    with no data
  `);

  const writable = await tx.session.client.unsafe(`
    copy hsdata_projection_relation_delete_stage (source_id, relation, target_id, source_revision_hash)
    from stdin with (format csv, delimiter E'\\t', null '\\N')
  `).writable();

  async function* generateLines() {
    for (const row of rows) yield encodeRelationPkRow(row);
  }

  await pipeline(Readable.from(generateLines()), writable);

  await tx.session.client.unsafe(`
    update hearthstone.entity_relations as target
    set deleted_at = now()
    from hsdata_projection_relation_delete_stage as stage
    where target.source_id = stage.source_id
      and target.relation = stage.relation
      and target.target_id = stage.target_id
      and target.source_revision_hash = stage.source_revision_hash
      and target.deleted_at is null
  `);
}
