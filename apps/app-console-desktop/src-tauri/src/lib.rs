#[allow(dead_code)]
mod hsdata_import_payload;
mod hsdata_legacy_dbf_id_table;

use crate::hsdata_import_payload::{
    collect_legacy_entity_card_ids, prepare_hsdata_payload_profiled_with_dbf_ids,
    HsdataPreparedPayload, HsdataPreparedPayloadChunk, HsdataPreparedPayloadProfile,
    HsdataPreparedPayloadResult, HSDATA_IMPORT_ENGINE_VERSION, HSDATA_PAYLOAD_ENCODING,
    HSDATA_PAYLOAD_FORMAT_VERSION,
};
use crate::hsdata_legacy_dbf_id_table::get_legacy_hsdata_dbf_id;
use flate2::write::GzEncoder;
use flate2::Compression;
use reqwest::cookie::{CookieStore, Jar};
use reqwest::{Client, Method, Url};
use serde::de::DeserializeOwned;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::{Arc, Mutex};
use std::time::Instant;
use tauri::{AppHandle, Emitter, Manager};

struct AuthState {
    current: Mutex<Option<SessionClient>>,
}

impl Default for AuthState {
    fn default() -> Self {
        Self {
            current: Mutex::new(None),
        }
    }
}

#[derive(Clone)]
struct SessionClient {
    base_url: String,
    client: Client,
    jar: Arc<Jar>,
}

/// API error payload returned by auth and ORPC endpoints.
#[derive(Deserialize)]
struct ApiErrorBody {
    code: Option<String>,
    message: Option<String>,
}

