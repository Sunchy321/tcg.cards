use crate::desktop_database::connect_configured_desktop_database;
use crate::entity::hearthstone_data::hsdata_import_job_chunks;
use crate::entity::hearthstone_data::hsdata_import_job_snapshots;
use crate::entity::hearthstone_data::hsdata_import_jobs;
use crate::entity::hearthstone_data::raw_entity_snapshot_tags;
use crate::entity::hearthstone_data::raw_entity_snapshots;
use crate::entity::hearthstone_data::sea_orm_active_enums::{
    HsdataImportChunkStatus, HsdataImportCleanupStatus, HsdataImportJobStatus,
    HsdataProjectionStatus,
};
use crate::entity::hearthstone_data::source_versions;
use crate::entity::hearthstone_data::tags;
use crate::hsdata_import_payload::HsdataPreparedPayloadChunk;
use sea_orm::{
    ActiveModelTrait, ActiveValue::Set, ColumnTrait, ConnectionTrait, DbBackend, EntityTrait,
    IntoActiveModel, Order, PaginatorTrait, QueryFilter, QueryOrder, Statement, TransactionTrait,
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::collections::{BTreeMap, HashMap, HashSet};
use uuid::Uuid;

/// Naive UTC timestamp resolved from the current system clock.
fn now_utc() -> chrono::NaiveDateTime {
    chrono::Utc::now().naive_utc()
}

/// Prepared hsdata payload written into the local desktop database.
#[derive(Clone)]
pub(crate) struct DesktopHsdataLocalImportInput {
    pub(crate) source_tag: u32,
    pub(crate) source_commit: String,
    pub(crate) source_uri: String,
    pub(crate) build: u32,
    pub(crate) source_hash: String,
    pub(crate) chunking_version: String,
    pub(crate) payload_format_version: String,
    pub(crate) payload_encoding: String,
    pub(crate) import_engine_version: String,
    pub(crate) max_bytes_per_chunk: usize,
    pub(crate) max_entities_per_chunk: usize,
    pub(crate) dry_run: bool,
    pub(crate) force: bool,
    pub(crate) total_entity_count: u32,
    pub(crate) chunks: Vec<HsdataPreparedPayloadChunk>,
}

/// Completed local hsdata import result plus its persisted job id.
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DesktopHsdataLocalImportResult {
    pub(crate) job_id: String,
    pub(crate) report: DesktopHsdataImportReport,
}

/// Local hsdata import report returned from desktop Rust.
#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DesktopHsdataImportReport {
    pub(crate) dry_run: bool,
    pub(crate) skipped: bool,
    pub(crate) source_tag: u32,
    pub(crate) build: u32,
    pub(crate) source_hash: String,
    pub(crate) entity_count: u32,
    pub(crate) inserted_snapshots: u32,
    pub(crate) reused_snapshots: u32,
    pub(crate) inserted_tag_rows: u32,
    pub(crate) discovered_tag_count: u32,
    pub(crate) updated_discovered_tags: u32,
    pub(crate) fallback_tag_row_count: u32,
    pub(crate) latest_snapshot_count: u32,
    pub(crate) discovered_tags: Vec<u32>,
}

/// Normalized raw tag payload staged inside one NDJSON snapshot line.
#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct LocalHsdataRawTag {
    enum_id: u32,
    raw_name: String,
    raw_type: String,
    raw_payload: Value,
    raw_value: Option<String>,
    loc_string_value: Option<BTreeMap<String, String>>,
    card_ref_card_id: Option<String>,
    tag_order: u32,
}

/// Canonical NDJSON line parsed from one prepared hsdata chunk.
#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct LocalHsdataParsedEntity {
    card_id: String,
    dbf_id: u32,
    entity_xml_version: u32,
    tags: Vec<LocalHsdataRawTag>,
    extra_payload: Value,
}

/// Existing raw snapshot row reused during local finalize.
struct ExistingSnapshotRow {
    id: Uuid,
    card_id: String,
    snapshot_hash: String,
    source_tags: Vec<i32>,
}

/// Existing tag row reused while parsing raw tag values.
struct ExistingTagRow {
    value_kind: String,
    raw_names: Vec<String>,
    raw_name: Option<String>,
    raw_type: Option<String>,
}

/// Parsed tag value resolved into the raw archive storage columns.
struct ResolvedTagValue {
    value_kind: String,
    parse_status: String,
    bool_value: Option<bool>,
    int_value: Option<i32>,
    string_value: Option<String>,
    loc_string_value: Option<Value>,
    card_ref_card_id: Option<String>,
    json_value: Option<Value>,
}

/// Stable sha256 digest rendered as lowercase hexadecimal.
fn sha256_hex(input: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(input.as_bytes());
    format!("{:x}", hasher.finalize())
}

/// Stable discovered-tag slug derived from one raw tag name and enum id.
fn slugify_tag(raw_name: &str, enum_id: u32) -> String {
    let mut slug = String::new();
    let mut last_dash = false;

    for character in raw_name.trim().to_ascii_lowercase().chars() {
        if character.is_ascii_alphanumeric() {
            slug.push(character);
            last_dash = false;
            continue;
        }

        if !last_dash {
            slug.push('-');
            last_dash = true;
        }
    }

    let slug = slug.trim_matches('-');
    format!("{}-{}", if slug.is_empty() { "tag" } else { slug }, enum_id)
}

/// Snapshot lookup key assembled from one card id plus one snapshot hash.
fn snapshot_key(card_id: &str, snapshot_hash: &str) -> String {
    format!("{card_id}\u{0000}{snapshot_hash}")
}

/// Import manifest hash persisted beside one local job row.
fn compute_manifest_hash(input: &DesktopHsdataLocalImportInput) -> Result<String, String> {
    #[derive(Serialize)]
    #[serde(rename_all = "camelCase")]
    struct ManifestChunk<'a> {
        chunk_index: u32,
        payload_hash: &'a str,
        entity_count: u32,
    }

    #[derive(Serialize)]
    #[serde(rename_all = "camelCase")]
    struct Manifest<'a> {
        build: u32,
        chunking_version: &'a str,
        payload_format_version: &'a str,
        payload_encoding: &'a str,
        import_engine_version: &'a str,
        max_bytes_per_chunk: usize,
        max_entities_per_chunk: usize,
        total_chunk_count: usize,
        total_entity_count: u32,
        chunks: Vec<ManifestChunk<'a>>,
    }

    let manifest = Manifest {
        build: input.build,
        chunking_version: &input.chunking_version,
        payload_format_version: &input.payload_format_version,
        payload_encoding: &input.payload_encoding,
        import_engine_version: &input.import_engine_version,
        max_bytes_per_chunk: input.max_bytes_per_chunk,
        max_entities_per_chunk: input.max_entities_per_chunk,
        total_chunk_count: input.chunks.len(),
        total_entity_count: input.total_entity_count,
        chunks: input
            .chunks
            .iter()
            .map(|chunk| ManifestChunk {
                chunk_index: chunk.chunk_index,
                payload_hash: &chunk.payload_hash,
                entity_count: chunk.entity_count,
            })
            .collect(),
    };

    serde_json::to_string(&manifest)
        .map(|json| sha256_hex(&json))
        .map_err(|error| format!("Failed to encode hsdata import manifest: {error}"))
}

