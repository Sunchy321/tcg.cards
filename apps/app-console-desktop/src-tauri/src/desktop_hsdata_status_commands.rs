use sea_orm::ConnectionTrait;
use serde::Serialize;
use serde_json::Value;
use tauri::AppHandle;

use crate::desktop_database::{
    connect_configured_desktop_database, postgres_statement, postgres_statement_with_values,
    read_query_value,
};

/// hsdata import states returned for one local source version row.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DesktopHsdataSourceVersionStatus {
    source_tag: i32,
    build: Option<i32>,
    source_commit: String,
    source_uri: String,
    import_status: String,
    imported_at: Option<String>,
    projection_status: String,
    projected_at: Option<String>,
    projection_error: Option<String>,
}

/// hsdata table status counters grouped by import status.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DesktopHsdataStatusCounts {
    completed: i64,
    failed: i64,
    processing: i64,
    pending: i64,
}

/// hsdata source_versions overview returned from the local database.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DesktopHsdataSourceVersionOverview {
    name: String,
    kind: String,
    rows: i64,
    latest_imported_at: Option<String>,
    latest_completed_source_tag: Option<i32>,
    status_counts: DesktopHsdataStatusCounts,
}

/// hsdata raw_entity_snapshots overview returned from the local database.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DesktopHsdataRawEntitySnapshotOverview {
    name: String,
    kind: String,
    rows: i64,
    latest_rows: i64,
    distinct_card_count: i64,
    updated_at: Option<String>,
}

/// hsdata raw_entity_snapshot_tags overview returned from the local database.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DesktopHsdataRawEntitySnapshotTagOverview {
    name: String,
    kind: String,
    rows: i64,
    distinct_snapshot_count: i64,
    distinct_enum_count: i64,
}

/// hsdata tag_value_view overview returned from the local database.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DesktopHsdataTagValueViewOverview {
    name: String,
    kind: String,
    rows: i64,
    distinct_snapshot_count: i64,
    distinct_enum_count: i64,
}

/// Aggregated hsdata overview counts returned from the local database.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DesktopHsdataOverviewSummary {
    source_version_count: i64,
    completed_source_version_count: i64,
    failed_source_version_count: i64,
    snapshot_count: i64,
    latest_snapshot_count: i64,
    tag_row_count: i64,
}

/// hsdata overview tables returned from the local database.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DesktopHsdataOverviewTables {
    source_versions: DesktopHsdataSourceVersionOverview,
    raw_entity_snapshots: DesktopHsdataRawEntitySnapshotOverview,
    raw_entity_snapshot_tags: DesktopHsdataRawEntitySnapshotTagOverview,
    tag_value_view: DesktopHsdataTagValueViewOverview,
}

/// hsdata overview returned from the local database.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DesktopHsdataOverview {
    summary: DesktopHsdataOverviewSummary,
    tables: DesktopHsdataOverviewTables,
}

/// hsdata import job state returned from the local database.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DesktopHsdataImportJobState {
    job_id: String,
    source_tag: i32,
    build: i32,
    source_hash: String,
    dry_run: bool,
    force: bool,
    status: String,
    staging_cleanup_status: String,
    total_chunk_count: i32,
    total_entity_count: i32,
    completed_chunk_count: i64,
    failed_chunk_count: i64,
    processing_chunk_count: i64,
    report: Option<Value>,
    error: Option<String>,
    staging_cleanup_error: Option<String>,
    cleaned_at: Option<String>,
    finalized_at: Option<String>,
}

/// Input used to resolve one local hsdata import job.
#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DesktopHsdataImportJobInput {
    job_id: String,
}

/// Uploading import jobs promoted to ready_to_finalize when all chunks are completed.
fn normalize_hsdata_import_job_status(
    status: &str,
    total_chunk_count: i32,
    completed_chunk_count: i64,
    failed_chunk_count: i64,
    processing_chunk_count: i64,
) -> String {
    if status != "uploading" {
        return status.to_string();
    }

    if failed_chunk_count > 0 || processing_chunk_count > 0 {
        return status.to_string();
    }

    if completed_chunk_count == i64::from(total_chunk_count) {
        "ready_to_finalize".to_string()
    } else {
        status.to_string()
    }
}

