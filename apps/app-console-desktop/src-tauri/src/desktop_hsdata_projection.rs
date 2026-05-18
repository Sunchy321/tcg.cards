use std::collections::{HashMap, HashSet};

use chrono::{DateTime, Utc};
use sea_orm::{
    ActiveModelTrait, ColumnTrait, ConnectionTrait, EntityTrait, IntoActiveModel, QueryFilter, Set,
};
use serde_json::{json, Map, Value};
use sha2::{Digest, Sha256};
use tauri::AppHandle;

use crate::desktop_database::{
    connect_configured_desktop_database, postgres_statement_with_values, read_query_value,
};
use crate::desktop_hsdata_projection_compat::{
    class_tokens_by_mask, known_scalar_enum_token_by_int, race_token_by_int,
    spell_school_token_by_int,
};
use crate::entity::hearthstone_data::sea_orm_active_enums::HsdataProjectionStatus;
use crate::entity::hearthstone_data::source_versions;
use crate::entity::hearthstone_data::tags;

/// Locale-specific strings preserved from one localized tag payload.
pub(crate) type LocalizedText = HashMap<String, String>;

/// Integer enum map target interpreted from one tag normalization config.
#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) enum EnumMapRule {
    Set,
    Rarity,
    Multiclass,
    SpellSchool,
    Race,
    Values(HashMap<String, EnumMapValue>),
}

/// Integer enum map payload interpreted from one tag normalization config.
#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) enum EnumMapValue {
    String(String),
    StringArray(Vec<String>),
}

/// Tag normalization rule interpreted from one `hearthstone.tags` row.
#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) enum NormalizeRule {
    Identity,
    IdentityInt,
    IdentityString,
    IdentityLocString,
    IdentityCardRef,
    BoolFromInt {
        true_values: Vec<i32>,
        false_values: Vec<i32>,
    },
    EnumFromInt {
        enum_map: Option<EnumMapRule>,
        allow_unknown_enum_value: bool,
    },
    CardRefFromInt,
    JsonWrap,
}

/// Projection rule interpreted from one `hearthstone.tags` row.
#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) enum ProjectRule {
    AssignValue,
    AppendStringArray { appended_value: Option<String> },
    AssignCardRef,
    AssignLocalizedText { locale_map: HashMap<String, String> },
    AssignMechanic,
    AssignReferencedTag,
    AssignLegacy,
    EmitRelation,
}

/// Parsed projection config extracted from one `hearthstone.tags` row.
#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) struct ParsedTagProjection {
    pub(crate) enum_id: i32,
    pub(crate) slug: String,
    pub(crate) project_target_type: Option<String>,
    pub(crate) project_target_path: Option<String>,
    pub(crate) normalize_rule: NormalizeRule,
    pub(crate) project_rule: Option<ProjectRule>,
}

/// Local hsdata projection request issued from the desktop frontend.
#[derive(Clone, Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DesktopHsdataProjectInput {
    pub(crate) source_tag: u32,
    pub(crate) dry_run: Option<bool>,
    pub(crate) force: Option<bool>,
}

/// Local hsdata projection report returned to the desktop frontend.
#[derive(Clone, Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DesktopHsdataProjectReport {
    pub(crate) dry_run: bool,
    pub(crate) skipped: bool,
    pub(crate) source_tag: u32,
    pub(crate) build: u32,
    pub(crate) snapshot_count: u32,
    pub(crate) inserted_entities: u32,
    pub(crate) reused_entities: u32,
    pub(crate) updated_entities: u32,
    pub(crate) inserted_localizations: u32,
    pub(crate) reused_localizations: u32,
    pub(crate) updated_localizations: u32,
    pub(crate) inserted_relations: u32,
    pub(crate) updated_relations: u32,
    pub(crate) unprojected_tag_count: u32,
    pub(crate) unprojected_tags: Vec<DesktopHsdataUnprojectedTagReportRow>,
}

/// One aggregated unprojected-tag row returned to the desktop frontend.
#[derive(Clone, Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DesktopHsdataUnprojectedTagReportRow {
    pub(crate) enum_id: i32,
    pub(crate) slug: String,
    pub(crate) count: u32,
}

#[derive(Clone, Debug)]
struct ProjectionSourceVersionRow {
    source_tag: i32,
    build: Option<i32>,
    status: String,
    projection_status: HsdataProjectionStatus,
    projection_error: Option<String>,
    projected_at: Option<DateTime<Utc>>,
}

/// Existing versioned row key loaded to classify inserted, reused, and updated projection output.
#[derive(Clone, Debug, PartialEq, Eq)]
struct ExistingVersionedKeyRow {
    key: String,
    version: Vec<i32>,
}

/// Write-count summary aligned with the TypeScript reconcile result categories.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
struct ProjectionRowWriteStats {
    inserted: u32,
    reused: u32,
    updated: u32,
}

/// Aggregated write counts returned for one full projection pass.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
struct ProjectionWriteStats {
    entities: ProjectionRowWriteStats,
    localizations: ProjectionRowWriteStats,
    relations: ProjectionRowWriteStats,
}

/// Change summary derived from the projected rows and the currently persisted build state.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
struct ProjectionChangeSummary {
    write_stats: ProjectionWriteStats,
    changed: bool,
}

#[derive(Clone, Debug)]
struct ProjectionSnapshotRow {
    id: String,
    card_id: String,
    dbf_id: i32,
    extra_payload: Value,
}

/// Raw snapshot tag row loaded for one local projection pass.
#[derive(Clone, Debug)]
struct ProjectionSnapshotTagRow {
    snapshot_id: String,
    enum_id: i32,
    tag_order: i32,
    raw_name: String,
    raw_payload: Value,
    bool_value: Option<bool>,
    int_value: Option<i32>,
    string_value: Option<String>,
    loc_string_value: Option<LocalizedText>,
    card_ref_card_id: Option<String>,
    card_ref_dbf_id: Option<i32>,
    json_value: Option<Value>,
}

/// Set row loaded to resolve `enum_from_int` set projections.
#[derive(Clone, Debug)]
struct ProjectionSetRow {
    set_id: String,
    dbf_id: i32,
}

/// Card reference preserved from one normalized tag payload.
#[derive(Clone, Debug, PartialEq, Eq)]
struct CardRefValue {
    card_id: Option<String>,
    dbf_id: Option<i32>,
}

/// Tag value normalized into one projection-friendly Rust shape.
#[derive(Clone, Debug, PartialEq)]
enum NormalizedValue {
    Bool(bool),
    Int(i32),
    String(String),
    StringArray(Vec<String>),
    LocalizedText(LocalizedText),
    CardRef(CardRefValue),
    Json(Value),
}

/// Entity draft projected from one raw snapshot.
#[derive(Clone, Debug, PartialEq, Eq)]
struct ProjectionEntityRow {
    card_id: String,
    revision_hash: String,
    dbf_id: i32,
    legacy_payload: Value,
    set_id: String,
    classes: Vec<String>,
    race: Vec<String>,
    type_slug: String,
    cost: i32,
    attack: Option<i32>,
    health: Option<i32>,
    durability: Option<i32>,
    armor: Option<i32>,
    rune: Option<Vec<String>>,
    spell_school: Option<String>,
    quest_type: Option<String>,
    quest_progress: Option<i32>,
    quest_part: Option<i32>,
    hero_power: Option<String>,
    tech_level: Option<i32>,
    in_bobs_tavern: bool,
    triple_card: Option<String>,
    race_bucket: Option<String>,
    armor_bucket: Option<i32>,
    buddy: Option<String>,
    banned_race: Option<String>,
    mercenary_role: Option<String>,
    mercenary_faction: Option<String>,
    colddown: Option<i32>,
    collectible: bool,
    elite: bool,
    artist: String,
    rarity: Option<String>,
    override_watermark: Option<String>,
    faction: Option<String>,
    mechanics: HashMap<String, Value>,
    referenced_tags: HashMap<String, Value>,
    text_builder_type: String,
    change_type: String,
}

/// Localization draft finalized for one output language.
#[derive(Clone, Debug, PartialEq, Eq)]
struct ProjectionLocalizationRow {
    card_id: String,
    lang: String,
    revision_hash: String,
    localization_hash: String,
    name: String,
    text: String,
    rich_text: String,
    display_text: String,
    target_text: Option<String>,
    text_in_play: Option<String>,
    how_to_earn: Option<String>,
    how_to_earn_golden: Option<String>,
    flavor_text: Option<String>,
    loc_change_type: String,
}

/// Relation draft projected from one card-reference tag.
#[derive(Clone, Debug, PartialEq, Eq)]
struct ProjectionRelationRow {
    source_id: String,
    source_revision_hash: String,
    relation: String,
    target_id: String,
}

/// Projection result collected for one raw snapshot.
#[derive(Clone, Debug, PartialEq, Eq)]
struct ProjectedSnapshot {
    entity: ProjectionEntityRow,
    localizations: Vec<ProjectionLocalizationRow>,
    relations: Vec<ProjectionRelationRow>,
    unprojected_tag_count: u32,
    unprojected_tags: Vec<ProjectionUnprojectedTagHit>,
}

/// Shared lookup tables required while normalizing tag payloads.
#[derive(Clone, Debug, Default)]
struct ProjectionContext {
    card_id_by_dbf_id: HashMap<i32, String>,
    set_id_by_dbf_id: HashMap<i32, String>,
}

/// Mutable localization fields accumulated before final row emission.
#[derive(Clone, Debug, PartialEq, Eq)]
struct LocalizationDraft {
    name: String,
    rich_text: String,
    target_text: Option<String>,
    text_in_play: Option<String>,
    how_to_earn: Option<String>,
    how_to_earn_golden: Option<String>,
    flavor_text: Option<String>,
}

/// One raw tag row recorded as unprojected before final aggregation.
#[derive(Clone, Debug, PartialEq, Eq)]
struct ProjectionUnprojectedTagHit {
    enum_id: i32,
    slug: String,
}

/// Relation row payload accumulated before the entity revision hash is finalized.
#[derive(Clone, Debug, PartialEq, Eq)]
struct ProjectionRelationDraft {
    relation: String,
    target_id: String,
}

/// Tag projection config parsed from one generated SeaORM model row.
pub(crate) fn parse_tag_projection(model: &tags::Model) -> Result<ParsedTagProjection, String> {
    let normalize_rule = parse_normalize_rule(
        model.enum_id,
        &model.slug,
        &model.normalize_kind,
        &model.normalize_config,
    )?;
    let project_target_path = model
        .project_target_path
        .as_deref()
        .map(normalize_target_path);
    let project_rule = parse_project_rule(
        model.enum_id,
        &model.slug,
        model.project_kind.as_deref(),
        &model.project_config,
    )?;

    Ok(ParsedTagProjection {
        enum_id: model.enum_id,
        slug: model.slug.clone(),
        project_target_type: model.project_target_type.clone(),
        project_target_path,
        normalize_rule,
        project_rule,
    })
}

/// Local hsdata projection preflight executed against the configured desktop database.
#[tauri::command]
pub(crate) async fn hsdata_project_source_version_local(
    app: AppHandle,
    input: DesktopHsdataProjectInput,
) -> Result<DesktopHsdataProjectReport, String> {
    let database = connect_configured_desktop_database(&app).await?;

    if input.dry_run.unwrap_or(false) {
        return project_hsdata_to_local_database(database.connection(), input).await;
    }

    let source_tag = i32::try_from(input.source_tag).map_err(|_| {
        format!(
            "[hearthstone][hsdata-project][desktop] sourceTag {} is out of range",
            input.source_tag
        )
    })?;
    let previous_source_version = load_source_version(database.connection(), source_tag).await?;
    mark_source_version_projection_processing(database.connection(), source_tag).await?;

    let transaction = database.transaction().await?;
    match project_hsdata_to_local_database(&transaction, input.clone()).await {
        Ok(report) => {
            transaction
                .commit()
                .await
                .map_err(|error| format!("Failed to commit local hsdata projection: {error}"))?;
            let projected_at = if report.skipped {
                previous_source_version
                    .as_ref()
                    .and_then(|row| row.projected_at)
            } else {
                Some(Utc::now())
            };
            mark_source_version_projection_completed(
                database.connection(),
                source_tag,
                projected_at,
            )
            .await?;
            Ok(report)
        }
        Err(error) => {
            let _ = transaction.rollback().await;
            mark_source_version_projection_failed(database.connection(), source_tag, &error)
                .await?;
            Err(error)
        }
    }
}

/// Local hsdata projection pass executed against one borrowed desktop database connection.
pub(crate) async fn project_hsdata_to_local_database(
    connection: &impl ConnectionTrait,
    input: DesktopHsdataProjectInput,
) -> Result<DesktopHsdataProjectReport, String> {
    let source_version = load_source_version(connection, input.source_tag as i32).await?;
    let Some(source_version) = source_version else {
        return Err(format!(
            "[hearthstone][hsdata-project][desktop] sourceTag {} does not exist",
            input.source_tag
        ));
    };

    if source_version.status != "completed" {
        return Err(format!(
            "[hearthstone][hsdata-project][desktop] sourceTag {} is not completed",
            input.source_tag
        ));
    }

    let Some(build) = source_version.build else {
        return Err(format!(
            "[hearthstone][hsdata-project][desktop] sourceTag {} is missing build",
            input.source_tag
        ));
    };

    let snapshots = load_projection_snapshots(connection, input.source_tag as i32).await?;

    if snapshots.is_empty() {
        return Err(format!(
            "[hearthstone][hsdata-project][desktop] no raw snapshots found for sourceTag {}",
            input.source_tag
        ));
    }

    let snapshot_ids = snapshots
        .iter()
        .map(|row| row.id.clone())
        .collect::<Vec<_>>();
    let snapshot_tags = load_projection_snapshot_tags(connection, &snapshot_ids).await?;
    let sets = load_projection_sets(connection).await?;
    let enum_ids = snapshot_tags
        .iter()
        .map(|row| row.enum_id)
        .collect::<HashSet<_>>()
        .into_iter()
        .collect::<Vec<_>>();
    let tags_by_enum_id = load_projection_tags(connection, &enum_ids).await?;
    let parsed_by_enum_id = parse_projection_tags(&tags_by_enum_id)?;
    let projected = project_snapshots(&snapshots, &snapshot_tags, &parsed_by_enum_id, &sets)?;
    let card_ids = unique_strings(
        projected
            .iter()
            .map(|snapshot| snapshot.entity.card_id.clone())
            .collect(),
    );
    let source_ids = card_ids.clone();
    let existing_entities = load_existing_entity_keys(connection, &card_ids).await?;
    let existing_localizations = load_existing_localization_keys(connection, &card_ids).await?;
    let existing_relations = load_existing_relation_keys(connection, &source_ids).await?;
    let change_summary = summarize_projection_change(
        build,
        &projected,
        &existing_entities,
        &existing_localizations,
        &existing_relations,
    )?;
    let unprojected_tag_count = projected.iter().try_fold(0_u32, |total, snapshot| {
        total
            .checked_add(snapshot.unprojected_tag_count)
            .ok_or_else(|| {
                "[hearthstone][hsdata-project][desktop] unprojected tag count exceeds u32 range"
                    .to_string()
            })
    })?;
    let unprojected_tags = summarize_unprojected_tags(&projected)?;
    let dry_run = input.dry_run.unwrap_or(false);
    let skipped = !change_summary.changed && !input.force.unwrap_or(false);

    if !dry_run && !skipped {
        write_projected_rows(connection, build, &projected).await?;
    }

    Ok(DesktopHsdataProjectReport {
        dry_run,
        skipped,
        source_tag: source_version.source_tag as u32,
        build: u32::try_from(build).map_err(|_| {
            format!(
                "[hearthstone][hsdata-project][desktop] build {} is out of range for sourceTag {}",
                build, input.source_tag
            )
        })?,
        snapshot_count: u32::try_from(snapshots.len()).unwrap_or(u32::MAX),
        inserted_entities: change_summary.write_stats.entities.inserted,
        reused_entities: change_summary.write_stats.entities.reused,
        updated_entities: change_summary.write_stats.entities.updated,
        inserted_localizations: change_summary.write_stats.localizations.inserted,
        reused_localizations: change_summary.write_stats.localizations.reused,
        updated_localizations: change_summary.write_stats.localizations.updated,
        inserted_relations: change_summary.write_stats.relations.inserted,
        updated_relations: change_summary.write_stats.relations.updated,
        unprojected_tag_count,
        unprojected_tags,
    })
}