/// ORPC JSON envelope for request and response payloads.
#[derive(Deserialize, Serialize)]
struct OrpcJsonEnvelope<T> {
    json: T,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    meta: Option<Vec<serde_json::Value>>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct RemoteAuthState {
    session: RemoteSession,
    user: RemoteUser,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct RemoteSession {
    id: String,
    expires_at: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct RemoteUser {
    id: String,
    name: String,
    email: String,
    username: Option<String>,
    role: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct DesktopAuthState {
    session: DesktopSession,
    user: DesktopUser,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct DesktopSession {
    id: String,
    expires_at: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct DesktopUser {
    id: String,
    name: String,
    email: String,
    username: Option<String>,
    role: Option<String>,
}

fn build_desktop_auth_state(remote: RemoteAuthState) -> DesktopAuthState {
    DesktopAuthState {
        session: DesktopSession {
            id: remote.session.id,
            expires_at: remote.session.expires_at,
        },
        user: DesktopUser {
            id: remote.user.id,
            name: remote.user.name,
            email: remote.user.email,
            username: remote.user.username,
            role: remote.user.role,
        },
    }
}

/// ORPC JSON envelope built from one payload.
fn orpc_json<T>(json: T) -> OrpcJsonEnvelope<T> {
    OrpcJsonEnvelope { json, meta: None }
}

/// API error message formatted from one decoded payload.
fn format_api_error(body: ApiErrorBody) -> Option<String> {
    if let Some(message) = body.message {
        if let Some(code) = body.code {
            return Some(format!("{code}: {message}"));
        }

        return Some(message);
    }

    None
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct StoredSession {
    base_url: String,
    cookie_header: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct DesktopFetchResponse {
    body: Vec<u8>,
    headers: Vec<(String, String)>,
    status: u16,
}

fn desktop_config_version() -> u32 {
    1
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct DesktopConfig {
    #[serde(default = "desktop_config_version")]
    version: u32,
    #[serde(default, skip_serializing_if = "DesktopGamesSettings::is_empty")]
    games: DesktopGamesSettings,
}

impl Default for DesktopConfig {
    fn default() -> Self {
        Self {
            version: desktop_config_version(),
            games: DesktopGamesSettings::default(),
        }
    }
}

/// Whole-millisecond duration measured from one monotonic timer.
fn elapsed_millis(started_at: &Instant) -> u128 {
    started_at.elapsed().as_millis()
}

/// Structured profiling log emitted for one desktop hsdata import stage.
fn log_hsdata_import_profile(stage: &str, fields: serde_json::Value) {
    eprintln!(
        "[hearthstone][hsdata-import][profile][desktop] {} {}",
        stage, fields
    );
}

#[derive(Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct DesktopGamesSettings {
    #[serde(skip_serializing_if = "Option::is_none")]
    hearthstone: Option<StoredHearthstoneSettings>,
}

impl DesktopGamesSettings {
    fn is_empty(&self) -> bool {
        self.hearthstone.is_none()
    }
}

#[derive(Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct StoredHearthstoneSettings {
    #[serde(skip_serializing_if = "Option::is_none")]
    hsdata: Option<StoredRepoPath>,
}

impl StoredHearthstoneSettings {
    fn is_empty(&self) -> bool {
        self.hsdata.is_none()
    }
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct StoredRepoPath {
    repo_path: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct HsdataRepoState {
    repo_path: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct HsdataSyncResult {
    repo_path: String,
    remote: String,
}

const HSDATA_REMOTE_NAME: &str = "origin";
const HSDATA_CHUNKING_VERSION: &str = "desktop-v1";
const HSDATA_MAX_BYTES_PER_CHUNK: usize = 1024 * 1024;
const HSDATA_MAX_ENTITIES_PER_CHUNK: usize = 256;
const HSDATA_UPLOAD_CONCURRENCY: usize = 4;
const HSDATA_CREATE_IMPORT_JOB_PATH: &str = "/rpc/hearthstone/dataSource/hsdata/createImportJob";
const HSDATA_UPLOAD_IMPORT_CHUNK_PATH: &str =
    "/rpc/hearthstone/dataSource/hsdata/uploadImportChunk";
const HSDATA_FINALIZE_IMPORT_JOB_PATH: &str =
    "/rpc/hearthstone/dataSource/hsdata/finalizeImportJob";
const HSDATA_GET_IMPORT_JOB_PATH: &str = "/rpc/hearthstone/dataSource/hsdata/getImportJob";
const HSDATA_IMPORT_PROGRESS_EVENT: &str = "hsdata-import-progress";
const HSDATA_UPLOAD_IMPORT_CHUNK_CONTENT_TYPE: &str = "application/x-ndjson";
const HSDATA_UPLOAD_IMPORT_CHUNK_CONTENT_ENCODING: &str = "gzip";
const HSDATA_UPLOAD_IMPORT_CHUNK_PAYLOAD_HASH_HEADER: &str = "x-hsdata-payload-hash";
const HSDATA_UPLOAD_IMPORT_CHUNK_ENTITY_COUNT_HEADER: &str = "x-hsdata-entity-count";

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct HsdataSourceEntry {
    id: String,
    name: String,
    kind: String,
    size: u64,
    time: Option<String>,
    source_tag: Option<u32>,
    source_commit: String,
    short_commit: String,
    source_uri: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct HsdataResolvedSource {
    id: String,
    name: String,
    kind: String,
    size: u64,
    time: Option<String>,
    xml: String,
    source_tag: u32,
    source_commit: String,
    short_commit: String,
    source_uri: String,
}

/// Remote hsdata import report.
#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct HsdataImportReport {
    dry_run: bool,
    skipped: bool,
    source_tag: u32,
    build: u32,
    source_hash: String,
    entity_count: u32,
    inserted_snapshots: u32,
    reused_snapshots: u32,
    inserted_tag_rows: u32,
    discovered_tag_count: u32,
    updated_discovered_tags: u32,
    fallback_tag_row_count: u32,
    latest_snapshot_count: u32,
    discovered_tags: Vec<u32>,
}

/// hsdata import progress event payload for the desktop window.
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct HsdataImportProgressEvent {
    source_id: String,
    source_tag: Option<u32>,
    job_id: Option<String>,
    phase: String,
    message: String,
    total_chunk_count: Option<u32>,
    completed_chunk_count: Option<u32>,
    total_entity_count: Option<u32>,
    current_chunk_index: Option<u32>,
}

/// Chunk manifest entry sent to the remote import job.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct HsdataImportChunkManifestItem {
    chunk_index: u32,
    payload_hash: String,
    entity_count: u32,
}

/// Remote createImportJob payload.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct HsdataCreateImportJobInput {
    source_tag: u32,
    source_commit: String,
    source_uri: String,
    build: u32,
    source_hash: String,
    chunking_version: String,
    payload_format_version: String,
    payload_encoding: String,
    import_engine_version: String,
    max_bytes_per_chunk: u32,
    max_entities_per_chunk: u32,
    dry_run: bool,
    force: bool,
    total_chunk_count: u32,
    total_entity_count: u32,
    chunks: Vec<HsdataImportChunkManifestItem>,
}

/// Remote createImportJob response.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct HsdataCreateImportJobResult {
    job_id: String,
}

/// Remote uploadImportChunk response.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct HsdataUploadImportChunkResult {
    chunk_status: String,
    completed_chunk_count: u32,
    total_chunk_count: u32,
    job_status: String,
}

/// Remote getImportJob and finalizeImportJob request.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct HsdataImportJobInput {
    job_id: String,
}

/// Remote getImportJob response.
#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct HsdataImportJobState {
    job_id: String,
    status: String,
    total_chunk_count: u32,
    completed_chunk_count: u32,
    report: Option<HsdataImportReport>,
    error: Option<String>,
}

/// Desktop-prepared hsdata import payload.
struct HsdataPreparedImport {
    source_id: String,
    source_kind: String,
    source_size_bytes: u64,
    source_tag: u32,
    build: u32,
    source_commit: String,
    source_uri: String,
    source_hash: String,
    payload_format_version: String,
    payload_encoding: String,
    import_engine_version: String,
    total_entity_count: u32,
    chunks: Vec<HsdataPreparedPayloadChunk>,
}

/// Fine-grained timings captured while the desktop prepares one hsdata import source.
struct HsdataPreparedImportProfile {
    resolve_source_ms: u128,
    prepare_payload_ms: u128,
    total_ms: u128,
    payload: HsdataPreparedPayloadProfile,
}

/// Prepared desktop import source paired with the local profiling summary.
struct HsdataPreparedImportResult {
    prepared: HsdataPreparedImport,
    profile: HsdataPreparedImportProfile,
}

/// Persisted desktop resume state for one hsdata import job.
#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct StoredHsdataImportJob {
    job_id: String,
    source_id: String,
    source_tag: u32,
    source_hash: String,
    chunking_version: String,
    #[serde(default = "default_hsdata_payload_format_version")]
    payload_format_version: String,
    #[serde(default = "default_hsdata_payload_encoding")]
    payload_encoding: String,
    #[serde(default = "default_hsdata_import_engine_version")]
    import_engine_version: String,
    max_bytes_per_chunk: u32,
    max_entities_per_chunk: u32,
    total_chunk_count: u32,
    total_entity_count: u32,
    dry_run: bool,
    force: bool,
}

const DEFAULT_AUTH_BASE_URL: &str = "http://127.0.0.1:2998";

/// Default payload format version used to read older local resume files.
fn default_hsdata_payload_format_version() -> String {
    HSDATA_PAYLOAD_FORMAT_VERSION.to_string()
}

/// Default payload encoding used to read older local resume files.
fn default_hsdata_payload_encoding() -> String {
    HSDATA_PAYLOAD_ENCODING.to_string()
}

/// Default import engine version used to read older local resume files.
fn default_hsdata_import_engine_version() -> String {
    HSDATA_IMPORT_ENGINE_VERSION.to_string()
}

fn build_url(base_url: &str, path: &str) -> String {
    format!("{}{}", base_url.trim_end_matches('/'), path)
}

fn resolve_auth_base_url() -> String {
    let base_url = std::env::var("INTERNAL_AUTH_URL")
        .ok()
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| DEFAULT_AUTH_BASE_URL.to_string());

    match Url::parse(&base_url) {
        Ok(mut url) => {
            if url.host_str() == Some("localhost") {
                let _ = url.set_host(Some("127.0.0.1"));
            }

            url.to_string().trim_end_matches('/').to_string()
        }
        Err(_) => base_url.trim_end_matches('/').to_string(),
    }
}

fn auth_cookie_url(base_url: &str) -> Result<Url, String> {
    Url::parse(&build_url(base_url, "/auth/get-session"))
        .map_err(|error| format!("Failed to parse auth URL: {error}"))
}

fn auth_origin_header(base_url: &str) -> Result<String, String> {
    let url = Url::parse(base_url).map_err(|error| format!("Failed to parse auth URL: {error}"))?;

    Ok(url.origin().ascii_serialization())
}

fn create_client(base_url: &str, cookie_header: Option<&str>) -> Result<SessionClient, String> {
    let origin = auth_cookie_url(base_url)?;
    let jar = Arc::new(Jar::default());

    if let Some(cookie_header) = cookie_header {
        for cookie in cookie_header.split(';') {
            let cookie = cookie.trim();

            if !cookie.is_empty() {
                jar.add_cookie_str(cookie, &origin);
            }
        }
    }

    let client = Client::builder()
        // Desktop localhost requests must bypass any system proxy behavior so they
        // behave the same as a direct curl to the local dev server.
        .no_proxy()
        .cookie_provider(jar.clone())
        .user_agent("tcg-cards-console-desktop")
        .build()
        .map_err(|error| format!("Failed to create auth client: {error}"))?;

    Ok(SessionClient {
        base_url: base_url.to_string(),
        client,
        jar,
    })
}

fn session_file(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Failed to resolve app data directory: {error}"))?;

    Ok(dir.join("auth-session.json"))
}

fn load_stored_session(app: &AppHandle) -> Result<Option<StoredSession>, String> {
    let path = session_file(app)?;

    if !path.exists() {
        return Ok(None);
    }

    let text = fs::read_to_string(&path)
        .map_err(|error| format!("Failed to read stored session: {error}"))?;

    let stored = serde_json::from_str::<StoredSession>(&text)
        .map_err(|error| format!("Failed to decode stored session: {error}"))?;

    Ok(Some(stored))
}

fn clear_stored_session(app: &AppHandle) -> Result<(), String> {
    let path = session_file(app)?;

    if path.exists() {
        fs::remove_file(path)
            .map_err(|error| format!("Failed to remove stored session: {error}"))?;
    }

    Ok(())
}

fn store_session(app: &AppHandle, session_client: &SessionClient) -> Result<(), String> {
    let path = session_file(app)?;
    let Some(parent) = path.parent() else {
        return Err("Failed to resolve session storage directory".to_string());
    };

    fs::create_dir_all(parent)
        .map_err(|error| format!("Failed to create session storage directory: {error}"))?;

    let origin = auth_cookie_url(&session_client.base_url)?;
    let cookie_header = session_client
        .jar
        .cookies(&origin)
        .ok_or_else(|| "No auth cookies were available to store".to_string())?
        .to_str()
        .map_err(|error| format!("Failed to serialize auth cookies: {error}"))?
        .to_string();

    let stored = StoredSession {
        base_url: session_client.base_url.clone(),
        cookie_header,
    };

    let text = serde_json::to_string(&stored)
        .map_err(|error| format!("Failed to encode stored session: {error}"))?;

    fs::write(path, text).map_err(|error| format!("Failed to write stored session: {error}"))?;

    Ok(())
}

fn restore_session_client(app: &AppHandle) -> Result<Option<SessionClient>, String> {
    let Some(stored) = load_stored_session(app)? else {
        return Ok(None);
    };

    create_client(&stored.base_url, Some(&stored.cookie_header)).map(Some)
}

fn desktop_config_file(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Failed to resolve app data directory: {error}"))?;

    Ok(dir.join("desktop-config.json"))
}

fn load_desktop_config(app: &AppHandle) -> Result<DesktopConfig, String> {
    let path = desktop_config_file(app)?;

    if !path.exists() {
        return Ok(DesktopConfig::default());
    }

    let text = fs::read_to_string(&path)
        .map_err(|error| format!("Failed to read desktop config: {error}"))?;

    serde_json::from_str::<DesktopConfig>(&text)
        .map_err(|error| format!("Failed to decode desktop config: {error}"))
}

fn store_desktop_config(app: &AppHandle, settings: &DesktopConfig) -> Result<(), String> {
    let path = desktop_config_file(app)?;
    let Some(parent) = path.parent() else {
        return Err("Failed to resolve desktop config directory".to_string());
    };

    fs::create_dir_all(parent)
        .map_err(|error| format!("Failed to create desktop config directory: {error}"))?;

    let text = serde_json::to_string(settings)
        .map_err(|error| format!("Failed to encode desktop config: {error}"))?;

    fs::write(path, text).map_err(|error| format!("Failed to write desktop config: {error}"))?;

    Ok(())
}

fn desktop_repo_label(game: &str, repo_key: &str) -> Result<&'static str, String> {
    match (game, repo_key) {
        ("hearthstone", "hsdata") => Ok("Local hsdata repo"),
        _ => Err(format!(
            "Unsupported desktop repo setting: {game}.{repo_key}"
        )),
    }
}

fn trim_non_empty(value: Option<String>) -> Option<String> {
    value.and_then(|value| {
        let trimmed = value.trim().to_string();
        (!trimmed.is_empty()).then_some(trimmed)
    })
}

fn trim_command_text(bytes: &[u8]) -> String {
    String::from_utf8_lossy(bytes).trim().to_string()
}

#[cfg(target_os = "macos")]
fn escape_applescript_string(value: &str) -> String {
    value.replace('\\', "\\\\").replace('"', "\\\"")
}

#[cfg(target_os = "windows")]
fn escape_powershell_string(value: &str) -> String {
    value.replace('\'', "''")
}

#[cfg(target_os = "macos")]
fn pick_directory(directory: Option<String>) -> Result<Option<String>, String> {
    let mut script =
        String::from("set selectedFolder to choose folder\nreturn POSIX path of selectedFolder");

    if let Some(directory) =
        trim_non_empty(directory).filter(|directory| Path::new(directory).exists())
    {
        let directory = escape_applescript_string(&directory);
        script = format!(
            "set selectedFolder to choose folder default location POSIX file \"{directory}\"\nreturn POSIX path of selectedFolder"
        );
    }

    let output = Command::new("osascript")
        .args(["-e", &script])
        .output()
        .map_err(|error| format!("Failed to open directory picker: {error}"))?;

    if output.status.success() {
        return Ok(trim_non_empty(Some(trim_command_text(&output.stdout))));
    }

    let stderr = trim_command_text(&output.stderr);
    if stderr.contains("User canceled") || stderr.contains("(-128)") {
        return Ok(None);
    }

    let message = if stderr.is_empty() {
        trim_command_text(&output.stdout)
    } else {
        stderr
    };

    Err(if message.is_empty() {
        "Failed to open directory picker".to_string()
    } else {
        format!("Failed to open directory picker: {message}")
    })
}

#[cfg(target_os = "windows")]
fn pick_directory(directory: Option<String>) -> Result<Option<String>, String> {
    let mut script = String::from(
        "[void][System.Reflection.Assembly]::LoadWithPartialName('System.Windows.Forms')\n\
         $dialog = New-Object System.Windows.Forms.FolderBrowserDialog\n",
    );

    if let Some(directory) =
        trim_non_empty(directory).filter(|directory| Path::new(directory).exists())
    {
        let directory = escape_powershell_string(&directory);
        script.push_str(&format!("$dialog.SelectedPath = '{directory}'\n"));
    }

    script.push_str(
        "if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {\n\
         [Console]::Out.Write($dialog.SelectedPath)\n\
         }\n",
    );

    let output = Command::new("powershell")
        .args(["-NoProfile", "-STA", "-Command", &script])
        .output()
        .map_err(|error| format!("Failed to open directory picker: {error}"))?;

    if !output.status.success() {
        let stderr = trim_command_text(&output.stderr);
        return Err(if stderr.is_empty() {
            "Failed to open directory picker".to_string()
        } else {
            format!("Failed to open directory picker: {stderr}")
        });
    }

    Ok(trim_non_empty(Some(trim_command_text(&output.stdout))))
}

#[cfg(target_os = "linux")]
fn pick_directory(directory: Option<String>) -> Result<Option<String>, String> {
    let directory = trim_non_empty(directory).filter(|directory| Path::new(directory).exists());

    let mut zenity = Command::new("zenity");
    zenity.args(["--file-selection", "--directory"]);
    if let Some(directory) = directory.as_ref() {
        zenity.arg(format!("--filename={directory}/"));
    }

    match zenity.output() {
        Ok(output) => {
            if output.status.success() {
                return Ok(trim_non_empty(Some(trim_command_text(&output.stdout))));
            }

            if output.status.code() == Some(1) {
                return Ok(None);
            }

            let stderr = trim_command_text(&output.stderr);
            return Err(if stderr.is_empty() {
                "Failed to open directory picker".to_string()
            } else {
                format!("Failed to open directory picker: {stderr}")
            });
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
        Err(error) => return Err(format!("Failed to open directory picker: {error}")),
    }

    let mut kdialog = Command::new("kdialog");
    kdialog.arg("--getexistingdirectory");
    if let Some(directory) = directory.as_ref() {
        kdialog.arg(directory);
    }

    match kdialog.output() {
        Ok(output) => {
            if output.status.success() {
                Ok(trim_non_empty(Some(trim_command_text(&output.stdout))))
            } else if output.status.code() == Some(1) {
                Ok(None)
            } else {
                let stderr = trim_command_text(&output.stderr);
                Err(if stderr.is_empty() {
                    "Failed to open directory picker".to_string()
                } else {
                    format!("Failed to open directory picker: {stderr}")
                })
            }
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            Err("Directory picker is unavailable on Linux. Install zenity or kdialog.".to_string())
        }
        Err(error) => Err(format!("Failed to open directory picker: {error}")),
    }
}

#[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
fn pick_directory(_directory: Option<String>) -> Result<Option<String>, String> {
    Err("Directory picker is not supported on this platform".to_string())
}

fn get_desktop_game_repo_path(
    config: &DesktopConfig,
    game: &str,
    repo_key: &str,
) -> Result<Option<String>, String> {
    match (game, repo_key) {
        ("hearthstone", "hsdata") => Ok(config
            .games
            .hearthstone
            .as_ref()
            .and_then(|settings| settings.hsdata.as_ref())
            .map(|repo| repo.repo_path.clone())),
        _ => Err(format!(
            "Unsupported desktop repo setting: {game}.{repo_key}"
        )),
    }
}

fn set_desktop_game_repo_path(
    config: &mut DesktopConfig,
    game: &str,
    repo_key: &str,
    repo_path: Option<String>,
) -> Result<(), String> {
    match (game, repo_key) {
        ("hearthstone", "hsdata") => {
            if let Some(repo_path) = repo_path {
                let settings = config
                    .games
                    .hearthstone
                    .get_or_insert_with(StoredHearthstoneSettings::default);
                settings.hsdata = Some(StoredRepoPath { repo_path });
            } else if let Some(settings) = config.games.hearthstone.as_mut() {
                settings.hsdata = None;

                if settings.is_empty() {
                    config.games.hearthstone = None;
                }
            }

            Ok(())
        }
        _ => Err(format!(
            "Unsupported desktop repo setting: {game}.{repo_key}"
        )),
    }
}

fn load_desktop_game_repo_path(
    app: &AppHandle,
    game: &str,
    repo_key: &str,
) -> Result<Option<String>, String> {
    let config = load_desktop_config(app)?;
    get_desktop_game_repo_path(&config, game, repo_key)
}

fn trim_git_output(output: String) -> String {
    output.trim().to_string()
}

fn run_git(repo_path: &str, args: &[&str]) -> Result<String, String> {
    let output = Command::new("git")
        .current_dir(repo_path)
        .args(args)
        .output()
        .map_err(|error| format!("Failed to run git {:?}: {error}", args))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        let message = if stderr.is_empty() {
            format!("git {:?} exited with status {}", args, output.status)
        } else {
            stderr
        };

        return Err(message);
    }

    String::from_utf8(output.stdout)
        .map_err(|error| format!("Failed to decode git output: {error}"))
}

fn run_git_with_input(repo_path: &str, args: &[&str], input: &str) -> Result<String, String> {
    let mut child = Command::new("git")
        .current_dir(repo_path)
        .args(args)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| format!("Failed to run git {:?}: {error}", args))?;