/// Local hsdata source version rows ordered for sourceTag-focused desktop display.
async fn list_local_hsdata_source_versions_inner(
    app: &AppHandle,
) -> Result<Vec<DesktopHsdataSourceVersionStatus>, String> {
    let database = connect_configured_desktop_database(app).await?;
    let rows = database
        .connection()
        .query_all(postgres_statement(
            r#"
            select
              source_tag,
              build,
              source_commit,
              source_uri,
              status,
              imported_at::text as imported_at,
              projection_status::text as projection_status,
              projected_at::text as projected_at,
              projection_error
            from hearthstone_data.source_versions
            order by source_tag desc
            "#,
        ))
        .await
        .map_err(|error| format!("Failed to load local hsdata source versions: {error}"))?;

    Ok(rows
        .into_iter()
        .map(|row| -> Result<DesktopHsdataSourceVersionStatus, String> {
            Ok(DesktopHsdataSourceVersionStatus {
                source_tag: read_query_value(&row, "source_tag")?,
                build: read_query_value(&row, "build")?,
                source_commit: read_query_value(&row, "source_commit")?,
                source_uri: read_query_value(&row, "source_uri")?,
                import_status: read_query_value(&row, "status")?,
                imported_at: read_query_value(&row, "imported_at")?,
                projection_status: read_query_value(&row, "projection_status")?,
                projected_at: read_query_value(&row, "projected_at")?,
                projection_error: read_query_value(&row, "projection_error")?,
            })
        })
        .collect::<Result<Vec<_>, String>>()?)
}

