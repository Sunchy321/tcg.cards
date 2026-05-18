use std::sync::Mutex;
use std::time::Instant;

use reqwest::Url;
use serde::Serialize;
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Manager};

use crate::desktop_database::{
    read_desktop_database_identity, DesktopDatabase, DesktopDatabaseIdentity,
};
use crate::{
    load_desktop_config, store_desktop_config, trim_non_empty,
    StoredHearthstonePublishTargetProfile, StoredHearthstoneSettings, CREDENTIAL_SERVICE,
};

const HEARTHSTONE_PUBLISH_TARGET_ACCOUNT: &str = "hearthstone-publish-target";

/// In-process cache for the Hearthstone publish target connection string.
pub(crate) struct HearthstonePublishTargetConnectionStringCache {
    current: Mutex<Option<Option<String>>>,
}

impl Default for HearthstonePublishTargetConnectionStringCache {
    /// Empty cache state before any secure-storage read or write.
    fn default() -> Self {
        Self {
            current: Mutex::new(None),
        }
    }
}

/// Publish target settings returned to the desktop frontend.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DesktopHearthstonePublishTargetSettings {
    pub(crate) publish_target_id: Option<String>,
    pub(crate) environment: Option<String>,
    pub(crate) target_fingerprint: Option<String>,
    pub(crate) connection_string: Option<String>,
}

/// Resolved publish target identity returned after one live connection test.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DesktopHearthstonePublishTargetTestResult {
    publish_target_id: String,
    environment: String,
    target_fingerprint: String,
    database_name: String,
    user_name: String,
    server_host: String,
    server_port: u16,
    latency_ms: u128,
}

/// Publish target binding validation result returned to the desktop frontend.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DesktopHearthstonePublishTargetValidationResult {
    is_valid: bool,
    reasons: Vec<String>,
    current_publish_target_id: Option<String>,
    current_environment: Option<String>,
    current_target_fingerprint: Option<String>,
}

/// Normalized network endpoint extracted for one PostgreSQL target.
struct PostgresTargetEndpoint {
    host: String,
    port: u16,
}

/// Fully resolved publish target identity derived from one live PostgreSQL session.
pub(crate) struct ResolvedHearthstonePublishTarget {
    pub(crate) publish_target_id: String,
    pub(crate) environment: String,
    pub(crate) target_fingerprint: String,
    pub(crate) database_name: String,
    pub(crate) user_name: String,
    pub(crate) server_host: String,
    pub(crate) server_port: u16,
}

/// In-process cache updated after the desktop runtime loads or stores the publish connection string.
fn write_cached_connection_string(
    app: &AppHandle,
    connection_string: Option<String>,
) -> Result<(), String> {
    let cache = app.state::<HearthstonePublishTargetConnectionStringCache>();
    let mut current = cache.current.lock().map_err(|_| {
        "Failed to lock Hearthstone publish target connection string cache.".to_string()
    })?;
    *current = Some(connection_string);
    Ok(())
}

/// Optional publish-target PostgreSQL connection string loaded from desktop secure storage.
pub(crate) fn load_publish_target_connection_string(
    app: &AppHandle,
) -> Result<Option<String>, String> {
    let cache = app.state::<HearthstonePublishTargetConnectionStringCache>();
    let mut current = cache.current.lock().map_err(|_| {
        "Failed to lock Hearthstone publish target connection string cache.".to_string()
    })?;

    if let Some(connection_string) = current.clone() {
        return Ok(connection_string);
    }

    let entry = keyring::Entry::new(CREDENTIAL_SERVICE, HEARTHSTONE_PUBLISH_TARGET_ACCOUNT)
        .map_err(|error| {
            format!("Failed to open Hearthstone publish target credential entry: {error}")
        })?;

    match entry.get_password() {
        Ok(connection_string) => {
            let trimmed_connection_string = trim_non_empty(Some(connection_string));
            *current = Some(trimmed_connection_string.clone());
            Ok(trimmed_connection_string)
        }
        Err(keyring::Error::NoEntry) => {
            *current = Some(None);
            Ok(None)
        }
        Err(error) => Err(format!(
            "Failed to read Hearthstone publish target connection string: {error}"
        )),
    }
}