/// Prepared NDJSON chunk decoded and validated against one frozen manifest entry.
fn parse_chunk_entities(
    chunk: &HsdataPreparedPayloadChunk,
) -> Result<Vec<(LocalHsdataParsedEntity, String)>, String> {
    let payload_hash = sha256_hex(&chunk.ndjson);
    if payload_hash != chunk.payload_hash {
        return Err(format!(
            "Chunk {} payloadHash does not match the prepared payload.",
            chunk.chunk_index
        ));
    }

    let entities = chunk
        .ndjson
        .lines()
        .filter(|line| !line.trim().is_empty())
        .map(|line| {
            serde_json::from_str::<LocalHsdataParsedEntity>(line)
                .map(|entity| (entity, sha256_hex(line)))
                .map_err(|error| {
                    format!(
                        "Failed to decode hsdata chunk {} line as JSON: {error}",
                        chunk.chunk_index
                    )
                })
        })
        .collect::<Result<Vec<_>, String>>()?;

    if entities.len() != chunk.entity_count as usize {
        return Err(format!(
            "Chunk {} entityCount does not match the prepared payload.",
            chunk.chunk_index
        ));
    }

    Ok(entities)
}

/// Active local job id created for one staged desktop import.
async fn create_local_import_job(
    database: &sea_orm::DatabaseConnection,
    input: &DesktopHsdataLocalImportInput,
) -> Result<Uuid, String> {
    let active_job = hsdata_import_jobs::Entity::find()
        .filter(hsdata_import_jobs::Column::SourceTag.eq(input.source_tag as i32))
        .filter(hsdata_import_jobs::Column::Status.is_in([
            HsdataImportJobStatus::Uploading,
            HsdataImportJobStatus::ReadyToFinalize,
            HsdataImportJobStatus::Finalizing,
        ]))
        .one(database)
        .await
        .map_err(|error| format!("Failed to query local hsdata import jobs: {error}"))?;

    if active_job.is_some() {
        return Err(format!(
            "sourceTag {} already has an active local import job",
            input.source_tag
        ));
    }

    let job_id = Uuid::new_v4();
    let manifest_hash = compute_manifest_hash(input)?;
    let chunk_count = i32::try_from(input.chunks.len())
        .map_err(|_| "Chunk count overflowed PostgreSQL integer range.".to_string())?;

    hsdata_import_jobs::Entity::insert(hsdata_import_jobs::ActiveModel {
        id: Set(job_id),
        source_tag: Set(input.source_tag as i32),
        source_commit: Set(input.source_commit.clone()),
        source_uri: Set(input.source_uri.clone()),
        build: Set(input.build as i32),
        source_hash: Set(input.source_hash.clone()),
        manifest_hash: Set(manifest_hash),
        chunking_version: Set(input.chunking_version.clone()),
        payload_format_version: Set(input.payload_format_version.clone()),
        payload_encoding: Set(input.payload_encoding.clone()),
        import_engine_version: Set(input.import_engine_version.clone()),
        max_bytes_per_chunk: Set(
            i32::try_from(input.max_bytes_per_chunk)
                .map_err(|_| "maxBytesPerChunk overflowed PostgreSQL integer range.".to_string())?,
        ),
        max_entities_per_chunk: Set(
            i32::try_from(input.max_entities_per_chunk).map_err(|_| {
                "maxEntitiesPerChunk overflowed PostgreSQL integer range.".to_string()
            })?,
        ),
        dry_run: Set(input.dry_run),
        force: Set(input.force),
        total_chunk_count: Set(chunk_count),
        total_entity_count: Set(input.total_entity_count as i32),
        status: Set(HsdataImportJobStatus::Uploading),
        error: Set(None),
        report: Set(None),
        staging_cleanup_status: Set(HsdataImportCleanupStatus::NotStarted),
        staging_cleanup_error: Set(None),
        cleaned_at: Set(None),
        created_at: Default::default(),
        updated_at: Default::default(),
        finalized_at: Set(None),
    })
    .exec(database)
    .await
    .map_err(|error| format!("Failed to create local hsdata import job: {error}"))?;

    let chunk_models = input
        .chunks
        .iter()
        .map(|chunk| {
            Ok(hsdata_import_job_chunks::ActiveModel {
                job_id: Set(job_id),
                chunk_index: Set(i32::try_from(chunk.chunk_index).map_err(|_| {
                    "chunkIndex overflowed PostgreSQL integer range.".to_string()
                })?),
                entity_count: Set(i32::try_from(chunk.entity_count).map_err(|_| {
                    "entityCount overflowed PostgreSQL integer range.".to_string()
                })?),
                payload_hash: Set(chunk.payload_hash.clone()),
                status: Set(HsdataImportChunkStatus::Pending),
                error: Set(None),
                claimed_at: Set(None),
                completed_at: Set(None),
                created_at: Default::default(),
                updated_at: Default::default(),
            })
        })
        .collect::<Result<Vec<_>, String>>()?;

    if !chunk_models.is_empty() {
        hsdata_import_job_chunks::Entity::insert_many(chunk_models)
            .exec(database)
            .await
            .map_err(|error| format!("Failed to create local hsdata import job chunks: {error}"))?;
    }

    Ok(job_id)
}

/// Chunk progress row updated into one transient processing state.
async fn mark_chunk_processing(
    transaction: &sea_orm::DatabaseTransaction,
    job_id: Uuid,
    chunk_index: i32,
) -> Result<(), String> {
    let Some(model) = hsdata_import_job_chunks::Entity::find_by_id((job_id, chunk_index))
        .one(transaction)
        .await
        .map_err(|error| format!("Failed to load local hsdata import chunk: {error}"))?
    else {
        return Err(format!(
            "Chunk {} is not registered for local job {}.",
            chunk_index, job_id
        ));
    };

    let mut active = model.into_active_model();
    active.status = Set(HsdataImportChunkStatus::Processing);
    active.claimed_at = Set(Some(now_utc()));
    active.error = Set(None);
    active
        .update(transaction)
        .await
        .map_err(|error| format!("Failed to mark local hsdata import chunk as processing: {error}"))?;

    Ok(())
}