    {
        let Some(stdin) = child.stdin.as_mut() else {
            return Err("Failed to open git stdin".to_string());
        };

        stdin
            .write_all(input.as_bytes())
            .map_err(|error| format!("Failed to write git stdin: {error}"))?;
    }

    let output = child
        .wait_with_output()
        .map_err(|error| format!("Failed to wait for git {:?}: {error}", args))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        let message = if stderr.is_empty() {
            format!("git {:?} exited with status {}", args, output.status)
        } else {
            stderr
        };

        return Err(message);
    }

    String::from_utf8(output.stdout)
        .map_err(|error| format!("Failed to decode git output: {error}"))
}

fn resolve_repo_root(repo_path: &str) -> Result<String, String> {
    let canonical = fs::canonicalize(repo_path)
        .map_err(|error| format!("Failed to access repo path: {error}"))?;
    let canonical = canonical.to_string_lossy().to_string();
    let root = trim_git_output(run_git(&canonical, &["rev-parse", "--show-toplevel"])?);

    if root.is_empty() {
        return Err("Failed to resolve hsdata repo root".to_string());
    }

    let card_defs = Path::new(&root).join("CardDefs.xml");
    if !card_defs.exists() {
        return Err("CardDefs.xml was not found in the configured hsdata repo".to_string());
    }

    Ok(root)
}

fn resolve_saved_repo_path(app: &AppHandle) -> Result<String, String> {
    let repo_path = load_desktop_game_repo_path(app, "hearthstone", "hsdata")?
        .ok_or_else(|| "Local hsdata repo is not configured".to_string())?;

    resolve_repo_root(&repo_path)
}

fn resolve_hsdata_sync_repo(app: &AppHandle) -> Result<(String, &'static str), String> {
    let repo_path = resolve_saved_repo_path(app)?;
    Ok((repo_path, HSDATA_REMOTE_NAME))
}

fn sync_hsdata_remote_versions(repo_path: &str, remote: &str) -> Result<HsdataSyncResult, String> {
    run_git(repo_path, &["fetch", "--prune", "--tags", remote])?;

    Ok(HsdataSyncResult {
        repo_path: repo_path.to_string(),
        remote: remote.to_string(),
    })
}

fn short_commit(commit: &str) -> String {
    commit.chars().take(7).collect()
}

fn tag_ref_name(tag: &str) -> String {
    format!("refs/tags/{tag}")
}

fn parse_carddefs_build(xml: &str) -> Result<u32, String> {
    let start = xml
        .find("<CardDefs")
        .ok_or_else(|| "Failed to locate CardDefs root element".to_string())?;
    let remaining = &xml[start..];
    let end = remaining
        .find('>')
        .ok_or_else(|| "Failed to parse CardDefs root element".to_string())?;
    let root = &remaining[..end];
    let marker = "build=\"";
    let build_start = root
        .find(marker)
        .ok_or_else(|| "Missing CardDefs.build attribute".to_string())?;
    let build_value = &root[build_start + marker.len()..];
    let build_end = build_value
        .find('"')
        .ok_or_else(|| "Failed to parse CardDefs.build attribute".to_string())?;

    build_value[..build_end]
        .parse::<u32>()
        .map_err(|error| format!("Invalid CardDefs.build value: {error}"))
}

fn worktree_carddefs_path(repo_path: &str) -> PathBuf {
    Path::new(repo_path).join("CardDefs.xml")
}

fn read_worktree_xml(repo_path: &str) -> Result<String, String> {
    fs::read_to_string(worktree_carddefs_path(repo_path))
        .map_err(|error| format!("Failed to read CardDefs.xml from worktree: {error}"))
}

fn worktree_time(repo_path: &str) -> Result<Option<String>, String> {
    let time = trim_git_output(run_git(repo_path, &["log", "-1", "--format=%cI", "HEAD"])?);
    Ok((!time.is_empty()).then_some(time))
}

fn build_source_uri(reference: &str) -> String {
    format!("git+local://hsdata?ref={reference}&path=CardDefs.xml")
}

fn read_worktree_source(repo_path: &str) -> Result<HsdataResolvedSource, String> {
    let xml = read_worktree_xml(repo_path)?;
    let source_tag = parse_carddefs_build(&xml)?;
    let source_commit = trim_git_output(run_git(repo_path, &["rev-parse", "HEAD"])?);
    let metadata = fs::metadata(worktree_carddefs_path(repo_path))
        .map_err(|error| format!("Failed to stat CardDefs.xml: {error}"))?;

    Ok(HsdataResolvedSource {
        id: "worktree".to_string(),
        name: "worktree".to_string(),
        kind: "worktree".to_string(),
        size: metadata.len(),
        time: worktree_time(repo_path)?,
        xml,
        source_tag,
        source_commit: source_commit.clone(),
        short_commit: short_commit(&source_commit),
        source_uri: build_source_uri("worktree"),
    })
}

fn read_tag_source(repo_path: &str, tag: &str) -> Result<HsdataResolvedSource, String> {
    let tag_ref = tag_ref_name(tag);
    let object = format!("{tag_ref}:CardDefs.xml");
    let xml = run_git(repo_path, &["show", &object])?;
    let source_tag = parse_carddefs_build(&xml)?;
    let source_commit = trim_git_output(run_git(repo_path, &["rev-list", "-n", "1", &tag_ref])?);
    let size = trim_git_output(run_git(repo_path, &["cat-file", "-s", &object])?)
        .parse::<u64>()
        .map_err(|error| format!("Failed to parse git object size: {error}"))?;
    let time = trim_git_output(run_git(
        repo_path,
        &["log", "-1", "--format=%cI", &tag_ref],
    )?);

    Ok(HsdataResolvedSource {
        id: format!("tag:{tag}"),
        name: tag.to_string(),
        kind: "tag".to_string(),
        size,
        time: (!time.is_empty()).then_some(time),
        xml,
        source_tag,
        source_commit: source_commit.clone(),
        short_commit: short_commit(&source_commit),
        source_uri: build_source_uri(&format!("tag:{tag}")),
    })
}

fn resolve_hsdata_source(repo_path: &str, id: &str) -> Result<HsdataResolvedSource, String> {
    if id == "worktree" {
        return read_worktree_source(repo_path);
    }

    let tag = id
        .strip_prefix("tag:")
        .ok_or_else(|| format!("Unsupported hsdata source id: {id}"))?;

    read_tag_source(repo_path, tag)
}

struct HsdataTagRefMeta {
    tag_ref: String,
    tag: String,
    time: Option<String>,
    source_commit: String,
}

struct HsdataBlobCheck {
    size: Option<u64>,
}

fn parse_tag_ref_meta(line: &str) -> Option<HsdataTagRefMeta> {
    let mut parts = line.splitn(5, '\t');
    let tag_ref = parts.next()?.trim();
    let tag = parts.next()?.trim();
    let object_name = parts.next()?.trim();
    let peeled_object_name = parts.next()?.trim();
    let time = parts
        .next()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string);

    if tag_ref.is_empty() || tag.is_empty() {
        return None;
    }

    let source_commit = if !peeled_object_name.is_empty() {
        peeled_object_name.to_string()
    } else if !object_name.is_empty() {
        object_name.to_string()
    } else {
        return None;
    };

    Some(HsdataTagRefMeta {
        tag_ref: tag_ref.to_string(),
        tag: tag.to_string(),
        time,
        source_commit,
    })
}