/// Publish-target PostgreSQL connection string persisted to desktop secure storage.
fn store_publish_target_connection_string(
    app: &AppHandle,
    connection_string: Option<String>,
) -> Result<(), String> {
    let entry = keyring::Entry::new(CREDENTIAL_SERVICE, HEARTHSTONE_PUBLISH_TARGET_ACCOUNT)
        .map_err(|error| {
            format!("Failed to open Hearthstone publish target credential entry: {error}")
        })?;

    match trim_non_empty(connection_string) {
        Some(connection_string) => {
            entry.set_password(&connection_string).map_err(|error| {
                format!("Failed to store Hearthstone publish target connection string: {error}")
            })?;
            write_cached_connection_string(app, Some(connection_string))
        }
        None => match entry.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => write_cached_connection_string(app, None),
            Err(error) => Err(format!(
                "Failed to clear Hearthstone publish target connection string: {error}"
            )),
        },
    }
}

/// Frontend settings payload built from one stored config profile plus secure connection string.
fn build_publish_target_settings(
    profile: Option<&StoredHearthstonePublishTargetProfile>,
    connection_string: Option<String>,
) -> DesktopHearthstonePublishTargetSettings {
    DesktopHearthstonePublishTargetSettings {
        publish_target_id: profile.map(|profile| profile.publish_target_id.clone()),
        environment: profile.map(|profile| profile.environment.clone()),
        target_fingerprint: profile.map(|profile| profile.target_fingerprint.clone()),
        connection_string,
    }
}

/// Stored publish target profile loaded from the desktop config file.
pub(crate) fn load_publish_target_profile(
    app: &AppHandle,
) -> Result<Option<StoredHearthstonePublishTargetProfile>, String> {
    let config = load_desktop_config(app)?;

    Ok(config
        .games
        .hearthstone
        .as_ref()
        .and_then(|settings| settings.publish.as_ref())
        .cloned())
}

/// Publish target profile written into the desktop config file.
fn store_publish_target_profile(
    app: &AppHandle,
    profile: Option<StoredHearthstonePublishTargetProfile>,
) -> Result<(), String> {
    let mut config = load_desktop_config(app)?;

    match profile {
        Some(profile) => {
            let settings = config
                .games
                .hearthstone
                .get_or_insert_with(StoredHearthstoneSettings::default);
            settings.publish = Some(profile);
        }
        None => {
            if let Some(settings) = config.games.hearthstone.as_mut() {
                settings.publish = None;

                if settings.is_empty() {
                    config.games.hearthstone = None;
                }
            }
        }
    }

    store_desktop_config(app, &config)
}

/// Frontend settings payload loaded from desktop config plus secure storage.
fn load_publish_target_settings(
    app: &AppHandle,
) -> Result<DesktopHearthstonePublishTargetSettings, String> {
    let profile = load_publish_target_profile(app)?;
    let connection_string = load_publish_target_connection_string(app)?;
    Ok(build_publish_target_settings(
        profile.as_ref(),
        connection_string,
    ))
}

/// Lowercase hex string encoded from one finalized sha256 hasher.
fn finish_sha256_hex(hasher: Sha256) -> String {
    let digest = hasher.finalize();
    let mut output = String::with_capacity(digest.len() * 2);

    for byte in digest {
        output.push_str(&format!("{byte:02x}"));
    }

    output
}

/// Stable sha256 digest rendered as lowercase hexadecimal.
fn sha256_hex(input: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(input.as_bytes());
    finish_sha256_hex(hasher)
}

/// Leading and trailing single or double quotes removed from one parsed connection value.
fn trim_connection_value(value: &str) -> String {
    value
        .trim()
        .trim_matches(|character| character == '\'' || character == '"')
        .to_string()
}

/// PostgreSQL endpoint parsed from one URL-style connection string.
fn parse_postgres_endpoint_from_url(connection_string: &str) -> Option<PostgresTargetEndpoint> {
    let url = Url::parse(connection_string).ok()?;

    if !matches!(url.scheme(), "postgres" | "postgresql") {
        return None;
    }

    let host = url
        .host_str()
        .map(|host| host.trim().to_ascii_lowercase())
        .or_else(|| {
            url.query_pairs()
                .find(|(key, _)| key == "host")
                .map(|(_, value)| value.trim().to_ascii_lowercase())
        })?;

    let port = url.port().or_else(|| {
        url.query_pairs()
            .find(|(key, _)| key == "port")
            .and_then(|(_, value)| value.parse::<u16>().ok())
    })?;

    Some(PostgresTargetEndpoint { host, port })
}