/// Staged card ids already owned by a different chunk in the same local job.
async fn load_conflicting_staged_card_ids(
    transaction: &sea_orm::DatabaseTransaction,
    job_id: Uuid,
    chunk_index: i32,
    card_ids: &[String],
) -> Result<Vec<String>, String> {
    if card_ids.is_empty() {
        return Ok(Vec::new());
    }

    let rows = hsdata_import_job_snapshots::Entity::find()
        .filter(hsdata_import_job_snapshots::Column::JobId.eq(job_id))
        .filter(hsdata_import_job_snapshots::Column::CardId.is_in(card_ids.iter().cloned()))
        .all(transaction)
        .await
        .map_err(|error| {
            format!("Failed to query local hsdata staged snapshot conflicts: {error}")
        })?;

    Ok(rows
        .into_iter()
        .filter(|row| row.chunk_index != chunk_index)
        .map(|row| row.card_id)
        .collect::<HashSet<_>>()
        .into_iter()
        .collect())
}

/// Prepared NDJSON chunk staged into one local hsdata import job.
async fn stage_local_import_chunk(
    transaction: &sea_orm::DatabaseTransaction,
    job_id: Uuid,
    job_total_chunk_count: i32,
    chunk: &HsdataPreparedPayloadChunk,
) -> Result<(), String> {
    let chunk_index = i32::try_from(chunk.chunk_index)
        .map_err(|_| "chunkIndex overflowed PostgreSQL integer range.".to_string())?;
    mark_chunk_processing(transaction, job_id, chunk_index).await?;

    let entities = parse_chunk_entities(chunk)?;
    let card_ids = entities
        .iter()
        .map(|(entity, _)| entity.card_id.clone())
        .collect::<Vec<_>>();
    let conflicts =
        load_conflicting_staged_card_ids(transaction, job_id, chunk_index, &card_ids).await?;

    if !conflicts.is_empty() {
        return Err(format!(
            "Chunk {} conflicts with staged cardId(s): {}",
            chunk.chunk_index,
            conflicts.join(", ")
        ));
    }

    hsdata_import_job_snapshots::Entity::delete_many()
        .filter(hsdata_import_job_snapshots::Column::JobId.eq(job_id))
        .filter(hsdata_import_job_snapshots::Column::ChunkIndex.eq(chunk_index))
        .exec(transaction)
        .await
        .map_err(|error| format!("Failed to clear local hsdata staged chunk rows: {error}"))?;

    let staged_models = entities
        .into_iter()
        .map(|(entity, snapshot_hash)| {
            Ok(hsdata_import_job_snapshots::ActiveModel {
                id: Set(Uuid::new_v4()),
                job_id: Set(job_id),
                chunk_index: Set(chunk_index),
                card_id: Set(entity.card_id),
                dbf_id: Set(entity.dbf_id as i32),
                entity_xml_version: Set(entity.entity_xml_version as i32),
                snapshot_hash: Set(snapshot_hash),
                tags: Set(serde_json::to_value(entity.tags).map_err(|error| {
                    format!("Failed to encode local hsdata staged tags: {error}")
                })?),
                extra_payload: Set(entity.extra_payload),
                created_at: Default::default(),
                updated_at: Default::default(),
            })
        })
        .collect::<Result<Vec<_>, String>>()?;

    if !staged_models.is_empty() {
        hsdata_import_job_snapshots::Entity::insert_many(staged_models)
            .exec(transaction)
            .await
            .map_err(|error| format!("Failed to insert local hsdata staged snapshots: {error}"))?;
    }

    let Some(chunk_model) = hsdata_import_job_chunks::Entity::find_by_id((job_id, chunk_index))
        .one(transaction)
        .await
        .map_err(|error| format!("Failed to reload local hsdata import chunk: {error}"))?
    else {
        return Err(format!(
            "Chunk {} is not registered for local job {}.",
            chunk_index, job_id
        ));
    };

    let mut chunk_active = chunk_model.into_active_model();
    chunk_active.status = Set(HsdataImportChunkStatus::Completed);
    chunk_active.completed_at = Set(Some(now_utc()));
    chunk_active.error = Set(None);
    chunk_active
        .update(transaction)
        .await
        .map_err(|error| format!("Failed to complete local hsdata import chunk: {error}"))?;

    let completed_chunk_count = hsdata_import_job_chunks::Entity::find()
        .filter(hsdata_import_job_chunks::Column::JobId.eq(job_id))
        .filter(hsdata_import_job_chunks::Column::Status.eq(HsdataImportChunkStatus::Completed))
        .count(transaction)
        .await
        .map_err(|error| format!("Failed to count local hsdata completed chunks: {error}"))?;

    let Some(job_model) = hsdata_import_jobs::Entity::find_by_id(job_id)
        .one(transaction)
        .await
        .map_err(|error| format!("Failed to reload local hsdata import job: {error}"))?
    else {
        return Err(format!("Local hsdata import job {job_id} does not exist."));
    };

    let mut job_active = job_model.into_active_model();
    job_active.status = Set(if completed_chunk_count == job_total_chunk_count as u64 {
        HsdataImportJobStatus::ReadyToFinalize
    } else {
        HsdataImportJobStatus::Uploading
    });
    job_active.error = Set(None);
    job_active
        .update(transaction)
        .await
        .map_err(|error| format!("Failed to update local hsdata import job progress: {error}"))?;

    Ok(())
}

/// Existing hearthstone tag rows loaded for one import batch.
async fn load_existing_tags(
    connection: &impl ConnectionTrait,
    enum_ids: &[i32],
) -> Result<HashMap<i32, ExistingTagRow>, String> {
    if enum_ids.is_empty() {
        return Ok(HashMap::new());
    }

    let rows = tags::Entity::find()
        .filter(tags::Column::EnumId.is_in(enum_ids.iter().copied()))
        .all(connection)
        .await
        .map_err(|error| format!("Failed to load hearthstone tag definitions: {error}"))?;

    Ok(rows
        .into_iter()
        .map(|row| {
            (
                row.enum_id,
                ExistingTagRow {
                    value_kind: row.value_kind,
                    raw_names: row.raw_names,
                    raw_name: row.raw_name,
                    raw_type: row.raw_type,
                },
            )
        })
        .collect())
}

/// Raw tag value kind guessed from one normalized raw tag payload.
fn guess_value_kind(tag: &LocalHsdataRawTag, existing: Option<&ExistingTagRow>) -> String {
    if let Some(existing) = existing {
        match existing.value_kind.as_str() {
            "bool" | "card_ref" | "int" | "json" | "loc_string" | "string" => {
                return existing.value_kind.clone();
            }
            _ => {}
        }
    }

    match tag.raw_type.as_str() {
        "Bool" => "bool".to_string(),
        "Card" => "card_ref".to_string(),
        "Int" => "int".to_string(),
        "LocString" => "loc_string".to_string(),
        "String" => "string".to_string(),
        _ => "json".to_string(),
    }
}