fn parse_blob_check_line(line: &str) -> Result<HsdataBlobCheck, String> {
    let trimmed = line.trim();

    if trimmed.is_empty() {
        return Err("Missing git cat-file batch output".to_string());
    }

    if trimmed.ends_with(" missing") {
        return Ok(HsdataBlobCheck { size: None });
    }

    let mut parts = trimmed.split_whitespace();
    let _object_name = parts
        .next()
        .ok_or_else(|| format!("Invalid git cat-file batch output: {trimmed}"))?;
    let object_type = parts
        .next()
        .ok_or_else(|| format!("Invalid git cat-file batch output: {trimmed}"))?;
    let object_size = parts
        .next()
        .ok_or_else(|| format!("Invalid git cat-file batch output: {trimmed}"))?;

    if object_type != "blob" {
        return Err(format!(
            "Expected blob for hsdata source, got {object_type}: {trimmed}"
        ));
    }

    let size = object_size
        .parse::<u64>()
        .map_err(|error| format!("Failed to parse git object size: {error}"))?;

    Ok(HsdataBlobCheck { size: Some(size) })
}

fn parse_numeric_tag(tag: &str) -> Option<u32> {
    tag.parse::<u32>().ok()
}

fn list_hsdata_sources(repo_path: &str) -> Result<Vec<HsdataSourceEntry>, String> {
    let tags = run_git(
        repo_path,
        &[
            "for-each-ref",
            "--format=%(refname)\t%(refname:short)\t%(objectname)\t%(*objectname)\t%(creatordate:iso-strict)",
            "refs/tags",
        ],
    )?;
    let mut tag_refs = Vec::new();
    for line in tags.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }

        if let Some(tag_ref) = parse_tag_ref_meta(trimmed) {
            tag_refs.push(tag_ref);
        }
    }

    tag_refs.sort_by(|left, right| {
        match (parse_numeric_tag(&left.tag), parse_numeric_tag(&right.tag)) {
            (Some(left_num), Some(right_num)) => right_num
                .cmp(&left_num)
                .then_with(|| right.tag.cmp(&left.tag)),
            (Some(_), None) => std::cmp::Ordering::Less,
            (None, Some(_)) => std::cmp::Ordering::Greater,
            (None, None) => left.tag.cmp(&right.tag),
        }
    });

    let mut sources = Vec::new();

    if !tag_refs.is_empty() {
        let batch_input = tag_refs
            .iter()
            .map(|tag_ref| format!("{}:CardDefs.xml\n", tag_ref.tag_ref))
            .collect::<String>();
        let batch_output =
            run_git_with_input(repo_path, &["cat-file", "--batch-check"], &batch_input)?;

        let blob_checks = batch_output
            .lines()
            .map(parse_blob_check_line)
            .collect::<Result<Vec<_>, _>>()?;

        if blob_checks.len() != tag_refs.len() {
            return Err(format!(
                "Unexpected git cat-file batch output count: expected {}, got {}",
                tag_refs.len(),
                blob_checks.len()
            ));
        }

        for (tag_ref, blob_check) in tag_refs.into_iter().zip(blob_checks.into_iter()) {
            let Some(size) = blob_check.size else {
                continue;
            };

            sources.push(HsdataSourceEntry {
                id: format!("tag:{}", tag_ref.tag),
                name: tag_ref.tag.clone(),
                kind: "tag".to_string(),
                size,
                time: tag_ref.time,
                source_tag: parse_numeric_tag(&tag_ref.tag),
                source_commit: tag_ref.source_commit.clone(),
                short_commit: short_commit(&tag_ref.source_commit),
                source_uri: build_source_uri(&format!("tag:{}", tag_ref.tag)),
            });
        }
    }

    Ok(sources)
}

fn get_hsdata_repo_state(app: &AppHandle) -> Result<HsdataRepoState, String> {
    let repo_path = match load_desktop_game_repo_path(app, "hearthstone", "hsdata")? {
        Some(repo_path) => Some(resolve_repo_root(&repo_path)?),
        None => None,
    };

    Ok(HsdataRepoState { repo_path })
}

/// Session client resolved from memory or persisted desktop state.
fn require_session_client(
    app: &AppHandle,
    state: &tauri::State<'_, AuthState>,
) -> Result<SessionClient, String> {
    {
        let current = state
            .current
            .lock()
            .map_err(|_| "Failed to read auth state".to_string())?;

        if let Some(session_client) = current.as_ref() {
            return Ok(session_client.clone());
        }
    }

    let session_client =
        restore_session_client(app)?.ok_or_else(|| "Auth session is unavailable".to_string())?;

    let mut current = state
        .current
        .lock()
        .map_err(|_| "Failed to update auth state".to_string())?;
    *current = Some(session_client.clone());

    Ok(session_client)
}

/// hsdata import resume file path for one sourceTag.
fn hsdata_import_job_file(app: &AppHandle, source_tag: u32) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Failed to resolve app data directory: {error}"))?;

    Ok(dir.join(format!("hsdata-import-job-{source_tag}.json")))
}

/// Stored hsdata import job loaded from the desktop resume file.
fn load_stored_hsdata_import_job(
    app: &AppHandle,
    source_tag: u32,
) -> Result<Option<StoredHsdataImportJob>, String> {
    let path = hsdata_import_job_file(app, source_tag)?;

    if !path.exists() {
        return Ok(None);
    }

    let text = fs::read_to_string(&path)
        .map_err(|error| format!("Failed to read hsdata import job state: {error}"))?;

    let stored = serde_json::from_str::<StoredHsdataImportJob>(&text)
        .map_err(|error| format!("Failed to decode hsdata import job state: {error}"))?;

    Ok(Some(stored))
}

/// Stored hsdata import job written to the desktop resume file.
fn store_hsdata_import_job(
    app: &AppHandle,
    source_tag: u32,
    job: &StoredHsdataImportJob,
) -> Result<(), String> {
    let path = hsdata_import_job_file(app, source_tag)?;
    let Some(parent) = path.parent() else {
        return Err("Failed to resolve hsdata import job directory".to_string());
    };

    fs::create_dir_all(parent)
        .map_err(|error| format!("Failed to create hsdata import job directory: {error}"))?;

    let text = serde_json::to_string(job)
        .map_err(|error| format!("Failed to encode hsdata import job state: {error}"))?;

    fs::write(path, text)
        .map_err(|error| format!("Failed to write hsdata import job state: {error}"))?;

    Ok(())
}

/// Stored hsdata import job removed from the desktop resume file.
fn clear_hsdata_import_job(app: &AppHandle, source_tag: u32) -> Result<(), String> {
    let path = hsdata_import_job_file(app, source_tag)?;

    if path.exists() {
        fs::remove_file(path)
            .map_err(|error| format!("Failed to remove hsdata import job state: {error}"))?;
    }

    Ok(())
}

/// Best-effort cleanup for the desktop resume file after terminal job states.
fn clear_hsdata_import_job_quietly(app: &AppHandle, source_tag: u32) {
    if let Err(error) = clear_hsdata_import_job(app, source_tag) {
        eprintln!("[hearthstone][hsdata-import] failed to clear local job state: {error}");
    }
}

/// Resolved local hsdata source prepared as chunked upload payloads.
fn prepare_hsdata_import_source(
    source: HsdataResolvedSource,
    resolve_source_ms: u128,
    dbf_id_by_card_id: &HashMap<String, u32>,
) -> Result<HsdataPreparedImportResult, String> {
    let prepare_payload_started_at = Instant::now();
    let HsdataPreparedPayloadResult {
        payload:
            HsdataPreparedPayload {
                build,
                source_hash,
                payload_format_version,
                payload_encoding,
                import_engine_version,
                total_entity_count,
                chunks,
            },
        profile: payload_profile,
    } = prepare_hsdata_payload_profiled_with_dbf_ids(
        &source.xml,
        HSDATA_MAX_BYTES_PER_CHUNK,
        HSDATA_MAX_ENTITIES_PER_CHUNK,
        dbf_id_by_card_id,
    )?;
    let prepare_payload_ms = elapsed_millis(&prepare_payload_started_at);

    Ok(HsdataPreparedImportResult {
        prepared: HsdataPreparedImport {
            source_id: source.id,
            source_kind: source.kind,
            source_size_bytes: source.size,
            source_tag: source.source_tag,
            build,
            source_commit: source.source_commit,
            source_uri: source.source_uri,
            source_hash,
            payload_format_version,
            payload_encoding,
            import_engine_version,
            total_entity_count,
            chunks,
        },
        profile: HsdataPreparedImportProfile {
            resolve_source_ms,
            prepare_payload_ms,
            total_ms: resolve_source_ms + prepare_payload_ms,
            payload: payload_profile,
        },
    })
}

/// Remote import job compatibility check against the current desktop manifest.
fn matches_stored_hsdata_import_job(
    stored: &StoredHsdataImportJob,
    prepared: &HsdataPreparedImport,
    dry_run: bool,
    force: bool,
) -> bool {
    stored.source_id == prepared.source_id
        && stored.source_tag == prepared.source_tag
        && stored.source_hash == prepared.source_hash
        && stored.chunking_version == HSDATA_CHUNKING_VERSION
        && stored.payload_format_version == prepared.payload_format_version
        && stored.payload_encoding == prepared.payload_encoding
        && stored.import_engine_version == prepared.import_engine_version
        && stored.max_bytes_per_chunk == HSDATA_MAX_BYTES_PER_CHUNK as u32
        && stored.max_entities_per_chunk == HSDATA_MAX_ENTITIES_PER_CHUNK as u32
        && stored.total_chunk_count == prepared.chunks.len() as u32
        && stored.total_entity_count == prepared.total_entity_count
        && stored.dry_run == dry_run
        && stored.force == force
}