/// PostgreSQL endpoint parsed from one keyword connection string.
fn parse_postgres_endpoint_from_keywords(
    connection_string: &str,
) -> Option<PostgresTargetEndpoint> {
    let mut host: Option<String> = None;
    let mut port: Option<u16> = None;

    for part in connection_string.split_whitespace() {
        let Some((key, value)) = part.split_once('=') else {
            continue;
        };

        let value = trim_connection_value(value);

        match key {
            "host" if !value.is_empty() => {
                host = Some(value.to_ascii_lowercase());
            }
            "port" => {
                port = value.parse::<u16>().ok();
            }
            _ => {}
        }
    }

    Some(PostgresTargetEndpoint {
        host: host?,
        port: port.unwrap_or(5432),
    })
}

/// PostgreSQL endpoint parsed from one connection string when the server session omits host data.
fn parse_postgres_endpoint(connection_string: &str) -> Option<PostgresTargetEndpoint> {
    parse_postgres_endpoint_from_url(connection_string)
        .or_else(|| parse_postgres_endpoint_from_keywords(connection_string))
}

/// Publish target endpoint resolved from one live session identity plus connection-string fallback.
fn resolve_target_endpoint(
    identity: &DesktopDatabaseIdentity,
    connection_string: &str,
) -> PostgresTargetEndpoint {
    let parsed = parse_postgres_endpoint(connection_string);
    let host = identity
        .server_host
        .as_deref()
        .map(str::trim)
        .filter(|host| !host.is_empty())
        .map(|host| host.to_ascii_lowercase())
        .or_else(|| parsed.as_ref().map(|endpoint| endpoint.host.clone()))
        .unwrap_or_else(|| "local-socket".to_string());
    let port = identity
        .server_port
        .and_then(|port| u16::try_from(port).ok())
        .or_else(|| parsed.as_ref().map(|endpoint| endpoint.port))
        .unwrap_or(5432);

    PostgresTargetEndpoint { host, port }
}

/// Stable fingerprint derived from one resolved PostgreSQL endpoint and identity pair.
fn compute_target_fingerprint(
    endpoint: &PostgresTargetEndpoint,
    identity: &DesktopDatabaseIdentity,
) -> String {
    sha256_hex(&format!(
        "host={}\nport={}\ndatabase={}\nuser={}",
        endpoint.host, endpoint.port, identity.database_name, identity.user_name
    ))
}

/// Publish target fields normalized from one explicit frontend request.
fn resolve_requested_target_fields(
    publish_target_id: Option<String>,
    environment: Option<String>,
    connection_string: Option<String>,
) -> Result<Option<(String, String, String)>, String> {
    let publish_target_id = trim_non_empty(publish_target_id);
    let environment = trim_non_empty(environment);
    let connection_string = trim_non_empty(connection_string);

    if publish_target_id.is_none() && environment.is_none() && connection_string.is_none() {
        return Ok(None);
    }

    let publish_target_id = publish_target_id
        .ok_or_else(|| "Hearthstone publish target id is required.".to_string())?;
    let environment = environment
        .ok_or_else(|| "Hearthstone publish target environment is required.".to_string())?;
    let connection_string = connection_string
        .ok_or_else(|| "Hearthstone publish target connection string is required.".to_string())?;

    Ok(Some((publish_target_id, environment, connection_string)))
}

/// Live publish target identity resolved from one explicit profile and connection string.
async fn resolve_publish_target(
    publish_target_id: String,
    environment: String,
    connection_string: String,
) -> Result<ResolvedHearthstonePublishTarget, String> {
    let database = DesktopDatabase::connect(&connection_string).await?;
    let identity = read_desktop_database_identity(database.connection()).await?;
    let endpoint = resolve_target_endpoint(&identity, &connection_string);
    let target_fingerprint = compute_target_fingerprint(&endpoint, &identity);

    Ok(ResolvedHearthstonePublishTarget {
        publish_target_id,
        environment,
        target_fingerprint,
        database_name: identity.database_name,
        user_name: identity.user_name,
        server_host: endpoint.host,
        server_port: endpoint.port,
    })
}

/// Stored publish target resolved and revalidated against the current live PostgreSQL target.
pub(crate) async fn require_resolved_publish_target(
    app: &AppHandle,
) -> Result<ResolvedHearthstonePublishTarget, String> {
    let profile = load_publish_target_profile(app)?
        .ok_or_else(|| "Hearthstone publish target profile is not configured.".to_string())?;
    let connection_string = load_publish_target_connection_string(app)?.ok_or_else(|| {
        "Hearthstone publish target connection string is not configured.".to_string()
    })?;
    let target = resolve_publish_target(
        profile.publish_target_id.clone(),
        profile.environment.clone(),
        connection_string,
    )
    .await?;

    if target.target_fingerprint != profile.target_fingerprint {
        return Err(format!(
            "Configured Hearthstone publish target fingerprint changed: expected {}, current {}.",
            profile.target_fingerprint, target.target_fingerprint
        ));
    }

    Ok(target)
}