/// Missing hearthstone tag rows inserted before raw tag rows are written.
async fn insert_missing_tags(
    connection: &impl ConnectionTrait,
    source_tag: u32,
    parsed_entities: &[LocalHsdataParsedEntity],
) -> Result<(HashMap<i32, ExistingTagRow>, Vec<u32>, u32), String> {
    let mut first_tag_by_enum = HashMap::<i32, &LocalHsdataRawTag>::new();

    for entity in parsed_entities {
        for tag in &entity.tags {
            first_tag_by_enum.entry(tag.enum_id as i32).or_insert(tag);
        }
    }

    let mut enum_ids = first_tag_by_enum.keys().copied().collect::<Vec<_>>();
    enum_ids.sort_unstable();
    let mut existing = load_existing_tags(connection, &enum_ids).await?;
    let mut discovered = Vec::new();
    let mut updated = 0_u32;

    for enum_id in enum_ids {
        let Some(input) = first_tag_by_enum.get(&enum_id) else {
            continue;
        };

        if let Some(row) = existing.get_mut(&enum_id) {
            let mut needs_update = false;
            if !input.raw_name.is_empty() && !row.raw_names.contains(&input.raw_name) {
                row.raw_names.push(input.raw_name.clone());
                row.raw_names.sort();
                needs_update = true;
            }
            if row.raw_name.is_none() && !input.raw_name.is_empty() {
                row.raw_name = Some(input.raw_name.clone());
                needs_update = true;
            }
            if row.raw_type.is_none() && !input.raw_type.is_empty() {
                row.raw_type = Some(input.raw_type.clone());
                needs_update = true;
            }

            if needs_update {
                updated += 1;
                let Some(model) = tags::Entity::find_by_id(enum_id)
                    .one(connection)
                    .await
                    .map_err(|error| format!("Failed to reload hearthstone tag row: {error}"))?
                else {
                    continue;
                };
                let mut active = model.into_active_model();
                active.raw_name = Set(row.raw_name.clone());
                active.raw_type = Set(row.raw_type.clone());
                active.raw_names = Set(row.raw_names.clone());
                active.last_seen_source_tag = Set(Some(source_tag as i32));
                active
                    .update(connection)
                    .await
                    .map_err(|error| format!("Failed to update hearthstone tag row: {error}"))?;
            }

            continue;
        }

        let raw_names = if input.raw_name.is_empty() {
            Vec::new()
        } else {
            vec![input.raw_name.clone()]
        };
        let value_kind = guess_value_kind(input, None);
        tags::Entity::insert(tags::ActiveModel {
            enum_id: Set(enum_id),
            slug: Set(slugify_tag(&input.raw_name, input.enum_id)),
            slug_aliases: Set(Vec::new()),
            name: Set((!input.raw_name.is_empty()).then_some(input.raw_name.clone())),
            raw_name: Set((!input.raw_name.is_empty()).then_some(input.raw_name.clone())),
            raw_type: Set((!input.raw_type.is_empty()).then_some(input.raw_type.clone())),
            raw_names: Set(raw_names.clone()),
            value_kind: Set(value_kind.clone()),
            normalize_kind: Set("identity".to_string()),
            normalize_config: Set(json!({})),
            project_target_type: Set(None),
            project_target_path: Set(None),
            project_kind: Set(None),
            project_config: Set(json!({})),
            status: Set("discovered".to_string()),
            description: Set(None),
            first_seen_source_tag: Set(Some(source_tag as i32)),
            last_seen_source_tag: Set(Some(source_tag as i32)),
            created_at: Default::default(),
            updated_at: Default::default(),
        })
        .exec(connection)
        .await
        .map_err(|error| format!("Failed to insert hearthstone tag row: {error}"))?;

        existing.insert(
            enum_id,
            ExistingTagRow {
                value_kind,
                raw_names,
                raw_name: (!input.raw_name.is_empty()).then_some(input.raw_name.clone()),
                raw_type: (!input.raw_type.is_empty()).then_some(input.raw_type.clone()),
            },
        );
        discovered.push(input.enum_id);
    }

    discovered.sort_unstable();
    Ok((existing, discovered, updated))
}

/// Typed raw tag columns resolved from one normalized hsdata tag snapshot.
fn resolve_tag_value(
    tag: &LocalHsdataRawTag,
    existing: Option<&ExistingTagRow>,
) -> ResolvedTagValue {
    let value_kind = guess_value_kind(tag, existing);
    let parsed_int = tag
        .raw_value
        .as_ref()
        .and_then(|value| value.parse::<i32>().ok());

    match value_kind.as_str() {
        "bool" => match parsed_int {
            Some(0) => ResolvedTagValue {
                value_kind,
                parse_status: "parsed".to_string(),
                bool_value: Some(false),
                int_value: None,
                string_value: None,
                loc_string_value: None,
                card_ref_card_id: None,
                json_value: None,
            },
            Some(1) => ResolvedTagValue {
                value_kind,
                parse_status: "parsed".to_string(),
                bool_value: Some(true),
                int_value: None,
                string_value: None,
                loc_string_value: None,
                card_ref_card_id: None,
                json_value: None,
            },
            _ => ResolvedTagValue {
                value_kind: "json".to_string(),
                parse_status: "fallback".to_string(),
                bool_value: None,
                int_value: None,
                string_value: None,
                loc_string_value: None,
                card_ref_card_id: None,
                json_value: Some(json!({ "value": tag.raw_value })),
            },
        },
        "int" => match parsed_int {
            Some(value) => ResolvedTagValue {
                value_kind,
                parse_status: "parsed".to_string(),
                bool_value: None,
                int_value: Some(value),
                string_value: None,
                loc_string_value: None,
                card_ref_card_id: None,
                json_value: None,
            },
            None => ResolvedTagValue {
                value_kind: "json".to_string(),
                parse_status: "fallback".to_string(),
                bool_value: None,
                int_value: None,
                string_value: None,
                loc_string_value: None,
                card_ref_card_id: None,
                json_value: Some(json!({ "value": tag.raw_value })),
            },
        },
        "string" => ResolvedTagValue {
            value_kind,
            parse_status: "parsed".to_string(),
            bool_value: None,
            int_value: None,
            string_value: Some(tag.raw_value.clone().unwrap_or_default()),
            loc_string_value: None,
            card_ref_card_id: None,
            json_value: None,
        },
        "card_ref" => ResolvedTagValue {
            value_kind,
            parse_status: if tag.card_ref_card_id.is_some() {
                "parsed".to_string()
            } else {
                "fallback".to_string()
            },
            bool_value: None,
            int_value: None,
            string_value: None,
            loc_string_value: None,
            card_ref_card_id: tag.card_ref_card_id.clone(),
            json_value: if tag.card_ref_card_id.is_some() {
                None
            } else {
                Some(json!({ "value": tag.raw_value }))
            },
        },
        "loc_string" => ResolvedTagValue {
            value_kind,
            parse_status: if tag.loc_string_value.is_some() {
                "parsed".to_string()
            } else {
                "fallback".to_string()
            },
            bool_value: None,
            int_value: None,
            string_value: None,
            loc_string_value: tag
                .loc_string_value
                .as_ref()
                .map(|value| serde_json::to_value(value).unwrap_or_else(|_| json!({}))),
            card_ref_card_id: None,
            json_value: if tag.loc_string_value.is_some() {
                None
            } else {
                Some(tag.raw_payload.clone())
            },
        },
        _ => ResolvedTagValue {
            value_kind: "json".to_string(),
            parse_status: "fallback".to_string(),
            bool_value: None,
            int_value: None,
            string_value: None,
            loc_string_value: None,
            card_ref_card_id: None,
            json_value: Some(
                tag.loc_string_value
                    .as_ref()
                    .map(|value| serde_json::to_value(value).unwrap_or_else(|_| json!({})))
                    .or_else(|| tag.raw_value.as_ref().map(|value| Value::String(value.clone())))
                    .unwrap_or_else(|| tag.raw_payload.clone()),
            ),
        },
    }
}

