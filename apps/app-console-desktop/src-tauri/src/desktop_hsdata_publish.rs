use std::collections::{BTreeMap, BTreeSet, HashMap};

use chrono::Utc;
use sea_orm::{
    ActiveModelTrait, ColumnTrait, ConnectionTrait, EntityTrait, IntoActiveModel, QueryFilter, Set,
};
use serde::Serialize;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use tauri::AppHandle;
use uuid::Uuid;

use crate::desktop_database::{
    connect_configured_desktop_database, postgres_statement_with_values, DesktopDatabase,
};
use crate::desktop_hearthstone_publish_target::{
    load_publish_target_connection_string, require_resolved_publish_target,
};
use crate::entity::hearthstone_data::publish_baselines;
use crate::entity::hearthstone_data::publish_batch_cards;
use crate::entity::hearthstone_data::publish_batches;
use crate::entity::hearthstone_data::publish_ledgers;
use crate::entity::hearthstone_data::sea_orm_active_enums::{
    HsdataProjectionStatus, PublishBatchCardAction, PublishBatchCardStatus, PublishBatchStatus,
};
use crate::entity::hearthstone_data::source_versions;
use crate::hearthstone_publish_row_family::cards;
use crate::hearthstone_publish_row_family::entities;
use crate::hearthstone_publish_row_family::entity_localizations;
use crate::hearthstone_publish_row_family::entity_relations;
use crate::hearthstone_publish_row_family::{ChangeType, Locale};

/// Timestamp value normalized to the local migration shape used by publish-side system tables.
fn current_publish_timestamp() -> chrono::NaiveDateTime {
    Utc::now().naive_utc()
}

/// Publish result returned to the desktop frontend after one remote apply attempt.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DesktopHsdataPublishReport {
    pub(crate) batch_id: String,
    pub(crate) publish_target_id: String,
    pub(crate) environment: String,
    pub(crate) target_fingerprint: String,
    pub(crate) manifest_hash: String,
    pub(crate) previous_manifest_hash: Option<String>,
    pub(crate) source_tag_min: i32,
    pub(crate) source_tag_max: i32,
    pub(crate) build_min: i32,
    pub(crate) build_max: i32,
    pub(crate) card_count: u32,
    pub(crate) changed_card_count: u32,
    pub(crate) inserted_card_count: u32,
    pub(crate) updated_card_count: u32,
    pub(crate) deleted_card_count: u32,
    pub(crate) unchanged_card_count: u32,
    pub(crate) published_at: String,
}

/// One fully materialized card family prepared for publish.
#[derive(Clone, Debug)]
struct PublishCardSnapshot {
    card_id: String,
    card: cards::Model,
    entities: Vec<entities::Model>,
    localizations: Vec<entity_localizations::Model>,
    relations: Vec<entity_relations::Model>,
    entity_family_hash: String,
    localization_family_hash: String,
    relation_family_hash: String,
    manifest_hash: String,
}

/// Per-card manifest state persisted in or derived from one publish batch.
#[derive(Clone, Debug)]
struct PublishCardManifestState {
    card_id: String,
    entity_family_hash: String,
    localization_family_hash: String,
    relation_family_hash: String,
    manifest_hash: String,
    entity_row_count: i32,
    localization_row_count: i32,
    relation_row_count: i32,
}

/// Per-card diff row prepared before one remote apply.
#[derive(Clone, Debug)]
struct PublishBatchCardPlan {
    card_id: String,
    action: PublishBatchCardAction,
    current: PublishCardManifestState,
    previous_manifest_hash: Option<String>,
}

/// Aggregated source/build range derived from the current latest local projection.
#[derive(Clone, Debug)]
struct PublishDatasetRange {
    source_tag_min: i32,
    source_tag_max: i32,
    build_min: i32,
    build_max: i32,
}

/// Publish batch summary counts derived from one card-level diff.
#[derive(Clone, Debug, Default)]
struct PublishBatchCounts {
    card_count: i32,
    changed_card_count: i32,
    inserted_card_count: i32,
    updated_card_count: i32,
    deleted_card_count: i32,
    unchanged_card_count: i32,
}

/// Stable lowercase hexadecimal SHA-256 digest for one byte slice.
fn sha256_hex_bytes(bytes: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(bytes);
    let digest = hasher.finalize();
    let mut output = String::with_capacity(digest.len() * 2);

    for byte in digest {
        output.push_str(&format!("{byte:02x}"));
    }

    output
}

/// Stable SHA-256 digest for one serializable JSON value.
fn hash_json(value: &Value) -> Result<String, String> {
    let encoded = serde_json::to_vec(value)
        .map_err(|error| format!("Failed to encode publish manifest JSON: {error}"))?;
    Ok(sha256_hex_bytes(&encoded))
}

/// Empty-family hash reused for deleted-card manifest rows.
fn empty_family_hash() -> String {
    sha256_hex_bytes(b"[]")
}

/// Change-type enum rendered back into the stored database token.
fn change_type_token(value: &ChangeType) -> &'static str {
    match value {
        ChangeType::Unknown => "unknown",
        ChangeType::Major => "major",
        ChangeType::Minor => "minor",
        ChangeType::NonFunctional => "non-functional",
        ChangeType::Wording => "wording",
        ChangeType::Bugged => "bugged",
    }
}