/// Source version loaded for one local hsdata projection request.
async fn load_source_version(
    connection: &impl ConnectionTrait,
    source_tag: i32,
) -> Result<Option<ProjectionSourceVersionRow>, String> {
    let model = source_versions::Entity::find_by_id(source_tag)
        .one(connection)
        .await
        .map_err(|error| {
            format!(
                "Failed to load local hsdata projection source version {}: {error}",
                source_tag
            )
        })?;

    Ok(model.map(|row| ProjectionSourceVersionRow {
        source_tag: row.source_tag,
        build: row.build,
        status: row.status,
        projection_status: row.projection_status,
        projection_error: row.projection_error,
        projected_at: row.projected_at.map(|value| value.and_utc()),
    }))
}

/// Source version projection state marked as processing before write-mode projection.
async fn mark_source_version_projection_processing(
    connection: &impl ConnectionTrait,
    source_tag: i32,
) -> Result<(), String> {
    let Some(model) = source_versions::Entity::find_by_id(source_tag)
        .one(connection)
        .await
        .map_err(|error| {
            format!(
                "Failed to reload local hsdata source version {} before projection: {error}",
                source_tag
            )
        })?
    else {
        return Err(format!(
            "Local hsdata source version {} does not exist for projection.",
            source_tag
        ));
    };

    let mut active = model.into_active_model();
    active.projection_status = Set(HsdataProjectionStatus::Processing);
    active.projection_error = Set(None);
    active.update(connection).await.map_err(|error| {
        format!(
            "Failed to mark local hsdata source version {} as projection processing: {error}",
            source_tag
        )
    })?;

    Ok(())
}

/// Source version projection state marked as completed after write-mode projection succeeds.
async fn mark_source_version_projection_completed(
    connection: &impl ConnectionTrait,
    source_tag: i32,
    projected_at: Option<DateTime<Utc>>,
) -> Result<(), String> {
    let Some(model) = source_versions::Entity::find_by_id(source_tag)
        .one(connection)
        .await
        .map_err(|error| {
            format!(
                "Failed to reload local hsdata source version {} after projection: {error}",
                source_tag
            )
        })?
    else {
        return Err(format!(
            "Local hsdata source version {} does not exist after projection.",
            source_tag
        ));
    };

    let existing_projected_at = model.projected_at.map(|value| value.and_utc());
    let mut active = model.into_active_model();
    active.projection_status = Set(HsdataProjectionStatus::Completed);
    active.projection_error = Set(None);
    active.projected_at = Set(Some(
        projected_at
            .or(existing_projected_at)
            .unwrap_or_else(Utc::now)
            .naive_utc(),
    ));
    active.update(connection).await.map_err(|error| {
        format!(
            "Failed to mark local hsdata source version {} as projection completed: {error}",
            source_tag
        )
    })?;

    Ok(())
}

/// Source version projection state marked as failed after write-mode projection aborts.
async fn mark_source_version_projection_failed(
    connection: &impl ConnectionTrait,
    source_tag: i32,
    projection_error: &str,
) -> Result<(), String> {
    let Some(model) = source_versions::Entity::find_by_id(source_tag)
        .one(connection)
        .await
        .map_err(|error| {
            format!(
                "Failed to reload local hsdata source version {} after projection failure: {error}",
                source_tag
            )
        })?
    else {
        return Err(format!(
            "Local hsdata source version {} does not exist after projection failure.",
            source_tag
        ));
    };

    let mut active = model.into_active_model();
    active.projection_status = Set(HsdataProjectionStatus::Failed);
    active.projection_error = Set(Some(projection_error.to_string()));
    active.update(connection).await.map_err(|error| {
        format!(
            "Failed to mark local hsdata source version {} as projection failed: {error}",
            source_tag
        )
    })?;

    Ok(())
}

/// Raw snapshots loaded for one sourceTag-focused projection preflight.
async fn load_projection_snapshots(
    connection: &impl ConnectionTrait,
    source_tag: i32,
) -> Result<Vec<ProjectionSnapshotRow>, String> {
    let rows = connection
        .query_all(postgres_statement_with_values(
            "select id::text as id, card_id, dbf_id, extra_payload from hearthstone_data.raw_entity_snapshots where $1 = any(source_tags)",
            vec![source_tag.into()],
        ))
        .await
        .map_err(|error| {
            format!(
                "Failed to load local hsdata snapshots for sourceTag {}: {error}",
                source_tag
            )
        })?;

    rows.into_iter()
        .map(|row| {
            Ok(ProjectionSnapshotRow {
                id: read_query_value(&row, "id")?,
                card_id: read_query_value(&row, "card_id")?,
                dbf_id: read_query_value(&row, "dbf_id")?,
                extra_payload: read_query_value(&row, "extra_payload")?,
            })
        })
        .collect()
}

/// Raw snapshot tags loaded for one explicit snapshot id list.
async fn load_projection_snapshot_tags(
    connection: &impl ConnectionTrait,
    snapshot_ids: &[String],
) -> Result<Vec<ProjectionSnapshotTagRow>, String> {
    if snapshot_ids.is_empty() {
        return Ok(Vec::new());
    }

    let snapshot_ids = snapshot_ids
        .iter()
        .cloned()
        .map(Into::into)
        .collect::<Vec<_>>();
    let rows = connection
        .query_all(postgres_statement_with_values(
            "select snapshot_id::text as snapshot_id, enum_id, tag_order, raw_name, raw_payload, bool_value, int_value, string_value, loc_string_value, card_ref_card_id, card_ref_dbf_id, json_value from hearthstone_data.raw_entity_snapshot_tags where snapshot_id::text = any($1)",
            vec![sea_orm::Value::Array(
                sea_orm::sea_query::ArrayType::String,
                Some(Box::new(snapshot_ids)),
            )],
        ))
        .await
        .map_err(|error| format!("Failed to load local hsdata snapshot tags: {error}"))?;

    rows.into_iter()
        .map(|row| {
            Ok(ProjectionSnapshotTagRow {
                snapshot_id: read_query_value(&row, "snapshot_id")?,
                enum_id: read_query_value(&row, "enum_id")?,
                tag_order: read_query_value(&row, "tag_order")?,
                raw_name: read_query_value(&row, "raw_name")?,
                raw_payload: read_query_value(&row, "raw_payload")?,
                bool_value: read_query_value(&row, "bool_value")?,
                int_value: read_query_value(&row, "int_value")?,
                string_value: read_query_value(&row, "string_value")?,
                loc_string_value: read_localized_text(&row, "loc_string_value")?,
                card_ref_card_id: read_query_value(&row, "card_ref_card_id")?,
                card_ref_dbf_id: read_query_value(&row, "card_ref_dbf_id")?,
                json_value: read_query_value(&row, "json_value")?,
            })
        })
        .collect()
}

/// Aggregated unprojected tag rows derived from all projected snapshots in one report.
fn summarize_unprojected_tags(
    projected: &[ProjectedSnapshot],
) -> Result<Vec<DesktopHsdataUnprojectedTagReportRow>, String> {
    let mut count_by_key: HashMap<(i32, String), u32> = HashMap::new();

    for snapshot in projected {
        for hit in &snapshot.unprojected_tags {
            let key = (hit.enum_id, hit.slug.clone());
            let entry = count_by_key.entry(key).or_insert(0);
            *entry = entry.checked_add(1).ok_or_else(|| {
                "[hearthstone][hsdata-project][desktop] unprojected tag detail count exceeds u32 range"
                    .to_string()
            })?;
        }
    }

    let mut rows = count_by_key
        .into_iter()
        .map(
            |((enum_id, slug), count)| DesktopHsdataUnprojectedTagReportRow {
                enum_id,
                slug,
                count,
            },
        )
        .collect::<Vec<_>>();
    rows.sort_by(|left, right| {
        right
            .count
            .cmp(&left.count)
            .then_with(|| left.enum_id.cmp(&right.enum_id))
            .then_with(|| left.slug.cmp(&right.slug))
    });

    Ok(rows)
}

/// Set rows loaded to resolve tag projections that map dbf ids to set ids.
async fn load_projection_sets(
    connection: &impl ConnectionTrait,
) -> Result<Vec<ProjectionSetRow>, String> {
    let rows = connection
        .query_all(crate::desktop_database::postgres_statement(
            "select set_id, dbf_id from hearthstone.sets where dbf_id is not null",
        ))
        .await
        .map_err(|error| format!("Failed to load hearthstone sets for projection: {error}"))?;

    rows.into_iter()
        .map(|row| {
            Ok(ProjectionSetRow {
                set_id: read_query_value(&row, "set_id")?,
                dbf_id: read_query_value(&row, "dbf_id")?,
            })
        })
        .collect()
}

/// Existing entity keys loaded for the projected card id set.
async fn load_existing_entity_keys(
    connection: &impl ConnectionTrait,
    card_ids: &[String],
) -> Result<Vec<ExistingVersionedKeyRow>, String> {
    if card_ids.is_empty() {
        return Ok(Vec::new());
    }

    let rows = connection
        .query_all(postgres_statement_with_values(
            "select card_id, revision_hash, version from hearthstone.entities where card_id = any($1)",
            vec![string_array_value(card_ids)],
        ))
        .await
        .map_err(|error| format!("Failed to load existing hearthstone.entities keys: {error}"))?;

    rows.into_iter()
        .map(|row| {
            let card_id: String = read_query_value(&row, "card_id")?;
            let revision_hash: String = read_query_value(&row, "revision_hash")?;
            let version: Vec<i32> = read_query_value(&row, "version")?;

            Ok(ExistingVersionedKeyRow {
                key: entity_row_key(&card_id, &revision_hash),
                version,
            })
        })
        .collect()
}

/// Existing localization keys loaded for the projected card id set.
async fn load_existing_localization_keys(
    connection: &impl ConnectionTrait,
    card_ids: &[String],
) -> Result<Vec<ExistingVersionedKeyRow>, String> {
    if card_ids.is_empty() {
        return Ok(Vec::new());
    }

    let rows = connection
        .query_all(postgres_statement_with_values(
            "select card_id, lang::text as lang, revision_hash, localization_hash, version from hearthstone.entity_localizations where card_id = any($1)",
            vec![string_array_value(card_ids)],
        ))
        .await
        .map_err(|error| {
            format!("Failed to load existing hearthstone.entity_localizations keys: {error}")
        })?;

    rows.into_iter()
        .map(|row| {
            let card_id: String = read_query_value(&row, "card_id")?;
            let lang: String = read_query_value(&row, "lang")?;
            let revision_hash: String = read_query_value(&row, "revision_hash")?;
            let localization_hash: String = read_query_value(&row, "localization_hash")?;
            let version: Vec<i32> = read_query_value(&row, "version")?;

            Ok(ExistingVersionedKeyRow {
                key: localization_row_key(&card_id, &lang, &revision_hash, &localization_hash),
                version,
            })
        })
        .collect()
}

/// Existing relation keys loaded for the projected source id set.
async fn load_existing_relation_keys(
    connection: &impl ConnectionTrait,
    source_ids: &[String],
) -> Result<Vec<ExistingVersionedKeyRow>, String> {
    if source_ids.is_empty() {
        return Ok(Vec::new());
    }

    let rows = connection
        .query_all(postgres_statement_with_values(
            "select source_id, source_revision_hash, relation, target_id, version from hearthstone.entity_relations where source_id = any($1)",
            vec![string_array_value(source_ids)],
        ))
        .await
        .map_err(|error| format!("Failed to load existing hearthstone.entity_relations keys: {error}"))?;

    rows.into_iter()
        .map(|row| {
            let source_id: String = read_query_value(&row, "source_id")?;
            let source_revision_hash: String = read_query_value(&row, "source_revision_hash")?;
            let relation: String = read_query_value(&row, "relation")?;
            let target_id: String = read_query_value(&row, "target_id")?;
            let version: Vec<i32> = read_query_value(&row, "version")?;

            Ok(ExistingVersionedKeyRow {
                key: relation_row_key(&source_id, &source_revision_hash, &relation, &target_id),
                version,
            })
        })
        .collect()
}

/// Change summary derived from the current projection output and the existing persisted row keys.
fn summarize_projection_change(
    build: i32,
    projected: &[ProjectedSnapshot],
    existing_entities: &[ExistingVersionedKeyRow],
    existing_localizations: &[ExistingVersionedKeyRow],
    existing_relations: &[ExistingVersionedKeyRow],
) -> Result<ProjectionChangeSummary, String> {
    let entity_keys = projected
        .iter()
        .map(|snapshot| entity_row_key(&snapshot.entity.card_id, &snapshot.entity.revision_hash))
        .collect::<Vec<_>>();
    let localization_keys = projected
        .iter()
        .flat_map(|snapshot| {
            snapshot.localizations.iter().map(|row| {
                localization_row_key(
                    &row.card_id,
                    &row.lang,
                    &row.revision_hash,
                    &row.localization_hash,
                )
            })
        })
        .collect::<Vec<_>>();
    let relation_keys = projected
        .iter()
        .flat_map(|snapshot| {
            snapshot.relations.iter().map(|row| {
                relation_row_key(
                    &row.source_id,
                    &row.source_revision_hash,
                    &row.relation,
                    &row.target_id,
                )
            })
        })
        .collect::<Vec<_>>();

    let write_stats = ProjectionWriteStats {
        entities: summarize_target_row_stats(build, &entity_keys, existing_entities)?,
        localizations: summarize_target_row_stats(
            build,
            &localization_keys,
            existing_localizations,
        )?,
        relations: summarize_target_row_stats(build, &relation_keys, existing_relations)?,
    };
    let changed = write_stats.entities.inserted > 0
        || write_stats.entities.updated > 0
        || write_stats.localizations.inserted > 0
        || write_stats.localizations.updated > 0
        || write_stats.relations.inserted > 0
        || write_stats.relations.updated > 0
        || has_extra_build_rows(build, &entity_keys, existing_entities)
        || has_extra_build_rows(build, &localization_keys, existing_localizations)
        || has_extra_build_rows(build, &relation_keys, existing_relations);

    Ok(ProjectionChangeSummary {
        write_stats,
        changed,
    })
}

/// Inserted, reused, and updated counts classified from one target key set and existing versions.
fn summarize_target_row_stats(
    build: i32,
    target_keys: &[String],
    existing_rows: &[ExistingVersionedKeyRow],
) -> Result<ProjectionRowWriteStats, String> {
    let existing_by_key = existing_rows
        .iter()
        .map(|row| (row.key.as_str(), &row.version))
        .collect::<HashMap<_, _>>();
    let mut stats = ProjectionRowWriteStats::default();

    for key in target_keys {
        match existing_by_key.get(key.as_str()) {
            None => {
                stats.inserted = stats.inserted.checked_add(1).ok_or_else(|| {
                    "[hearthstone][hsdata-project][desktop] inserted row count exceeds u32 range"
                        .to_string()
                })?;
            }
            Some(version) if version.contains(&build) => {
                stats.reused = stats.reused.checked_add(1).ok_or_else(|| {
                    "[hearthstone][hsdata-project][desktop] reused row count exceeds u32 range"
                        .to_string()
                })?;
            }
            Some(_) => {
                stats.updated = stats.updated.checked_add(1).ok_or_else(|| {
                    "[hearthstone][hsdata-project][desktop] updated row count exceeds u32 range"
                        .to_string()
                })?;
            }
        }
    }

    Ok(stats)
}