/// Existing source version row loaded for one local hsdata import source tag.
async fn load_source_version(
    connection: &impl ConnectionTrait,
    source_tag: i32,
) -> Result<Option<source_versions::Model>, String> {
    source_versions::Entity::find_by_id(source_tag)
        .one(connection)
        .await
        .map_err(|error| format!("Failed to load local hsdata source version: {error}"))
}

/// source_versions row moved into one local processing state.
async fn upsert_source_version_processing(
    connection: &impl ConnectionTrait,
    input: &DesktopHsdataLocalImportInput,
) -> Result<(), String> {
    if let Some(model) = load_source_version(connection, input.source_tag as i32).await? {
        let mut active = model.into_active_model();
        active.source_commit = Set(input.source_commit.clone());
        active.build = Set(Some(input.build as i32));
        active.source_hash = Set(input.source_hash.clone());
        active.source_uri = Set(input.source_uri.clone());
        active.import_engine_version = Set(Some(input.import_engine_version.clone()));
        active.status = Set("processing".to_string());
        active.imported_at = Set(None);
        active
            .update(connection)
            .await
            .map_err(|error| format!("Failed to update local hsdata source version: {error}"))?;
        return Ok(());
    }

    source_versions::Entity::insert(source_versions::ActiveModel {
        source_tag: Set(input.source_tag as i32),
        source_commit: Set(input.source_commit.clone()),
        build: Set(Some(input.build as i32)),
        source_hash: Set(input.source_hash.clone()),
        source_uri: Set(input.source_uri.clone()),
        import_engine_version: Set(Some(input.import_engine_version.clone())),
        status: Set("processing".to_string()),
        projection_status: Set(HsdataProjectionStatus::NotStarted),
        projection_error: Set(None),
        imported_at: Set(None),
        projected_at: Set(None),
        created_at: Default::default(),
        updated_at: Default::default(),
    })
    .exec(connection)
    .await
    .map_err(|error| format!("Failed to insert local hsdata source version: {error}"))?;

    Ok(())
}

/// source_versions row marked as completed after one local import succeeds.
async fn mark_source_version_completed(
    connection: &impl ConnectionTrait,
    source_tag: i32,
) -> Result<(), String> {
    let Some(model) = load_source_version(connection, source_tag).await? else {
        return Ok(());
    };

    let mut active = model.into_active_model();
    active.status = Set("completed".to_string());
    active.projection_status = Set(HsdataProjectionStatus::NotStarted);
    active.projection_error = Set(None);
    active.imported_at = Set(Some(now_utc()));
    active.projected_at = Set(None);
    active
        .update(connection)
        .await
        .map_err(|error| format!("Failed to mark local hsdata source version as completed: {error}"))?;

    Ok(())
}

/// source_versions row marked as failed when one local import aborts.
async fn upsert_source_version_failed(
    connection: &impl ConnectionTrait,
    input: &DesktopHsdataLocalImportInput,
    previous: Option<&source_versions::Model>,
) -> Result<(), String> {
    if let Some(previous) = previous {
        if previous.status == "completed" && previous.source_hash == input.source_hash {
            return Ok(());
        }
    }

    if let Some(model) = load_source_version(connection, input.source_tag as i32).await? {
        let mut active = model.into_active_model();
        active.source_commit = Set(input.source_commit.clone());
        active.build = Set(Some(input.build as i32));
        active.source_hash = Set(input.source_hash.clone());
        active.source_uri = Set(input.source_uri.clone());
        active.import_engine_version = Set(Some(input.import_engine_version.clone()));
        active.status = Set("failed".to_string());
        active.imported_at = Set(None);
        active
            .update(connection)
            .await
            .map_err(|error| format!("Failed to mark local hsdata source version as failed: {error}"))?;
        return Ok(());
    }

    source_versions::Entity::insert(source_versions::ActiveModel {
        source_tag: Set(input.source_tag as i32),
        source_commit: Set(input.source_commit.clone()),
        build: Set(Some(input.build as i32)),
        source_hash: Set(input.source_hash.clone()),
        source_uri: Set(input.source_uri.clone()),
        import_engine_version: Set(Some(input.import_engine_version.clone())),
        status: Set("failed".to_string()),
        projection_status: Set(HsdataProjectionStatus::NotStarted),
        projection_error: Set(None),
        imported_at: Set(None),
        projected_at: Set(None),
        created_at: Default::default(),
        updated_at: Default::default(),
    })
    .exec(connection)
    .await
    .map_err(|error| format!("Failed to insert failed local hsdata source version: {error}"))?;

    Ok(())
}

/// Raw snapshots currently linked to one local hsdata source tag.
async fn load_source_tag_snapshots(
    connection: &impl ConnectionTrait,
    source_tag: i32,
) -> Result<Vec<ExistingSnapshotRow>, String> {
    let rows = connection
        .query_all(Statement::from_sql_and_values(
            DbBackend::Postgres,
            r#"
            select
              id,
              card_id,
              snapshot_hash,
              source_tags
            from hearthstone_data.raw_entity_snapshots
            where $1 = any(source_tags)
            "#,
            vec![source_tag.into()],
        ))
        .await
        .map_err(|error| format!("Failed to query local hsdata sourceTag snapshots: {error}"))?;

    rows.into_iter()
        .map(|row| {
            Ok(ExistingSnapshotRow {
                id: row
                    .try_get("", "id")
                    .map_err(|error| format!("Failed to decode raw snapshot id: {error}"))?,
                card_id: row
                    .try_get("", "card_id")
                    .map_err(|error| format!("Failed to decode raw snapshot cardId: {error}"))?,
                snapshot_hash: row.try_get("", "snapshot_hash").map_err(|error| {
                    format!("Failed to decode raw snapshot snapshotHash: {error}")
                })?,
                source_tags: row.try_get("", "source_tags").map_err(|error| {
                    format!("Failed to decode raw snapshot sourceTags: {error}")
                })?,
            })
        })
        .collect()
}