/// Locale enum rendered back into the stored database token.
fn locale_token(value: &Locale) -> &'static str {
    match value {
        Locale::En => "en",
        Locale::De => "de",
        Locale::Zhs => "zhs",
        Locale::Es => "es",
        Locale::Zht => "zht",
        Locale::Fr => "fr",
        Locale::It => "it",
        Locale::Ja => "ja",
        Locale::Ko => "ko",
        Locale::Mx => "mx",
        Locale::Pl => "pl",
        Locale::Pt => "pt",
        Locale::Ru => "ru",
        Locale::Ph => "ph",
        Locale::Th => "th",
        Locale::He => "he",
        Locale::Ar => "ar",
        Locale::Sa => "sa",
        Locale::Grc => "grc",
        Locale::La => "la",
        Locale::Qya => "qya",
    }
}

/// Publish action enum rendered into the stored batch-card token.
fn publish_batch_card_action_token(value: &PublishBatchCardAction) -> &'static str {
    match value {
        PublishBatchCardAction::Insert => "insert",
        PublishBatchCardAction::Update => "update",
        PublishBatchCardAction::Delete => "delete",
        PublishBatchCardAction::Unchanged => "unchanged",
    }
}

/// Entity model serialized in stable field order for publish-manifest hashing.
fn entity_manifest_value(row: &entities::Model) -> Value {
    json!({
        "cardId": row.card_id,
        "version": row.version,
        "revisionHash": row.revision_hash,
        "dbfId": row.dbf_id,
        "legacyPayload": row.legacy_payload,
        "set": row.set,
        "classes": row.class,
        "type": row.r#type,
        "cost": row.cost,
        "attack": row.attack,
        "health": row.health,
        "durability": row.durability,
        "armor": row.armor,
        "rune": row.rune,
        "race": row.race,
        "spellSchool": row.spell_school,
        "questType": row.quest_type,
        "questProgress": row.quest_progress,
        "questPart": row.quest_part,
        "heroPower": row.hero_power,
        "techLevel": row.tech_level,
        "inBobsTavern": row.in_bobs_tavern,
        "tripleCard": row.triple_card,
        "raceBucket": row.race_bucket,
        "armorBucket": row.armor_bucket,
        "buddy": row.buddy,
        "bannedRace": row.banned_race,
        "mercenaryRole": row.mercenary_role,
        "mercenaryFaction": row.mercenary_faction,
        "colddown": row.colddown,
        "collectible": row.collectible,
        "elite": row.elite,
        "rarity": row.rarity,
        "artist": row.artist,
        "overrideWatermark": row.override_watermark,
        "faction": row.faction,
        "mechanics": row.mechanics,
        "referencedTags": row.referenced_tags,
        "textBuilderType": row.text_builder_type,
        "changeType": change_type_token(&row.change_type),
        "isLatest": row.is_latest,
    })
}

/// Localization model serialized in stable field order for publish-manifest hashing.
fn localization_manifest_value(row: &entity_localizations::Model) -> Value {
    json!({
        "cardId": row.card_id,
        "version": row.version,
        "lang": locale_token(&row.lang),
        "revisionHash": row.revision_hash,
        "localizationHash": row.localization_hash,
        "renderHash": row.render_hash,
        "renderModel": row.render_model,
        "isLatest": row.is_latest,
        "name": row.name,
        "text": row.text,
        "richText": row.rich_text,
        "displayText": row.display_text,
        "targetText": row.target_text,
        "textInPlay": row.text_in_play,
        "howToEarn": row.how_to_earn,
        "howToEarnGolden": row.how_to_earn_golden,
        "flavorText": row.flavor_text,
        "locChangeType": change_type_token(&row.loc_change_type),
    })
}

/// Relation model serialized in stable field order for publish-manifest hashing.
fn relation_manifest_value(row: &entity_relations::Model) -> Value {
    json!({
        "sourceId": row.source_id,
        "sourceRevisionHash": row.source_revision_hash,
        "relation": row.relation,
        "targetId": row.target_id,
        "version": row.version,
        "isLatest": row.is_latest,
    })
}

/// Card model serialized in stable field order for publish-manifest hashing.
fn card_manifest_value(row: &cards::Model) -> Value {
    json!({
        "cardId": row.card_id,
        "legalities": row.legalities,
    })
}

/// Card-family manifest row reconstructed from one current local snapshot.
fn build_current_card_manifest(snapshot: &PublishCardSnapshot) -> PublishCardManifestState {
    PublishCardManifestState {
        card_id: snapshot.card_id.clone(),
        entity_family_hash: snapshot.entity_family_hash.clone(),
        localization_family_hash: snapshot.localization_family_hash.clone(),
        relation_family_hash: snapshot.relation_family_hash.clone(),
        manifest_hash: snapshot.manifest_hash.clone(),
        entity_row_count: snapshot.entities.len() as i32,
        localization_row_count: snapshot.localizations.len() as i32,
        relation_row_count: snapshot.relations.len() as i32,
    }
}

/// Deleted-card manifest row synthesized from the previous successful baseline.
fn build_deleted_card_manifest(previous: &PublishCardManifestState) -> PublishCardManifestState {
    let empty_hash = empty_family_hash();

    PublishCardManifestState {
        card_id: previous.card_id.clone(),
        entity_family_hash: empty_hash.clone(),
        localization_family_hash: empty_hash.clone(),
        relation_family_hash: empty_hash.clone(),
        manifest_hash: hash_json(&json!({
            "entityFamilyHash": empty_hash,
            "localizationFamilyHash": empty_hash,
            "relationFamilyHash": empty_hash,
        }))
        .unwrap_or_default(),
        entity_row_count: 0,
        localization_row_count: 0,
        relation_row_count: 0,
    }
}