/// Build-scoped rows scheduled for removal detected from the current persisted key set.
fn has_extra_build_rows(
    build: i32,
    target_keys: &[String],
    existing_rows: &[ExistingVersionedKeyRow],
) -> bool {
    let target_keys = target_keys
        .iter()
        .map(String::as_str)
        .collect::<HashSet<_>>();

    existing_rows
        .iter()
        .any(|row| row.version.contains(&build) && !target_keys.contains(row.key.as_str()))
}

/// Projected rows persisted into the local Hearthstone domain tables for one build.
async fn write_projected_rows(
    connection: &impl ConnectionTrait,
    build: i32,
    projected: &[ProjectedSnapshot],
) -> Result<(), String> {
    let card_ids = projected
        .iter()
        .map(|row| row.entity.card_id.clone())
        .collect::<Vec<_>>();
    let source_ids = projected
        .iter()
        .map(|row| row.entity.card_id.clone())
        .collect::<Vec<_>>();

    prune_entity_build_rows(connection, build, &card_ids).await?;
    prune_localization_build_rows(connection, build, &card_ids).await?;
    prune_relation_build_rows(connection, build, &source_ids).await?;

    for snapshot in projected {
        ensure_card_row(connection, &snapshot.entity.card_id).await?;
        upsert_entity_row(connection, build, &snapshot.entity).await?;

        for localization in &snapshot.localizations {
            upsert_localization_row(connection, build, localization).await?;
        }

        for relation in &snapshot.relations {
            upsert_relation_row(connection, build, relation).await?;
        }
    }

    recompute_entity_latest_flags(connection, &card_ids).await?;
    recompute_localization_latest_flags(connection, &card_ids).await?;
    recompute_relation_latest_flags(connection, &source_ids).await?;

    Ok(())
}

/// Card row inserted with default legalities when the projected card id is not present yet.
async fn ensure_card_row(connection: &impl ConnectionTrait, card_id: &str) -> Result<(), String> {
    connection
        .execute(postgres_statement_with_values(
            r#"
            insert into hearthstone.cards (card_id, legalities)
            values ($1, $2)
            on conflict (card_id) do nothing
            "#,
            vec![card_id.to_string().into(), json!({}).into()],
        ))
        .await
        .map_err(|error| format!("Failed to ensure hearthstone.cards row {card_id}: {error}"))?;

    Ok(())
}

/// Current build removed from existing entity versions before one write-mode projection pass.
async fn prune_entity_build_rows(
    connection: &impl ConnectionTrait,
    build: i32,
    card_ids: &[String],
) -> Result<(), String> {
    if card_ids.is_empty() {
        return Ok(());
    }

    let card_ids = string_array_value(card_ids);
    connection
        .execute(postgres_statement_with_values(
            "delete from hearthstone.entities where card_id = any($1) and cardinality(version) = 1 and $2 = any(version)",
            vec![card_ids.clone(), build.into()],
        ))
        .await
        .map_err(|error| {
            format!("Failed to delete single-build hearthstone.entities rows: {error}")
        })?;
    connection
        .execute(postgres_statement_with_values(
            "update hearthstone.entities set version = array_remove(version, $1), is_latest = false where card_id = any($2) and cardinality(version) > 1 and $1 = any(version)",
            vec![build.into(), card_ids],
        ))
        .await
        .map_err(|error| format!("Failed to prune current build from hearthstone.entities: {error}"))?;

    Ok(())
}

/// Current build removed from existing localization versions before one write-mode projection pass.
async fn prune_localization_build_rows(
    connection: &impl ConnectionTrait,
    build: i32,
    card_ids: &[String],
) -> Result<(), String> {
    if card_ids.is_empty() {
        return Ok(());
    }

    let card_ids = string_array_value(card_ids);
    connection
        .execute(postgres_statement_with_values(
            "delete from hearthstone.entity_localizations where card_id = any($1) and cardinality(version) = 1 and $2 = any(version)",
            vec![card_ids.clone(), build.into()],
        ))
        .await
        .map_err(|error| {
            format!("Failed to delete single-build hearthstone.entity_localizations rows: {error}")
        })?;
    connection
        .execute(postgres_statement_with_values(
            "update hearthstone.entity_localizations set version = array_remove(version, $1), is_latest = false where card_id = any($2) and cardinality(version) > 1 and $1 = any(version)",
            vec![build.into(), card_ids],
        ))
        .await
        .map_err(|error| format!("Failed to prune current build from hearthstone.entity_localizations: {error}"))?;

    Ok(())
}

/// Current build removed from existing relation versions before one write-mode projection pass.
async fn prune_relation_build_rows(
    connection: &impl ConnectionTrait,
    build: i32,
    source_ids: &[String],
) -> Result<(), String> {
    if source_ids.is_empty() {
        return Ok(());
    }

    let source_ids = string_array_value(source_ids);
    connection
        .execute(postgres_statement_with_values(
            "delete from hearthstone.entity_relations where source_id = any($1) and cardinality(version) = 1 and $2 = any(version)",
            vec![source_ids.clone(), build.into()],
        ))
        .await
        .map_err(|error| {
            format!("Failed to delete single-build hearthstone.entity_relations rows: {error}")
        })?;
    connection
        .execute(postgres_statement_with_values(
            "update hearthstone.entity_relations set version = array_remove(version, $1), is_latest = false where source_id = any($2) and cardinality(version) > 1 and $1 = any(version)",
            vec![build.into(), source_ids],
        ))
        .await
        .map_err(|error| format!("Failed to prune current build from hearthstone.entity_relations: {error}"))?;

    Ok(())
}

/// One entity row inserted or merged by primary key while preserving version history.
async fn upsert_entity_row(
    connection: &impl ConnectionTrait,
    build: i32,
    row: &ProjectionEntityRow,
) -> Result<(), String> {
    connection
        .execute(postgres_statement_with_values(
            r#"
            insert into hearthstone.entities (
              card_id, version, revision_hash, dbf_id, legacy_payload, set, class, type, cost, attack,
              health, durability, armor, rune, race, spell_school, quest_type, quest_progress, quest_part,
              hero_power, tech_level, in_bobs_tavern, triple_card, race_bucket, armor_bucket, buddy,
              banned_race, mercenary_role, mercenary_faction, colddown, collectible, elite, rarity,
              artist, override_watermark, faction, mechanics, referenced_tags, text_builder_type,
              change_type, is_latest
            ) values (
              $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
              $11, $12, $13, $14, $15, $16, $17, $18, $19,
              $20, $21, $22, $23, $24, $25, $26,
              $27, $28, $29, $30, $31, $32, $33,
              $34, $35, $36, $37, $38, $39,
              $40::hearthstone.change_type, $41
            )
            on conflict (card_id, revision_hash) do update
            set
              version = (
                select array_agg(value order by value)
                from (
                  select distinct unnest(hearthstone.entities.version || excluded.version) as value
                ) merged
              ),
              dbf_id = excluded.dbf_id,
              legacy_payload = excluded.legacy_payload,
              set = excluded.set,
              class = excluded.class,
              type = excluded.type,
              cost = excluded.cost,
              attack = excluded.attack,
              health = excluded.health,
              durability = excluded.durability,
              armor = excluded.armor,
              rune = excluded.rune,
              race = excluded.race,
              spell_school = excluded.spell_school,
              quest_type = excluded.quest_type,
              quest_progress = excluded.quest_progress,
              quest_part = excluded.quest_part,
              hero_power = excluded.hero_power,
              tech_level = excluded.tech_level,
              in_bobs_tavern = excluded.in_bobs_tavern,
              triple_card = excluded.triple_card,
              race_bucket = excluded.race_bucket,
              armor_bucket = excluded.armor_bucket,
              buddy = excluded.buddy,
              banned_race = excluded.banned_race,
              mercenary_role = excluded.mercenary_role,
              mercenary_faction = excluded.mercenary_faction,
              colddown = excluded.colddown,
              collectible = excluded.collectible,
              elite = excluded.elite,
              rarity = excluded.rarity,
              artist = excluded.artist,
              override_watermark = excluded.override_watermark,
              faction = excluded.faction,
              mechanics = excluded.mechanics,
              referenced_tags = excluded.referenced_tags,
              text_builder_type = excluded.text_builder_type,
              change_type = excluded.change_type,
              is_latest = false
            "#,
            vec![
                row.card_id.clone().into(),
                int_array_value(&[build]),
                row.revision_hash.clone().into(),
                row.dbf_id.into(),
                row.legacy_payload.clone().into(),
                row.set_id.clone().into(),
                string_array_value(&row.classes),
                row.type_slug.clone().into(),
                row.cost.into(),
                row.attack.into(),
                row.health.into(),
                row.durability.into(),
                row.armor.into(),
                optional_string_array_value(row.rune.as_deref()),
                optional_string_array_value(Some(&row.race)),
                row.spell_school.clone().into(),
                row.quest_type.clone().into(),
                row.quest_progress.into(),
                row.quest_part.into(),
                row.hero_power.clone().into(),
                row.tech_level.into(),
                row.in_bobs_tavern.into(),
                row.triple_card.clone().into(),
                row.race_bucket.clone().into(),
                row.armor_bucket.into(),
                row.buddy.clone().into(),
                row.banned_race.clone().into(),
                row.mercenary_role.clone().into(),
                row.mercenary_faction.clone().into(),
                row.colddown.into(),
                row.collectible.into(),
                row.elite.into(),
                row.rarity.clone().into(),
                row.artist.clone().into(),
                row.override_watermark.clone().into(),
                row.faction.clone().into(),
                map_to_json_value(&row.mechanics).into(),
                map_to_json_value(&row.referenced_tags).into(),
                row.text_builder_type.clone().into(),
                row.change_type.clone().into(),
                false.into(),
            ],
        ))
        .await
        .map_err(|error| format!("Failed to upsert hearthstone.entities row {}: {error}", row.card_id))?;

    Ok(())
}

/// One localization row inserted or merged by primary key while preserving version history.
async fn upsert_localization_row(
    connection: &impl ConnectionTrait,
    build: i32,
    row: &ProjectionLocalizationRow,
) -> Result<(), String> {
    connection
        .execute(postgres_statement_with_values(
            r#"
            insert into hearthstone.entity_localizations (
              card_id, version, lang, revision_hash, localization_hash, render_hash, render_model,
              is_latest, name, text, rich_text, display_text, target_text, text_in_play,
              how_to_earn, how_to_earn_golden, flavor_text, loc_change_type
            ) values (
              $1, $2, $3::hearthstone.locale, $4, $5, $6, $7,
              $8, $9, $10, $11, $12, $13, $14,
              $15, $16, $17, $18::hearthstone.change_type
            )
            on conflict (card_id, lang, revision_hash, localization_hash) do update
            set
              version = (
                select array_agg(value order by value)
                from (
                  select distinct unnest(hearthstone.entity_localizations.version || excluded.version) as value
                ) merged
              ),
              render_hash = excluded.render_hash,
              render_model = excluded.render_model,
              is_latest = false,
              name = excluded.name,
              text = excluded.text,
              rich_text = excluded.rich_text,
              display_text = excluded.display_text,
              target_text = excluded.target_text,
              text_in_play = excluded.text_in_play,
              how_to_earn = excluded.how_to_earn,
              how_to_earn_golden = excluded.how_to_earn_golden,
              flavor_text = excluded.flavor_text,
              loc_change_type = excluded.loc_change_type
            "#,
            vec![
                row.card_id.clone().into(),
                int_array_value(&[build]),
                row.lang.clone().into(),
                row.revision_hash.clone().into(),
                row.localization_hash.clone().into(),
                sea_orm::Value::String(None),
                sea_orm::Value::Json(None),
                false.into(),
                row.name.clone().into(),
                row.text.clone().into(),
                row.rich_text.clone().into(),
                row.display_text.clone().into(),
                row.target_text.clone().into(),
                row.text_in_play.clone().into(),
                row.how_to_earn.clone().into(),
                row.how_to_earn_golden.clone().into(),
                row.flavor_text.clone().into(),
                row.loc_change_type.clone().into(),
            ],
        ))
        .await
        .map_err(|error| {
            format!(
                "Failed to upsert hearthstone.entity_localizations row {} {}: {error}",
                row.card_id, row.lang
            )
        })?;

    Ok(())
}

/// One relation row inserted or merged by primary key while preserving version history.
async fn upsert_relation_row(
    connection: &impl ConnectionTrait,
    build: i32,
    row: &ProjectionRelationRow,
) -> Result<(), String> {
    connection
        .execute(postgres_statement_with_values(
            r#"
            insert into hearthstone.entity_relations (
              source_id, source_revision_hash, relation, target_id, version, is_latest
            ) values (
              $1, $2, $3, $4, $5, $6
            )
            on conflict (source_id, source_revision_hash, relation, target_id) do update
            set
              version = (
                select array_agg(value order by value)
                from (
                  select distinct unnest(hearthstone.entity_relations.version || excluded.version) as value
                ) merged
              ),
              is_latest = false
            "#,
            vec![
                row.source_id.clone().into(),
                row.source_revision_hash.clone().into(),
                row.relation.clone().into(),
                row.target_id.clone().into(),
                int_array_value(&[build]),
                false.into(),
            ],
        ))
        .await
        .map_err(|error| {
            format!(
                "Failed to upsert hearthstone.entity_relations row {} {}: {error}",
                row.source_id, row.relation
            )
        })?;

    Ok(())
}

/// Latest entity flags recomputed from the highest version attached to each card id.
async fn recompute_entity_latest_flags(
    connection: &impl ConnectionTrait,
    card_ids: &[String],
) -> Result<(), String> {
    if card_ids.is_empty() {
        return Ok(());
    }

    let card_ids = string_array_value(card_ids);
    connection
        .execute(postgres_statement_with_values(
            r#"
            with latest as (
              select card_id, max(version_item) as latest_version
              from hearthstone.entities
              cross join lateral unnest(version) as version_item
              where card_id = any($1)
              group by card_id
            )
            update hearthstone.entities as entity
            set is_latest = entity.version @> array[latest.latest_version]::integer[]
            from latest
            where entity.card_id = latest.card_id
              and entity.card_id = any($1)
            "#,
            vec![card_ids],
        ))
        .await
        .map_err(|error| {
            format!("Failed to recompute hearthstone.entities latest flags: {error}")
        })?;

    Ok(())
}

/// Latest localization flags recomputed from the highest version per card and language.
async fn recompute_localization_latest_flags(
    connection: &impl ConnectionTrait,
    card_ids: &[String],
) -> Result<(), String> {
    if card_ids.is_empty() {
        return Ok(());
    }

    let card_ids = string_array_value(card_ids);
    connection
        .execute(postgres_statement_with_values(
            r#"
            with latest as (
              select card_id, lang, max(version_item) as latest_version
              from hearthstone.entity_localizations
              cross join lateral unnest(version) as version_item
              where card_id = any($1)
              group by card_id, lang
            )
            update hearthstone.entity_localizations as localization
            set is_latest = localization.version @> array[latest.latest_version]::integer[]
            from latest
            where localization.card_id = latest.card_id
              and localization.lang = latest.lang
              and localization.card_id = any($1)
            "#,
            vec![card_ids],
        ))
        .await
        .map_err(|error| {
            format!("Failed to recompute hearthstone.entity_localizations latest flags: {error}")
        })?;

    Ok(())
}