/// Existing raw snapshots loaded for the provided local card ids.
async fn load_existing_snapshots(
    connection: &impl ConnectionTrait,
    card_ids: &[String],
) -> Result<HashMap<String, ExistingSnapshotRow>, String> {
    if card_ids.is_empty() {
        return Ok(HashMap::new());
    }

    let rows = raw_entity_snapshots::Entity::find()
        .filter(raw_entity_snapshots::Column::CardId.is_in(card_ids.iter().cloned()))
        .all(connection)
        .await
        .map_err(|error| format!("Failed to query local hsdata existing snapshots: {error}"))?;

    Ok(rows
        .into_iter()
        .map(|row| {
            let key = snapshot_key(&row.card_id, &row.snapshot_hash);
            (
                key,
                ExistingSnapshotRow {
                    id: row.id,
                    card_id: row.card_id,
                    snapshot_hash: row.snapshot_hash,
                    source_tags: row.source_tags,
                },
            )
        })
        .collect())
}

/// Snapshot tag rows deleted for the provided local raw snapshot ids.
async fn delete_snapshot_tags(
    connection: &impl ConnectionTrait,
    snapshot_ids: &[Uuid],
) -> Result<(), String> {
    if snapshot_ids.is_empty() {
        return Ok(());
    }

    raw_entity_snapshot_tags::Entity::delete_many()
        .filter(raw_entity_snapshot_tags::Column::SnapshotId.is_in(snapshot_ids.iter().copied()))
        .exec(connection)
        .await
        .map_err(|error| format!("Failed to delete local hsdata snapshot tags: {error}"))?;

    Ok(())
}

/// Raw tag rows inserted for one local snapshot archive row.
async fn insert_snapshot_tags(
    connection: &impl ConnectionTrait,
    snapshot_id: Uuid,
    entity: &LocalHsdataParsedEntity,
    existing_tags: &HashMap<i32, ExistingTagRow>,
    dbf_id_by_card_id: &HashMap<String, u32>,
) -> Result<(u32, u32), String> {
    if entity.tags.is_empty() {
        return Ok((0, 0));
    }

    let mut models = Vec::with_capacity(entity.tags.len());
    let mut fallback_count = 0_u32;

    for tag in &entity.tags {
        let resolved = resolve_tag_value(tag, existing_tags.get(&(tag.enum_id as i32)));
        if resolved.parse_status == "fallback" {
            fallback_count += 1;
        }

        models.push(raw_entity_snapshot_tags::ActiveModel {
            snapshot_id: Set(snapshot_id),
            enum_id: Set(tag.enum_id as i32),
            tag_order: Set(tag.tag_order as i32),
            raw_name: Set(tag.raw_name.clone()),
            raw_type: Set(tag.raw_type.clone()),
            raw_payload: Set(tag.raw_payload.clone()),
            value_kind: Set(resolved.value_kind),
            bool_value: Set(resolved.bool_value),
            int_value: Set(resolved.int_value),
            string_value: Set(resolved.string_value),
            enum_value: Set(None),
            loc_string_value: Set(resolved.loc_string_value),
            card_ref_card_id: Set(resolved.card_ref_card_id.clone()),
            card_ref_dbf_id: Set(
                resolved
                    .card_ref_card_id
                    .as_ref()
                    .and_then(|card_id| dbf_id_by_card_id.get(card_id).copied())
                    .map(|value| value as i32),
            ),
            json_value: Set(resolved.json_value),
            parse_status: Set(resolved.parse_status),
        });
    }

    raw_entity_snapshot_tags::Entity::insert_many(models)
        .exec(connection)
        .await
        .map_err(|error| format!("Failed to insert local hsdata snapshot tags: {error}"))?;

    Ok((entity.tags.len() as u32, fallback_count))
}

/// Staged local job snapshot rows loaded in deterministic finalize order.
async fn load_staged_job_entities(
    connection: &impl ConnectionTrait,
    job_id: Uuid,
) -> Result<Vec<(LocalHsdataParsedEntity, String)>, String> {
    let rows = hsdata_import_job_snapshots::Entity::find()
        .filter(hsdata_import_job_snapshots::Column::JobId.eq(job_id))
        .order_by(hsdata_import_job_snapshots::Column::ChunkIndex, Order::Asc)
        .order_by(hsdata_import_job_snapshots::Column::CardId, Order::Asc)
        .all(connection)
        .await
        .map_err(|error| format!("Failed to load local hsdata staged snapshots: {error}"))?;

    rows.into_iter()
        .map(|row| {
            let tags = serde_json::from_value::<Vec<LocalHsdataRawTag>>(row.tags)
                .map_err(|error| format!("Failed to decode local hsdata staged tags: {error}"))?;

            Ok((
                LocalHsdataParsedEntity {
                    card_id: row.card_id,
                    dbf_id: row.dbf_id as u32,
                    entity_xml_version: row.entity_xml_version as u32,
                    tags,
                    extra_payload: row.extra_payload,
                },
                row.snapshot_hash,
            ))
        })
        .collect()
}