/// Frontend settings payload loaded by the desktop frontend.
#[tauri::command]
pub(crate) fn desktop_get_hearthstone_publish_target(
    app: AppHandle,
) -> Result<DesktopHearthstonePublishTargetSettings, String> {
    load_publish_target_settings(&app)
}

/// Publish target connection tested without mutating stored desktop settings.
#[tauri::command]
pub(crate) async fn desktop_test_hearthstone_publish_target(
    publish_target_id: Option<String>,
    environment: Option<String>,
    connection_string: Option<String>,
) -> Result<DesktopHearthstonePublishTargetTestResult, String> {
    let (publish_target_id, environment, connection_string) =
        resolve_requested_target_fields(publish_target_id, environment, connection_string)?
            .ok_or_else(|| "Hearthstone publish target settings are required.".to_string())?;
    let started_at = Instant::now();
    let target = resolve_publish_target(publish_target_id, environment, connection_string).await?;

    Ok(DesktopHearthstonePublishTargetTestResult {
        publish_target_id: target.publish_target_id,
        environment: target.environment,
        target_fingerprint: target.target_fingerprint,
        database_name: target.database_name,
        user_name: target.user_name,
        server_host: target.server_host,
        server_port: target.server_port,
        latency_ms: started_at.elapsed().as_millis(),
    })
}

/// Publish target settings persisted into desktop config plus secure storage.
#[tauri::command]
pub(crate) async fn desktop_set_hearthstone_publish_target(
    app: AppHandle,
    publish_target_id: Option<String>,
    environment: Option<String>,
    connection_string: Option<String>,
) -> Result<DesktopHearthstonePublishTargetSettings, String> {
    let requested =
        resolve_requested_target_fields(publish_target_id, environment, connection_string)?;

    let Some((publish_target_id, environment, connection_string)) = requested else {
        store_publish_target_profile(&app, None)?;
        store_publish_target_connection_string(&app, None)?;
        return Ok(DesktopHearthstonePublishTargetSettings {
            publish_target_id: None,
            environment: None,
            target_fingerprint: None,
            connection_string: None,
        });
    };

    let target = resolve_publish_target(
        publish_target_id.clone(),
        environment.clone(),
        connection_string.clone(),
    )
    .await?;

    store_publish_target_connection_string(&app, Some(connection_string.clone()))?;
    store_publish_target_profile(
        &app,
        Some(StoredHearthstonePublishTargetProfile {
            publish_target_id,
            environment,
            target_fingerprint: target.target_fingerprint.clone(),
        }),
    )?;

    Ok(DesktopHearthstonePublishTargetSettings {
        publish_target_id: Some(target.publish_target_id),
        environment: Some(target.environment),
        target_fingerprint: Some(target.target_fingerprint),
        connection_string: Some(connection_string),
    })
}