/// Latest relation flags recomputed from the highest version attached to each source id.
async fn recompute_relation_latest_flags(
    connection: &impl ConnectionTrait,
    source_ids: &[String],
) -> Result<(), String> {
    if source_ids.is_empty() {
        return Ok(());
    }

    let source_ids = string_array_value(source_ids);
    connection
        .execute(postgres_statement_with_values(
            r#"
            with latest as (
              select source_id, max(version_item) as latest_version
              from hearthstone.entity_relations
              cross join lateral unnest(version) as version_item
              where source_id = any($1)
              group by source_id
            )
            update hearthstone.entity_relations as relation
            set is_latest = relation.version @> array[latest.latest_version]::integer[]
            from latest
            where relation.source_id = latest.source_id
              and relation.source_id = any($1)
            "#,
            vec![source_ids],
        ))
        .await
        .map_err(|error| {
            format!("Failed to recompute hearthstone.entity_relations latest flags: {error}")
        })?;

    Ok(())
}

/// Tag config rows loaded for one explicit enum id list.
async fn load_projection_tags(
    connection: &impl ConnectionTrait,
    enum_ids: &[i32],
) -> Result<Vec<tags::Model>, String> {
    if enum_ids.is_empty() {
        return Ok(Vec::new());
    }

    tags::Entity::find()
        .filter(tags::Column::EnumId.is_in(enum_ids.iter().copied()))
        .all(connection)
        .await
        .map_err(|error| format!("Failed to load local hsdata tag configs: {error}"))
}

/// Parsed tag configs indexed by enum id for one projection preflight.
fn parse_projection_tags(
    models: &[tags::Model],
) -> Result<HashMap<i32, ParsedTagProjection>, String> {
    let mut result = HashMap::with_capacity(models.len());

    for model in models {
        let parsed = parse_tag_projection(model)?;
        result.insert(parsed.enum_id, parsed);
    }

    Ok(result)
}

/// Unprojected tag rows counted from the current parser-visible projection config.
fn count_unprojected_tags(
    snapshot_tags: &[ProjectionSnapshotTagRow],
    parsed_by_enum_id: &HashMap<i32, ParsedTagProjection>,
) -> Result<u32, String> {
    let count = snapshot_tags
        .iter()
        .filter(|row| match parsed_by_enum_id.get(&row.enum_id) {
            None => true,
            Some(parsed) => parsed.project_rule.is_none() || parsed.project_target_path.is_none(),
        })
        .count();

    u32::try_from(count).map_err(|_| {
        "[hearthstone][hsdata-project][desktop] unprojected tag count exceeds u32 range".to_string()
    })
}

/// Locale map decoded from one nullable JSON column.
fn read_localized_text(
    row: &sea_orm::QueryResult,
    column: &str,
) -> Result<Option<LocalizedText>, String> {
    let value: Option<Value> = read_query_value(row, column)?;
    match value {
        None => Ok(None),
        Some(Value::Object(object)) => {
            let mut result = HashMap::with_capacity(object.len());

            for (key, item) in object {
                let Some(text) = item.as_str() else {
                    return Err(format!(
                        "Failed to decode PostgreSQL column {column}: expected localized string map"
                    ));
                };
                result.insert(key, text.to_string());
            }

            Ok(Some(result))
        }
        Some(_) => Err(format!(
            "Failed to decode PostgreSQL column {column}: expected localized string map"
        )),
    }
}

/// Raw snapshots projected into in-memory entity, localization, and relation drafts.
fn project_snapshots(
    snapshots: &[ProjectionSnapshotRow],
    snapshot_tags: &[ProjectionSnapshotTagRow],
    parsed_by_enum_id: &HashMap<i32, ParsedTagProjection>,
    sets: &[ProjectionSetRow],
) -> Result<Vec<ProjectedSnapshot>, String> {
    let mut tags_by_snapshot_id: HashMap<&str, Vec<&ProjectionSnapshotTagRow>> =
        HashMap::with_capacity(snapshots.len());

    for row in snapshot_tags {
        tags_by_snapshot_id
            .entry(row.snapshot_id.as_str())
            .or_default()
            .push(row);
    }

    let context = ProjectionContext {
        card_id_by_dbf_id: snapshots
            .iter()
            .map(|snapshot| (snapshot.dbf_id, snapshot.card_id.clone()))
            .collect(),
        set_id_by_dbf_id: sets
            .iter()
            .map(|row| (row.dbf_id, row.set_id.clone()))
            .collect(),
    };

    let mut result = Vec::with_capacity(snapshots.len());

    for snapshot in snapshots {
        let rows = tags_by_snapshot_id
            .remove(snapshot.id.as_str())
            .unwrap_or_default();
        result.push(project_snapshot(
            snapshot,
            &rows,
            parsed_by_enum_id,
            &context,
        )?);
    }

    Ok(result)
}

/// One raw snapshot projected into memory without touching local domain tables.
fn project_snapshot(
    snapshot: &ProjectionSnapshotRow,
    raw_tags: &[&ProjectionSnapshotTagRow],
    parsed_by_enum_id: &HashMap<i32, ParsedTagProjection>,
    context: &ProjectionContext,
) -> Result<ProjectedSnapshot, String> {
    let mut entity = create_entity_draft(snapshot);
    let mut localizations: HashMap<String, LocalizationDraft> = HashMap::new();
    let mut relation_drafts = Vec::new();
    let mut sorted_tags = raw_tags.to_vec();
    let mut unprojected_tag_count = 0_u32;
    let mut unprojected_tags = Vec::new();

    sorted_tags.sort_by_key(|row| row.tag_order);

    for row in sorted_tags {
        let Some(tag) = parsed_by_enum_id.get(&row.enum_id) else {
            mark_unprojected_tag(&mut unprojected_tag_count, &mut unprojected_tags, row, None);
            continue;
        };
        let Some(project_rule) = &tag.project_rule else {
            mark_unprojected_tag(
                &mut unprojected_tag_count,
                &mut unprojected_tags,
                row,
                Some(tag),
            );
            continue;
        };
        let Some(target_path) = tag.project_target_path.as_deref() else {
            mark_unprojected_tag(
                &mut unprojected_tag_count,
                &mut unprojected_tags,
                row,
                Some(tag),
            );
            continue;
        };

        let normalized = normalize_tag_value(row, tag, context);
        if target_path == "set"
            && uses_set_enum_rule(tag)
            && !matches!(normalized, Some(NormalizedValue::String(_)))
        {
            return Err(format!(
                "[hearthstone][hsdata-project][desktop] unresolved setId for card {} ({}) from payload {}",
                snapshot.card_id,
                snapshot.dbf_id,
                row.raw_payload
            ));
        }

        let cleaned = clean_null_value(normalized, tag);
        let Some(cleaned) = cleaned else {
            mark_unprojected_tag(
                &mut unprojected_tag_count,
                &mut unprojected_tags,
                row,
                Some(tag),
            );
            continue;
        };

        match project_rule {
            ProjectRule::AssignValue => {
                if !apply_entity_scalar(&mut entity, target_path, &cleaned) {
                    mark_unprojected_tag(
                        &mut unprojected_tag_count,
                        &mut unprojected_tags,
                        row,
                        Some(tag),
                    );
                }
            }
            ProjectRule::AppendStringArray { appended_value } => {
                if let Some(value) = append_string_array_value(&cleaned, appended_value.as_deref())
                {
                    if !append_entity_string_array(&mut entity, target_path, value) {
                        mark_unprojected_tag(
                            &mut unprojected_tag_count,
                            &mut unprojected_tags,
                            row,
                            Some(tag),
                        );
                    }
                }
            }
            ProjectRule::AssignCardRef => {
                if !apply_card_ref(&mut entity, &mut relation_drafts, target_path, &cleaned) {
                    mark_unprojected_tag(
                        &mut unprojected_tag_count,
                        &mut unprojected_tags,
                        row,
                        Some(tag),
                    );
                }
            }
            ProjectRule::AssignLocalizedText { locale_map } => {
                if !apply_localized_text(&mut localizations, target_path, &cleaned, locale_map) {
                    mark_unprojected_tag(
                        &mut unprojected_tag_count,
                        &mut unprojected_tags,
                        row,
                        Some(tag),
                    );
                }
            }
            ProjectRule::AssignMechanic => {
                if !apply_numeric_flag(&mut entity.mechanics, row.enum_id, &cleaned) {
                    mark_unprojected_tag(
                        &mut unprojected_tag_count,
                        &mut unprojected_tags,
                        row,
                        Some(tag),
                    );
                }
            }
            ProjectRule::AssignReferencedTag => {
                if !apply_numeric_flag(&mut entity.referenced_tags, row.enum_id, &cleaned) {
                    mark_unprojected_tag(
                        &mut unprojected_tag_count,
                        &mut unprojected_tags,
                        row,
                        Some(tag),
                    );
                }
            }
            ProjectRule::AssignLegacy => {
                if !apply_legacy_value(&mut entity, target_path, &cleaned) {
                    mark_unprojected_tag(
                        &mut unprojected_tag_count,
                        &mut unprojected_tags,
                        row,
                        Some(tag),
                    );
                }
            }
            ProjectRule::EmitRelation => {
                if tag.project_target_type.as_deref() != Some("entity_relation")
                    || !append_relation_draft(&mut relation_drafts, target_path, &cleaned)
                {
                    mark_unprojected_tag(
                        &mut unprojected_tag_count,
                        &mut unprojected_tags,
                        row,
                        Some(tag),
                    );
                }
            }
        }
    }

    finalize_entity_row(&mut entity);
    if localizations.is_empty() {
        return Err(build_missing_localization_error(
            snapshot,
            raw_tags,
            parsed_by_enum_id,
        ));
    }
    let localizations = finalize_localizations(&entity, localizations);
    let relations = build_relations(&entity, &relation_drafts);

    Ok(ProjectedSnapshot {
        entity,
        localizations,
        relations,
        unprojected_tag_count,
        unprojected_tags,
    })
}

/// Missing-localization failure formatted with localized-tag diagnostics for one snapshot.
fn build_missing_localization_error(
    snapshot: &ProjectionSnapshotRow,
    raw_tags: &[&ProjectionSnapshotTagRow],
    parsed_by_enum_id: &HashMap<i32, ParsedTagProjection>,
) -> String {
    let localized_sources = raw_tags
        .iter()
        .filter_map(|row| {
            let parsed = parsed_by_enum_id.get(&row.enum_id);
            let locale_keys = row
                .loc_string_value
                .as_ref()
                .map(|values| {
                    let mut keys = values.keys().cloned().collect::<Vec<_>>();
                    keys.sort();
                    keys.join(",")
                })
                .unwrap_or_else(|| "-".to_string());
            let Some(target_path) = parsed.and_then(|tag| tag.project_target_path.as_deref())
            else {
                if row.loc_string_value.is_none() {
                    return None;
                }

                return Some(format!(
                    "{}:{} target=- locales={}",
                    row.enum_id, row.raw_name, locale_keys
                ));
            };
            let Some(ProjectRule::AssignLocalizedText { locale_map }) =
                parsed.map(|tag| &tag.project_rule).and_then(Option::as_ref)
            else {
                if row.loc_string_value.is_none() {
                    return None;
                }

                return Some(format!(
                    "{}:{} target={} locales={}",
                    row.enum_id,
                    parsed
                        .map(|tag| tag.slug.as_str())
                        .unwrap_or(row.raw_name.as_str()),
                    target_path,
                    locale_keys
                ));
            };

            let normalized_locales = row
                .loc_string_value
                .as_ref()
                .map(|values| {
                    let mut keys = values
                        .keys()
                        .filter_map(|key| normalize_locale_key(key, locale_map))
                        .collect::<Vec<_>>();
                    keys.sort();
                    keys.dedup();
                    if keys.is_empty() {
                        "-".to_string()
                    } else {
                        keys.join(",")
                    }
                })
                .unwrap_or_else(|| "-".to_string());

            Some(format!(
                "{}:{} target={} locales={} normalized={}",
                row.enum_id,
                parsed
                    .map(|tag| tag.slug.as_str())
                    .unwrap_or(row.raw_name.as_str()),
                target_path,
                locale_keys,
                normalized_locales
            ))
        })
        .collect::<Vec<_>>();

    let source_summary = if localized_sources.is_empty() {
        "none".to_string()
    } else {
        localized_sources.join("; ")
    };

    format!(
        "[hearthstone][hsdata-project][desktop] missing localization rows for {} (dbfId {}); localized tag candidates: {}",
        snapshot.card_id, snapshot.dbf_id, source_summary
    )
}

/// One unprojected raw tag row recorded into the per-snapshot report state.
fn mark_unprojected_tag(
    unprojected_tag_count: &mut u32,
    unprojected_tags: &mut Vec<ProjectionUnprojectedTagHit>,
    row: &ProjectionSnapshotTagRow,
    tag: Option<&ParsedTagProjection>,
) {
    *unprojected_tag_count = unprojected_tag_count.saturating_add(1);
    unprojected_tags.push(ProjectionUnprojectedTagHit {
        enum_id: row.enum_id,
        slug: tag
            .map(|item| item.slug.clone())
            .unwrap_or_else(|| row.raw_name.clone()),
    });
}

/// Entity row initialized from one raw snapshot before tag projection mutates fields.
fn create_entity_draft(snapshot: &ProjectionSnapshotRow) -> ProjectionEntityRow {
    ProjectionEntityRow {
        card_id: snapshot.card_id.clone(),
        revision_hash: String::new(),
        dbf_id: snapshot.dbf_id,
        legacy_payload: json!({}),
        set_id: String::new(),
        classes: Vec::new(),
        race: Vec::new(),
        type_slug: "null".to_string(),
        cost: 0,
        attack: None,
        health: None,
        durability: None,
        armor: None,
        rune: None,
        spell_school: None,
        quest_type: None,
        quest_progress: None,
        quest_part: None,
        hero_power: None,
        tech_level: None,
        in_bobs_tavern: false,
        triple_card: None,
        race_bucket: None,
        armor_bucket: None,
        buddy: None,
        banned_race: None,
        mercenary_role: None,
        mercenary_faction: None,
        colddown: None,
        collectible: false,
        elite: false,
        artist: String::new(),
        rarity: None,
        override_watermark: None,
        faction: None,
        mechanics: HashMap::new(),
        referenced_tags: extract_referenced_tags(&snapshot.extra_payload),
        text_builder_type: "default".to_string(),
        change_type: "unknown".to_string(),
    }
}

/// Referenced tag flags copied from raw snapshot extra payload.
fn extract_referenced_tags(extra_payload: &Value) -> HashMap<String, Value> {
    let mut result = HashMap::new();
    let Some(object) = extra_payload.as_object() else {
        return result;
    };
    let Some(referenced_tags) = object.get("referencedTags").and_then(Value::as_object) else {
        return result;
    };

    for (key, value) in referenced_tags {
        if value.is_boolean() || value.as_i64().is_some() {
            result.insert(key.clone(), value.clone());
        }
    }

    result
}