/// Parsed raw import applied into the local snapshot archive tables.
async fn apply_raw_import(
    connection: &impl ConnectionTrait,
    input: &DesktopHsdataLocalImportInput,
    parsed_entities: &[LocalHsdataParsedEntity],
) -> Result<DesktopHsdataImportReport, String> {
    let previous_source_version = load_source_version(connection, input.source_tag as i32).await?;

    if !input.force {
        if let Some(previous) = previous_source_version.as_ref() {
            if previous.status == "completed" && previous.source_hash == input.source_hash {
                return Ok(DesktopHsdataImportReport {
                    dry_run: input.dry_run,
                    skipped: true,
                    source_tag: input.source_tag,
                    build: input.build,
                    source_hash: input.source_hash.clone(),
                    entity_count: parsed_entities.len() as u32,
                    inserted_snapshots: 0,
                    reused_snapshots: 0,
                    inserted_tag_rows: 0,
                    discovered_tag_count: 0,
                    updated_discovered_tags: 0,
                    fallback_tag_row_count: 0,
                    latest_snapshot_count: 0,
                    discovered_tags: Vec::new(),
                });
            }

            if !previous.source_hash.is_empty() && previous.source_hash != input.source_hash {
                return Err(format!(
                    "sourceTag {} already exists with a different sourceHash; rerun with force=true to overwrite",
                    input.source_tag
                ));
            }
        }
    }

    if !input.dry_run {
        upsert_source_version_processing(connection, input).await?;
    }

    let all_enum_ids = parsed_entities
        .iter()
        .flat_map(|entity| entity.tags.iter().map(|tag| tag.enum_id as i32))
        .collect::<HashSet<_>>()
        .into_iter()
        .collect::<Vec<_>>();
    let (existing_tags, discovered_tags, updated_discovered_tags) =
        insert_missing_tags(connection, input.source_tag, parsed_entities).await?;

    let dbf_id_by_card_id = parsed_entities
        .iter()
        .map(|entity| (entity.card_id.clone(), entity.dbf_id))
        .collect::<HashMap<_, _>>();
    let existing_snapshots = load_existing_snapshots(
        connection,
        &parsed_entities
            .iter()
            .map(|entity| entity.card_id.clone())
            .collect::<Vec<_>>(),
    )
    .await?;
    let previous_snapshots = load_source_tag_snapshots(connection, input.source_tag as i32).await?;
    let previous_snapshot_ids = previous_snapshots.iter().map(|row| row.id).collect::<HashSet<_>>();
    let mut target_snapshot_ids = Vec::<Uuid>::new();
    let mut entity_by_snapshot_id = HashMap::<Uuid, &LocalHsdataParsedEntity>::new();
    let mut inserted_snapshots = 0_u32;
    let mut reused_snapshots = 0_u32;
    let mut inserted_tag_rows = 0_u32;
    let mut fallback_tag_row_count = 0_u32;

    for entity in parsed_entities {
        let line_hash = sha256_hex(
            &serde_json::to_string(entity)
                .map_err(|error| format!("Failed to encode local hsdata snapshot line: {error}"))?,
        );
        let key = snapshot_key(&entity.card_id, &line_hash);

        if let Some(existing) = existing_snapshots.get(&key) {
            reused_snapshots += 1;
            target_snapshot_ids.push(existing.id);
            entity_by_snapshot_id.insert(existing.id, entity);

            if !input.dry_run && !existing.source_tags.contains(&(input.source_tag as i32)) {
                let Some(model) = raw_entity_snapshots::Entity::find_by_id(existing.id)
                    .one(connection)
                    .await
                    .map_err(|error| format!("Failed to reload local raw snapshot row: {error}"))?
                else {
                    return Err("Existing local raw snapshot disappeared during import.".to_string());
                };

                let mut active = model.into_active_model();
                let mut next_source_tags = existing.source_tags.clone();
                next_source_tags.push(input.source_tag as i32);
                next_source_tags.sort_unstable();
                next_source_tags.dedup();
                active.source_tags = Set(next_source_tags);
                active
                    .update(connection)
                    .await
                    .map_err(|error| format!("Failed to update local raw snapshot sourceTags: {error}"))?;
            }

            continue;
        }

        inserted_snapshots += 1;
        let snapshot_id = Uuid::new_v4();
        target_snapshot_ids.push(snapshot_id);
        entity_by_snapshot_id.insert(snapshot_id, entity);

        if input.dry_run {
            continue;
        }

        raw_entity_snapshots::Entity::insert(raw_entity_snapshots::ActiveModel {
            id: Set(snapshot_id),
            card_id: Set(entity.card_id.clone()),
            dbf_id: Set(entity.dbf_id as i32),
            source_tags: Set(vec![input.source_tag as i32]),
            entity_xml_version: Set(entity.entity_xml_version as i32),
            snapshot_hash: Set(line_hash),
            extra_payload: Set(entity.extra_payload.clone()),
            is_latest: Set(false),
            created_at: Default::default(),
            updated_at: Default::default(),
        })
        .exec(connection)
        .await
        .map_err(|error| format!("Failed to insert local raw snapshot row: {error}"))?;
    }

    let unique_target_snapshot_ids = target_snapshot_ids
        .iter()
        .copied()
        .collect::<HashSet<_>>()
        .into_iter()
        .collect::<Vec<_>>();

    if !input.dry_run {
        for previous in &previous_snapshots {
            if unique_target_snapshot_ids.contains(&previous.id) {
                continue;
            }

            let Some(model) = raw_entity_snapshots::Entity::find_by_id(previous.id)
                .one(connection)
                .await
                .map_err(|error| format!("Failed to reload previous local raw snapshot row: {error}"))?
            else {
                continue;
            };

            let next_source_tags = previous
                .source_tags
                .iter()
                .copied()
                .filter(|value| *value != input.source_tag as i32)
                .collect::<Vec<_>>();

            if next_source_tags.is_empty() {
                raw_entity_snapshots::Entity::delete_by_id(previous.id)
                    .exec(connection)
                    .await
                    .map_err(|error| format!("Failed to delete local raw snapshot row: {error}"))?;
                continue;
            }

            let mut active = model.into_active_model();
            active.source_tags = Set(next_source_tags);
            active.is_latest = Set(false);
            active
                .update(connection)
                .await
                .map_err(|error| format!("Failed to rewrite local raw snapshot sourceTags: {error}"))?;
        }

        if !previous_snapshot_ids.is_empty() {
            for snapshot_id in &previous_snapshot_ids {
                if let Some(model) = raw_entity_snapshots::Entity::find_by_id(*snapshot_id)
                    .one(connection)
                    .await
                    .map_err(|error| format!("Failed to reload previous latest snapshot row: {error}"))?
                {
                    let mut active = model.into_active_model();
                    active.is_latest = Set(false);
                    active
                        .update(connection)
                        .await
                        .map_err(|error| format!("Failed to clear local raw snapshot latest flag: {error}"))?;
                }
            }
        }

        if input.force {
            delete_snapshot_tags(connection, &unique_target_snapshot_ids).await?;
        }

        for snapshot_id in &unique_target_snapshot_ids {
            let Some(entity) = entity_by_snapshot_id.get(snapshot_id) else {
                continue;
            };

            if !input.force && previous_snapshot_ids.contains(snapshot_id) && inserted_snapshots == 0 {
                continue;
            }

            if !input.force && !previous_snapshot_ids.contains(snapshot_id) {
                let (row_count, fallback_count) = insert_snapshot_tags(
                    connection,
                    *snapshot_id,
                    entity,
                    &existing_tags,
                    &dbf_id_by_card_id,
                )
                .await?;
                inserted_tag_rows += row_count;
                fallback_tag_row_count += fallback_count;
                continue;
            }

            if input.force {
                let (row_count, fallback_count) = insert_snapshot_tags(
                    connection,
                    *snapshot_id,
                    entity,
                    &existing_tags,
                    &dbf_id_by_card_id,
                )
                .await?;
                inserted_tag_rows += row_count;
                fallback_tag_row_count += fallback_count;
            }
        }

        for snapshot_id in &unique_target_snapshot_ids {
            let Some(model) = raw_entity_snapshots::Entity::find_by_id(*snapshot_id)
                .one(connection)
                .await
                .map_err(|error| format!("Failed to reload target local raw snapshot row: {error}"))?
            else {
                continue;
            };

            let mut active = model.into_active_model();
            active.is_latest = Set(true);
            active
                .update(connection)
                .await
                .map_err(|error| format!("Failed to mark local raw snapshot as latest: {error}"))?;
        }

        mark_source_version_completed(connection, input.source_tag as i32).await?;
    } else {
        inserted_tag_rows = parsed_entities
            .iter()
            .map(|entity| entity.tags.len() as u32)
            .sum();
        fallback_tag_row_count = parsed_entities
            .iter()
            .flat_map(|entity| entity.tags.iter())
            .filter(|tag| resolve_tag_value(tag, existing_tags.get(&(tag.enum_id as i32))).parse_status == "fallback")
            .count() as u32;
    }

    let _ = all_enum_ids;

    Ok(DesktopHsdataImportReport {
        dry_run: input.dry_run,
        skipped: false,
        source_tag: input.source_tag,
        build: input.build,
        source_hash: input.source_hash.clone(),
        entity_count: parsed_entities.len() as u32,
        inserted_snapshots,
        reused_snapshots,
        inserted_tag_rows,
        discovered_tag_count: discovered_tags.len() as u32,
        updated_discovered_tags,
        fallback_tag_row_count,
        latest_snapshot_count: unique_target_snapshot_ids.len() as u32,
        discovered_tags,
    })
}