/// Current latest card families loaded from the local projected Hearthstone tables.
async fn load_current_publish_snapshots(
    connection: &impl ConnectionTrait,
) -> Result<Vec<PublishCardSnapshot>, String> {
    let mut entity_rows = entities::Entity::find()
        .filter(entities::Column::IsLatest.eq(true))
        .all(connection)
        .await
        .map_err(|error| format!("Failed to load latest local Hearthstone entities: {error}"))?;
    let mut localization_rows = entity_localizations::Entity::find()
        .filter(entity_localizations::Column::IsLatest.eq(true))
        .all(connection)
        .await
        .map_err(|error| {
            format!("Failed to load latest local Hearthstone localizations: {error}")
        })?;
    let mut relation_rows = entity_relations::Entity::find()
        .filter(entity_relations::Column::IsLatest.eq(true))
        .all(connection)
        .await
        .map_err(|error| format!("Failed to load latest local Hearthstone relations: {error}"))?;

    entity_rows.sort_by(|left, right| {
        left.card_id
            .cmp(&right.card_id)
            .then_with(|| left.revision_hash.cmp(&right.revision_hash))
    });
    localization_rows.sort_by(|left, right| {
        left.card_id
            .cmp(&right.card_id)
            .then_with(|| locale_token(&left.lang).cmp(locale_token(&right.lang)))
            .then_with(|| left.revision_hash.cmp(&right.revision_hash))
            .then_with(|| left.localization_hash.cmp(&right.localization_hash))
    });
    relation_rows.sort_by(|left, right| {
        left.source_id
            .cmp(&right.source_id)
            .then_with(|| left.relation.cmp(&right.relation))
            .then_with(|| left.target_id.cmp(&right.target_id))
            .then_with(|| left.source_revision_hash.cmp(&right.source_revision_hash))
    });

    let mut entity_map = HashMap::<String, Vec<entities::Model>>::new();
    let mut localization_map = HashMap::<String, Vec<entity_localizations::Model>>::new();
    let mut relation_map = HashMap::<String, Vec<entity_relations::Model>>::new();
    let mut card_ids = BTreeSet::<String>::new();

    for row in entity_rows {
        card_ids.insert(row.card_id.clone());
        entity_map.entry(row.card_id.clone()).or_default().push(row);
    }

    for row in localization_rows {
        card_ids.insert(row.card_id.clone());
        localization_map
            .entry(row.card_id.clone())
            .or_default()
            .push(row);
    }

    for row in relation_rows {
        card_ids.insert(row.source_id.clone());
        relation_map
            .entry(row.source_id.clone())
            .or_default()
            .push(row);
    }

    let mut card_rows = cards::Entity::find()
        .filter(cards::Column::CardId.is_in(card_ids.iter().cloned()))
        .all(connection)
        .await
        .map_err(|error| format!("Failed to load local Hearthstone cards for publish: {error}"))?;
    card_rows.sort_by(|left, right| left.card_id.cmp(&right.card_id));
    let mut card_map = HashMap::<String, cards::Model>::new();

    for row in card_rows {
        card_map.insert(row.card_id.clone(), row);
    }

    let mut snapshots = Vec::with_capacity(card_ids.len());

    for card_id in card_ids {
        let card = card_map.remove(&card_id).unwrap_or_else(|| cards::Model {
            card_id: card_id.clone(),
            legalities: json!({}),
        });
        let entities = entity_map.remove(&card_id).unwrap_or_default();
        let localizations = localization_map.remove(&card_id).unwrap_or_default();
        let relations = relation_map.remove(&card_id).unwrap_or_default();

        if entities.is_empty() {
            return Err(format!(
                "Local publish snapshot for card {} is missing latest entity rows.",
                card_id
            ));
        }

        let entity_family_hash = hash_json(&Value::Array(
            entities.iter().map(entity_manifest_value).collect(),
        ))?;
        let localization_family_hash = hash_json(&Value::Array(
            localizations
                .iter()
                .map(localization_manifest_value)
                .collect(),
        ))?;
        let relation_family_hash = hash_json(&Value::Array(
            relations.iter().map(relation_manifest_value).collect(),
        ))?;
        let manifest_hash = hash_json(&json!({
            "card": card_manifest_value(&card),
            "entityFamilyHash": entity_family_hash,
            "localizationFamilyHash": localization_family_hash,
            "relationFamilyHash": relation_family_hash,
        }))?;

        snapshots.push(PublishCardSnapshot {
            card_id,
            card,
            entities,
            localizations,
            relations,
            entity_family_hash,
            localization_family_hash,
            relation_family_hash,
            manifest_hash,
        });
    }

    Ok(snapshots)
}

/// Previous successful per-card manifest rows loaded from the publish baseline batch.
async fn load_previous_publish_manifests(
    connection: &impl ConnectionTrait,
    publish_target_id: &str,
) -> Result<
    (
        Option<publish_baselines::Model>,
        BTreeMap<String, PublishCardManifestState>,
    ),
    String,