/// Raw tag payload normalized with the parsed rule set for one hearthstone tag row.
fn normalize_tag_value(
    row: &ProjectionSnapshotTagRow,
    tag: &ParsedTagProjection,
    context: &ProjectionContext,
) -> Option<NormalizedValue> {
    match &tag.normalize_rule {
        NormalizeRule::Identity => normalize_scalar_value(row),
        NormalizeRule::IdentityInt => row.int_value.map(NormalizedValue::Int),
        NormalizeRule::IdentityString => row.string_value.clone().map(NormalizedValue::String),
        NormalizeRule::IdentityLocString => row
            .loc_string_value
            .clone()
            .map(NormalizedValue::LocalizedText),
        NormalizeRule::IdentityCardRef => {
            if row.card_ref_card_id.is_none() && row.card_ref_dbf_id.is_none() {
                None
            } else {
                Some(NormalizedValue::CardRef(CardRefValue {
                    card_id: row.card_ref_card_id.clone(),
                    dbf_id: row.card_ref_dbf_id,
                }))
            }
        }
        NormalizeRule::BoolFromInt {
            true_values,
            false_values,
        } => normalize_bool_from_int(row, true_values, false_values),
        NormalizeRule::EnumFromInt {
            enum_map,
            allow_unknown_enum_value,
        } => normalize_enum_from_int(
            row,
            tag,
            context,
            enum_map.as_ref(),
            *allow_unknown_enum_value,
        ),
        NormalizeRule::CardRefFromInt => normalize_card_ref_from_int(row, context),
        NormalizeRule::JsonWrap => Some(NormalizedValue::Json(
            row.json_value
                .clone()
                .unwrap_or_else(|| row.raw_payload.clone()),
        )),
    }
}

/// Scalar tag payload normalized without any config-driven coercion.
fn normalize_scalar_value(row: &ProjectionSnapshotTagRow) -> Option<NormalizedValue> {
    if let Some(value) = row.bool_value {
        return Some(NormalizedValue::Bool(value));
    }
    if let Some(value) = row.int_value {
        return Some(NormalizedValue::Int(value));
    }
    if let Some(value) = row.string_value.clone() {
        return Some(NormalizedValue::String(value));
    }
    if let Some(value) = row.loc_string_value.clone() {
        return Some(NormalizedValue::LocalizedText(value));
    }
    if row.card_ref_card_id.is_some() || row.card_ref_dbf_id.is_some() {
        return Some(NormalizedValue::CardRef(CardRefValue {
            card_id: row.card_ref_card_id.clone(),
            dbf_id: row.card_ref_dbf_id,
        }));
    }

    row.json_value.clone().map(NormalizedValue::Json)
}

/// Boolean tag projection normalized from one integer payload.
fn normalize_bool_from_int(
    row: &ProjectionSnapshotTagRow,
    true_values: &[i32],
    false_values: &[i32],
) -> Option<NormalizedValue> {
    let Some(value) = row.int_value else {
        return row.bool_value.map(NormalizedValue::Bool);
    };

    let normalized = if !true_values.is_empty() || !false_values.is_empty() {
        if true_values.contains(&value) {
            Some(true)
        } else if false_values.contains(&value) {
            Some(false)
        } else {
            None
        }
    } else if value == 1 {
        Some(true)
    } else if value == 0 {
        Some(false)
    } else {
        None
    }?;

    Some(NormalizedValue::Bool(normalized))
}

/// Integer enum tag projection normalized from config and built-in fallbacks.
fn normalize_enum_from_int(
    row: &ProjectionSnapshotTagRow,
    tag: &ParsedTagProjection,
    context: &ProjectionContext,
    enum_map: Option<&EnumMapRule>,
    allow_unknown_enum_value: bool,
) -> Option<NormalizedValue> {
    let value = row.int_value?;

    if matches!(enum_map, Some(EnumMapRule::Set)) {
        return context
            .set_id_by_dbf_id
            .get(&value)
            .cloned()
            .map(NormalizedValue::String);
    }

    if let Some(alias) = enum_map {
        match alias {
            EnumMapRule::Rarity => {
                if let Some(mapped) = normalize_known_enum_value(tag, value) {
                    return Some(NormalizedValue::String(mapped));
                }
            }
            EnumMapRule::SpellSchool => {
                if let Some(mapped) = spell_school_token_by_int(value) {
                    return Some(NormalizedValue::String(mapped.to_string()));
                }
            }
            EnumMapRule::Race => {
                if let Some(mapped) = race_token_by_int(value) {
                    return Some(NormalizedValue::String(mapped.to_string()));
                }
            }
            EnumMapRule::Multiclass => {
                let mapped = class_tokens_by_mask(value);
                if !mapped.is_empty() {
                    return Some(NormalizedValue::StringArray(mapped));
                }
            }
            EnumMapRule::Set | EnumMapRule::Values(_) => {}
        }
    }

    if let Some(EnumMapRule::Values(values)) = enum_map {
        let key = value.to_string();
        if let Some(mapped) = values.get(&key) {
            return match mapped {
                EnumMapValue::String(text) => Some(NormalizedValue::String(
                    normalize_projected_enum_value(tag, text).unwrap_or_else(|| text.clone()),
                )),
                EnumMapValue::StringArray(items) => {
                    Some(NormalizedValue::StringArray(items.clone()))
                }
            };
        }
    }

    normalize_known_enum_value(tag, value)
        .map(NormalizedValue::String)
        .or_else(|| allow_unknown_enum_value.then(|| NormalizedValue::String(value.to_string())))
}

/// Card reference normalized from an integer dbf id plus the current snapshot lookup tables.
fn normalize_card_ref_from_int(
    row: &ProjectionSnapshotTagRow,
    context: &ProjectionContext,
) -> Option<NormalizedValue> {
    if row.card_ref_card_id.is_some() || row.card_ref_dbf_id.is_some() {
        return Some(NormalizedValue::CardRef(CardRefValue {
            card_id: row.card_ref_card_id.clone(),
            dbf_id: row.card_ref_dbf_id,
        }));
    }

    let dbf_id = row.int_value?;

    Some(NormalizedValue::CardRef(CardRefValue {
        card_id: context.card_id_by_dbf_id.get(&dbf_id).cloned(),
        dbf_id: Some(dbf_id),
    }))
}

/// Known enum fallback normalized for `type` and `rarity` target fields.
fn normalize_known_enum_value(tag: &ParsedTagProjection, value: i32) -> Option<String> {
    resolve_known_enum_target(tag)
        .and_then(|target| known_scalar_enum_token_by_int(target, value))
        .map(str::to_string)
}

/// Target field resolved for enum normalization rules that need built-in aliases.
fn resolve_known_enum_target(tag: &ParsedTagProjection) -> Option<&str> {
    match tag.project_target_path.as_deref() {
        Some("type") => Some("type"),
        Some("rarity") => Some("rarity"),
        _ => match tag.slug.as_str() {
            "card_type" => Some("type"),
            "rarity" => Some("rarity"),
            _ => None,
        },
    }
}

/// Enum text normalized to the canonical output token for entity scalar fields.
fn normalize_projected_enum_value(tag: &ParsedTagProjection, value: &str) -> Option<String> {
    match resolve_known_enum_target(tag) {
        Some("type") | Some("rarity") => Some(normalize_enum_token(value)),
        _ => None,
    }
}

/// Enum token normalized with the same lowercase underscore rules as the TypeScript baseline.
fn normalize_enum_token(value: &str) -> String {
    let mut result = String::new();
    let mut last_was_separator = false;

    for character in value.trim().chars().flat_map(char::to_lowercase) {
        if character.is_ascii_alphanumeric() {
            result.push(character);
            last_was_separator = false;
            continue;
        }

        if !last_was_separator && !result.is_empty() {
            result.push('_');
        }
        last_was_separator = true;
    }

    result.trim_matches('_').to_string()
}

/// Parsed tag config checked for the special `enumMap: "set"` behavior.
fn uses_set_enum_rule(tag: &ParsedTagProjection) -> bool {
    matches!(
        tag.normalize_rule,
        NormalizeRule::EnumFromInt {
            enum_map: Some(EnumMapRule::Set),
            ..
        }
    )
}

/// Configured null values removed before one tag payload is projected.
fn clean_null_value(
    value: Option<NormalizedValue>,
    _tag: &ParsedTagProjection,
) -> Option<NormalizedValue> {
    value
}

/// Entity scalar fields updated from one normalized projection value.
fn apply_entity_scalar(
    entity: &mut ProjectionEntityRow,
    target_path: &str,
    value: &NormalizedValue,
) -> bool {
    match (target_path, value) {
        ("set", NormalizedValue::String(text)) => entity.set_id = text.clone(),
        ("type", NormalizedValue::String(text)) => entity.type_slug = text.clone(),
        ("cost", NormalizedValue::Int(number)) => entity.cost = *number,
        ("attack", NormalizedValue::Int(number)) => entity.attack = Some(*number),
        ("health", NormalizedValue::Int(number)) => entity.health = Some(*number),
        ("durability", NormalizedValue::Int(number)) => entity.durability = Some(*number),
        ("armor", NormalizedValue::Int(number)) => entity.armor = Some(*number),
        ("spellSchool", NormalizedValue::String(text)) => entity.spell_school = Some(text.clone()),
        ("questType", NormalizedValue::String(text)) => entity.quest_type = Some(text.clone()),
        ("questProgress", NormalizedValue::Int(number)) => entity.quest_progress = Some(*number),
        ("questPart", NormalizedValue::Int(number)) => entity.quest_part = Some(*number),
        ("techLevel", NormalizedValue::Int(number)) => entity.tech_level = Some(*number),
        ("inBobsTavern", NormalizedValue::Bool(flag)) => entity.in_bobs_tavern = *flag,
        ("raceBucket", NormalizedValue::String(text)) => entity.race_bucket = Some(text.clone()),
        ("armorBucket", NormalizedValue::Int(number)) => entity.armor_bucket = Some(*number),
        ("bannedRace", NormalizedValue::String(text)) => entity.banned_race = Some(text.clone()),
        ("mercenaryRole", NormalizedValue::String(text)) => {
            entity.mercenary_role = Some(text.clone())
        }
        ("mercenaryFaction", NormalizedValue::String(text)) => {
            entity.mercenary_faction = Some(text.clone())
        }
        ("colddown", NormalizedValue::Int(number)) => entity.colddown = Some(*number),
        ("collectible", NormalizedValue::Bool(flag)) => entity.collectible = *flag,
        ("elite", NormalizedValue::Bool(flag)) => entity.elite = *flag,
        ("artist", NormalizedValue::String(text)) => entity.artist = text.clone(),
        ("rarity", NormalizedValue::String(text)) => entity.rarity = Some(text.clone()),
        ("overrideWatermark", NormalizedValue::String(text)) => {
            entity.override_watermark = Some(text.clone())
        }
        ("faction", NormalizedValue::String(text)) => entity.faction = Some(text.clone()),
        ("textBuilderType", NormalizedValue::String(text)) => {
            entity.text_builder_type = text.clone()
        }
        _ => return false,
    }

    true
}

/// String-array entity fields appended with one normalized projection payload.
fn append_entity_string_array(
    entity: &mut ProjectionEntityRow,
    target_path: &str,
    value: NormalizedValue,
) -> bool {
    let values = match value {
        NormalizedValue::String(text) => vec![text],
        NormalizedValue::StringArray(items) => items,
        _ => return false,
    };

    if values.is_empty() {
        return false;
    }

    match target_path {
        "classes" => entity.classes = unique_strings([entity.classes.clone(), values].concat()),
        "rune" => {
            let current = entity.rune.clone().unwrap_or_default();
            entity.rune = Some(unique_strings([current, values].concat()));
        }
        "race" => entity.race = unique_strings([entity.race.clone(), values].concat()),
        _ => return false,
    }

    true
}

/// Boolean marker tags converted into string-array append payloads when configured.
fn append_string_array_value(
    value: &NormalizedValue,
    appended_value: Option<&str>,
) -> Option<NormalizedValue> {
    match value {
        NormalizedValue::Bool(false) => None,
        NormalizedValue::Bool(true) => {
            appended_value.map(|text| NormalizedValue::String(text.to_string()))
        }
        _ => Some(value.clone()),
    }
}

/// Card-reference entity fields updated from one normalized payload with legacy relation fallbacks.
fn apply_card_ref(
    entity: &mut ProjectionEntityRow,
    relation_drafts: &mut Vec<ProjectionRelationDraft>,
    target_path: &str,
    value: &NormalizedValue,
) -> bool {
    let NormalizedValue::CardRef(card_ref) = value else {
        return false;
    };
    let Some(card_id) = card_ref.card_id.clone() else {
        return false;
    };

    match target_path {
        "heroPower" => entity.hero_power = Some(card_id),
        "buddy" => entity.buddy = Some(card_id),
        "tripleCard" => entity.triple_card = Some(card_id),
        "heroicHeroPower" => {
            relation_drafts.push(ProjectionRelationDraft {
                relation: relation_name_from_entity_path(target_path),
                target_id: card_id,
            });
        }
        _ => return false,
    }

    true
}

/// Relation draft appended from one normalized card-reference payload and relation path.
fn append_relation_draft(
    relation_drafts: &mut Vec<ProjectionRelationDraft>,
    relation: &str,
    value: &NormalizedValue,
) -> bool {
    let NormalizedValue::CardRef(card_ref) = value else {
        return false;
    };
    let Some(target_id) = card_ref.card_id.clone() else {
        return false;
    };
    relation_drafts.push(ProjectionRelationDraft {
        relation: relation.to_string(),
        target_id,
    });
    true
}

/// Legacy payload updated from one normalized projection value and target path.
fn apply_legacy_value(
    entity: &mut ProjectionEntityRow,
    target_path: &str,
    value: &NormalizedValue,
) -> bool {
    if target_path == "legacyPayload" {
        let NormalizedValue::Json(Value::Object(object)) = value else {
            return false;
        };
        let Some(target) = entity.legacy_payload.as_object_mut() else {
            return false;
        };
        for (key, item) in object {
            target.insert(key.clone(), item.clone());
        }
        return true;
    }

    let key = target_path
        .strip_prefix("legacyPayload.")
        .unwrap_or(target_path);
    if key.is_empty() {
        return false;
    }

    let Some(target) = entity.legacy_payload.as_object_mut() else {
        return false;
    };
    target.insert(key.to_string(), normalized_value_to_json(value));
    true
}

/// Normalized projection value converted into the JSON representation stored in legacy payloads.
fn normalized_value_to_json(value: &NormalizedValue) -> Value {
    match value {
        NormalizedValue::Bool(flag) => Value::Bool(*flag),
        NormalizedValue::Int(number) => Value::from(*number),
        NormalizedValue::String(text) => Value::String(text.clone()),
        NormalizedValue::StringArray(items) => {
            Value::Array(items.iter().cloned().map(Value::String).collect::<Vec<_>>())
        }
        NormalizedValue::LocalizedText(values) => Value::Object(
            values
                .iter()
                .map(|(key, item)| (key.clone(), Value::String(item.clone())))
                .collect(),
        ),
        NormalizedValue::CardRef(card_ref) => json!({
            "cardId": card_ref.card_id,
            "dbfId": card_ref.dbf_id,
        }),
        NormalizedValue::Json(json) => json.clone(),
    }
}

/// Localized text fields accumulated for every supported output language.
fn apply_localized_text(
    localizations: &mut HashMap<String, LocalizationDraft>,
    target_path: &str,
    value: &NormalizedValue,
    locale_map: &HashMap<String, String>,
) -> bool {
    let NormalizedValue::LocalizedText(values) = value else {
        return false;
    };
    let mut projected = false;

    for (raw_lang, text) in values {
        let Some(lang) = normalize_locale_key(raw_lang, locale_map) else {
            continue;
        };
        let draft = localizations
            .entry(lang)
            .or_insert_with(create_localization_draft);

        if set_localization_field(draft, target_path, text) {
            projected = true;
        }
    }

    projected
}