/// Local hsdata overview rows aggregated from the configured desktop PostgreSQL database.
async fn get_local_hsdata_overview_inner(app: &AppHandle) -> Result<DesktopHsdataOverview, String> {
    let database = connect_configured_desktop_database(app).await?;
    let connection = database.connection();

    let source_version_summary = connection
        .query_one(postgres_statement(
            r#"
            select
              count(*)::bigint as rows,
              coalesce(sum(case when status = 'completed' then 1 else 0 end), 0)::bigint as completed,
              coalesce(sum(case when status = 'failed' then 1 else 0 end), 0)::bigint as failed,
              coalesce(sum(case when status = 'processing' then 1 else 0 end), 0)::bigint as processing,
              coalesce(sum(case when status = 'pending' then 1 else 0 end), 0)::bigint as pending
            from hearthstone_data.source_versions
            "#,
        ))
        .await
        .map_err(|error| format!("Failed to load local hsdata source version summary: {error}"))?
        .ok_or_else(|| "Failed to load local hsdata source version summary.".to_string())?;

    let latest_completed_source_version = connection
        .query_one(postgres_statement(
            r#"
            select
              source_tag,
              imported_at::text as imported_at
            from hearthstone_data.source_versions
            where status = 'completed'
            order by imported_at desc, source_tag desc
            limit 1
            "#,
        ))
        .await
        .map_err(|error| {
            format!("Failed to load local hsdata latest completed source version: {error}")
        })?;

    let snapshot_summary = connection
        .query_one(postgres_statement(
            r#"
            select
              count(*)::bigint as rows,
              coalesce(sum(case when is_latest then 1 else 0 end), 0)::bigint as latest_rows,
              count(distinct card_id)::bigint as distinct_card_count,
              max(updated_at)::text as updated_at
            from hearthstone_data.raw_entity_snapshots
            "#,
        ))
        .await
        .map_err(|error| format!("Failed to load local hsdata snapshot summary: {error}"))?
        .ok_or_else(|| "Failed to load local hsdata snapshot summary.".to_string())?;

    let snapshot_tag_summary = connection
        .query_one(postgres_statement(
            r#"
            select
              count(*)::bigint as rows,
              count(distinct snapshot_id)::bigint as distinct_snapshot_count,
              count(distinct enum_id)::bigint as distinct_enum_count
            from hearthstone_data.raw_entity_snapshot_tags
            "#,
        ))
        .await
        .map_err(|error| format!("Failed to load local hsdata snapshot tag summary: {error}"))?
        .ok_or_else(|| "Failed to load local hsdata snapshot tag summary.".to_string())?;

    let tag_value_summary = connection
        .query_one(postgres_statement(
            r#"
            select
              count(*)::bigint as rows,
              count(distinct snapshot_id)::bigint as distinct_snapshot_count,
              count(distinct enum_id)::bigint as distinct_enum_count
            from hearthstone_data.tag_value_view
            "#,
        ))
        .await
        .map_err(|error| format!("Failed to load local hsdata tag value summary: {error}"))?
        .ok_or_else(|| "Failed to load local hsdata tag value summary.".to_string())?;

    Ok(DesktopHsdataOverview {
        summary: DesktopHsdataOverviewSummary {
            source_version_count: read_query_value(&source_version_summary, "rows")?,
            completed_source_version_count: read_query_value(&source_version_summary, "completed")?,
            failed_source_version_count: read_query_value(&source_version_summary, "failed")?,
            snapshot_count: read_query_value(&snapshot_summary, "rows")?,
            latest_snapshot_count: read_query_value(&snapshot_summary, "latest_rows")?,
            tag_row_count: read_query_value(&snapshot_tag_summary, "rows")?,
        },
        tables: DesktopHsdataOverviewTables {
            source_versions: DesktopHsdataSourceVersionOverview {
                name: "source_versions".to_string(),
                kind: "table".to_string(),
                rows: read_query_value(&source_version_summary, "rows")?,
                latest_imported_at: latest_completed_source_version
                    .as_ref()
                    .map(|row| read_query_value(row, "imported_at"))
                    .transpose()?
                    .flatten(),
                latest_completed_source_tag: latest_completed_source_version
                    .as_ref()
                    .map(|row| read_query_value(row, "source_tag"))
                    .transpose()?,
                status_counts: DesktopHsdataStatusCounts {
                    completed: read_query_value(&source_version_summary, "completed")?,
                    failed: read_query_value(&source_version_summary, "failed")?,
                    processing: read_query_value(&source_version_summary, "processing")?,
                    pending: read_query_value(&source_version_summary, "pending")?,
                },
            },
            raw_entity_snapshots: DesktopHsdataRawEntitySnapshotOverview {
                name: "raw_entity_snapshots".to_string(),
                kind: "table".to_string(),
                rows: read_query_value(&snapshot_summary, "rows")?,
                latest_rows: read_query_value(&snapshot_summary, "latest_rows")?,
                distinct_card_count: read_query_value(&snapshot_summary, "distinct_card_count")?,
                updated_at: read_query_value(&snapshot_summary, "updated_at")?,
            },
            raw_entity_snapshot_tags: DesktopHsdataRawEntitySnapshotTagOverview {
                name: "raw_entity_snapshot_tags".to_string(),
                kind: "table".to_string(),
                rows: read_query_value(&snapshot_tag_summary, "rows")?,
                distinct_snapshot_count: read_query_value(
                    &snapshot_tag_summary,
                    "distinct_snapshot_count",
                )?,
                distinct_enum_count: read_query_value(
                    &snapshot_tag_summary,
                    "distinct_enum_count",
                )?,
            },
            tag_value_view: DesktopHsdataTagValueViewOverview {
                name: "tag_value_view".to_string(),
                kind: "view".to_string(),
                rows: read_query_value(&tag_value_summary, "rows")?,
                distinct_snapshot_count: read_query_value(
                    &tag_value_summary,
                    "distinct_snapshot_count",
                )?,
                distinct_enum_count: read_query_value(&tag_value_summary, "distinct_enum_count")?,
            },
        },
    })
}

