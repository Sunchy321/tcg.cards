use std::sync::Mutex;
use std::time::Instant;

use serde::{Deserialize, Serialize};
use serde_json::json;
use tauri::{AppHandle, Manager};

use crate::desktop_runtime_config_sync::{post_runtime_json, schedule_desktop_runtime_config_sync};
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
    pub(crate) publish_target: Option<String>,
    pub(crate) environment: Option<String>,
    pub(crate) target_fingerprint: Option<String>,
    pub(crate) connection_string: Option<String>,
}

/// Resolved publish target identity returned after one live connection test.
#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DesktopHearthstonePublishTargetTestResult {
    publish_target: String,
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
    current_publish_target: Option<String>,
    current_environment: Option<String>,
    current_target_fingerprint: Option<String>,
}

/// Fully resolved publish target identity derived from one live PostgreSQL session.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ResolvedHearthstonePublishTarget {
    pub(crate) publish_target: String,
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
        publish_target: profile.map(|profile| profile.publish_target.clone()),
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

/// Publish target fields normalized from one explicit frontend request.
fn resolve_requested_target_fields(
    publish_target: Option<String>,
    environment: Option<String>,
    connection_string: Option<String>,
) -> Result<Option<(String, String, String)>, String> {
    let publish_target = trim_non_empty(publish_target);
    let environment = trim_non_empty(environment);
    let connection_string = trim_non_empty(connection_string);

    if publish_target.is_none() && environment.is_none() && connection_string.is_none() {
        return Ok(None);
    }

    let publish_target = publish_target
        .ok_or_else(|| "Hearthstone publish target is required.".to_string())?;
    let environment = environment
        .ok_or_else(|| "Hearthstone publish target environment is required.".to_string())?;
    let connection_string = connection_string
        .ok_or_else(|| "Hearthstone publish target connection string is required.".to_string())?;

    Ok(Some((publish_target, environment, connection_string)))
}

/// Live publish target identity resolved from one explicit profile and connection string.
async fn resolve_publish_target(
    publish_target: String,
    environment: String,
    connection_string: String,
) -> Result<ResolvedHearthstonePublishTarget, String> {
    post_runtime_json(
        "desktop/test-hearthstone-publish-target",
        json!({
            "publishTarget": publish_target,
            "environment": environment,
            "connectionString": connection_string,
        }),
    )
    .await
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
        profile.publish_target.clone(),
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
    publish_target: Option<String>,
    environment: Option<String>,
    connection_string: Option<String>,
) -> Result<DesktopHearthstonePublishTargetTestResult, String> {
    let (publish_target, environment, connection_string) =
        resolve_requested_target_fields(publish_target, environment, connection_string)?
            .ok_or_else(|| "Hearthstone publish target settings are required.".to_string())?;
    let started_at = Instant::now();
    let target = resolve_publish_target(publish_target, environment, connection_string).await?;

    Ok(DesktopHearthstonePublishTargetTestResult {
        publish_target: target.publish_target,
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
    publish_target: Option<String>,
    environment: Option<String>,
    connection_string: Option<String>,
) -> Result<DesktopHearthstonePublishTargetSettings, String> {
    let requested =
        resolve_requested_target_fields(publish_target, environment, connection_string)?;

    let Some((publish_target, environment, connection_string)) = requested else {
        store_publish_target_profile(&app, None)?;
        store_publish_target_connection_string(&app, None)?;
        schedule_desktop_runtime_config_sync(app.clone());
        return Ok(DesktopHearthstonePublishTargetSettings {
            publish_target: None,
            environment: None,
            target_fingerprint: None,
            connection_string: None,
        });
    };

    let target = resolve_publish_target(
        publish_target.clone(),
        environment.clone(),
        connection_string.clone(),
    )
    .await?;

    store_publish_target_connection_string(&app, Some(connection_string.clone()))?;
    store_publish_target_profile(
        &app,
        Some(StoredHearthstonePublishTargetProfile {
            publish_target,
            environment,
            target_fingerprint: target.target_fingerprint.clone(),
        }),
    )?;
    schedule_desktop_runtime_config_sync(app.clone());

    Ok(DesktopHearthstonePublishTargetSettings {
        publish_target: Some(target.publish_target),
        environment: Some(target.environment),
        target_fingerprint: Some(target.target_fingerprint),
        connection_string: Some(connection_string),
    })
}

/// Expected binding validated against the currently configured target profile and live database.
#[tauri::command]
pub(crate) async fn desktop_validate_hearthstone_publish_target_binding(
    app: AppHandle,
    publish_target: String,
    environment: String,
    target_fingerprint: String,
) -> Result<DesktopHearthstonePublishTargetValidationResult, String> {
    let expected_publish_target = trim_non_empty(Some(publish_target))
        .ok_or_else(|| "Expected Hearthstone publish target is required.".to_string())?;
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
    let current_publish_target = profile
        .as_ref()
        .map(|profile| profile.publish_target.clone());
    let current_environment = profile.as_ref().map(|profile| profile.environment.clone());
    let mut current_target_fingerprint = profile
        .as_ref()
        .map(|profile| profile.target_fingerprint.clone());

    match current_publish_target.as_deref() {
        Some(current_publish_target) if current_publish_target == expected_publish_target => {}
        Some(current_publish_target) => reasons.push(format!(
            "Configured publish target changed: expected {expected_publish_target}, current {current_publish_target}."
        )),
        None => reasons.push("Configured publish target is missing.".to_string()),
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
            let live_publish_target = current_publish_target
                .clone()
                .unwrap_or_else(|| expected_publish_target.clone());
            let live_environment = current_environment
                .clone()
                .unwrap_or_else(|| expected_environment.clone());

            match resolve_publish_target(
                live_publish_target,
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
        current_publish_target,
        current_environment,
        current_target_fingerprint,
    })
}