/// Mechanic and referenced-tag value maps updated from one boolean-or-integer payload.
fn apply_numeric_flag(
    target: &mut HashMap<String, Value>,
    enum_id: i32,
    value: &NormalizedValue,
) -> bool {
    match value {
        NormalizedValue::Bool(flag) => {
            target.insert(enum_id.to_string(), Value::Bool(*flag));
            true
        }
        NormalizedValue::Int(number) => {
            target.insert(enum_id.to_string(), Value::from(*number));
            true
        }
        _ => false,
    }
}

/// Localization draft initialized with the same empty defaults as the TypeScript baseline.
fn create_localization_draft() -> LocalizationDraft {
    LocalizationDraft {
        name: String::new(),
        rich_text: String::new(),
        target_text: None,
        text_in_play: None,
        how_to_earn: None,
        how_to_earn_golden: None,
        flavor_text: None,
    }
}

/// Localized field assigned when the target path is supported by the current draft shape.
fn set_localization_field(draft: &mut LocalizationDraft, target_path: &str, value: &str) -> bool {
    match target_path {
        "name" => draft.name = value.to_string(),
        "richText" => draft.rich_text = value.to_string(),
        "targetText" => draft.target_text = Some(value.to_string()),
        "textInPlay" => draft.text_in_play = Some(value.to_string()),
        "howToEarn" => draft.how_to_earn = Some(value.to_string()),
        "howToEarnGolden" => draft.how_to_earn_golden = Some(value.to_string()),
        "flavorText" => draft.flavor_text = Some(value.to_string()),
        _ => return false,
    }

    true
}

/// Output language normalized from one raw locale key plus one optional override map.
fn normalize_locale_key(raw: &str, overrides: &HashMap<String, String>) -> Option<String> {
    let mapped = overrides.get(raw).cloned().unwrap_or_else(|| match raw {
        "deDE" => "de".to_string(),
        "enGB" | "enUS" => "en".to_string(),
        "esES" => "es".to_string(),
        "esMX" => "mx".to_string(),
        "frFR" => "fr".to_string(),
        "itIT" => "it".to_string(),
        "jaJP" => "ja".to_string(),
        "koKR" => "ko".to_string(),
        "plPL" => "pl".to_string(),
        "ptBR" => "pt".to_string(),
        "ruRU" => "ru".to_string(),
        "thTH" => "th".to_string(),
        "zhCN" | "zhSG" => "zhs".to_string(),
        "zhHK" | "zhTW" => "zht".to_string(),
        other => other.to_string(),
    });

    matches!(
        mapped.as_str(),
        "de" | "en"
            | "es"
            | "mx"
            | "fr"
            | "it"
            | "ja"
            | "ko"
            | "pl"
            | "pt"
            | "ru"
            | "th"
            | "zhs"
            | "zht"
    )
    .then_some(mapped)
}

/// Final localization rows emitted for one entity after tag accumulation finishes.
fn finalize_localizations(
    entity: &ProjectionEntityRow,
    localizations: HashMap<String, LocalizationDraft>,
) -> Vec<ProjectionLocalizationRow> {
    let mut rows = localizations
        .into_iter()
        .map(|(lang, draft)| ProjectionLocalizationRow {
            card_id: entity.card_id.clone(),
            lang,
            revision_hash: entity.revision_hash.clone(),
            localization_hash: String::new(),
            text: draft.rich_text.clone(),
            rich_text: draft.rich_text.clone(),
            display_text: draft.rich_text.clone(),
            name: draft.name,
            target_text: draft.target_text,
            text_in_play: draft.text_in_play,
            how_to_earn: draft.how_to_earn,
            how_to_earn_golden: draft.how_to_earn_golden,
            flavor_text: draft.flavor_text,
            loc_change_type: "unknown".to_string(),
        })
        .collect::<Vec<_>>();
    for row in &mut rows {
        row.localization_hash = compute_localization_hash(row);
    }
    rows.sort_by(|left, right| left.lang.cmp(&right.lang));
    rows
}

/// Relation rows emitted from projected entity card-reference fields and explicit relation drafts.
fn build_relations(
    entity: &ProjectionEntityRow,
    relation_drafts: &[ProjectionRelationDraft],
) -> Vec<ProjectionRelationRow> {
    let mut rows = Vec::new();

    if let Some(target_id) = entity.hero_power.clone() {
        rows.push(ProjectionRelationRow {
            source_id: entity.card_id.clone(),
            source_revision_hash: entity.revision_hash.clone(),
            relation: "hero_power".to_string(),
            target_id,
        });
    }
    if let Some(target_id) = entity.buddy.clone() {
        rows.push(ProjectionRelationRow {
            source_id: entity.card_id.clone(),
            source_revision_hash: entity.revision_hash.clone(),
            relation: "buddy".to_string(),
            target_id,
        });
    }
    if let Some(target_id) = entity.triple_card.clone() {
        rows.push(ProjectionRelationRow {
            source_id: entity.card_id.clone(),
            source_revision_hash: entity.revision_hash.clone(),
            relation: "triple_card".to_string(),
            target_id,
        });
    }
    for relation in relation_drafts {
        rows.push(ProjectionRelationRow {
            source_id: entity.card_id.clone(),
            source_revision_hash: entity.revision_hash.clone(),
            relation: relation.relation.clone(),
            target_id: relation.target_id.clone(),
        });
    }

    rows
}

/// Relation name normalized from one legacy entity card-reference field name.
fn relation_name_from_entity_path(path: &str) -> String {
    match path {
        "heroPower" => "hero_power".to_string(),
        "tripleCard" => "triple_card".to_string(),
        "heroicHeroPower" => "heroic_hero_power".to_string(),
        other => {
            let mut result = String::new();
            for character in other.chars() {
                if character.is_ascii_uppercase() {
                    result.push('_');
                    result.push(character.to_ascii_lowercase());
                } else {
                    result.push(character);
                }
            }
            result
        }
    }
}

/// String values deduplicated while preserving their first-seen order.
fn unique_strings(values: Vec<String>) -> Vec<String> {
    let mut seen = HashSet::new();
    let mut result = Vec::with_capacity(values.len());

    for value in values {
        if seen.insert(value.clone()) {
            result.push(value);
        }
    }

    result
}

/// Entity primary key serialized into one stable in-memory comparison key.
fn entity_row_key(card_id: &str, revision_hash: &str) -> String {
    format!("{card_id}\u{0}{revision_hash}")
}

/// Localization primary key serialized into one stable in-memory comparison key.
fn localization_row_key(
    card_id: &str,
    lang: &str,
    revision_hash: &str,
    localization_hash: &str,
) -> String {
    format!("{card_id}\u{0}{lang}\u{0}{revision_hash}\u{0}{localization_hash}")
}

/// Relation primary key serialized into one stable in-memory comparison key.
fn relation_row_key(
    source_id: &str,
    source_revision_hash: &str,
    relation: &str,
    target_id: &str,
) -> String {
    format!("{source_id}\u{0}{source_revision_hash}\u{0}{relation}\u{0}{target_id}")
}

/// Entity defaults normalized and hashed before localizations and relations are derived.
fn finalize_entity_row(entity: &mut ProjectionEntityRow) {
    entity.classes = unique_strings(entity.classes.clone());
    entity.race = unique_strings(entity.race.clone());

    if entity.race.is_empty() {
        entity.race = Vec::new();
    }

    if entity.type_slug == "minion" {
        if entity.attack.is_some() && entity.health.is_none() {
            entity.health = Some(0);
        }
        if entity.attack.is_none() && entity.health.is_some() {
            entity.attack = Some(0);
        }
    }

    entity.revision_hash = sha256_hex(&canonicalize_json(&build_entity_hash_payload(entity)));
}

/// Hash payload assembled from one projected entity row.
fn build_entity_hash_payload(entity: &ProjectionEntityRow) -> Value {
    json!({
        "cardId": entity.card_id,
        "dbfId": entity.dbf_id,
        "legacyPayload": entity.legacy_payload,
        "set": entity.set_id,
        "classes": entity.classes,
        "type": entity.type_slug,
        "cost": entity.cost,
        "attack": entity.attack,
        "health": entity.health,
        "durability": entity.durability,
        "armor": entity.armor,
        "rune": entity.rune,
        "race": entity.race,
        "spellSchool": entity.spell_school,
        "questType": entity.quest_type,
        "questProgress": entity.quest_progress,
        "questPart": entity.quest_part,
        "heroPower": entity.hero_power,
        "techLevel": entity.tech_level,
        "inBobsTavern": entity.in_bobs_tavern,
        "tripleCard": entity.triple_card,
        "raceBucket": entity.race_bucket,
        "armorBucket": entity.armor_bucket,
        "buddy": entity.buddy,
        "bannedRace": entity.banned_race,
        "mercenaryRole": entity.mercenary_role,
        "mercenaryFaction": entity.mercenary_faction,
        "colddown": entity.colddown,
        "collectible": entity.collectible,
        "elite": entity.elite,
        "rarity": entity.rarity,
        "artist": entity.artist,
        "overrideWatermark": entity.override_watermark,
        "faction": entity.faction,
        "mechanics": entity.mechanics,
        "referencedTags": entity.referenced_tags,
        "textBuilderType": entity.text_builder_type,
        "changeType": entity.change_type,
    })
}

/// Localization hash computed from one finalized localization row.
fn compute_localization_hash(row: &ProjectionLocalizationRow) -> String {
    sha256_hex(&canonicalize_json(&json!({
        "lang": row.lang,
        "name": row.name,
        "text": row.text,
        "richText": row.rich_text,
        "displayText": row.display_text,
        "targetText": row.target_text,
        "textInPlay": row.text_in_play,
        "howToEarn": row.how_to_earn,
        "howToEarnGolden": row.how_to_earn_golden,
        "flavorText": row.flavor_text,
        "locChangeType": row.loc_change_type,
    })))
}

/// JSON value canonicalized with stable key ordering for hash generation.
fn canonicalize_json(value: &Value) -> String {
    match value {
        Value::Null => "null".to_string(),
        Value::Bool(flag) => serde_json::to_string(flag).unwrap_or_else(|_| "false".to_string()),
        Value::Number(number) => number.to_string(),
        Value::String(text) => serde_json::to_string(text).unwrap_or_else(|_| "\"\"".to_string()),
        Value::Array(items) => format!(
            "[{}]",
            items
                .iter()
                .map(canonicalize_json)
                .collect::<Vec<_>>()
                .join(",")
        ),
        Value::Object(object) => {
            let mut keys = object.keys().cloned().collect::<Vec<_>>();
            keys.sort();

            format!(
                "{{{}}}",
                keys.iter()
                    .map(|key| {
                        format!(
                            "{}:{}",
                            serde_json::to_string(key).unwrap_or_else(|_| "\"\"".to_string()),
                            canonicalize_json(object.get(key).unwrap_or(&Value::Null))
                        )
                    })
                    .collect::<Vec<_>>()
                    .join(",")
            )
        }
    }
}

/// Hex SHA-256 digest generated from one canonical JSON payload string.
fn sha256_hex(input: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(input.as_bytes());
    format!("{:x}", hasher.finalize())
}

/// PostgreSQL text array value built from one borrowed string slice.
fn string_array_value(values: &[String]) -> sea_orm::Value {
    sea_orm::Value::Array(
        sea_orm::sea_query::ArrayType::String,
        Some(Box::new(
            values.iter().cloned().map(Into::into).collect::<Vec<_>>(),
        )),
    )
}

/// PostgreSQL integer array value built from one borrowed integer slice.
fn int_array_value(values: &[i32]) -> sea_orm::Value {
    sea_orm::Value::Array(
        sea_orm::sea_query::ArrayType::Int,
        Some(Box::new(
            values.iter().copied().map(Into::into).collect::<Vec<_>>(),
        )),
    )
}

/// Nullable PostgreSQL text array value built from one optional borrowed string slice.
fn optional_string_array_value(values: Option<&[String]>) -> sea_orm::Value {
    match values {
        Some(values) => string_array_value(values),
        None => sea_orm::Value::Array(sea_orm::sea_query::ArrayType::String, None),
    }
}

/// JSON object value built from one string-keyed map.
fn map_to_json_value(map: &HashMap<String, Value>) -> Value {
    Value::Object(map.clone().into_iter().collect())
}

/// Target path normalized to the canonical field names used by projection rows.
pub(crate) fn normalize_target_path(path: &str) -> String {
    path.replace("entity_localizations.", "")
        .replace("entity_localization.", "")
        .replace("entity.", "")
        .replace("localization.", "")
        .replace("legacy_payload.", "legacyPayload.")
}

/// Tag normalization rule parsed from one string kind plus raw JSON config.
fn parse_normalize_rule(
    enum_id: i32,
    slug: &str,
    normalize_kind: &str,
    normalize_config: &Value,
) -> Result<NormalizeRule, String> {
    let config = require_json_object(enum_id, slug, "normalizeConfig", normalize_config)?;

    match normalize_kind {
        "" | "identity" => Ok(NormalizeRule::Identity),
        "identity_int" => Ok(NormalizeRule::IdentityInt),
        "identity_string" => Ok(NormalizeRule::IdentityString),
        "identity_loc_string" => Ok(NormalizeRule::IdentityLocString),
        "identity_card_ref" => Ok(NormalizeRule::IdentityCardRef),
        "bool_from_int" => Ok(NormalizeRule::BoolFromInt {
            true_values: parse_i32_array(enum_id, slug, "normalizeConfig.trueValues", config.get("trueValues"))?,
            false_values: parse_i32_array(
                enum_id,
                slug,
                "normalizeConfig.falseValues",
                config.get("falseValues"),
            )?,
        }),
        "enum_from_int" => Ok(NormalizeRule::EnumFromInt {
            enum_map: parse_enum_map_rule(enum_id, slug, config.get("enumMap"))?,
            allow_unknown_enum_value: parse_bool(
                enum_id,
                slug,
                "normalizeConfig.allowUnknownEnumValue",
                config.get("allowUnknownEnumValue"),
            )?
            .unwrap_or(false),
        }),
        "card_ref_from_int" => Ok(NormalizeRule::CardRefFromInt),
        "json_wrap" => Ok(NormalizeRule::JsonWrap),
        other => Err(format!(
            "[hearthstone][hsdata-project][desktop] unsupported normalizeKind {other} for tag {slug} ({enum_id})"
        )),
    }
}

/// Projection rule parsed from one string kind plus raw JSON config.
fn parse_project_rule(
    enum_id: i32,
    slug: &str,
    project_kind: Option<&str>,
    project_config: &Value,
) -> Result<Option<ProjectRule>, String> {
    let Some(project_kind) = project_kind else {
        return Ok(None);
    };
    let config = require_json_object(enum_id, slug, "projectConfig", project_config)?;

    match project_kind {
        "assign_value" | "assign_scalar" | "assign_bool" | "assign_int" | "assign_string"
        | "assign_enum" => Ok(Some(ProjectRule::AssignValue)),
        "append_string_array" => Ok(Some(ProjectRule::AppendStringArray {
            appended_value: parse_optional_string(
                enum_id,
                slug,
                "projectConfig.value",
                config.get("value"),
            )?,
        })),
        "assign_card_ref" => Ok(Some(ProjectRule::AssignCardRef)),
        "assign_localized_text" => Ok(Some(ProjectRule::AssignLocalizedText {
            locale_map: parse_string_map(
                enum_id,
                slug,
                "projectConfig.localeMap",
                config.get("localeMap"),
            )?,
        })),
        "assign_mechanic" => Ok(Some(ProjectRule::AssignMechanic)),
        "assign_referenced_tag" => Ok(Some(ProjectRule::AssignReferencedTag)),
        "assign_legacy" => Ok(Some(ProjectRule::AssignLegacy)),
        "emit_relation" => Ok(Some(ProjectRule::EmitRelation)),
        other => Err(format!(
            "[hearthstone][hsdata-project][desktop] unsupported projectKind {other} for tag {slug} ({enum_id})"
        )),
    }
}