/// JSON RPC GET call against the authenticated internal console API.
async fn rpc_get_json<TInput, TOutput>(
    session_client: &SessionClient,
    path: &str,
    input: &TInput,
) -> Result<TOutput, String>
where
    TInput: Serialize + ?Sized,
    TOutput: DeserializeOwned,
{
    let mut url = Url::parse(&build_url(&session_client.base_url, path))
        .map_err(|error| format!("Failed to parse RPC URL: {error}"))?;
    let data = serde_json::to_string(&orpc_json(input))
        .map_err(|error| format!("Failed to encode RPC query: {error}"))?;
    url.query_pairs_mut().append_pair("data", &data);

    let response = session_client
        .client
        .get(url)
        .header(reqwest::header::ACCEPT, "application/json")
        .send()
        .await
        .map_err(|error| format!("Failed to send RPC request: {error}"))?;

    if !response.status().is_success() {
        return Err(parse_error(response).await);
    }

    response
        .json::<OrpcJsonEnvelope<TOutput>>()
        .await
        .map(|envelope| envelope.json)
        .map_err(|error| format!("Failed to decode RPC response: {error}"))
}

/// JSON RPC POST call against the authenticated internal console API.
async fn rpc_post_json<TInput, TOutput>(
    session_client: &SessionClient,
    path: &str,
    input: &TInput,
) -> Result<TOutput, String>
where
    TInput: Serialize + ?Sized,
    TOutput: DeserializeOwned,
{
    let url = build_url(&session_client.base_url, path);
    let response = session_client
        .client
        .post(url)
        .header(reqwest::header::ACCEPT, "application/json")
        .json(&orpc_json(input))
        .send()
        .await
        .map_err(|error| format!("Failed to send RPC request: {error}"))?;

    if !response.status().is_success() {
        return Err(parse_error(response).await);
    }

    response
        .json::<OrpcJsonEnvelope<TOutput>>()
        .await
        .map(|envelope| envelope.json)
        .map_err(|error| format!("Failed to decode RPC response: {error}"))
}

/// Remote hsdata import job state fetched by jobId.
async fn get_remote_hsdata_import_job(
    session_client: &SessionClient,
    job_id: &str,
) -> Result<HsdataImportJobState, String> {
    rpc_get_json(
        session_client,
        HSDATA_GET_IMPORT_JOB_PATH,
        &HsdataImportJobInput {
            job_id: job_id.to_string(),
        },
    )
    .await
}

/// Remote hsdata import job created from the desktop chunk manifest.
async fn create_remote_hsdata_import_job(
    session_client: &SessionClient,
    prepared: &HsdataPreparedImport,
    dry_run: bool,
    force: bool,
) -> Result<HsdataCreateImportJobResult, String> {
    let manifest = HsdataCreateImportJobInput {
        source_tag: prepared.source_tag,
        source_commit: prepared.source_commit.clone(),
        source_uri: prepared.source_uri.clone(),
        build: prepared.build,
        source_hash: prepared.source_hash.clone(),
        chunking_version: HSDATA_CHUNKING_VERSION.to_string(),
        payload_format_version: prepared.payload_format_version.clone(),
        payload_encoding: prepared.payload_encoding.clone(),
        import_engine_version: prepared.import_engine_version.clone(),
        max_bytes_per_chunk: HSDATA_MAX_BYTES_PER_CHUNK as u32,
        max_entities_per_chunk: HSDATA_MAX_ENTITIES_PER_CHUNK as u32,
        dry_run,
        force,
        total_chunk_count: prepared.chunks.len() as u32,
        total_entity_count: prepared.total_entity_count,
        chunks: prepared
            .chunks
            .iter()
            .map(|chunk| HsdataImportChunkManifestItem {
                chunk_index: chunk.chunk_index,
                payload_hash: chunk.payload_hash.clone(),
                entity_count: chunk.entity_count,
            })
            .collect(),
    };

    rpc_post_json(session_client, HSDATA_CREATE_IMPORT_JOB_PATH, &manifest).await
}

/// Local legacy cardId fallback mappings resolved from the git-tracked Rust table.
fn resolve_local_hsdata_card_dbf_ids(card_ids: Vec<String>) -> HashMap<String, u32> {
    card_ids
        .into_iter()
        .filter_map(|card_id| {
            get_legacy_hsdata_dbf_id(&card_id).map(|dbf_id| (card_id, dbf_id))
        })
        .collect()
}

/// Gzip-compressed NDJSON payload encoded for the raw upload endpoint.
fn compress_gzip_payload(payload: &str) -> Result<Vec<u8>, String> {
    let mut encoder = GzEncoder::new(Vec::new(), Compression::default());
    encoder
        .write_all(payload.as_bytes())
        .map_err(|error| format!("Failed to gzip hsdata payload: {error}"))?;
    encoder
        .finish()
        .map_err(|error| format!("Failed to finish hsdata payload gzip stream: {error}"))
}

/// One gzip-compressed NDJSON chunk uploaded to the remote staging job.
async fn upload_remote_hsdata_chunk(
    session_client: &SessionClient,
    job_id: &str,
    chunk: &HsdataPreparedPayloadChunk,
) -> Result<HsdataUploadImportChunkResult, String> {
    let compressed_payload = compress_gzip_payload(&chunk.ndjson)?;
    let mut url = Url::parse(&build_url(
        &session_client.base_url,
        HSDATA_UPLOAD_IMPORT_CHUNK_PATH,
    ))
    .map_err(|error| format!("Failed to parse hsdata upload URL: {error}"))?;
    url.query_pairs_mut()
        .append_pair("jobId", job_id)
        .append_pair("chunkIndex", &chunk.chunk_index.to_string());

    let response = session_client
        .client
        .post(url)
        .header(reqwest::header::ACCEPT, "application/json")
        .header(
            reqwest::header::CONTENT_TYPE,
            HSDATA_UPLOAD_IMPORT_CHUNK_CONTENT_TYPE,
        )
        .header(
            reqwest::header::CONTENT_ENCODING,
            HSDATA_UPLOAD_IMPORT_CHUNK_CONTENT_ENCODING,
        )
        .header(
            HSDATA_UPLOAD_IMPORT_CHUNK_PAYLOAD_HASH_HEADER,
            &chunk.payload_hash,
        )
        .header(
            HSDATA_UPLOAD_IMPORT_CHUNK_ENTITY_COUNT_HEADER,
            chunk.entity_count.to_string(),
        )
        .body(compressed_payload)
        .send()
        .await
        .map_err(|error| format!("Failed to send hsdata upload request: {error}"))?;

    if !response.status().is_success() {
        return Err(parse_error(response).await);
    }

    response
        .json::<HsdataUploadImportChunkResult>()
        .await
        .map_err(|error| format!("Failed to decode hsdata upload response: {error}"))
}

/// Remote hsdata import job finalized into the raw archive tables.
async fn finalize_remote_hsdata_import_job(
    session_client: &SessionClient,
    job_id: &str,
) -> Result<HsdataImportReport, String> {
    rpc_post_json(
        session_client,
        HSDATA_FINALIZE_IMPORT_JOB_PATH,
        &HsdataImportJobInput {
            job_id: job_id.to_string(),
        },
    )
    .await
}

/// Local resume decision for one hsdata import job.
enum HsdataImportJobResolution {
    Completed(HsdataImportReport),
    Pending {
        job_id: String,
        state: Option<HsdataImportJobState>,
    },
}

/// Remote NOT_FOUND error detection for stale desktop resume state.
fn is_remote_not_found_error(message: &str) -> bool {
    message.starts_with("NOT_FOUND:")
}

/// Active hsdata import job chosen from local resume state or remote job creation.
async fn ensure_hsdata_import_job(
    app: &AppHandle,
    session_client: &SessionClient,
    prepared: &HsdataPreparedImport,
    dry_run: bool,
    force: bool,
) -> Result<HsdataImportJobResolution, String> {
    if let Some(stored) = load_stored_hsdata_import_job(app, prepared.source_tag)? {
        if matches_stored_hsdata_import_job(&stored, prepared, dry_run, force) {
            let state = match get_remote_hsdata_import_job(session_client, &stored.job_id).await {
                Ok(state) => state,
                Err(error) if is_remote_not_found_error(&error) => {
                    clear_hsdata_import_job(app, prepared.source_tag)?;
                    let created =
                        create_remote_hsdata_import_job(session_client, prepared, dry_run, force)
                            .await?;

                    store_hsdata_import_job(
                        app,
                        prepared.source_tag,
                        &StoredHsdataImportJob {
                            job_id: created.job_id.clone(),
                            source_id: prepared.source_id.clone(),
                            source_tag: prepared.source_tag,
                            source_hash: prepared.source_hash.clone(),
                            chunking_version: HSDATA_CHUNKING_VERSION.to_string(),
                            payload_format_version: prepared.payload_format_version.clone(),
                            payload_encoding: prepared.payload_encoding.clone(),
                            import_engine_version: prepared.import_engine_version.clone(),
                            max_bytes_per_chunk: HSDATA_MAX_BYTES_PER_CHUNK as u32,
                            max_entities_per_chunk: HSDATA_MAX_ENTITIES_PER_CHUNK as u32,
                            total_chunk_count: prepared.chunks.len() as u32,
                            total_entity_count: prepared.total_entity_count,
                            dry_run,
                            force,
                        },
                    )?;

                    return Ok(HsdataImportJobResolution::Pending {
                        job_id: created.job_id,
                        state: None,
                    });
                }
                Err(error) => return Err(error),
            };

            if state.status == "completed" {
                if let Some(report) = state.report.clone() {
                    clear_hsdata_import_job_quietly(app, prepared.source_tag);
                    return Ok(HsdataImportJobResolution::Completed(report));
                }

                clear_hsdata_import_job_quietly(app, prepared.source_tag);
                return Err(format!(
                    "hsdata import job {} completed without a report",
                    stored.job_id
                ));
            }

            if state.status != "failed" {
                return Ok(HsdataImportJobResolution::Pending {
                    job_id: stored.job_id,
                    state: Some(state),
                });
            }
        }

        clear_hsdata_import_job(app, prepared.source_tag)?;
    }

    let created = create_remote_hsdata_import_job(session_client, prepared, dry_run, force).await?;

    // The desktop side persists only job identity and manifest invariants. Completed chunks are
    // idempotent on the server, so resume does not need to maintain its own per-chunk ledger.
    store_hsdata_import_job(
        app,
        prepared.source_tag,
        &StoredHsdataImportJob {
            job_id: created.job_id.clone(),
            source_id: prepared.source_id.clone(),
            source_tag: prepared.source_tag,
            source_hash: prepared.source_hash.clone(),
            chunking_version: HSDATA_CHUNKING_VERSION.to_string(),
            payload_format_version: prepared.payload_format_version.clone(),
            payload_encoding: prepared.payload_encoding.clone(),
            import_engine_version: prepared.import_engine_version.clone(),
            max_bytes_per_chunk: HSDATA_MAX_BYTES_PER_CHUNK as u32,
            max_entities_per_chunk: HSDATA_MAX_ENTITIES_PER_CHUNK as u32,
            total_chunk_count: prepared.chunks.len() as u32,
            total_entity_count: prepared.total_entity_count,
            dry_run,
            force,
        },
    )?;

    Ok(HsdataImportJobResolution::Pending {
        job_id: created.job_id,
        state: None,
    })
}