> {
    let baseline = publish_baselines::Entity::find_by_id(publish_target_id.to_string())
        .one(connection)
        .await
        .map_err(|error| format!("Failed to load local publish baseline: {error}"))?;

    let Some(baseline) = baseline else {
        return Ok((None, BTreeMap::new()));
    };

    let rows = publish_batch_cards::Entity::find()
        .filter(publish_batch_cards::Column::BatchId.eq(baseline.batch_id))
        .all(connection)
        .await
        .map_err(|error| format!("Failed to load previous publish batch cards: {error}"))?;

    let mut manifests = BTreeMap::new();

    for row in rows {
        if row.action == PublishBatchCardAction::Delete {
            continue;
        }

        manifests.insert(
            row.card_id.clone(),
            PublishCardManifestState {
                card_id: row.card_id,
                entity_family_hash: row.entity_family_hash,
                localization_family_hash: row.localization_family_hash,
                relation_family_hash: row.relation_family_hash,
                manifest_hash: row.manifest_hash,
                entity_row_count: row.entity_row_count,
                localization_row_count: row.localization_row_count,
                relation_row_count: row.relation_row_count,
            },
        );
    }

    Ok((Some(baseline), manifests))
}

/// Source/build range derived from the current latest projected Hearthstone entities.
async fn derive_publish_dataset_range(
    connection: &impl ConnectionTrait,
    snapshots: &[PublishCardSnapshot],
) -> Result<PublishDatasetRange, String> {
    let mut builds = BTreeSet::<i32>::new();

    for snapshot in snapshots {
        for row in &snapshot.entities {
            for version in &row.version {
                builds.insert(*version);
            }
        }
    }

    let build_min = *builds.first().ok_or_else(|| {
        "Local publish snapshot does not include any Hearthstone build numbers.".to_string()
    })?;
    let build_max = *builds.last().ok_or_else(|| {
        "Local publish snapshot does not include any Hearthstone build numbers.".to_string()
    })?;

    let rows = source_versions::Entity::find()
        .filter(source_versions::Column::Build.is_in(builds.iter().copied()))
        .filter(source_versions::Column::Status.eq("completed"))
        .filter(source_versions::Column::ProjectionStatus.eq(HsdataProjectionStatus::Completed))
        .all(connection)
        .await
        .map_err(|error| {
            format!("Failed to map latest Hearthstone builds back to source tags: {error}")
        })?;

    let mut source_tags = BTreeSet::<i32>::new();

    for row in rows {
        if row.build.is_some() {
            source_tags.insert(row.source_tag);
        }
    }

    let source_tag_min = *source_tags.first().ok_or_else(|| {
        "Local publish snapshot could not resolve source tags for the current build set."
            .to_string()
    })?;
    let source_tag_max = *source_tags.last().ok_or_else(|| {
        "Local publish snapshot could not resolve source tags for the current build set."
            .to_string()
    })?;

    Ok(PublishDatasetRange {
        source_tag_min,
        source_tag_max,
        build_min,
        build_max,
    })
}

/// Diff plan derived from the current manifest and the previous successful baseline.
fn build_publish_batch_plan(
    snapshots: &[PublishCardSnapshot],
    previous: &BTreeMap<String, PublishCardManifestState>,
) -> (Vec<PublishBatchCardPlan>, PublishBatchCounts, String) {
    let mut current = BTreeMap::<String, PublishCardManifestState>::new();

    for snapshot in snapshots {
        current.insert(
            snapshot.card_id.clone(),
            build_current_card_manifest(snapshot),
        );
    }

    let mut card_ids = BTreeSet::<String>::new();
    card_ids.extend(current.keys().cloned());
    card_ids.extend(previous.keys().cloned());

    let mut plans = Vec::with_capacity(card_ids.len());
    let mut counts = PublishBatchCounts::default();
    counts.card_count = card_ids.len() as i32;

    for card_id in card_ids {
        let current_row = current.get(&card_id);
        let previous_row = previous.get(&card_id);

        let (action, current_manifest, previous_manifest_hash) = match (current_row, previous_row) {
            (Some(current_row), None) => {
                (PublishBatchCardAction::Insert, current_row.clone(), None)
            }
            (Some(current_row), Some(previous_row))
                if current_row.manifest_hash == previous_row.manifest_hash =>
            {
                (
                    PublishBatchCardAction::Unchanged,
                    current_row.clone(),
                    Some(previous_row.manifest_hash.clone()),
                )
            }
            (Some(current_row), Some(previous_row)) => (
                PublishBatchCardAction::Update,
                current_row.clone(),
                Some(previous_row.manifest_hash.clone()),
            ),
            (None, Some(previous_row)) => (
                PublishBatchCardAction::Delete,
                build_deleted_card_manifest(previous_row),
                Some(previous_row.manifest_hash.clone()),
            ),
            (None, None) => continue,
        };

        match action {
            PublishBatchCardAction::Insert => {
                counts.changed_card_count += 1;
                counts.inserted_card_count += 1;
            }
            PublishBatchCardAction::Update => {
                counts.changed_card_count += 1;
                counts.updated_card_count += 1;
            }
            PublishBatchCardAction::Delete => {
                counts.changed_card_count += 1;
                counts.deleted_card_count += 1;
            }
            PublishBatchCardAction::Unchanged => {
                counts.unchanged_card_count += 1;
            }
        }

        plans.push(PublishBatchCardPlan {
            card_id,
            action,
            current: current_manifest,
            previous_manifest_hash,
        });
    }

    let manifest_hash = hash_json(&Value::Array(
        plans
            .iter()
            .filter(|plan| plan.action != PublishBatchCardAction::Delete)
            .map(|plan| {
                json!({
                    "cardId": plan.card_id,
                    "entityFamilyHash": plan.current.entity_family_hash,
                    "localizationFamilyHash": plan.current.localization_family_hash,
                    "relationFamilyHash": plan.current.relation_family_hash,
                    "manifestHash": plan.current.manifest_hash,
                })
            })
            .collect(),
    ))
    .unwrap_or_default();

    (plans, counts, manifest_hash)
}

