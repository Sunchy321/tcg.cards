use std::time::Instant;

use serde::{Deserialize, Serialize};
use serde_json::json;
use tauri::AppHandle;

use crate::desktop_database_settings::{
    build_desktop_database_settings, load_desktop_database_settings,
    store_desktop_database_connection_string, DesktopDatabaseSettings,
};
use crate::desktop_runtime_config_sync::{post_runtime_json, schedule_desktop_runtime_config_sync};
use crate::trim_non_empty;

/// Connection test result returned to the desktop frontend.
#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DesktopDatabaseConnectionTestResult {
    database_name: String,
    user_name: String,
    latency_ms: u128,
}

/// External PostgreSQL connection string resolved from one explicit test request.
fn resolve_database_test_connection_string(
    external_connection_string: Option<String>,
) -> Result<String, String> {
    trim_non_empty(external_connection_string)
        .ok_or_else(|| "External local PostgreSQL connection string is required.".to_string())
}

/// Connection test executed against one explicit PostgreSQL connection string.
async fn test_desktop_database_connection(
    external_connection_string: String,
) -> Result<DesktopDatabaseConnectionTestResult, String> {
    let started_at = Instant::now();
    let mut result = post_runtime_json::<DesktopDatabaseConnectionTestResult>(
        "desktop/test-local-database",
        json!({
            "connectionString": external_connection_string,
        }),
    )
    .await?;
    result.latency_ms = started_at.elapsed().as_millis();

    Ok(result)
}

/// Database settings loaded by the desktop frontend.
#[tauri::command]
pub(crate) fn desktop_get_database_settings(
    app: AppHandle,
) -> Result<DesktopDatabaseSettings, String> {
    load_desktop_database_settings(&app)
}

/// Database connection tested by the desktop frontend.
#[tauri::command]
pub(crate) async fn desktop_test_database_connection(
    external_connection_string: Option<String>,
) -> Result<DesktopDatabaseConnectionTestResult, String> {
    let external_connection_string =
        resolve_database_test_connection_string(external_connection_string)?;

    test_desktop_database_connection(external_connection_string).await
}

/// Database settings persisted from the desktop frontend.
#[tauri::command]
pub(crate) fn desktop_set_database_settings(
    app: AppHandle,
    external_connection_string: Option<String>,
) -> Result<DesktopDatabaseSettings, String> {
    let external_connection_string = trim_non_empty(external_connection_string);

    if external_connection_string.is_none() {
        return Err("External local PostgreSQL connection string is required.".to_string());
    }

    store_desktop_database_connection_string(&app, external_connection_string.clone())?;
    schedule_desktop_runtime_config_sync(app.clone());

    Ok(build_desktop_database_settings(external_connection_string))
}