/// Expected binding validated against the currently configured target profile and live database.
#[tauri::command]
pub(crate) async fn desktop_validate_hearthstone_publish_target_binding(
    app: AppHandle,
    publish_target_id: String,
    environment: String,
    target_fingerprint: String,
) -> Result<DesktopHearthstonePublishTargetValidationResult, String> {
    let expected_publish_target_id = trim_non_empty(Some(publish_target_id))
        .ok_or_else(|| "Expected Hearthstone publish target id is required.".to_string())?;
    let expected_environment = trim_non_empty(Some(environment)).ok_or_else(|| {
        "Expected Hearthstone publish target environment is required.".to_string()
    })?;
    let expected_target_fingerprint =
        trim_non_empty(Some(target_fingerprint)).ok_or_else(|| {
            "Expected Hearthstone publish target fingerprint is required.".to_string()
        })?;

    let profile = load_publish_target_profile(&app)?;
    let connection_string = load_publish_target_connection_string(&app)?;
    let mut reasons = Vec::new();
    let current_publish_target_id = profile
        .as_ref()
        .map(|profile| profile.publish_target_id.clone());
    let current_environment = profile.as_ref().map(|profile| profile.environment.clone());
    let mut current_target_fingerprint = profile
        .as_ref()
        .map(|profile| profile.target_fingerprint.clone());

    match current_publish_target_id.as_deref() {
        Some(current_publish_target_id) if current_publish_target_id == expected_publish_target_id => {}
        Some(current_publish_target_id) => reasons.push(format!(
            "Configured publish target id changed: expected {expected_publish_target_id}, current {current_publish_target_id}."
        )),
        None => reasons.push("Configured publish target id is missing.".to_string()),
    }

    match current_environment.as_deref() {
        Some(current_environment) if current_environment == expected_environment => {}
        Some(current_environment) => reasons.push(format!(
            "Configured publish target environment changed: expected {expected_environment}, current {current_environment}."
        )),
        None => reasons.push("Configured publish target environment is missing.".to_string()),
    }

    match current_target_fingerprint.as_deref() {
        Some(current_target_fingerprint)
            if current_target_fingerprint == expected_target_fingerprint => {}
        Some(current_target_fingerprint) => reasons.push(format!(
            "Stored publish target fingerprint changed: expected {expected_target_fingerprint}, current {current_target_fingerprint}."
        )),
        None => reasons.push("Stored publish target fingerprint is missing.".to_string()),
    }

    match connection_string {
        Some(connection_string) => {
            let live_publish_target_id = current_publish_target_id
                .clone()
                .unwrap_or_else(|| expected_publish_target_id.clone());
            let live_environment = current_environment
                .clone()
                .unwrap_or_else(|| expected_environment.clone());

            match resolve_publish_target(
                live_publish_target_id,
                live_environment,
                connection_string,
            )
            .await
            {
                Ok(target) => {
                    current_target_fingerprint = Some(target.target_fingerprint.clone());

                    if target.target_fingerprint != expected_target_fingerprint {
                        reasons.push(format!(
                            "Live publish target fingerprint changed: expected {expected_target_fingerprint}, current {}.",
                            target.target_fingerprint
                        ));
                    }
                }
                Err(error) => {
                    reasons.push(format!(
                        "Failed to resolve the live publish target fingerprint: {error}"
                    ));
                }
            }
        }
        None => reasons.push("Configured publish target connection string is missing.".to_string()),
    }

    Ok(DesktopHearthstonePublishTargetValidationResult {
        is_valid: reasons.is_empty(),
        reasons,
        current_publish_target_id,
        current_environment,
        current_target_fingerprint,
    })
}

#[cfg(test)]
mod tests {
    use super::{
        compute_target_fingerprint, parse_postgres_endpoint, resolve_target_endpoint,
        PostgresTargetEndpoint,
    };
    use crate::desktop_database::DesktopDatabaseIdentity;

    /// URL-style PostgreSQL connection strings should expose host and port for fallback use.
    #[test]
    fn parses_postgres_endpoint_from_url() {
        let endpoint = parse_postgres_endpoint("postgres://user:pass@Db.EXAMPLE.com:6543/cards")
            .expect("endpoint");

        assert_eq!(endpoint.host, "db.example.com");
        assert_eq!(endpoint.port, 6543);
    }

    /// Keyword PostgreSQL connection strings should expose host and default port when omitted.
    #[test]
    fn parses_postgres_endpoint_from_keywords() {
        let endpoint =
            parse_postgres_endpoint("host=Db.EXAMPLE.com user=cards dbname=tcg_cards_remote_dev")
                .expect("endpoint");

        assert_eq!(endpoint.host, "db.example.com");
        assert_eq!(endpoint.port, 5432);
    }

    /// Live session data should win when PostgreSQL already reports the connected server address.
    #[test]
    fn prefers_live_server_identity_over_connection_string_fallback() {
        let identity = DesktopDatabaseIdentity {
            database_name: "cards".to_string(),
            user_name: "writer".to_string(),
            server_host: Some("10.0.0.5".to_string()),
            server_port: Some(6432),
        };

        let endpoint =
            resolve_target_endpoint(&identity, "postgres://user:pass@db.example.com:5432/cards");

        assert_eq!(endpoint.host, "10.0.0.5");
        assert_eq!(endpoint.port, 6432);
    }

    /// Fingerprints should stay stable for semantically identical normalized endpoints.
    #[test]
    fn computes_stable_target_fingerprint() {
        let identity = DesktopDatabaseIdentity {
            database_name: "cards".to_string(),
            user_name: "writer".to_string(),
            server_host: None,
            server_port: None,
        };
        let endpoint = PostgresTargetEndpoint {
            host: "db.example.com".to_string(),
            port: 5432,
        };

        let left = compute_target_fingerprint(&endpoint, &identity);
        let right = compute_target_fingerprint(
            &PostgresTargetEndpoint {
                host: "db.example.com".to_string(),
                port: 5432,
            },
            &identity,
        );

        assert_eq!(left, right);
    }
}