/// Local publish batch row inserted before any remote apply work begins.
async fn insert_publish_batch(
    connection: &impl ConnectionTrait,
    batch_id: Uuid,
    target_id: &str,
    environment: &str,
    target_fingerprint: &str,
    range: &PublishDatasetRange,
    manifest_hash: &str,
    previous_manifest_hash: Option<String>,
    counts: &PublishBatchCounts,
) -> Result<(), String> {
    let now = current_publish_timestamp();

    publish_batches::ActiveModel {
        id: Set(batch_id),
        publish_target_id: Set(target_id.to_string()),
        environment: Set(environment.to_string()),
        target_fingerprint: Set(target_fingerprint.to_string()),
        source_tag_min: Set(range.source_tag_min),
        source_tag_max: Set(range.source_tag_max),
        build_min: Set(range.build_min),
        build_max: Set(range.build_max),
        manifest_hash: Set(manifest_hash.to_string()),
        previous_manifest_hash: Set(previous_manifest_hash),
        card_count: Set(counts.card_count),
        changed_card_count: Set(counts.changed_card_count),
        inserted_card_count: Set(counts.inserted_card_count),
        updated_card_count: Set(counts.updated_card_count),
        deleted_card_count: Set(counts.deleted_card_count),
        unchanged_card_count: Set(counts.unchanged_card_count),
        status: Set(PublishBatchStatus::Draft),
        error: Set(None),
        summary: Set(None),
        created_at: Set(now),
        updated_at: Set(now),
        started_at: Set(None),
        completed_at: Set(None),
    }
    .insert(connection)
    .await
    .map_err(|error| format!("Failed to insert local publish batch: {error}"))?;

    Ok(())
}

/// Local per-card publish rows inserted before the remote apply starts.
async fn insert_publish_batch_cards(
    connection: &impl ConnectionTrait,
    batch_id: Uuid,
    plans: &[PublishBatchCardPlan],
) -> Result<(), String> {
    let now = current_publish_timestamp();

    for plan in plans {
        publish_batch_cards::ActiveModel {
            batch_id: Set(batch_id),
            card_id: Set(plan.card_id.clone()),
            entity_family_hash: Set(plan.current.entity_family_hash.clone()),
            localization_family_hash: Set(plan.current.localization_family_hash.clone()),
            relation_family_hash: Set(plan.current.relation_family_hash.clone()),
            manifest_hash: Set(plan.current.manifest_hash.clone()),
            previous_manifest_hash: Set(plan.previous_manifest_hash.clone()),
            action: Set(plan.action.clone()),
            status: Set(PublishBatchCardStatus::Pending),
            error: Set(None),
            entity_row_count: Set(plan.current.entity_row_count),
            localization_row_count: Set(plan.current.localization_row_count),
            relation_row_count: Set(plan.current.relation_row_count),
            created_at: Set(now),
            updated_at: Set(now),
            applied_at: Set(None),
        }
        .insert(connection)
        .await
        .map_err(|error| {
            format!(
                "Failed to insert local publish batch card {}: {error}",
                plan.card_id
            )
        })?;
    }

    Ok(())
}

/// Batch row marked as applying before the remote transaction begins.
async fn mark_publish_batch_applying(
    connection: &impl ConnectionTrait,
    batch_id: Uuid,
) -> Result<(), String> {
    let model = publish_batches::Entity::find_by_id(batch_id)
        .one(connection)
        .await
        .map_err(|error| format!("Failed to reload local publish batch {batch_id}: {error}"))?
        .ok_or_else(|| format!("Local publish batch {batch_id} does not exist."))?;
    let mut active = model.into_active_model();
    active.status = Set(PublishBatchStatus::Applying);
    active.started_at = Set(Some(current_publish_timestamp()));
    active.error = Set(None);
    active.summary = Set(None);
    active.update(connection).await.map_err(|error| {
        format!("Failed to mark local publish batch {batch_id} as applying: {error}")
    })?;
    Ok(())
}