/// JSON object required for one tag config payload.
fn require_json_object<'a>(
    enum_id: i32,
    slug: &str,
    field: &str,
    value: &'a Value,
) -> Result<&'a Map<String, Value>, String> {
    value.as_object().ok_or_else(|| {
        format!(
            "[hearthstone][hsdata-project][desktop] expected {field} object for tag {slug} ({enum_id})"
        )
    })
}

/// Optional boolean parsed from one JSON scalar field.
fn parse_bool(
    enum_id: i32,
    slug: &str,
    field: &str,
    value: Option<&Value>,
) -> Result<Option<bool>, String> {
    match value {
        None | Some(Value::Null) => Ok(None),
        Some(Value::Bool(flag)) => Ok(Some(*flag)),
        _ => Err(format!(
            "[hearthstone][hsdata-project][desktop] expected {field} boolean for tag {slug} ({enum_id})"
        )),
    }
}

/// Optional string parsed from one JSON scalar field.
fn parse_optional_string(
    enum_id: i32,
    slug: &str,
    field: &str,
    value: Option<&Value>,
) -> Result<Option<String>, String> {
    match value {
        None | Some(Value::Null) => Ok(None),
        Some(Value::String(text)) => Ok(Some(text.clone())),
        _ => Err(format!(
            "[hearthstone][hsdata-project][desktop] expected {field} string for tag {slug} ({enum_id})"
        )),
    }
}

/// Integer array parsed from one JSON list field.
fn parse_i32_array(
    enum_id: i32,
    slug: &str,
    field: &str,
    value: Option<&Value>,
) -> Result<Vec<i32>, String> {
    let Some(value) = value else {
        return Ok(Vec::new());
    };
    let Some(items) = value.as_array() else {
        return Err(format!(
            "[hearthstone][hsdata-project][desktop] expected {field} array for tag {slug} ({enum_id})"
        ));
    };

    let mut result = Vec::with_capacity(items.len());

    for item in items {
        let Some(number) = item.as_i64() else {
            return Err(format!(
                "[hearthstone][hsdata-project][desktop] expected {field} integer array for tag {slug} ({enum_id})"
            ));
        };
        let number = i32::try_from(number).map_err(|_| {
            format!(
                "[hearthstone][hsdata-project][desktop] integer out of range in {field} for tag {slug} ({enum_id})"
            )
        })?;
        result.push(number);
    }

    Ok(result)
}

/// String map parsed from one JSON object field.
fn parse_string_map(
    enum_id: i32,
    slug: &str,
    field: &str,
    value: Option<&Value>,
) -> Result<HashMap<String, String>, String> {
    let Some(value) = value else {
        return Ok(HashMap::new());
    };
    let Some(object) = value.as_object() else {
        return Err(format!(
            "[hearthstone][hsdata-project][desktop] expected {field} object for tag {slug} ({enum_id})"
        ));
    };

    let mut result = HashMap::with_capacity(object.len());

    for (key, item) in object {
        let Some(text) = item.as_str() else {
            return Err(format!(
                "[hearthstone][hsdata-project][desktop] expected {field} string map for tag {slug} ({enum_id})"
            ));
        };
        result.insert(key.clone(), text.to_string());
    }

    Ok(result)
}

/// Enum map rule parsed from one JSON config field.
fn parse_enum_map_rule(
    enum_id: i32,
    slug: &str,
    value: Option<&Value>,
) -> Result<Option<EnumMapRule>, String> {
    let Some(value) = value else {
        return Ok(None);
    };

    match value {
        Value::String(text) if text == "set" => Ok(Some(EnumMapRule::Set)),
        Value::String(text) if text == "rarity" => Ok(Some(EnumMapRule::Rarity)),
        Value::String(text) if text == "multiclass" => Ok(Some(EnumMapRule::Multiclass)),
        Value::String(text) if text == "spell-school" => Ok(Some(EnumMapRule::SpellSchool)),
        Value::String(text) if text == "race" => Ok(Some(EnumMapRule::Race)),
        Value::Object(object) => {
            let mut result = HashMap::with_capacity(object.len());

            for (key, item) in object {
                match item {
                    Value::String(text) => {
                        result.insert(key.clone(), EnumMapValue::String(text.clone()));
                    }
                    Value::Array(items) => {
                        let mut values = Vec::with_capacity(items.len());

                        for item in items {
                            let Some(text) = item.as_str() else {
                                return Err(format!(
                                    "[hearthstone][hsdata-project][desktop] expected normalizeConfig.enumMap string array for tag {slug} ({enum_id})"
                                ));
                            };
                            values.push(text.to_string());
                        }

                        result.insert(key.clone(), EnumMapValue::StringArray(values));
                    }
                    _ => {
                        return Err(format!(
                            "[hearthstone][hsdata-project][desktop] expected normalizeConfig.enumMap strings for tag {slug} ({enum_id})"
                        ));
                    }
                }
            }

            Ok(Some(EnumMapRule::Values(result)))
        }
        _ => Err(format!(
            "[hearthstone][hsdata-project][desktop] expected normalizeConfig.enumMap object or supported string alias for tag {slug} ({enum_id})"
        )),
    }
}

#[cfg(test)]
mod tests {
    use super::{
        count_unprojected_tags, normalize_tag_value, normalize_target_path, parse_projection_tags,
        parse_tag_projection, project_snapshots, summarize_projection_change,
        summarize_target_row_stats, DesktopHsdataProjectInput, EnumMapRule, EnumMapValue,
        ExistingVersionedKeyRow, NormalizeRule, ParsedTagProjection, ProjectRule,
        ProjectedSnapshot, ProjectionContext, ProjectionEntityRow, ProjectionLocalizationRow,
        ProjectionRelationRow, ProjectionSetRow, ProjectionSnapshotRow, ProjectionSnapshotTagRow,
    };
    use crate::entity::hearthstone_data::tags;
    use chrono::Utc;
    use serde::Deserialize;
    use serde_json::{json, Value};
    use std::collections::HashMap;

    /// Tag row fixture used by projection parser tests.
    fn make_tag() -> tags::Model {
        tags::Model {
            enum_id: 202,
            slug: "card_type".to_string(),
            slug_aliases: Vec::new(),
            name: None,
            raw_name: None,
            raw_type: None,
            raw_names: Vec::new(),
            value_kind: "int".to_string(),
            normalize_kind: "enum_from_int".to_string(),
            normalize_config: json!({
                "enumMap": {
                    "4": "minion",
                    "7": ["weapon", "legacy_weapon"]
                },
                "allowUnknownEnumValue": true
            }),
            project_target_type: Some("entity".to_string()),
            project_target_path: Some("entity.type".to_string()),
            project_kind: Some("assign_value".to_string()),
            project_config: json!({}),
            status: "discovered".to_string(),
            description: None,
            first_seen_source_tag: None,
            last_seen_source_tag: None,
            created_at: Utc::now().naive_utc(),
            updated_at: Utc::now().naive_utc(),
        }
    }

    /// Snapshot tag fixture row initialized with empty optional payload fields.
    fn make_snapshot_tag_row(enum_id: i32) -> ProjectionSnapshotTagRow {
        ProjectionSnapshotTagRow {
            snapshot_id: "snapshot".to_string(),
            enum_id,
            tag_order: 0,
            raw_name: "UNKNOWN".to_string(),
            raw_payload: Value::Null,
            bool_value: None,
            int_value: None,
            string_value: None,
            loc_string_value: None,
            card_ref_card_id: None,
            card_ref_dbf_id: None,
            json_value: None,
        }
    }

    /// Baseline fixture loaded from the shared TypeScript golden dataset.
    #[derive(Debug, Deserialize)]
    struct BaselineFixture {
        input: BaselineInput,
        expected: BaselineExpected,
    }

