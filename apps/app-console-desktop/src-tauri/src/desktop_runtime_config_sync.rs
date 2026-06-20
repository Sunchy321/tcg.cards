use std::time::Duration;

use reqwest::StatusCode;
use serde::de::DeserializeOwned;
use serde_json::json;
use tauri::AppHandle;

use crate::desktop_database_settings::load_desktop_database_connection_string;
use crate::desktop_hearthstone_image::load_image_settings;
use crate::desktop_publish_target::load_publish_target_rows;
use crate::load_desktop_game_repo_path;

const DESKTOP_RUNTIME_HTTP_BASE_URL: &str = "http://127.0.0.1:4318";
const DESKTOP_RUNTIME_RPC_BASE_URL: &str = "http://127.0.0.1:4318/rpc";
const DESKTOP_RUNTIME_SYNC_INTERVAL_SECONDS: u64 = 5;

/// Builds one JSON RPC payload envelope accepted by the desktop runtime oRPC transport.
fn build_rpc_payload(input: serde_json::Value) -> serde_json::Value {
    json!({
        "json": input,
    })
}

/// Writes one concise runtime sync log line for the current desktop shell.
fn log_runtime_sync(message: &str) {
    eprintln!("[desktop][runtime-sync] {message}");
}

/// One reqwest client built with one explicit desktop runtime timeout.
fn build_runtime_http_client(timeout_ms: u64) -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .timeout(Duration::from_millis(timeout_ms))
        .build()
        .map_err(|error| format!("Failed to build desktop runtime HTTP client: {error}"))
}

/// Builds one unified desktop-state snapshot payload for the local Bun runtime.
fn build_desktop_state_payload(app: &AppHandle) -> Result<serde_json::Value, String> {
    let connection_string = load_desktop_database_connection_string(app)?;
    let repo_path = load_desktop_game_repo_path(app, "hearthstone", "hsdata")?;
    let image_settings = load_image_settings(app)?;
    let publish_targets = load_publish_target_rows(app)?;

    Ok(json!({
        "localDatabase": {
            "connectionString": connection_string,
        },
        "games": {
            "hearthstone": {
                "hsdata": {
                    "repoPath": repo_path,
                },
                "image": {
                    "rendererBaseUrl": image_settings.renderer_base_url,
                    "bucketDir": image_settings.bucket_dir,
                },
                "publish": publish_targets.iter().map(|target| {
                    json!({
                        "publishTarget": target.publish_target,
                        "environment": target.environment,
                        "targetFingerprint": target.target_fingerprint,
                        "connectionString": target.connection_string,
                    })
                }).collect::<Vec<_>>(),
            },
        },
    }))
}

/// Posts one runtime configuration procedure call into the local Bun desktop runtime.
async fn post_runtime_rpc(path: &str, input: serde_json::Value) -> Result<(), String> {
    let url = format!("{DESKTOP_RUNTIME_RPC_BASE_URL}/{path}");
    let client = build_runtime_http_client(800)?;

    let response = client
        .post(&url)
        .json(&build_rpc_payload(input))
        .send()
        .await
        .map_err(|error| format!("Failed to call desktop runtime {path}: {error}"))?;

    if response.status().is_success() {
        return Ok(());
    }

    let status = response.status();
    let body = response.text().await.unwrap_or_default();

    Err(match status {
        StatusCode::NOT_FOUND => format!("Desktop runtime procedure not found: {path}"),
        _ if body.trim().is_empty() => {
            format!("Desktop runtime procedure {path} failed with status {status}")
        }
        _ => format!(
            "Desktop runtime procedure {path} failed with status {status}: {}",
            body.trim()
        ),
    })
}

/// Posts one JSON request into the local Bun desktop runtime and decodes one JSON response body.
pub(crate) async fn post_runtime_json<T>(
    path: &str,
    input: serde_json::Value,
) -> Result<T, String>
where
    T: DeserializeOwned,
{
    let url = format!("{DESKTOP_RUNTIME_HTTP_BASE_URL}/{path}");
    let client = build_runtime_http_client(6_000)?;
    let response = client
        .post(&url)
        .json(&input)
        .send()
        .await
        .map_err(|error| format!("Failed to call desktop runtime {path}: {error}"))?;

    if response.status().is_success() {
        return response
            .json::<T>()
            .await
            .map_err(|error| format!("Failed to decode desktop runtime {path} response: {error}"));
    }

    let status = response.status();
    let body = response.text().await.unwrap_or_default();

    Err(match status {
        StatusCode::NOT_FOUND => format!("Desktop runtime endpoint not found: {path}"),
        _ if body.trim().is_empty() => {
            format!("Desktop runtime endpoint {path} failed with status {status}")
        }
        _ => format!(
            "Desktop runtime endpoint {path} failed with status {status}: {}",
            body.trim()
        ),
    })
}

/// Pushes the current desktop config values into the local Bun runtime once.
pub(crate) async fn sync_desktop_runtime_config_once(app: &AppHandle) -> Result<(), String> {
    post_runtime_rpc("runtime/configureDesktopState", build_desktop_state_payload(app)?).await
}

/// Runs one startup sync inline so the desktop UI can observe backend-injected config sooner.
pub(crate) fn sync_desktop_runtime_config_blocking(app: &AppHandle) {
    if let Err(error) = tauri::async_runtime::block_on(sync_desktop_runtime_config_once(app)) {
        log_runtime_sync(&format!("startup config sync failed: {error}"));
    }
}

/// Schedules one background sync attempt without blocking the current desktop command.
pub(crate) fn schedule_desktop_runtime_config_sync(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        if let Err(error) = sync_desktop_runtime_config_once(&app).await {
            log_runtime_sync(&format!("deferred config sync failed: {error}"));
        }
    });
}

/// Starts the background sync loop that keeps the independent Bun runtime aligned with desktop config.
pub(crate) fn start_desktop_runtime_config_sync_loop(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        loop {
            if let Err(error) = sync_desktop_runtime_config_once(&app).await {
                log_runtime_sync(&format!("periodic config sync failed: {error}"));
            }

            tokio::time::sleep(Duration::from_secs(
                DESKTOP_RUNTIME_SYNC_INTERVAL_SECONDS,
            ))
            .await;
        }
    });
}