/// Chunk upload fan-out with a fixed number of concurrent Worker requests.
async fn upload_hsdata_chunks(
    app: &AppHandle,
    session_client: &SessionClient,
    source_id: &str,
    source_tag: u32,
    job_id: &str,
    total_entity_count: u32,
    initial_completed_chunk_count: u32,
    chunks: &[HsdataPreparedPayloadChunk],
) -> Result<(), String> {
    let upload_started_at = Instant::now();
    emit_hsdata_import_progress(
        app,
        HsdataImportProgressEvent {
            source_id: source_id.to_string(),
            source_tag: Some(source_tag),
            job_id: Some(job_id.to_string()),
            phase: "uploading".to_string(),
            message: "Uploading hsdata payload chunks".to_string(),
            total_chunk_count: Some(chunks.len() as u32),
            completed_chunk_count: Some(initial_completed_chunk_count),
            total_entity_count: Some(total_entity_count),
            current_chunk_index: None,
        },
    );

    for (batch_index, batch) in chunks.chunks(HSDATA_UPLOAD_CONCURRENCY).enumerate() {
        let batch_started_at = Instant::now();
        let mut handles = Vec::with_capacity(batch.len());
        let batch_entity_count = batch.iter().map(|chunk| chunk.entity_count).sum::<u32>();

        for chunk in batch {
            let session_client = session_client.clone();
            let job_id = job_id.to_string();
            let chunk = chunk.clone();

            handles.push(tauri::async_runtime::spawn(async move {
                upload_remote_hsdata_chunk(&session_client, &job_id, &chunk)
                    .await
                    .map(|result| (chunk.chunk_index, result))
                    .map_err(|error| format!("Chunk {} upload failed: {error}", chunk.chunk_index))
            }));
        }

        let mut batch_completed_chunk_count = initial_completed_chunk_count;

        for handle in handles {
            let (chunk_index, result) = handle
                .await
                .map_err(|error| format!("Failed to join hsdata upload task: {error}"))??;

            emit_hsdata_import_progress(
                app,
                HsdataImportProgressEvent {
                    source_id: source_id.to_string(),
                    source_tag: Some(source_tag),
                    job_id: Some(job_id.to_string()),
                    phase: result.job_status.clone(),
                    message: format!(
                        "Uploaded payload chunk {} ({})",
                        chunk_index + 1,
                        result.chunk_status
                    ),
                    total_chunk_count: Some(result.total_chunk_count),
                    completed_chunk_count: Some(result.completed_chunk_count),
                    total_entity_count: Some(total_entity_count),
                    current_chunk_index: Some(chunk_index),
                },
            );
            batch_completed_chunk_count = result.completed_chunk_count;
        }

        log_hsdata_import_profile(
            "upload_chunk_batch",
            serde_json::json!({
                "sourceTag": source_tag,
                "jobId": job_id,
                "batchIndex": batch_index,
                "batchChunkCount": batch.len(),
                "batchEntityCount": batch_entity_count,
                "completedChunkCount": batch_completed_chunk_count,
                "elapsedMs": elapsed_millis(&batch_started_at),
            }),
        );
    }

    log_hsdata_import_profile(
        "upload_chunks",
        serde_json::json!({
            "sourceTag": source_tag,
            "jobId": job_id,
            "chunkCount": chunks.len(),
            "totalEntityCount": total_entity_count,
            "elapsedMs": elapsed_millis(&upload_started_at),
        }),
    );

    Ok(())
}

/// Final import report extracted from a completed remote job state.
fn completed_hsdata_import_report(
    state: HsdataImportJobState,
) -> Result<HsdataImportReport, String> {
    state.report.ok_or_else(|| {
        format!(
            "hsdata import job {} completed without a report",
            state.job_id
        )
    })
}

/// hsdata import progress event emitted to the desktop window.
fn emit_hsdata_import_progress(app: &AppHandle, event: HsdataImportProgressEvent) {
    if let Err(error) = app.emit(HSDATA_IMPORT_PROGRESS_EVENT, event) {
        eprintln!("[hearthstone][hsdata-import] failed to emit progress event: {error}");
    }
}

async fn parse_error(response: reqwest::Response) -> String {
    let status = response.status();
    let text = response.text().await.unwrap_or_default();

    if let Ok(body) = serde_json::from_str::<OrpcJsonEnvelope<ApiErrorBody>>(&text) {
        if let Some(message) = format_api_error(body.json) {
            return message;
        }
    }

    if let Ok(body) = serde_json::from_str::<ApiErrorBody>(&text) {
        if let Some(message) = format_api_error(body) {
            return message;
        }
    }

    if text.is_empty() {
        format!("Request failed with status {status}")
    } else {
        format!("Request failed with status {status}: {text}")
    }
}

async fn fetch_session(session_client: &SessionClient) -> Result<Option<DesktopAuthState>, String> {
    let url = build_url(&session_client.base_url, "/auth/get-session");
    let response = session_client
        .client
        .get(&url)
        .header(reqwest::header::ACCEPT, "application/json")
        .send()
        .await
        .map_err(|error| format!("Failed to fetch session: {error}"))?;

    if !response.status().is_success() {
        return Err(parse_error(response).await);
    }

    let session = response
        .json::<Option<RemoteAuthState>>()
        .await
        .map_err(|error| format!("Failed to decode session: {error}"))?;

    Ok(session.map(build_desktop_auth_state))
}

#[tauri::command]
async fn auth_sign_in(
    app: AppHandle,
    state: tauri::State<'_, AuthState>,
    username: String,
    password: String,
) -> Result<DesktopAuthState, String> {
    let base_url = resolve_auth_base_url();
    let session_client = create_client(&base_url, None)?;
    let url = build_url(&base_url, "/auth/sign-in/username");

    let response = session_client
        .client
        .post(&url)
        .header(reqwest::header::ACCEPT, "application/json")
        .json(&serde_json::json!({
            "username": username,
            "password": password,
        }))
        .send()
        .await
        .map_err(|error| format!("Failed to sign in: {error}"))?;

    if !response.status().is_success() {
        return Err(parse_error(response).await);
    }

    let session = fetch_session(&session_client)
        .await?
        .ok_or_else(|| "Sign in succeeded but no session was returned".to_string())?;

    store_session(&app, &session_client)?;

    let mut current = state
        .current
        .lock()
        .map_err(|_| "Failed to update auth state".to_string())?;

    *current = Some(session_client);

    Ok(session)
}

#[tauri::command]
async fn auth_get_session(
    app: AppHandle,
    state: tauri::State<'_, AuthState>,
) -> Result<Option<DesktopAuthState>, String> {
    let session_client = {
        let current = state
            .current
            .lock()
            .map_err(|_| "Failed to read auth state".to_string())?;

        current.clone()
    };

    let Some(session_client) = (match session_client {
        Some(current) => Some(current),
        None => restore_session_client(&app)?,
    }) else {
        return Ok(None);
    };

    let session = fetch_session(&session_client).await?;

    if session.is_some() {
        store_session(&app, &session_client)?;

        let mut current = state
            .current
            .lock()
            .map_err(|_| "Failed to update auth state".to_string())?;

        *current = Some(session_client);
    } else {
        let mut current = state
            .current
            .lock()
            .map_err(|_| "Failed to clear auth state".to_string())?;

        *current = None;
        clear_stored_session(&app)?;
    }

    Ok(session)
}

#[tauri::command]
async fn auth_sign_out(app: AppHandle, state: tauri::State<'_, AuthState>) -> Result<(), String> {
    let session_client = {
        let current = state
            .current
            .lock()
            .map_err(|_| "Failed to read auth state".to_string())?;

        let Some(current) = current.as_ref() else {
            clear_stored_session(&app)?;
            return Ok(());
        };

        current.clone()
    };
    let url = build_url(&session_client.base_url, "/auth/sign-out");

    let response = session_client
        .client
        .post(&url)
        .header(reqwest::header::ACCEPT, "application/json")
        .header(
            reqwest::header::ORIGIN,
            auth_origin_header(&session_client.base_url)?,
        )
        .json(&serde_json::json!({}))
        .send()
        .await
        .map_err(|error| format!("Failed to sign out: {error}"))?;

    if !response.status().is_success() {
        return Err(parse_error(response).await);
    }

    let mut current = state
        .current
        .lock()
        .map_err(|_| "Failed to clear auth state".to_string())?;

    *current = None;
    clear_stored_session(&app)?;

    Ok(())
}

const CREDENTIAL_SERVICE: &str = "tcg-cards-console-desktop";

#[tauri::command]
fn desktop_get_game_repo(
    app: AppHandle,
    game: String,
    repo_key: String,
) -> Result<Option<String>, String> {
    desktop_repo_label(&game, &repo_key)?;
    load_desktop_game_repo_path(&app, &game, &repo_key)
}

#[tauri::command]
fn desktop_set_game_repo(
    app: AppHandle,
    game: String,
    repo_key: String,
    repo_path: Option<String>,
) -> Result<Option<String>, String> {
    desktop_repo_label(&game, &repo_key)?;
    let repo_path = trim_non_empty(repo_path);
    let resolved_repo_path = match repo_path {
        Some(repo_path) => Some(resolve_repo_root(&repo_path)?),
        None => None,
    };
    let mut config = load_desktop_config(&app)?;

    set_desktop_game_repo_path(&mut config, &game, &repo_key, resolved_repo_path.clone())?;
    store_desktop_config(&app, &config)?;

    Ok(resolved_repo_path)
}

#[tauri::command]
fn desktop_pick_directory(directory: Option<String>) -> Result<Option<String>, String> {
    pick_directory(directory)
}

#[tauri::command]
fn hsdata_get_repo_state(app: AppHandle) -> Result<HsdataRepoState, String> {
    get_hsdata_repo_state(&app)
}

#[tauri::command]
fn hsdata_list_sources(app: AppHandle) -> Result<Vec<HsdataSourceEntry>, String> {
    let repo_path = resolve_saved_repo_path(&app)?;
    list_hsdata_sources(&repo_path)
}

#[tauri::command]
fn hsdata_read_source(app: AppHandle, id: String) -> Result<HsdataResolvedSource, String> {
    let repo_path = resolve_saved_repo_path(&app)?;
    resolve_hsdata_source(&repo_path, &id)
}