/// Successful local batch and card states persisted after the remote transaction commits.
async fn finalize_publish_batch_success(
    connection: &impl ConnectionTrait,
    batch_id: Uuid,
    target_id: &str,
    environment: &str,
    target_fingerprint: &str,
    range: &PublishDatasetRange,
    counts: &PublishBatchCounts,
    manifest_hash: &str,
    plans: &[PublishBatchCardPlan],
) -> Result<(), String> {
    let published_at = current_publish_timestamp();
    let summary = json!({
        "batchId": batch_id,
        "publishTargetId": target_id,
        "environment": environment,
        "cardCount": counts.card_count,
        "changedCardCount": counts.changed_card_count,
        "insertedCardCount": counts.inserted_card_count,
        "updatedCardCount": counts.updated_card_count,
        "deletedCardCount": counts.deleted_card_count,
        "unchangedCardCount": counts.unchanged_card_count,
        "publishedAt": chrono::DateTime::<Utc>::from_naive_utc_and_offset(published_at, Utc).to_rfc3339(),
    });

    for plan in plans {
        let row = publish_batch_cards::Entity::find_by_id((batch_id, plan.card_id.clone()))
            .one(connection)
            .await
            .map_err(|error| {
                format!(
                    "Failed to reload local publish batch card {}: {error}",
                    plan.card_id
                )
            })?
            .ok_or_else(|| {
                format!(
                    "Local publish batch card {} does not exist for batch {}.",
                    plan.card_id, batch_id
                )
            })?;
        let mut active = row.into_active_model();
        active.status = Set(match plan.action {
            PublishBatchCardAction::Unchanged => PublishBatchCardStatus::Skipped,
            PublishBatchCardAction::Insert
            | PublishBatchCardAction::Update
            | PublishBatchCardAction::Delete => PublishBatchCardStatus::Applied,
        });
        active.error = Set(None);
        active.applied_at = Set(Some(published_at));
        active.update(connection).await.map_err(|error| {
            format!(
                "Failed to update local publish batch card {}: {error}",
                plan.card_id
            )
        })?;
    }

    let batch = publish_batches::Entity::find_by_id(batch_id)
        .one(connection)
        .await
        .map_err(|error| format!("Failed to reload local publish batch {batch_id}: {error}"))?
        .ok_or_else(|| format!("Local publish batch {batch_id} does not exist."))?;
    let mut batch_active = batch.into_active_model();
    batch_active.status = Set(PublishBatchStatus::Completed);
    batch_active.error = Set(None);
    batch_active.summary = Set(Some(summary));
    batch_active.completed_at = Set(Some(published_at));
    batch_active.update(connection).await.map_err(|error| {
        format!("Failed to mark local publish batch {batch_id} as completed: {error}")
    })?;

    let baseline = publish_baselines::Entity::find_by_id(target_id.to_string())
        .one(connection)
        .await
        .map_err(|error| format!("Failed to reload local publish baseline: {error}"))?;

    match baseline {
        Some(baseline) => {
            let mut active = baseline.into_active_model();
            active.environment = Set(environment.to_string());
            active.target_fingerprint = Set(target_fingerprint.to_string());
            active.batch_id = Set(batch_id);
            active.source_tag_min = Set(range.source_tag_min);
            active.source_tag_max = Set(range.source_tag_max);
            active.build_min = Set(range.build_min);
            active.build_max = Set(range.build_max);
            active.manifest_hash = Set(manifest_hash.to_string());
            active.card_count = Set(counts.card_count);
            active.published_at = Set(published_at);
            active
                .update(connection)
                .await
                .map_err(|error| format!("Failed to update local publish baseline: {error}"))?;
        }
        None => {
            publish_baselines::ActiveModel {
                publish_target_id: Set(target_id.to_string()),
                environment: Set(environment.to_string()),
                target_fingerprint: Set(target_fingerprint.to_string()),
                batch_id: Set(batch_id),
                source_tag_min: Set(range.source_tag_min),
                source_tag_max: Set(range.source_tag_max),
                build_min: Set(range.build_min),
                build_max: Set(range.build_max),
                manifest_hash: Set(manifest_hash.to_string()),
                card_count: Set(counts.card_count),
                published_at: Set(published_at),
                created_at: Set(published_at),
                updated_at: Set(published_at),
            }
            .insert(connection)
            .await
            .map_err(|error| format!("Failed to insert local publish baseline: {error}"))?;
        }
    }

    Ok(())
}

/// Failed batch and card states persisted after the remote apply aborts.
async fn finalize_publish_batch_failure(
    connection: &impl ConnectionTrait,
    batch_id: Uuid,
    failed_card_id: Option<&str>,
    error: &str,
) -> Result<(), String> {
    if let Some(failed_card_id) = failed_card_id {
        if let Some(row) =
            publish_batch_cards::Entity::find_by_id((batch_id, failed_card_id.to_string()))
                .one(connection)
                .await
                .map_err(|load_error| {
                    format!(
                        "Failed to reload failed publish batch card {}: {load_error}",
                        failed_card_id
                    )
                })?
        {
            let mut active = row.into_active_model();
            active.status = Set(PublishBatchCardStatus::Failed);
            active.error = Set(Some(error.to_string()));
            active.update(connection).await.map_err(|update_error| {
                format!(
                    "Failed to mark publish batch card {} as failed: {update_error}",
                    failed_card_id
                )
            })?;
        }
    }

    let batch = publish_batches::Entity::find_by_id(batch_id)
        .one(connection)
        .await
        .map_err(|load_error| {
            format!("Failed to reload failed publish batch {batch_id}: {load_error}")
        })?
        .ok_or_else(|| format!("Local publish batch {batch_id} does not exist."))?;
    let mut active = batch.into_active_model();
    active.status = Set(PublishBatchStatus::Failed);
    active.error = Set(Some(error.to_string()));
    active.completed_at = Set(Some(current_publish_timestamp()));
    active.update(connection).await.map_err(|update_error| {
        format!("Failed to mark local publish batch {batch_id} as failed: {update_error}")
    })?;
    Ok(())
}

