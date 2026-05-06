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

#[derive(Deserialize)]
struct AuthErrorBody {
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
    tag: Option<String>,
    commit: Option<String>,
    short: Option<String>,
    repo_path: Option<String>,
    dirty: bool,
    file_count: usize,
}

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
        _ => Err(format!("Unsupported desktop repo setting: {game}.{repo_key}")),
    }
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
        _ => Err(format!("Unsupported desktop repo setting: {game}.{repo_key}")),
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
        _ => Err(format!("Unsupported desktop repo setting: {game}.{repo_key}")),
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

    String::from_utf8(output.stdout).map_err(|error| format!("Failed to decode git output: {error}"))
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

fn git_object_exists(repo_path: &str, object: &str) -> bool {
    Command::new("git")
        .current_dir(repo_path)
        .args(["cat-file", "-e", object])
        .status()
        .map(|status| status.success())
        .unwrap_or(false)
}

fn short_commit(commit: &str) -> String {
    commit.chars().take(7).collect()
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
    let object = format!("{tag}:CardDefs.xml");
    let xml = run_git(repo_path, &["show", &object])?;
    let source_tag = parse_carddefs_build(&xml)?;
    let source_commit = trim_git_output(run_git(repo_path, &["rev-list", "-n", "1", tag])?);
    let size = trim_git_output(run_git(repo_path, &["cat-file", "-s", &object])?)
        .parse::<u64>()
        .map_err(|error| format!("Failed to parse git object size: {error}"))?;
    let time = trim_git_output(run_git(repo_path, &["log", "-1", "--format=%cI", tag])?);

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

fn list_hsdata_sources(repo_path: &str) -> Result<Vec<HsdataSourceEntry>, String> {
    let worktree = read_worktree_source(repo_path)?;
    let mut sources = vec![HsdataSourceEntry {
        id: worktree.id,
        name: worktree.name,
        kind: worktree.kind,
        size: worktree.size,
        time: worktree.time,
        source_tag: Some(worktree.source_tag),
        source_commit: worktree.source_commit,
        short_commit: worktree.short_commit,
        source_uri: worktree.source_uri,
    }];

    let tags = run_git(
        repo_path,
        &[
            "for-each-ref",
            "--sort=-creatordate",
            "--format=%(refname:short)\t%(creatordate:iso-strict)",
            "refs/tags",
        ],
    )?;

    for line in tags.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }

        let mut parts = trimmed.splitn(2, '\t');
        let Some(tag) = parts.next() else {
            continue;
        };
        let time = parts.next().map(str::to_string).filter(|value| !value.is_empty());
        let object = format!("{tag}:CardDefs.xml");

        if !git_object_exists(repo_path, &object) {
            continue;
        }

        let source_commit = trim_git_output(run_git(repo_path, &["rev-list", "-n", "1", tag])?);
        let size = trim_git_output(run_git(repo_path, &["cat-file", "-s", &object])?)
            .parse::<u64>()
            .map_err(|error| format!("Failed to parse git object size: {error}"))?;

        sources.push(HsdataSourceEntry {
            id: format!("tag:{tag}"),
            name: tag.to_string(),
            kind: "tag".to_string(),
            size,
            time,
            source_tag: None,
            source_commit: source_commit.clone(),
            short_commit: short_commit(&source_commit),
            source_uri: build_source_uri(&format!("tag:{tag}")),
        });
    }

    Ok(sources)
}

fn get_hsdata_repo_state(app: &AppHandle) -> Result<HsdataRepoState, String> {
    let repo_path = match load_desktop_game_repo_path(app, "hearthstone", "hsdata")? {
        Some(repo_path) => Some(resolve_repo_root(&repo_path)?),
        None => None,
    };

    let Some(repo_path) = repo_path else {
        return Ok(HsdataRepoState {
            tag: None,
            commit: None,
            short: None,
            repo_path: None,
            dirty: false,
            file_count: 0,
        });
    };

    let commit = trim_git_output(run_git(&repo_path, &["rev-parse", "HEAD"])?);
    let dirty_output = trim_git_output(run_git(&repo_path, &["status", "--short"])?);
    let worktree = read_worktree_source(&repo_path)?;
    let file_count = list_hsdata_sources(&repo_path)?.len();

    Ok(HsdataRepoState {
        tag: Some(worktree.source_tag.to_string()),
        commit: Some(commit.clone()),
        short: Some(short_commit(&commit)),
        repo_path: Some(repo_path),
        dirty: !dirty_output.is_empty(),
        file_count,
    })
}

async fn parse_error(response: reqwest::Response) -> String {
    let status = response.status();
    let text = response.text().await.unwrap_or_default();

    if let Ok(body) = serde_json::from_str::<AuthErrorBody>(&text) {
        if let Some(message) = body.message {
            if let Some(code) = body.code {
                return format!("{code}: {message}");
            }

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
        .header(reqwest::header::ORIGIN, auth_origin_header(&session_client.base_url)?)
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
    let repo_path = repo_path.and_then(|value| {
        let trimmed = value.trim().to_string();
        (!trimmed.is_empty()).then_some(trimmed)
    });
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
    let entry =
        keyring::Entry::new(CREDENTIAL_SERVICE, &username).map_err(|e| e.to_string())?;

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
            hsdata_get_repo_state,
            hsdata_list_sources,
            hsdata_read_source,
            credential_get,
            credential_set,
            credential_delete,
            create_login_window,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