#[tauri::command]
async fn hsdata_sync_remote_versions(app: AppHandle) -> Result<HsdataSyncResult, String> {
    let (repo_path, remote) = resolve_hsdata_sync_repo(&app)?;

    tauri::async_runtime::spawn_blocking(move || sync_hsdata_remote_versions(&repo_path, remote))
        .await
        .map_err(|error| format!("Failed to join hsdata remote sync task: {error}"))?
}

/// Local hsdata source imported through the staged remote job flow.
#[tauri::command]
async fn hsdata_import_source(
    app: AppHandle,
    state: tauri::State<'_, AuthState>,
    id: String,
    dry_run: bool,
    force: bool,
) -> Result<HsdataImportReport, String> {
    let source_id = id.clone();
    let total_started_at = Instant::now();

    emit_hsdata_import_progress(
        &app,
        HsdataImportProgressEvent {
            source_id: source_id.clone(),
            source_tag: None,
            job_id: None,
            phase: "preparing".to_string(),
            message: "Reading and preparing hsdata payload".to_string(),
            total_chunk_count: None,
            completed_chunk_count: None,
            total_entity_count: None,
            current_chunk_index: None,
        },
    );

    let result = async {
        let repo_path = resolve_saved_repo_path(&app)?;
        let resolve_source_id = source_id.clone();
        let (source, resolve_source_ms) = tauri::async_runtime::spawn_blocking(move || {
            let resolve_source_started_at = Instant::now();
            resolve_hsdata_source(&repo_path, &resolve_source_id)
                .map(|source| (source, elapsed_millis(&resolve_source_started_at)))
        })
        .await
        .map_err(|error| format!("Failed to join hsdata source resolution task: {error}"))??;

        let collect_legacy_dbf_ids_started_at = Instant::now();
        let legacy_scan_xml = source.xml.clone();
        let legacy_card_ids = tauri::async_runtime::spawn_blocking(move || {
            collect_legacy_entity_card_ids(&legacy_scan_xml)
        })
        .await
        .map_err(|error| format!("Failed to join legacy hsdata scan task: {error}"))??;
        let collect_legacy_dbf_ids_ms = elapsed_millis(&collect_legacy_dbf_ids_started_at);
        log_hsdata_import_profile(
            "prepare_source_collect_legacy_dbf_ids",
            serde_json::json!({
                "sourceId": source.id,
                "sourceTag": source.source_tag,
                "legacyEntityCount": legacy_card_ids.len(),
                "elapsedMs": collect_legacy_dbf_ids_ms,
            }),
        );

        let mut dbf_id_by_card_id = HashMap::<String, u32>::new();

        if !legacy_card_ids.is_empty() {
            let resolve_legacy_dbf_ids_started_at = Instant::now();
            dbf_id_by_card_id = resolve_local_hsdata_card_dbf_ids(legacy_card_ids.clone());
            let resolve_legacy_dbf_ids_ms = elapsed_millis(&resolve_legacy_dbf_ids_started_at);

            log_hsdata_import_profile(
                "prepare_source_resolve_legacy_dbf_ids",
                serde_json::json!({
                    "sourceId": source.id,
                    "sourceTag": source.source_tag,
                    "legacyEntityCount": legacy_card_ids.len(),
                    "resolvedEntityCount": dbf_id_by_card_id.len(),
                    "missingEntityCount": legacy_card_ids.len().saturating_sub(dbf_id_by_card_id.len()),
                    "elapsedMs": resolve_legacy_dbf_ids_ms,
                }),
            );
        }

        let HsdataPreparedImportResult {
            prepared,
            profile: prepare_profile,
        } = tauri::async_runtime::spawn_blocking(move || {
            prepare_hsdata_import_source(source, resolve_source_ms, &dbf_id_by_card_id)
        })
        .await
        .map_err(|error| format!("Failed to join hsdata import preparation task: {error}"))??;
        log_hsdata_import_profile(
            "prepare_source_resolve_source",
            serde_json::json!({
                "sourceId": prepared.source_id,
                "sourceKind": prepared.source_kind,
                "sourceSizeBytes": prepared.source_size_bytes,
                "sourceTag": prepared.source_tag,
                "elapsedMs": prepare_profile.resolve_source_ms,
            }),
        );
        log_hsdata_import_profile(
            "prepare_source_normalize_xml",
            serde_json::json!({
                "sourceId": prepared.source_id,
                "sourceTag": prepared.source_tag,
                "normalizedXmlBytes": prepare_profile.payload.normalized_xml_bytes,
                "elapsedMs": prepare_profile.payload.normalize_xml_ms,
            }),
        );
        log_hsdata_import_profile(
            "prepare_source_parse_xml",
            serde_json::json!({
                "sourceId": prepared.source_id,
                "sourceTag": prepared.source_tag,
                "build": prepared.build,
                "totalEntityCount": prepare_profile.payload.total_entity_count,
                "elapsedMs": prepare_profile.payload.parse_xml_ms,
            }),
        );
        log_hsdata_import_profile(
            "prepare_source_parse_xml_decode",
            serde_json::json!({
                "sourceId": prepared.source_id,
                "sourceTag": prepared.source_tag,
                "startEventCount": prepare_profile.payload.parse_xml_profile.start_event_count,
                "emptyEventCount": prepare_profile.payload.parse_xml_profile.empty_event_count,
                "endEventCount": prepare_profile.payload.parse_xml_profile.end_event_count,
                "textEventCount": prepare_profile.payload.parse_xml_profile.text_event_count,
                "cdataEventCount": prepare_profile.payload.parse_xml_profile.cdata_event_count,
                "decodedAttributeCount": prepare_profile.payload.parse_xml_profile.decoded_attribute_count,
                "decodedTextNodeCount": prepare_profile.payload.parse_xml_profile.decoded_text_node_count,
                "decodedTextBytes": prepare_profile.payload.parse_xml_profile.decoded_text_bytes,
                "readEventMs": prepare_profile.payload.parse_xml_profile.read_event_ms,
                "decodeAttributesMs": prepare_profile.payload.parse_xml_profile.decode_attributes_ms,
                "decodeTextMs": prepare_profile.payload.parse_xml_profile.decode_text_ms,
            }),
        );
        log_hsdata_import_profile(
            "prepare_source_parse_xml_normalize_entities",
            serde_json::json!({
                "sourceId": prepared.source_id,
                "sourceTag": prepared.source_tag,
                "parsedEntityCount": prepare_profile.payload.parse_xml_profile.parsed_entity_count,
                "tagCount": prepare_profile.payload.parse_xml_profile.tag_count,
                "locStringTagCount": prepare_profile.payload.parse_xml_profile.loc_string_tag_count,
                "normalizeEntityMs": prepare_profile.payload.parse_xml_profile.normalize_entity_ms,
                "normalizeTagsMs": prepare_profile.payload.parse_xml_profile.normalize_tags_ms,
                "normalizeExtraPayloadMs": prepare_profile.payload.parse_xml_profile.normalize_extra_payload_ms,
                "serializeSnapshotJsonMs": prepare_profile.payload.parse_xml_profile.serialize_snapshot_json_ms,
                "hashSerializedSnapshotMs": prepare_profile.payload.parse_xml_profile.hash_serialized_snapshot_ms,
                "snapshotHashMs": prepare_profile.payload.parse_xml_profile.snapshot_hash_ms,
            }),
        );
        log_hsdata_import_profile(
            "prepare_source_parse_xml_validate_dedupe",
            serde_json::json!({
                "sourceId": prepared.source_id,
                "sourceTag": prepared.source_tag,
                "parsedEntityCount": prepare_profile.payload.parse_xml_profile.parsed_entity_count,
                "dedupedEntityCount": prepare_profile.payload.parse_xml_profile.deduped_entity_count,
                "validateDedupeMs": prepare_profile.payload.parse_xml_profile.validate_dedupe_ms,
                "totalMs": prepare_profile.payload.parse_xml_profile.total_ms,
            }),
        );
        log_hsdata_import_profile(
            "prepare_source_build_chunks",
            serde_json::json!({
                "sourceId": prepared.source_id,
                "sourceTag": prepared.source_tag,
                "chunkCount": prepare_profile.payload.chunk_count,
                "totalEntityCount": prepare_profile.payload.total_entity_count,
                "serializedLineCount": prepare_profile.payload.build_chunks_profile.serialized_line_count,
                "serializedLineBytes": prepare_profile.payload.build_chunks_profile.serialized_line_bytes,
                "materializeLineMs": prepare_profile.payload.build_chunks_profile.materialize_line_ms,
                "updateChunkHashMs": prepare_profile.payload.build_chunks_profile.update_chunk_hash_ms,
                "appendChunkMs": prepare_profile.payload.build_chunks_profile.append_chunk_ms,
                "flushChunkMs": prepare_profile.payload.build_chunks_profile.flush_chunk_ms,
                "elapsedMs": prepare_profile.payload.build_chunks_ms,
            }),
        );
        log_hsdata_import_profile(
            "prepare_source_compute_source_hash",
            serde_json::json!({
                "sourceId": prepared.source_id,
                "sourceTag": prepared.source_tag,
                "normalizedXmlBytes": prepare_profile.payload.normalized_xml_bytes,
                "elapsedMs": prepare_profile.payload.compute_source_hash_ms,
            }),
        );
        log_hsdata_import_profile(
            "prepare_source_prepare_payload",
            serde_json::json!({
                "sourceId": prepared.source_id,
                "sourceTag": prepared.source_tag,
                "build": prepared.build,
                "normalizedXmlBytes": prepare_profile.payload.normalized_xml_bytes,
                "chunkCount": prepare_profile.payload.chunk_count,
                "totalEntityCount": prepare_profile.payload.total_entity_count,
                "elapsedMs": prepare_profile.prepare_payload_ms,
            }),
        );
        log_hsdata_import_profile(
            "prepare_source",
            serde_json::json!({
                "sourceId": prepared.source_id,
                "sourceKind": prepared.source_kind,
                "sourceSizeBytes": prepared.source_size_bytes,
                "sourceTag": prepared.source_tag,
                "build": prepared.build,
                "normalizedXmlBytes": prepare_profile.payload.normalized_xml_bytes,
                "chunkCount": prepared.chunks.len(),
                "totalEntityCount": prepared.total_entity_count,
                "elapsedMs": prepare_profile.total_ms,
            }),
        );
        let session_client = require_session_client(&app, &state)?;

        emit_hsdata_import_progress(
            &app,
            HsdataImportProgressEvent {
                source_id: prepared.source_id.clone(),
                source_tag: Some(prepared.source_tag),
                job_id: None,
                phase: "prepared".to_string(),
                message: "Prepared hsdata payload locally".to_string(),
                total_chunk_count: Some(prepared.chunks.len() as u32),
                completed_chunk_count: Some(0),
                total_entity_count: Some(prepared.total_entity_count),
                current_chunk_index: None,
            },
        );

        emit_hsdata_import_progress(
            &app,
            HsdataImportProgressEvent {
                source_id: prepared.source_id.clone(),
                source_tag: Some(prepared.source_tag),
                job_id: None,
                phase: "creating_job".to_string(),
                message: "Creating or resuming remote import job".to_string(),
                total_chunk_count: Some(prepared.chunks.len() as u32),
                completed_chunk_count: Some(0),
                total_entity_count: Some(prepared.total_entity_count),
                current_chunk_index: None,
            },
        );

        let ensure_job_started_at = Instant::now();
        let (job_id, state) =
            match ensure_hsdata_import_job(&app, &session_client, &prepared, dry_run, force).await?
            {
                HsdataImportJobResolution::Completed(report) => {
                    log_hsdata_import_profile(
                        "ensure_remote_job",
                        serde_json::json!({
                            "sourceId": prepared.source_id,
                            "sourceTag": prepared.source_tag,
                            "resolution": "completed_cached",
                            "elapsedMs": elapsed_millis(&ensure_job_started_at),
                        }),
                    );
                    log_hsdata_import_profile(
                        "total",
                        serde_json::json!({
                            "sourceId": prepared.source_id,
                            "sourceTag": prepared.source_tag,
                            "chunkCount": prepared.chunks.len(),
                            "totalEntityCount": prepared.total_entity_count,
                            "outcome": "completed_cached",
                            "elapsedMs": elapsed_millis(&total_started_at),
                        }),
                    );
                    return Ok((prepared, None, report));
                }
                HsdataImportJobResolution::Pending { job_id, state } => (job_id, state),
            };
        log_hsdata_import_profile(
            "ensure_remote_job",
            serde_json::json!({
                "sourceId": prepared.source_id,
                "sourceTag": prepared.source_tag,
                "jobId": job_id,
                "reusedRemoteState": state.is_some(),
                "elapsedMs": elapsed_millis(&ensure_job_started_at),
            }),
        );

        let mut job_state = match state {
            Some(state) => state,
            None => get_remote_hsdata_import_job(&session_client, &job_id).await?,
        };

        emit_hsdata_import_progress(
            &app,
            HsdataImportProgressEvent {
                source_id: prepared.source_id.clone(),
                source_tag: Some(prepared.source_tag),
                job_id: Some(job_id.clone()),
                phase: job_state.status.clone(),
                message: "Remote import job is ready".to_string(),
                total_chunk_count: Some(job_state.total_chunk_count),
                completed_chunk_count: Some(job_state.completed_chunk_count),
                total_entity_count: Some(prepared.total_entity_count),
                current_chunk_index: None,
            },
        );

        if job_state.status == "uploading" {
            let upload_started_at = Instant::now();
            upload_hsdata_chunks(
                &app,
                &session_client,
                &prepared.source_id,
                prepared.source_tag,
                &job_id,
                prepared.total_entity_count,
                job_state.completed_chunk_count,
                &prepared.chunks,
            )
            .await?;
            log_hsdata_import_profile(
                "upload_chunks_complete",
                serde_json::json!({
                    "sourceId": prepared.source_id,
                    "sourceTag": prepared.source_tag,
                    "jobId": job_id,
                    "elapsedMs": elapsed_millis(&upload_started_at),
                }),
            );
            job_state = get_remote_hsdata_import_job(&session_client, &job_id).await?;
        }

        if job_state.status == "completed" {
            let report = completed_hsdata_import_report(job_state)?;
            return Ok((prepared, Some(job_id), report));
        }

        if job_state.status == "ready_to_finalize"
            || (job_state.status == "uploading"
                && job_state.completed_chunk_count == job_state.total_chunk_count)
        {
            emit_hsdata_import_progress(
                &app,
                HsdataImportProgressEvent {
                    source_id: prepared.source_id.clone(),
                    source_tag: Some(prepared.source_tag),
                    job_id: Some(job_id.clone()),
                    phase: "finalizing".to_string(),
                    message: "Finalizing hsdata import job".to_string(),
                    total_chunk_count: Some(job_state.total_chunk_count),
                    completed_chunk_count: Some(job_state.total_chunk_count),
                    total_entity_count: Some(prepared.total_entity_count),
                    current_chunk_index: None,
                },
            );

            let finalize_started_at = Instant::now();
            let report = finalize_remote_hsdata_import_job(&session_client, &job_id).await?;
            log_hsdata_import_profile(
                "finalize_remote_job",
                serde_json::json!({
                    "sourceId": prepared.source_id,
                    "sourceTag": prepared.source_tag,
                    "jobId": job_id,
                    "elapsedMs": elapsed_millis(&finalize_started_at),
                }),
            );
            return Ok((prepared, Some(job_id), report));
        }

        if job_state.status == "failed" {
            clear_hsdata_import_job_quietly(&app, prepared.source_tag);
            return Err(job_state
                .error
                .unwrap_or_else(|| format!("hsdata import job {} failed", job_state.job_id)));
        }

        if job_state.status == "finalizing" {
            return Err(format!(
                "hsdata import job {} is already finalizing",
                job_state.job_id
            ));
        }

        Err(format!(
            "hsdata import job {} is still incomplete after upload ({}/{})",
            job_state.job_id, job_state.completed_chunk_count, job_state.total_chunk_count
        ))
    }
    .await;

    match result {
        Ok((prepared, job_id, report)) => {
            clear_hsdata_import_job_quietly(&app, prepared.source_tag);
            log_hsdata_import_profile(
                "total",
                serde_json::json!({
                    "sourceId": prepared.source_id,
                    "sourceTag": report.source_tag,
                    "jobId": job_id,
                    "chunkCount": prepared.chunks.len(),
                    "totalEntityCount": prepared.total_entity_count,
                    "outcome": "completed",
                    "elapsedMs": elapsed_millis(&total_started_at),
                }),
            );
            emit_hsdata_import_progress(
                &app,
                HsdataImportProgressEvent {
                    source_id: prepared.source_id,
                    source_tag: Some(report.source_tag),
                    job_id,
                    phase: "completed".to_string(),
                    message: "hsdata import completed".to_string(),
                    total_chunk_count: Some(prepared.chunks.len() as u32),
                    completed_chunk_count: Some(prepared.chunks.len() as u32),
                    total_entity_count: Some(prepared.total_entity_count),
                    current_chunk_index: None,
                },
            );

            Ok(report)
        }
        Err(error) => {
            log_hsdata_import_profile(
                "total",
                serde_json::json!({
                    "sourceId": source_id,
                    "outcome": "failed",
                    "error": error,
                    "elapsedMs": elapsed_millis(&total_started_at),
                }),
            );
            emit_hsdata_import_progress(
                &app,
                HsdataImportProgressEvent {
                    source_id,
                    source_tag: None,
                    job_id: None,
                    phase: "failed".to_string(),
                    message: error.clone(),
                    total_chunk_count: None,
                    completed_chunk_count: None,
                    total_entity_count: None,
                    current_chunk_index: None,
                },
            );

            Err(error)
        }
    }
}