    /// Input section preserved from the shared TypeScript golden dataset.
    #[derive(Debug, Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct BaselineInput {
        sets: Vec<BaselineSetRow>,
        tags: Vec<BaselineTagRow>,
        snapshots: Vec<BaselineSnapshotRow>,
        snapshot_tags: Vec<BaselineSnapshotTagRow>,
    }

    /// Set fixture row preserved from the shared TypeScript golden dataset.
    #[derive(Debug, Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct BaselineSetRow {
        set_id: String,
        dbf_id: Option<i32>,
    }

    /// Tag fixture row preserved from the shared TypeScript golden dataset.
    #[derive(Debug, Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct BaselineTagRow {
        enum_id: i32,
        slug: String,
        value_kind: String,
        normalize_kind: String,
        normalize_config: Value,
        project_target_type: Option<String>,
        project_target_path: Option<String>,
        project_kind: Option<String>,
        project_config: Value,
    }

    /// Snapshot fixture row preserved from the shared TypeScript golden dataset.
    #[derive(Debug, Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct BaselineSnapshotRow {
        id: String,
        card_id: String,
        dbf_id: i32,
        extra_payload: Value,
    }

    /// Snapshot tag fixture row preserved from the shared TypeScript golden dataset.
    #[derive(Debug, Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct BaselineSnapshotTagRow {
        snapshot_id: String,
        enum_id: i32,
        tag_order: i32,
        raw_name: String,
        raw_payload: Value,
        bool_value: Option<bool>,
        int_value: Option<i32>,
        string_value: Option<String>,
        loc_string_value: Option<HashMap<String, String>>,
        card_ref_card_id: Option<String>,
        card_ref_dbf_id: Option<i32>,
        json_value: Option<Value>,
    }

    /// Expected section preserved from the shared TypeScript golden dataset.
    #[derive(Debug, Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct BaselineExpected {
        report: BaselineReport,
        main_entity: BaselineExpectedEntity,
        localizations: Vec<BaselineExpectedLocalization>,
        relations: Vec<BaselineExpectedRelation>,
    }

    /// Expected report subset preserved from the shared TypeScript golden dataset.
    #[derive(Debug, Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct BaselineReport {
        snapshot_count: u32,
        inserted_entities: u32,
        inserted_localizations: u32,
        inserted_relations: u32,
        unprojected_tag_count: u32,
    }

    /// Expected entity subset preserved from the shared TypeScript golden dataset.
    #[derive(Debug, Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct BaselineExpectedEntity {
        card_id: String,
        set: String,
        classes: Vec<String>,
        race: Vec<String>,
        r#type: String,
        cost: i32,
        attack: Option<i32>,
        health: Option<i32>,
        hero_power: Option<String>,
        triple_card: Option<String>,
        collectible: bool,
        elite: bool,
        mechanics: HashMap<String, Value>,
        referenced_tags: HashMap<String, Value>,
    }

    /// Expected localization subset preserved from the shared TypeScript golden dataset.
    #[derive(Debug, Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct BaselineExpectedLocalization {
        card_id: String,
        lang: String,
        name: String,
        text: String,
        rich_text: String,
        display_text: String,
        flavor_text: Option<String>,
        render_model: Value,
    }

    /// Expected relation subset preserved from the shared TypeScript golden dataset.
    #[derive(Debug, Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct BaselineExpectedRelation {
        source_id: String,
        relation: String,
        target_id: String,
    }

    /// Generated SeaORM tag row built from one baseline fixture tag payload.
    fn build_fixture_tag(row: &BaselineTagRow) -> tags::Model {
        tags::Model {
            enum_id: row.enum_id,
            slug: row.slug.clone(),
            slug_aliases: Vec::new(),
            name: None,
            raw_name: None,
            raw_type: None,
            raw_names: Vec::new(),
            value_kind: row.value_kind.clone(),
            normalize_kind: row.normalize_kind.clone(),
            normalize_config: row.normalize_config.clone(),
            project_target_type: row.project_target_type.clone(),
            project_target_path: row.project_target_path.clone(),
            project_kind: row.project_kind.clone(),
            project_config: row.project_config.clone(),
            status: "fixture".to_string(),
            description: None,
            first_seen_source_tag: None,
            last_seen_source_tag: None,
            created_at: Utc::now().naive_utc(),
            updated_at: Utc::now().naive_utc(),
        }
    }

    /// Target path normalization strips legacy prefixes used by the TypeScript baseline.
    #[test]
    fn normalize_target_path_strips_known_prefixes() {
        assert_eq!(normalize_target_path("entity.type"), "type");
        assert_eq!(
            normalize_target_path("entity_localization.richText"),
            "richText"
        );
        assert_eq!(
            normalize_target_path("legacy_payload.cardId"),
            "legacyPayload.cardId"
        );
    }

    /// Enum map config preserves both scalar and array values.
    #[test]
    fn parse_tag_projection_reads_enum_map_rules() {
        let parsed = parse_tag_projection(&make_tag()).expect("tag config should parse");

        assert_eq!(parsed.project_target_path.as_deref(), Some("type"));
        assert_eq!(parsed.project_rule, Some(ProjectRule::AssignValue));
        assert_eq!(
            parsed.normalize_rule,
            NormalizeRule::EnumFromInt {
                enum_map: Some(EnumMapRule::Values(HashMap::from([
                    ("4".to_string(), EnumMapValue::String("minion".to_string())),
                    (
                        "7".to_string(),
                        EnumMapValue::StringArray(vec![
                            "weapon".to_string(),
                            "legacy_weapon".to_string(),
                        ]),
                    ),
                ]))),
                allow_unknown_enum_value: true,
            }
        );
    }

    /// Localized text config preserves the optional locale override map.
    #[test]
    fn parse_tag_projection_reads_locale_maps() {
        let mut tag = make_tag();
        tag.slug = "card_text".to_string();
        tag.normalize_kind = "identity_loc_string".to_string();
        tag.normalize_config = json!({});
        tag.project_target_type = Some("entity_localization".to_string());
        tag.project_target_path = Some("entity_localization.richText".to_string());
        tag.project_kind = Some("assign_localized_text".to_string());
        tag.project_config = json!({
            "localeMap": {
                "zhCN": "zhs",
                "zhTW": "zht"
            }
        });

        let parsed = parse_tag_projection(&tag).expect("tag config should parse");

        assert_eq!(
            parsed.project_rule,
            Some(ProjectRule::AssignLocalizedText {
                locale_map: HashMap::from([
                    ("zhCN".to_string(), "zhs".to_string()),
                    ("zhTW".to_string(), "zht".to_string()),
                ]),
            })
        );
        assert_eq!(parsed.project_target_path.as_deref(), Some("richText"));
    }

    /// Legacy string aliases in enumMap continue to parse to explicit compatibility rules.
    #[test]
    fn parse_tag_projection_reads_enum_map_aliases() {
        let mut tag = make_tag();
        tag.slug = "spell-school".to_string();
        tag.project_target_path = Some("entity.spellSchool".to_string());
        tag.normalize_config = json!({
            "enumMap": "spell-school"
        });

        let parsed = parse_tag_projection(&tag).expect("tag config should parse");

        assert_eq!(
            parsed.normalize_rule,
            NormalizeRule::EnumFromInt {
                enum_map: Some(EnumMapRule::SpellSchool),
                allow_unknown_enum_value: false,
            }
        );
    }

    /// Legacy string aliases normalize to the same strings and string arrays as the TypeScript projector.
    #[test]
    fn normalize_tag_value_supports_enum_map_aliases() {
        let multiclass_tag = ParsedTagProjection {
            enum_id: 476,
            slug: "multi-class".to_string(),
            project_target_type: Some("entity".to_string()),
            project_target_path: Some("classes".to_string()),
            normalize_rule: NormalizeRule::EnumFromInt {
                enum_map: Some(EnumMapRule::Multiclass),
                allow_unknown_enum_value: false,
            },
            project_rule: Some(ProjectRule::AppendStringArray {
                appended_value: None,
            }),
        };
        let spell_school_tag = ParsedTagProjection {
            enum_id: 1635,
            slug: "spell-school".to_string(),
            project_target_type: Some("entity".to_string()),
            project_target_path: Some("spellSchool".to_string()),
            normalize_rule: NormalizeRule::EnumFromInt {
                enum_map: Some(EnumMapRule::SpellSchool),
                allow_unknown_enum_value: false,
            },
            project_rule: Some(ProjectRule::AssignValue),
        };
        let race_tag = ParsedTagProjection {
            enum_id: 2703,
            slug: "banned-race".to_string(),
            project_target_type: Some("entity".to_string()),
            project_target_path: Some("bannedRace".to_string()),
            normalize_rule: NormalizeRule::EnumFromInt {
                enum_map: Some(EnumMapRule::Race),
                allow_unknown_enum_value: false,
            },
            project_rule: Some(ProjectRule::AssignValue),
        };

        let mut multiclass_row = make_snapshot_tag_row(476);
        multiclass_row.int_value = Some(2056);
        let mut spell_school_row = make_snapshot_tag_row(1635);
        spell_school_row.int_value = Some(2);
        let mut race_row = make_snapshot_tag_row(2703);
        race_row.int_value = Some(24);

        let context = ProjectionContext::default();

        assert_eq!(
            normalize_tag_value(&multiclass_row, &multiclass_tag, &context),
            Some(super::NormalizedValue::StringArray(vec![
                "mage".to_string(),
                "neutral".to_string(),
            ]))
        );
        assert_eq!(
            normalize_tag_value(&spell_school_row, &spell_school_tag, &context),
            Some(super::NormalizedValue::String("fire".to_string()))
        );
        assert_eq!(
            normalize_tag_value(&race_row, &race_tag, &context),
            Some(super::NormalizedValue::String("dragon".to_string()))
        );
    }

    /// Malformed enum map config fails fast instead of silently guessing behavior.
    #[test]
    fn parse_tag_projection_rejects_invalid_enum_map_values() {
        let mut tag = make_tag();
        tag.normalize_config = json!({
            "enumMap": {
                "4": 4
            }
        });

        let error = parse_tag_projection(&tag).expect_err("invalid enum map should fail");
        assert!(error.contains("normalizeConfig.enumMap strings"));
    }

    /// Missing project rules still count as unprojected rows during the dry-run preflight.
    #[test]
    fn counts_unprojected_tags_from_missing_projection_rules() {
        let parsed_by_enum_id = HashMap::from([(
            202,
            ParsedTagProjection {
                enum_id: 202,
                slug: "card_type".to_string(),
                project_target_type: Some("entity".to_string()),
                project_target_path: Some("type".to_string()),
                normalize_rule: NormalizeRule::IdentityInt,
                project_rule: Some(ProjectRule::AssignValue),
            },
        )]);
        let rows = vec![make_snapshot_tag_row(202), make_snapshot_tag_row(9999)];

        let count = count_unprojected_tags(&rows, &parsed_by_enum_id)
            .expect("unprojected tag count should fit into u32");

        assert_eq!(count, 1);
    }

    /// Desktop projection inputs default to dry-run-only behavior until row writes land.
    #[test]
    fn projection_input_defaults_to_write_mode_disabled() {
        let input = DesktopHsdataProjectInput {
            source_tag: 50001,
            dry_run: None,
            force: None,
        };

        assert_eq!(input.source_tag, 50001);
        assert_eq!(input.dry_run, None);
        assert_eq!(input.force, None);
    }

    /// Reconcile-style row stats distinguish inserted, reused, and updated keys.
    #[test]
    fn summarize_target_row_stats_matches_reconcile_categories() {
        let existing = vec![
            ExistingVersionedKeyRow {
                key: "reused".to_string(),
                version: vec![100, 200],
            },
            ExistingVersionedKeyRow {
                key: "updated".to_string(),
                version: vec![100],
            },
        ];
        let target = vec![
            "inserted".to_string(),
            "reused".to_string(),
            "updated".to_string(),
        ];

        let stats = summarize_target_row_stats(200, &target, &existing)
            .expect("row stats should fit into u32");

        assert_eq!(stats.inserted, 1);
        assert_eq!(stats.reused, 1);
        assert_eq!(stats.updated, 1);
    }

    /// Fully reused projection output reports no changes and enables skip-mode behavior.
    #[test]
    fn summarize_projection_change_detects_noop_projection() {
        let projected = vec![ProjectedSnapshot {
            entity: ProjectionEntityRow {
                card_id: "MAIN_001".to_string(),
                revision_hash: "rev-1".to_string(),
                dbf_id: 1001,
                legacy_payload: json!({}),
                set_id: "CORE".to_string(),
                classes: vec!["mage".to_string()],
                race: vec!["beast".to_string()],
                type_slug: "minion".to_string(),
                cost: 3,
                attack: Some(2),
                health: Some(4),
                durability: None,
                armor: None,
                rune: None,
                spell_school: None,
                quest_type: None,
                quest_progress: None,
                quest_part: None,
                hero_power: Some("HERO_POWER_001".to_string()),
                tech_level: None,
                in_bobs_tavern: false,
                triple_card: Some("TOKEN_001".to_string()),
                race_bucket: None,
                armor_bucket: None,
                buddy: None,
                banned_race: None,
                mercenary_role: None,
                mercenary_faction: None,
                colddown: None,
                collectible: true,
                elite: false,
                artist: "Studio Lantern".to_string(),
                rarity: Some("rare".to_string()),
                override_watermark: None,
                faction: None,
                mechanics: HashMap::new(),
                referenced_tags: HashMap::new(),
                text_builder_type: "default".to_string(),
                change_type: "unknown".to_string(),
            },
            localizations: vec![ProjectionLocalizationRow {
                card_id: "MAIN_001".to_string(),
                lang: "zhs".to_string(),
                revision_hash: "rev-1".to_string(),
                localization_hash: "loc-1".to_string(),
                name: "奥术构造体".to_string(),
                text: "法术迸发：获得 +2 攻击力。".to_string(),
                rich_text: "法术迸发：获得 +2 攻击力。".to_string(),
                display_text: "法术迸发：获得 +2 攻击力。".to_string(),
                target_text: None,
                text_in_play: None,
                how_to_earn: None,
                how_to_earn_golden: None,
                flavor_text: Some("为精准施法而造。".to_string()),
                loc_change_type: "unknown".to_string(),
            }],
            relations: vec![ProjectionRelationRow {
                source_id: "MAIN_001".to_string(),
                source_revision_hash: "rev-1".to_string(),
                relation: "hero_power".to_string(),
                target_id: "HERO_POWER_001".to_string(),
            }],
            unprojected_tag_count: 0,
            unprojected_tags: Vec::new(),
        }];
        let existing_entities = vec![ExistingVersionedKeyRow {
            key: "MAIN_001\u{0}rev-1".to_string(),
            version: vec![31001],
        }];
        let existing_localizations = vec![ExistingVersionedKeyRow {
            key: "MAIN_001\u{0}zhs\u{0}rev-1\u{0}loc-1".to_string(),
            version: vec![31001],
        }];
        let existing_relations = vec![ExistingVersionedKeyRow {
            key: "MAIN_001\u{0}rev-1\u{0}hero_power\u{0}HERO_POWER_001".to_string(),
            version: vec![31001],
        }];

        let summary = summarize_projection_change(
            31001,
            &projected,
            &existing_entities,
            &existing_localizations,
            &existing_relations,
        )
        .expect("projection summary should fit into u32");

        assert!(!summary.changed);
        assert_eq!(summary.write_stats.entities.reused, 1);
        assert_eq!(summary.write_stats.localizations.reused, 1);
        assert_eq!(summary.write_stats.relations.reused, 1);
    }

    /// Rows from the same build that disappear from the target projection still count as changes.
    #[test]
    fn summarize_projection_change_detects_removed_build_rows() {
        let projected = vec![ProjectedSnapshot {
            entity: ProjectionEntityRow {
                card_id: "MAIN_001".to_string(),
                revision_hash: "rev-1".to_string(),
                dbf_id: 1001,
                legacy_payload: json!({}),
                set_id: "CORE".to_string(),
                classes: vec![],
                race: vec![],
                type_slug: "spell".to_string(),
                cost: 1,
                attack: None,
                health: None,
                durability: None,
                armor: None,
                rune: None,
                spell_school: None,
                quest_type: None,
                quest_progress: None,
                quest_part: None,
                hero_power: None,
                tech_level: None,
                in_bobs_tavern: false,
                triple_card: None,
                race_bucket: None,
                armor_bucket: None,
                buddy: None,
                banned_race: None,
                mercenary_role: None,
                mercenary_faction: None,
                colddown: None,
                collectible: false,
                elite: false,
                artist: String::new(),
                rarity: None,
                override_watermark: None,
                faction: None,
                mechanics: HashMap::new(),
                referenced_tags: HashMap::new(),
                text_builder_type: "default".to_string(),
                change_type: "unknown".to_string(),
            },
            localizations: Vec::new(),
            relations: Vec::new(),
            unprojected_tag_count: 0,
            unprojected_tags: Vec::new(),
        }];
        let existing_entities = vec![
            ExistingVersionedKeyRow {
                key: "MAIN_001\u{0}rev-1".to_string(),
                version: vec![31001],
            },
            ExistingVersionedKeyRow {
                key: "MAIN_001\u{0}rev-old".to_string(),
                version: vec![31001],
            },
        ];

        let summary = summarize_projection_change(31001, &projected, &existing_entities, &[], &[])
            .expect("projection summary should fit into u32");

        assert!(summary.changed);
        assert_eq!(summary.write_stats.entities.reused, 1);
    }

    /// Shared baseline fixture projects to the same entity, localization, and relation counts.
    #[test]
    fn projects_shared_baseline_fixture() {
        let fixture: BaselineFixture = serde_json::from_str(include_str!(
            "../../../../packages/console-api/src/lib/hearthstone/fixtures/hsdata-project-baseline.json"
        ))
        .expect("baseline fixture should deserialize");
        let snapshots = fixture
            .input
            .snapshots
            .iter()
            .map(|row| ProjectionSnapshotRow {
                id: row.id.clone(),
                card_id: row.card_id.clone(),
                dbf_id: row.dbf_id,
                extra_payload: row.extra_payload.clone(),
            })
            .collect::<Vec<_>>();
        let snapshot_tags = fixture
            .input
            .snapshot_tags
            .iter()
            .map(|row| ProjectionSnapshotTagRow {
                snapshot_id: row.snapshot_id.clone(),
                enum_id: row.enum_id,
                tag_order: row.tag_order,
                raw_name: row.raw_name.clone(),
                raw_payload: row.raw_payload.clone(),
                bool_value: row.bool_value,
                int_value: row.int_value,
                string_value: row.string_value.clone(),
                loc_string_value: row.loc_string_value.clone(),
                card_ref_card_id: row.card_ref_card_id.clone(),
                card_ref_dbf_id: row.card_ref_dbf_id,
                json_value: row.json_value.clone(),
            })
            .collect::<Vec<_>>();
        let sets = fixture
            .input
            .sets
            .iter()
            .filter_map(|row| {
                row.dbf_id.map(|dbf_id| ProjectionSetRow {
                    set_id: row.set_id.clone(),
                    dbf_id,
                })
            })
            .collect::<Vec<_>>();
        let tag_models = fixture
            .input
            .tags
            .iter()
            .map(build_fixture_tag)
            .collect::<Vec<_>>();
        let parsed = parse_projection_tags(&tag_models).expect("fixture tags should parse");
        let projected = project_snapshots(&snapshots, &snapshot_tags, &parsed, &sets)
            .expect("fixture should project");

        let snapshot_count = u32::try_from(projected.len()).unwrap_or(u32::MAX);
        let inserted_localizations = projected
            .iter()
            .map(|row| u32::try_from(row.localizations.len()).unwrap_or(u32::MAX))
            .sum::<u32>();
        let inserted_relations = projected
            .iter()
            .map(|row| u32::try_from(row.relations.len()).unwrap_or(u32::MAX))
            .sum::<u32>();
        let unprojected_tag_count = projected
            .iter()
            .map(|row| row.unprojected_tag_count)
            .sum::<u32>();

        assert_eq!(snapshot_count, fixture.expected.report.snapshot_count);
        assert_eq!(snapshot_count, fixture.expected.report.inserted_entities);
        assert_eq!(
            inserted_localizations,
            fixture.expected.report.inserted_localizations
        );
        assert_eq!(
            inserted_relations,
            fixture.expected.report.inserted_relations
        );
        assert_eq!(
            unprojected_tag_count,
            fixture.expected.report.unprojected_tag_count
        );

        let main = projected
            .iter()
            .find(|row| row.entity.card_id == fixture.expected.main_entity.card_id)
            .expect("main entity should exist");
        assert_eq!(main.entity.set_id, fixture.expected.main_entity.set);
        assert_eq!(main.entity.classes, fixture.expected.main_entity.classes);
        assert_eq!(main.entity.race, fixture.expected.main_entity.race);
        assert_eq!(main.entity.type_slug, fixture.expected.main_entity.r#type);
        assert_eq!(main.entity.cost, fixture.expected.main_entity.cost);
        assert_eq!(main.entity.attack, fixture.expected.main_entity.attack);
        assert_eq!(main.entity.health, fixture.expected.main_entity.health);
        assert_eq!(
            main.entity.hero_power,
            fixture.expected.main_entity.hero_power
        );
        assert_eq!(
            main.entity.triple_card,
            fixture.expected.main_entity.triple_card
        );
        assert_eq!(
            main.entity.collectible,
            fixture.expected.main_entity.collectible
        );
        assert_eq!(main.entity.elite, fixture.expected.main_entity.elite);
        assert_eq!(
            main.entity.mechanics,
            fixture.expected.main_entity.mechanics
        );
        assert_eq!(
            main.entity.referenced_tags,
            fixture.expected.main_entity.referenced_tags
        );

        let expected_localization = fixture
            .expected
            .localizations
            .iter()
            .find(|row| row.lang == "zhs")
            .expect("zhs localization should exist");
        let localization = main
            .localizations
            .iter()
            .find(|row| row.lang == expected_localization.lang)
            .expect("projected zhs localization should exist");
        assert_eq!(localization.card_id, expected_localization.card_id);
        assert_eq!(localization.name, expected_localization.name);
        assert_eq!(localization.text, expected_localization.text);
        assert_eq!(localization.rich_text, expected_localization.rich_text);
        assert_eq!(
            localization.display_text,
            expected_localization.display_text
        );
        assert_eq!(localization.flavor_text, expected_localization.flavor_text);
        assert_eq!(
            expected_localization.render_model["renderMechanics"],
            json!({ "hide_cost": true })
        );

        let mut actual_relations = main
            .relations
            .iter()
            .map(|row| {
                (
                    row.source_id.clone(),
                    row.relation.clone(),
                    row.target_id.clone(),
                )
            })
            .collect::<Vec<_>>();
        actual_relations.sort();
        let mut expected_relations = fixture
            .expected
            .relations
            .iter()
            .map(|row| {
                (
                    row.source_id.clone(),
                    row.relation.clone(),
                    row.target_id.clone(),
                )
            })
            .collect::<Vec<_>>();
        expected_relations.sort();

        assert_eq!(actual_relations, expected_relations);
    }
}
