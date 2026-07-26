import { sql } from 'drizzle-orm';

import { BaseEntity, BaseEntityLocalization, BaseEntityRelation } from '@tcg-cards/db/schema/local/hearthstone';

import type { EntityRow, LocalizationRow, RelationRow } from './types';

const WRITE_CHUNK_SIZE = 500;

function chunked<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

type AnyTx = {
  insert:   (table: any) => { values: (rows: any[]) => { onConflictDoUpdate: (opts: any) => Promise<any> } };
  update:   (table: any) => { set: (values: any) => { where: (cond: any) => Promise<any> } };
  session?: { client: { unsafe: (query: string, params?: any[]) => Promise<any> } };
};

/** Raw Postgres.js client attached to a Drizzle transaction. */
interface RawTx {
  unsafe(query: string, params?: any[]): Promise<any>;
}

async function batchDelete(
  tx: AnyTx & { session?: { client: RawTx } },
  table: string,
  columns: string,
  rows: string[][],
): Promise<void> {
  const client = tx.session?.client;
  if (!client) throw new Error('Transaction does not support raw SQL');

  for (const chunk of chunked(rows, WRITE_CHUNK_SIZE)) {
    const values = chunk.map(r => `(${r.map(v => `'${v.replace(/'/g, '\'\'')}'`).join(',')})`).join(',');
    const typedColumns = columns.split(',').map(c => `${c.trim()} text`).join(', ');
    const stage = `_del_${table.replace(/\./g, '_')}_${Date.now()}`;
    await client.unsafe(`CREATE TEMP TABLE ${stage} (${typedColumns}) ON COMMIT DROP`);
    await client.unsafe(`INSERT INTO ${stage} (${columns}) VALUES ${values}`);
    await client.unsafe(`
      UPDATE ${table} t SET deleted_at = now()
      FROM ${stage} s
      WHERE ${columns.split(',').map(c => `t.${c.trim()}::text = s.${c.trim()}`).join(' AND ')}
        AND t.deleted_at IS NULL
    `);
  }
}

export async function softDeleteEntities(
  tx: AnyTx,
  rows: Pick<EntityRow, 'cardId' | 'revisionHash'>[],
) {
  await batchDelete(
    tx,
    'hearthstone.entities',
    'card_id, revision_hash',
    rows.map(r => [r.cardId, r.revisionHash]),
  );
}

export async function softDeleteLocalizations(
  tx: AnyTx,
  rows: Pick<LocalizationRow, 'cardId' | 'lang' | 'revisionHash' | 'localizationHash'>[],
) {
  await batchDelete(
    tx,
    'hearthstone.entity_localizations',
    'card_id, lang, revision_hash, localization_hash',
    rows.map(r => [r.cardId, r.lang, r.revisionHash, r.localizationHash]),
  );
}

export async function softDeleteRelations(
  tx: AnyTx,
  rows: RelationRow[],
) {
  await batchDelete(
    tx,
    'hearthstone.entity_relations',
    'source_id, relation, target_id, source_revision_hash',
    rows.map(r => [r.sourceId, r.relation, r.targetId, r.sourceRevisionHash]),
  );
}