#[tauri::command]
async fn auth_fetch(
    state: tauri::State<'_, AuthState>,
    path: String,
    method: String,
    headers: Vec<(String, String)>,
    body: Option<String>,
) -> Result<DesktopFetchResponse, String> {
    let session_client = {
        let current = state
            .current
            .lock()
            .map_err(|_| "Failed to read auth state".to_string())?;

        current
            .as_ref()
            .cloned()
            .ok_or_else(|| "Auth session is unavailable".to_string())?
    };

    let url = build_url(&session_client.base_url, &path);
    let method = Method::from_bytes(method.as_bytes())
        .map_err(|error| format!("Invalid request method: {error}"))?;
    let mut request = session_client.client.request(method, &url);

    for (name, value) in headers {
        request = request.header(&name, &value);
    }

    if let Some(body) = body {
        request = request.body(body);
    }

    let response = request
        .send()
        .await
        .map_err(|error| format!("Failed to send request: {error}"))?;
    let status = response.status().as_u16();
    let response_headers = response
        .headers()
        .iter()
        .map(|(name, value)| {
            (
                name.as_str().to_string(),
                value.to_str().unwrap_or_default().to_string(),
            )
        })
        .collect::<Vec<_>>();
    let body = response
        .bytes()
        .await
        .map_err(|error| format!("Failed to read response body: {error}"))?
        .to_vec();

    Ok(DesktopFetchResponse {
        body,
        headers: response_headers,
        status,
    })
}

#[tauri::command]
fn create_login_window(app: AppHandle) -> Result<(), String> {
    if app.get_webview_window("login").is_some() {
        return Ok(());
    }

    let config = app.config();
    let window_config = config
        .app
        .windows
        .iter()
        .find(|w| w.label == "login")
        .ok_or_else(|| "Login window config not found".to_string())?;

    tauri::WebviewWindowBuilder::from_config(&app, window_config)
        .map_err(|e| e.to_string())?
        .build()
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
fn credential_get(username: &str) -> Result<Option<String>, String> {
    let entry = keyring::Entry::new(CREDENTIAL_SERVICE, username).map_err(|e| e.to_string())?;

    match entry.get_password() {
        Ok(password) => Ok(Some(password)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
fn credential_set(username: String, password: String) -> Result<(), String> {
    keyring::Entry::new(CREDENTIAL_SERVICE, &username)
        .map_err(|e| e.to_string())?
        .set_password(&password)
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn credential_delete(username: String) -> Result<(), String> {
    let entry = keyring::Entry::new(CREDENTIAL_SERVICE, &username).map_err(|e| e.to_string())?;

    match entry.delete_credential() {
        Ok(()) => Ok(()),
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(AuthState::default())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            auth_sign_in,
            auth_get_session,
            auth_sign_out,
            auth_fetch,
            desktop_get_game_repo,
            desktop_set_game_repo,
            desktop_pick_directory,
            hsdata_get_repo_state,
            hsdata_list_sources,
            hsdata_read_source,
            hsdata_sync_remote_versions,
            hsdata_import_source,
            credential_get,
            credential_set,
            credential_delete,
            create_login_window,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
