#[allow(dead_code)]
mod desktop_config_commands;
#[allow(dead_code)]
mod desktop_database_commands;
#[allow(dead_code)]
mod desktop_database_settings;
#[allow(dead_code)]
mod desktop_hearthstone_publish_target;
#[allow(dead_code)]
mod desktop_runtime_config_sync;

use crate::desktop_config_commands::{
    desktop_get_config_file_info, desktop_get_raw_config, desktop_open_config_directory,
    desktop_set_raw_config,
};
use crate::desktop_database_commands::{
    desktop_get_database_settings, desktop_set_database_settings, desktop_test_database_connection,
};
use crate::desktop_database_settings::DesktopDatabaseConnectionStringCache;
use crate::desktop_hearthstone_publish_target::{
    desktop_get_hearthstone_publish_target, desktop_set_hearthstone_publish_target,
    desktop_test_hearthstone_publish_target, desktop_validate_hearthstone_publish_target_binding,
    HearthstonePublishTargetConnectionStringCache,
};
use crate::desktop_runtime_config_sync::{
    schedule_desktop_runtime_config_sync, start_desktop_runtime_config_sync_loop,
    sync_desktop_runtime_config_blocking,
};
use reqwest::cookie::{CookieStore, Jar};
use reqwest::{Client, Method, Url};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Manager};

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
pub(crate) struct DesktopConfig {
    #[serde(default = "desktop_config_version")]
    version: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    external_database_connection_string: Option<String>,
    #[serde(default, skip_serializing_if = "DesktopGamesSettings::is_empty")]
    games: DesktopGamesSettings,
}

impl Default for DesktopConfig {
    fn default() -> Self {
        Self {
            version: desktop_config_version(),
            external_database_connection_string: None,
            games: DesktopGamesSettings::default(),
        }
    }
}

#[derive(Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
/// Per-game settings persisted in the desktop config file.
struct DesktopGamesSettings {
    #[serde(skip_serializing_if = "Option::is_none")]
    hearthstone: Option<StoredHearthstoneSettings>,
}

impl DesktopGamesSettings {
    /// Whether the config currently contains any persisted game settings.
    fn is_empty(&self) -> bool {
        self.hearthstone.is_none()
    }
}

#[derive(Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
/// Hearthstone-specific settings persisted in the desktop config file.
struct StoredHearthstoneSettings {
    #[serde(skip_serializing_if = "Option::is_none")]
    hsdata: Option<StoredRepoPath>,
    #[serde(skip_serializing_if = "Option::is_none")]
    publish: Option<StoredHearthstonePublishTargetProfile>,
}

impl StoredHearthstoneSettings {
    /// Whether the Hearthstone settings currently contain any persisted values.
    fn is_empty(&self) -> bool {
        self.hsdata.is_none() && self.publish.is_none()
    }
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
/// Local repository path persisted for one game integration.
struct StoredRepoPath {
    repo_path: String,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
/// Publish target profile persisted for one Hearthstone environment binding.
struct StoredHearthstonePublishTargetProfile {
    publish_target_id: String,
    environment: String,
    target_fingerprint: String,
}

const DEFAULT_AUTH_BASE_URL: &str = "http://127.0.0.1:2998";

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

/// Absolute file path resolved for the desktop JSON config file.
pub(crate) fn desktop_config_file(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Failed to resolve app data directory: {error}"))?;

    Ok(dir.join("desktop-config.json"))
}

/// Structured desktop config decoded from the JSON config file.
pub(crate) fn load_desktop_config(app: &AppHandle) -> Result<DesktopConfig, String> {
    let path = desktop_config_file(app)?;

    if !path.exists() {
        return Ok(DesktopConfig::default());
    }

    let text = fs::read_to_string(&path)
        .map_err(|error| format!("Failed to read desktop config: {error}"))?;

    serde_json::from_str::<DesktopConfig>(&text)
        .map_err(|error| format!("Failed to decode desktop config: {error}"))
}

/// Structured desktop config encoded and written into the JSON config file.
pub(crate) fn store_desktop_config(
    app: &AppHandle,
    settings: &DesktopConfig,
) -> Result<(), String> {
    let path = desktop_config_file(app)?;
    let Some(parent) = path.parent() else {
        return Err("Failed to resolve desktop config directory".to_string());
    };

    fs::create_dir_all(parent)
        .map_err(|error| format!("Failed to create desktop config directory: {error}"))?;

    let text = serde_json::to_string_pretty(settings)
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

pub(crate) fn load_desktop_game_repo_path(
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
async fn parse_error(response: reqwest::Response) -> String {
    let status = response.status();
    let text = response.text().await.unwrap_or_default();

    if let Ok(body) = serde_json::from_str::<serde_json::Value>(&text) {
        if let Some(json) = body.get("json").cloned() {
            if let Ok(enveloped) = serde_json::from_value::<ApiErrorBody>(json) {
                if let Some(message) = format_api_error(enveloped) {
                    return message;
                }
            }
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
    schedule_desktop_runtime_config_sync(app.clone());

    Ok(resolved_repo_path)
}

#[tauri::command]
fn desktop_pick_directory(directory: Option<String>) -> Result<Option<String>, String> {
    pick_directory(directory)
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
        .manage(DesktopDatabaseConnectionStringCache::default())
        .manage(HearthstonePublishTargetConnectionStringCache::default())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            sync_desktop_runtime_config_blocking(&app.handle().clone());
            start_desktop_runtime_config_sync_loop(app.handle().clone());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            auth_sign_in,
            auth_get_session,
            auth_sign_out,
            auth_fetch,
            desktop_get_raw_config,
            desktop_set_raw_config,
            desktop_get_config_file_info,
            desktop_open_config_directory,
            desktop_get_database_settings,
            desktop_set_database_settings,
            desktop_test_database_connection,
            desktop_get_hearthstone_publish_target,
            desktop_set_hearthstone_publish_target,
            desktop_test_hearthstone_publish_target,
            desktop_validate_hearthstone_publish_target_binding,
            desktop_get_game_repo,
            desktop_set_game_repo,
            desktop_pick_directory,
            credential_get,
            credential_set,
            credential_delete,
            create_login_window,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