/// Remote publish ledger upsert executed after all card-family writes succeed.
async fn upsert_remote_publish_ledger(
    connection: &impl ConnectionTrait,
    batch_id: Uuid,
    target_id: &str,
    environment: &str,
    target_fingerprint: &str,
    range: &PublishDatasetRange,
    counts: &PublishBatchCounts,
    manifest_hash: &str,
) -> Result<(), String> {
    let published_at = current_publish_timestamp();
    let existing = publish_ledgers::Entity::find_by_id(target_id.to_string())
        .one(connection)
        .await
        .map_err(|error| format!("Failed to load remote publish ledger: {error}"))?;

    match existing {
        Some(existing) => {
            let mut active = existing.into_active_model();
            active.environment = Set(environment.to_string());
            active.target_fingerprint = Set(target_fingerprint.to_string());
            active.batch_id = Set(batch_id);
            active.source_tag_min = Set(range.source_tag_min);
            active.source_tag_max = Set(range.source_tag_max);
            active.build_min = Set(range.build_min);
            active.build_max = Set(range.build_max);
            active.manifest_hash = Set(manifest_hash.to_string());
            active.card_count = Set(counts.card_count);
            active.changed_card_count = Set(counts.changed_card_count);
            active.published_at = Set(published_at);
            active
                .update(connection)
                .await
                .map_err(|error| format!("Failed to update remote publish ledger: {error}"))?;
        }
        None => {
            publish_ledgers::ActiveModel {
                publish_target_id: Set(target_id.to_string()),
                environment: Set(environment.to_string()),
                target_fingerprint: Set(target_fingerprint.to_string()),
                batch_id: Set(batch_id),
                source_tag_min: Set(range.source_tag_min),
                source_tag_max: Set(range.source_tag_max),
                build_min: Set(range.build_min),
                build_max: Set(range.build_max),
                manifest_hash: Set(manifest_hash.to_string()),
                card_count: Set(counts.card_count),
                changed_card_count: Set(counts.changed_card_count),
                published_at: Set(published_at),
                created_at: Set(published_at),
                updated_at: Set(published_at),
            }
            .insert(connection)
            .await
            .map_err(|error| format!("Failed to insert remote publish ledger: {error}"))?;
        }
    }

    Ok(())
}

/// Remote Hearthstone row family deleted for one card before re-inserting the current projection.
async fn delete_remote_card_family(
    connection: &impl ConnectionTrait,
    card_id: &str,
) -> Result<(), String> {
    entity_localizations::Entity::delete_many()
        .filter(entity_localizations::Column::CardId.eq(card_id.to_string()))
        .exec(connection)
        .await
        .map_err(|error| {
            format!(
                "Failed to delete remote Hearthstone localizations for card {}: {error}",
                card_id
            )
        })?;
    entity_relations::Entity::delete_many()
        .filter(entity_relations::Column::SourceId.eq(card_id.to_string()))
        .exec(connection)
        .await
        .map_err(|error| {
            format!(
                "Failed to delete remote Hearthstone relations for card {}: {error}",
                card_id
            )
        })?;
    entities::Entity::delete_many()
        .filter(entities::Column::CardId.eq(card_id.to_string()))
        .exec(connection)
        .await
        .map_err(|error| {
            format!(
                "Failed to delete remote Hearthstone entities for card {}: {error}",
                card_id
            )
        })?;
    Ok(())
}

/// Remote Hearthstone card row inserted only when the current card id is missing.
async fn ensure_remote_card_row(
    connection: &impl ConnectionTrait,
    row: &cards::Model,
) -> Result<(), String> {
    connection
        .execute(postgres_statement_with_values(
            r#"
            insert into hearthstone.cards (card_id, legalities)
            values ($1, $2)
            on conflict (card_id) do nothing
            "#,
            vec![row.card_id.clone().into(), row.legalities.clone().into()],
        ))
        .await
        .map_err(|error| {
            format!(
                "Failed to ensure remote Hearthstone card row for card {}: {error}",
                row.card_id
            )
        })?;

    Ok(())
}

/// Remote Hearthstone row family inserted for one current local card snapshot.
async fn insert_remote_card_family(
    connection: &impl ConnectionTrait,
    snapshot: &PublishCardSnapshot,
) -> Result<(), String> {
    ensure_remote_card_row(connection, &snapshot.card).await?;

    for row in &snapshot.entities {
        row.clone()
            .into_active_model()
            .insert(connection)
            .await
            .map_err(|error| {
                format!(
                    "Failed to insert remote Hearthstone entity row for card {}: {error}",
                    snapshot.card_id
                )
            })?;
    }

    for row in &snapshot.localizations {
        row.clone()
            .into_active_model()
            .insert(connection)
            .await
            .map_err(|error| {
                format!(
                    "Failed to insert remote Hearthstone localization row for card {}: {error}",
                    snapshot.card_id
                )
            })?;
    }

    for row in &snapshot.relations {
        row.clone()
            .into_active_model()
            .insert(connection)
            .await
            .map_err(|error| {
                format!(
                    "Failed to insert remote Hearthstone relation row for card {}: {error}",
                    snapshot.card_id
                )
            })?;
    }

    Ok(())
}