export async function copyEntitiesIntoTable(tx: AnyTx, rows: EntityRow[]) {
  for (const chunk of chunked(rows, WRITE_CHUNK_SIZE)) {
    await tx.insert(BaseEntity).values(chunk.map(r => ({
      cardId:            r.cardId,
      version:           r.version,
      revisionHash:      r.revisionHash,
      dbfId:             r.dbfId,
      legacyPayload:     r.legacyPayload as any,
      set:               r.set,
      classes:           r.classes,
      type:              r.type as any,
      cost:              r.cost,
      attack:            r.attack,
      health:            r.health,
      durability:        r.durability,
      armor:             r.armor,
      rune:              r.rune,
      race:              r.race,
      spellSchool:       r.spellSchool,
      questType:         r.questType,
      questProgress:     r.questProgress,
      questPart:         r.questPart,
      heroPower:         r.heroPower,
      techLevel:         r.techLevel,
      inBobsTavern:      r.inBobsTavern,
      tripleCard:        r.tripleCard,
      raceBucket:        r.raceBucket,
      armorBucket:       r.armorBucket,
      buddy:             r.buddy,
      bannedRace:        r.bannedRace,
      mercenaryRole:     r.mercenaryRole,
      mercenaryFaction:  r.mercenaryFaction,
      colddown:          r.colddown,
      collectible:       r.collectible,
      elite:             r.elite,
      rarity:            r.rarity,
      artist:            r.artist,
      overrideWatermark: r.overrideWatermark,
      faction:           r.faction,
      mechanics:         r.mechanics as any,
      referencedTags:    r.referencedTags as any,
      textBuilderType:   r.textBuilderType,
      changeType:        r.changeType,
      signatureArtist:   r.signatureArtist,
      creditsCardName:   r.creditsCardName,
      suggestionWeight:  r.suggestionWeight,
      changeVersion:     r.changeVersion,
    })))
      .onConflictDoUpdate({
        target: [BaseEntity.cardId, BaseEntity.revisionHash],
        set:    {
          version:           sql`excluded.version`,
          dbfId:             sql`excluded.dbf_id`,
          legacyPayload:     sql`excluded.legacy_payload`,
          set:               sql`excluded.set`,
          classes:           sql`excluded.class`,
          type:              sql`excluded.type`,
          cost:              sql`excluded.cost`,
          attack:            sql`excluded.attack`,
          health:            sql`excluded.health`,
          durability:        sql`excluded.durability`,
          armor:             sql`excluded.armor`,
          rune:              sql`excluded.rune`,
          race:              sql`excluded.race`,
          spellSchool:       sql`excluded.spell_school`,
          questType:         sql`excluded.quest_type`,
          questProgress:     sql`excluded.quest_progress`,
          questPart:         sql`excluded.quest_part`,
          heroPower:         sql`excluded.hero_power`,
          techLevel:         sql`excluded.tech_level`,
          inBobsTavern:      sql`excluded.in_bobs_tavern`,
          tripleCard:        sql`excluded.triple_card`,
          raceBucket:        sql`excluded.race_bucket`,
          armorBucket:       sql`excluded.armor_bucket`,
          buddy:             sql`excluded.buddy`,
          bannedRace:        sql`excluded.banned_race`,
          mercenaryRole:     sql`excluded.mercenary_role`,
          mercenaryFaction:  sql`excluded.mercenary_faction`,
          colddown:          sql`excluded.colddown`,
          collectible:       sql`excluded.collectible`,
          elite:             sql`excluded.elite`,
          rarity:            sql`excluded.rarity`,
          artist:            sql`excluded.artist`,
          overrideWatermark: sql`excluded.override_watermark`,
          faction:           sql`excluded.faction`,
          mechanics:         sql`excluded.mechanics`,
          referencedTags:    sql`excluded.referenced_tags`,
          textBuilderType:   sql`excluded.text_builder_type`,
          changeType:        sql`excluded.change_type`,
          signatureArtist:   sql`excluded.signature_artist`,
          creditsCardName:   sql`excluded.credits_card_name`,
          suggestionWeight:  sql`excluded.suggestion_weight`,
          changeVersion:     sql`excluded.change_version`,
          deletedAt:         sql`null`,
          updatedAt:         sql`now()`,
        } as any,
      });
  }
}

export async function copyLocalizationsIntoTable(tx: AnyTx, rows: LocalizationRow[]) {
  for (const chunk of chunked(rows, WRITE_CHUNK_SIZE)) {
    await tx.insert(BaseEntityLocalization).values(chunk.map(r => ({
      cardId:             r.cardId,
      version:            r.version,
      lang:               r.lang,
      revisionHash:       r.revisionHash,
      localizationHash:   r.localizationHash,
      renderHash:         r.renderHash,
      renderModel:        r.renderModel as any,
      name:               r.name,
      text:               r.text,
      richText:           r.richText,
      displayText:        r.displayText,
      targetText:         r.targetText,
      textInPlay:         r.textInPlay,
      howToEarn:          r.howToEarn,
      howToEarnGolden:    r.howToEarnGolden,
      howToEarnSignature: r.howToEarnSignature,
      howToEarnDiamond:   r.howToEarnDiamond,
      flavorText:         r.flavorText,
      locChangeType:      r.locChangeType,
    })))
      .onConflictDoUpdate({
        target: [BaseEntityLocalization.cardId, BaseEntityLocalization.lang, BaseEntityLocalization.revisionHash, BaseEntityLocalization.localizationHash],
        set:    {
          version:            sql`excluded.version`,
          renderHash:         sql`excluded.render_hash`,
          renderModel:        sql`excluded.render_model`,
          name:               sql`excluded.name`,
          text:               sql`excluded.text`,
          richText:           sql`excluded.rich_text`,
          displayText:        sql`excluded.display_text`,
          targetText:         sql`excluded.target_text`,
          textInPlay:         sql`excluded.text_in_play`,
          howToEarn:          sql`excluded.how_to_earn`,
          howToEarnGolden:    sql`excluded.how_to_earn_golden`,
          howToEarnSignature: sql`excluded.how_to_earn_signature`,
          howToEarnDiamond:   sql`excluded.how_to_earn_diamond`,
          flavorText:         sql`excluded.flavor_text`,
          locChangeType:      sql`excluded.loc_change_type`,
          deletedAt:          sql`null`,
          updatedAt:          sql`now()`,
        } as any,
      });
  }
}

export async function copyRelationsIntoTable(tx: AnyTx, rows: RelationRow[]) {
  for (const chunk of chunked(rows, WRITE_CHUNK_SIZE)) {
    await tx.insert(BaseEntityRelation).values(chunk.map(r => ({
      sourceId:           r.sourceId,
      sourceRevisionHash: r.sourceRevisionHash,
      relation:           r.relation,
      targetId:           r.targetId,
      version:            r.version,
    })))
      .onConflictDoUpdate({
        target: [BaseEntityRelation.sourceId, BaseEntityRelation.sourceRevisionHash, BaseEntityRelation.relation, BaseEntityRelation.targetId],
        set:    {
          version:   sql`excluded.version`,
          deletedAt: sql`null`,
          updatedAt: sql`now()`,
        } as any,
      });
  }
}