/// Local import job row marked as failed with one terminal error message.
async fn mark_local_job_failed(
    connection: &impl ConnectionTrait,
    job_id: Uuid,
    error_message: &str,
) -> Result<(), String> {
    let Some(model) = hsdata_import_jobs::Entity::find_by_id(job_id)
        .one(connection)
        .await
        .map_err(|error| format!("Failed to reload local hsdata import job: {error}"))?
    else {
        return Ok(());
    };

    let mut active = model.into_active_model();
    active.status = Set(HsdataImportJobStatus::Failed);
    active.error = Set(Some(error_message.to_string()));
    active
        .update(connection)
        .await
        .map_err(|error| format!("Failed to mark local hsdata import job as failed: {error}"))?;

    Ok(())
}

/// Staging rows deleted after one local hsdata import job has completed.
async fn cleanup_local_job_staging(
    connection: &impl ConnectionTrait,
    job_id: Uuid,
) -> Result<(), String> {
    hsdata_import_job_snapshots::Entity::delete_many()
        .filter(hsdata_import_job_snapshots::Column::JobId.eq(job_id))
        .exec(connection)
        .await
        .map_err(|error| format!("Failed to delete local hsdata staged snapshots: {error}"))?;

    hsdata_import_job_chunks::Entity::delete_many()
        .filter(hsdata_import_job_chunks::Column::JobId.eq(job_id))
        .exec(connection)
        .await
        .map_err(|error| format!("Failed to delete local hsdata staged chunks: {error}"))?;

    let Some(model) = hsdata_import_jobs::Entity::find_by_id(job_id)
        .one(connection)
        .await
        .map_err(|error| format!("Failed to reload local hsdata import job cleanup state: {error}"))?
    else {
        return Ok(());
    };

    let mut active = model.into_active_model();
    active.staging_cleanup_status = Set(HsdataImportCleanupStatus::Succeeded);
    active.staging_cleanup_error = Set(None);
    active.cleaned_at = Set(Some(now_utc()));
    active
        .update(connection)
        .await
        .map_err(|error| format!("Failed to persist local hsdata cleanup state: {error}"))?;

    Ok(())
}

/// Staged local hsdata job finalized into raw archive rows and source_versions state.
async fn finalize_local_import_job(
    database: &sea_orm::DatabaseConnection,
    input: &DesktopHsdataLocalImportInput,
    job_id: Uuid,
) -> Result<DesktopHsdataImportReport, String> {
    let chunk_rows = hsdata_import_job_chunks::Entity::find()
        .filter(hsdata_import_job_chunks::Column::JobId.eq(job_id))
        .all(database)
        .await
        .map_err(|error| format!("Failed to load local hsdata import chunk rows: {error}"))?;

    let completed_chunk_count = chunk_rows
        .iter()
        .filter(|row| row.status == HsdataImportChunkStatus::Completed)
        .count();
    if chunk_rows.len() != input.chunks.len() || completed_chunk_count != input.chunks.len() {
        return Err(format!(
            "Local hsdata import job {} is missing completed chunks.",
            job_id
        ));
    }

    let Some(model) = hsdata_import_jobs::Entity::find_by_id(job_id)
        .one(database)
        .await
        .map_err(|error| format!("Failed to load local hsdata import job: {error}"))?
    else {
        return Err(format!("Local hsdata import job {} does not exist.", job_id));
    };
    let mut active = model.into_active_model();
    active.status = Set(HsdataImportJobStatus::Finalizing);
    active.error = Set(None);
    active
        .update(database)
        .await
        .map_err(|error| format!("Failed to claim local hsdata import job for finalize: {error}"))?;

    let parsed_entities = load_staged_job_entities(database, job_id).await?;
    let parsed_entities = parsed_entities
        .into_iter()
        .map(|(entity, _)| entity)
        .collect::<Vec<_>>();

    match apply_raw_import(database, input, &parsed_entities).await {
        Ok(report) => {
            let Some(model) = hsdata_import_jobs::Entity::find_by_id(job_id)
                .one(database)
                .await
                .map_err(|error| format!("Failed to reload completed local hsdata import job: {error}"))?
            else {
                return Err(format!("Local hsdata import job {} does not exist.", job_id));
            };

            let mut active = model.into_active_model();
            active.status = Set(HsdataImportJobStatus::Completed);
            active.error = Set(None);
            active.report = Set(Some(
                serde_json::to_value(&report)
                    .map_err(|error| format!("Failed to encode local hsdata import report: {error}"))?,
            ));
            active.finalized_at = Set(Some(now_utc()));
            active.staging_cleanup_status = Set(HsdataImportCleanupStatus::Pending);
            active.staging_cleanup_error = Set(None);
            active
                .update(database)
                .await
                .map_err(|error| format!("Failed to persist completed local hsdata import job: {error}"))?;

            cleanup_local_job_staging(database, job_id).await?;
            Ok(report)
        }
        Err(error) => {
            if !input.dry_run {
                let previous = load_source_version(database, input.source_tag as i32).await?;
                upsert_source_version_failed(database, input, previous.as_ref()).await?;
            }
            mark_local_job_failed(database, job_id, &error).await?;
            Err(error)
        }
    }
}

/// Prepared hsdata payload imported into the local desktop PostgreSQL database.
pub(crate) async fn import_hsdata_to_local_database(
    input: DesktopHsdataLocalImportInput,
) -> Result<DesktopHsdataLocalImportResult, String> {
    let database = connect_configured_desktop_database().await?;
    let job_id = create_local_import_job(database.connection(), &input).await?;

    for chunk in &input.chunks {
        let transaction = database
            .connection()
            .begin()
            .await
            .map_err(|error| format!("Failed to start local hsdata staging transaction: {error}"))?;

        if let Err(error) =
            stage_local_import_chunk(&transaction, job_id, input.chunks.len() as i32, chunk).await
        {
            let _ = transaction.rollback().await;
            let _ = mark_local_job_failed(database.connection(), job_id, &error).await;
            return Err(error);
        }

        transaction
            .commit()
            .await
            .map_err(|error| format!("Failed to commit local hsdata staging transaction: {error}"))?;
    }

    let report = finalize_local_import_job(database.connection(), &input, job_id).await?;

    Ok(DesktopHsdataLocalImportResult {
        job_id: job_id.to_string(),
        report,
    })
}