/// Remote card-family apply executed inside one single remote database transaction.
async fn apply_publish_batch_to_remote(
    remote_database: &DesktopDatabase,
    snapshots: &[PublishCardSnapshot],
    plans: &[PublishBatchCardPlan],
    batch_id: Uuid,
    target_id: &str,
    environment: &str,
    target_fingerprint: &str,
    range: &PublishDatasetRange,
    counts: &PublishBatchCounts,
    manifest_hash: &str,
) -> Result<(), (Option<String>, String)> {
    let snapshot_map = snapshots
        .iter()
        .map(|snapshot| (snapshot.card_id.clone(), snapshot))
        .collect::<HashMap<_, _>>();
    let remote_transaction = remote_database
        .transaction()
        .await
        .map_err(|error| (None, error))?;

    for plan in plans {
        let result = match plan.action {
            PublishBatchCardAction::Insert | PublishBatchCardAction::Update => {
                async {
                    delete_remote_card_family(&remote_transaction, &plan.card_id).await?;
                    let snapshot = snapshot_map.get(&plan.card_id).ok_or_else(|| {
                        format!(
                            "Current publish snapshot for card {} is missing during remote apply.",
                            plan.card_id
                        )
                    })?;
                    insert_remote_card_family(&remote_transaction, snapshot).await
                }
                .await
            }
            PublishBatchCardAction::Delete => {
                delete_remote_card_family(&remote_transaction, &plan.card_id).await
            }
            PublishBatchCardAction::Unchanged => Ok(()),
        };

        if let Err(error) = result {
            let _ = remote_transaction.rollback().await;
            return Err((Some(plan.card_id.clone()), error));
        }
    }

    if let Err(error) = upsert_remote_publish_ledger(
        &remote_transaction,
        batch_id,
        target_id,
        environment,
        target_fingerprint,
        range,
        counts,
        manifest_hash,
    )
    .await
    {
        let _ = remote_transaction.rollback().await;
        return Err((None, error));
    }

    remote_transaction.commit().await.map_err(|error| {
        (
            None,
            format!("Failed to commit remote publish transaction: {error}"),
        )
    })?;
    Ok(())
}

/// Current local projection published to the configured remote Hearthstone target.
#[tauri::command]
pub(crate) async fn hsdata_publish_current_to_remote(
    app: AppHandle,
) -> Result<DesktopHsdataPublishReport, String> {
    let target = require_resolved_publish_target(&app).await?;
    let connection_string = load_publish_target_connection_string(&app)?.ok_or_else(|| {
        "Hearthstone publish target connection string is not configured.".to_string()
    })?;
    let local_database = connect_configured_desktop_database(&app).await?;
    let snapshots = load_current_publish_snapshots(local_database.connection()).await?;

    if snapshots.is_empty() {
        return Err(
            "No latest local Hearthstone projection rows are available for publish.".to_string(),
        );
    }

    let range = derive_publish_dataset_range(local_database.connection(), &snapshots).await?;
    let (baseline, previous_manifests) =
        load_previous_publish_manifests(local_database.connection(), &target.publish_target_id)
            .await?;
    let previous_manifest_hash = baseline.as_ref().map(|row| row.manifest_hash.clone());
    let (plans, counts, manifest_hash) = build_publish_batch_plan(&snapshots, &previous_manifests);
    let batch_id = Uuid::new_v4();

    insert_publish_batch(
        local_database.connection(),
        batch_id,
        &target.publish_target_id,
        &target.environment,
        &target.target_fingerprint,
        &range,
        &manifest_hash,
        previous_manifest_hash.clone(),
        &counts,
    )
    .await?;
    insert_publish_batch_cards(local_database.connection(), batch_id, &plans).await?;
    mark_publish_batch_applying(local_database.connection(), batch_id).await?;

    let remote_database = DesktopDatabase::connect(&connection_string).await?;
    match apply_publish_batch_to_remote(
        &remote_database,
        &snapshots,
        &plans,
        batch_id,
        &target.publish_target_id,
        &target.environment,
        &target.target_fingerprint,
        &range,
        &counts,
        &manifest_hash,
    )
    .await
    {
        Ok(()) => {
            finalize_publish_batch_success(
                local_database.connection(),
                batch_id,
                &target.publish_target_id,
                &target.environment,
                &target.target_fingerprint,
                &range,
                &counts,
                &manifest_hash,
                &plans,
            )
            .await?;

            Ok(DesktopHsdataPublishReport {
                batch_id: batch_id.to_string(),
                publish_target_id: target.publish_target_id,
                environment: target.environment,
                target_fingerprint: target.target_fingerprint,
                manifest_hash,
                previous_manifest_hash,
                source_tag_min: range.source_tag_min,
                source_tag_max: range.source_tag_max,
                build_min: range.build_min,
                build_max: range.build_max,
                card_count: counts.card_count as u32,
                changed_card_count: counts.changed_card_count as u32,
                inserted_card_count: counts.inserted_card_count as u32,
                updated_card_count: counts.updated_card_count as u32,
                deleted_card_count: counts.deleted_card_count as u32,
                unchanged_card_count: counts.unchanged_card_count as u32,
                published_at: Utc::now().to_rfc3339(),
            })
        }
        Err((failed_card_id, error)) => {
            finalize_publish_batch_failure(
                local_database.connection(),
                batch_id,
                failed_card_id.as_deref(),
                &error,
            )
            .await?;
            Err(error)
        }
    }
}