/// Local hsdata import job state resolved from one configured desktop PostgreSQL database.
async fn get_local_hsdata_import_job_inner(
    app: &AppHandle,
    input: DesktopHsdataImportJobInput,
) -> Result<DesktopHsdataImportJobState, String> {
    let database = connect_configured_desktop_database(app).await?;
    let connection = database.connection();

    let job = connection
        .query_one(postgres_statement_with_values(
            r#"
            select
              id::text as job_id,
              source_tag,
              build,
              source_hash,
              dry_run,
              force,
              status::text as status,
              staging_cleanup_status::text as staging_cleanup_status,
              total_chunk_count,
              total_entity_count,
              report::text as report,
              error,
              staging_cleanup_error,
              cleaned_at::text as cleaned_at,
              finalized_at::text as finalized_at
            from hearthstone_data.hsdata_import_jobs
            where id = $1::uuid
            "#,
            vec![input.job_id.clone().into()],
        ))
        .await
        .map_err(|error| format!("Failed to load local hsdata import job: {error}"))?
        .ok_or_else(|| format!("hsdata import job {} does not exist", input.job_id))?;

    let chunk_status_rows = connection
        .query_all(postgres_statement_with_values(
            r#"
            select
              status::text as status,
              count(*)::bigint as value
            from hearthstone_data.hsdata_import_job_chunks
            where job_id = $1::uuid
            group by status
            "#,
            vec![input.job_id.clone().into()],
        ))
        .await
        .map_err(|error| {
            format!("Failed to load local hsdata import job chunk progress: {error}")
        })?;

    let mut completed_chunk_count = 0_i64;
    let mut failed_chunk_count = 0_i64;
    let mut processing_chunk_count = 0_i64;

    for row in chunk_status_rows {
        let status: String = read_query_value(&row, "status")?;
        let value: i64 = read_query_value(&row, "value")?;

        match status.as_str() {
            "completed" => completed_chunk_count = value,
            "failed" => failed_chunk_count = value,
            "processing" => processing_chunk_count = value,
            _ => {}
        }
    }

    let total_chunk_count: i32 = read_query_value(&job, "total_chunk_count")?;
    let normalized_status = normalize_hsdata_import_job_status(
        &read_query_value::<String>(&job, "status")?,
        total_chunk_count,
        completed_chunk_count,
        failed_chunk_count,
        processing_chunk_count,
    );
    let report = read_query_value::<Option<String>>(&job, "report")?
        .map(|text| {
            serde_json::from_str::<Value>(&text).map_err(|error| {
                format!("Failed to decode local hsdata import job report: {error}")
            })
        })
        .transpose()?;

    Ok(DesktopHsdataImportJobState {
        job_id: read_query_value(&job, "job_id")?,
        source_tag: read_query_value(&job, "source_tag")?,
        build: read_query_value(&job, "build")?,
        source_hash: read_query_value(&job, "source_hash")?,
        dry_run: read_query_value(&job, "dry_run")?,
        force: read_query_value(&job, "force")?,
        status: normalized_status.clone(),
        staging_cleanup_status: read_query_value(&job, "staging_cleanup_status")?,
        total_chunk_count,
        total_entity_count: read_query_value(&job, "total_entity_count")?,
        completed_chunk_count: if normalized_status == "completed" && completed_chunk_count == 0 {
            i64::from(total_chunk_count)
        } else {
            completed_chunk_count
        },
        failed_chunk_count,
        processing_chunk_count,
        report,
        error: read_query_value(&job, "error")?,
        staging_cleanup_error: read_query_value(&job, "staging_cleanup_error")?,
        cleaned_at: read_query_value(&job, "cleaned_at")?,
        finalized_at: read_query_value(&job, "finalized_at")?,
    })
}

/// Local hsdata overview loaded by the desktop frontend.
#[tauri::command]
pub(crate) async fn hsdata_get_local_overview(
    app: AppHandle,
) -> Result<DesktopHsdataOverview, String> {
    get_local_hsdata_overview_inner(&app).await
}

/// Local hsdata source version rows loaded by the desktop frontend.
#[tauri::command]
pub(crate) async fn hsdata_list_local_source_versions(
    app: AppHandle,
) -> Result<Vec<DesktopHsdataSourceVersionStatus>, String> {
    list_local_hsdata_source_versions_inner(&app).await
}

/// Local hsdata import job state loaded by the desktop frontend.
#[tauri::command]
pub(crate) async fn hsdata_get_local_import_job(
    app: AppHandle,
    input: DesktopHsdataImportJobInput,
) -> Result<DesktopHsdataImportJobState, String> {
    get_local_hsdata_import_job_inner(&app, input).await
}
