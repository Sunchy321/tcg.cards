use std::time::Instant;

use serde::{Deserialize, Serialize};
use serde_json::json;
use tauri::AppHandle;
use uuid::Uuid;

use crate::desktop_runtime_config_sync::{post_runtime_json, schedule_desktop_runtime_config_sync};
use crate::{
    load_desktop_config, store_desktop_config, trim_non_empty, CREDENTIAL_SERVICE,
    StoredPublishTargetProfile,
};
const PUBLISH_TARGET_CREDENTIAL_ACCOUNT_PREFIX: &str = "publish-target:";

/// Publish target settings returned to the desktop frontend.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DesktopPublishTargetSettings {
    pub(crate) publish_target: Option<String>,
    pub(crate) environment: Option<String>,
    pub(crate) target_fingerprint: Option<String>,
    pub(crate) connection_string: Option<String>,
}

/// Publish target row returned to the desktop frontend.
#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DesktopPublishTarget {
    pub(crate) credential_key: Option<String>,
    pub(crate) publish_target: String,
    pub(crate) environment: String,
    pub(crate) target_fingerprint: String,
    pub(crate) connection_string: Option<String>,
}

/// Stable credential key generated for one publish target profile.
fn generate_publish_target_credential_key() -> String {
    Uuid::new_v4().to_string()
}

/// Keyring account name derived from one publish target credential key.
fn build_publish_target_credential_account(credential_key: &str) -> String {
    format!("{PUBLISH_TARGET_CREDENTIAL_ACCOUNT_PREFIX}{credential_key}")
}

/// Resolved publish target identity returned after one live connection test.
#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DesktopPublishTargetTestResult {
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
pub(crate) struct DesktopPublishTargetValidationResult {
    is_valid: bool,
    reasons: Vec<String>,
    current_publish_target: Option<String>,
    current_environment: Option<String>,
    current_target_fingerprint: Option<String>,
}

/// Fully resolved publish target identity derived from one live PostgreSQL session.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ResolvedPublishTarget {
    pub(crate) publish_target: String,
    pub(crate) environment: String,
    pub(crate) target_fingerprint: String,
    pub(crate) database_name: String,
    pub(crate) user_name: String,
    pub(crate) server_host: String,
    pub(crate) server_port: u16,
}

/// Publish-target PostgreSQL connection string loaded from secure storage by one credential key.
fn load_publish_target_connection_string_by_key(
    credential_key: &str,
) -> Result<Option<String>, String> {
    let entry = keyring::Entry::new(
        CREDENTIAL_SERVICE,
        &build_publish_target_credential_account(credential_key),
    )
    .map_err(|error| format!("Failed to open publish target credential entry: {error}"))?;

    match entry.get_password() {
        Ok(connection_string) => Ok(trim_non_empty(Some(connection_string))),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(error) => Err(format!(
            "Failed to read publish target connection string: {error}"
        )),
    }
}

/// Publish-target PostgreSQL connection string stored in secure storage by one credential key.
fn store_publish_target_connection_string_by_key(
    credential_key: &str,
    connection_string: Option<String>,
) -> Result<(), String> {
    let entry = keyring::Entry::new(
        CREDENTIAL_SERVICE,
        &build_publish_target_credential_account(credential_key),
    )
    .map_err(|error| format!("Failed to open publish target credential entry: {error}"))?;

    match trim_non_empty(connection_string) {
        Some(connection_string) => entry
            .set_password(&connection_string)
            .map_err(|error| format!("Failed to store publish target connection string: {error}")),
        None => match entry.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(error) => Err(format!(
                "Failed to clear publish target connection string: {error}"
            )),
        },
    }
}

/// Frontend settings payload built from one stored config profile plus secure connection string.
fn build_publish_target_settings(
    profile: Option<&StoredPublishTargetProfile>,
    connection_string: Option<String>,
) -> DesktopPublishTargetSettings {
    DesktopPublishTargetSettings {
        publish_target: profile.and_then(|profile| profile.publish_target.clone()),
        environment: profile.and_then(|profile| profile.environment.clone()),
        target_fingerprint: profile.and_then(|profile| profile.target_fingerprint.clone()),
        connection_string,
    }
}

/// Connection string resolved from one stored profile using its keyed credential when available.
fn resolve_profile_connection_string(
    profile: &StoredPublishTargetProfile,
) -> Result<Option<String>, String> {
    match trim_non_empty(profile.credential_key.clone()) {
        Some(credential_key) => load_publish_target_connection_string_by_key(&credential_key),
        None => Ok(None),
    }
}

/// Publish target row built from one stored config profile.
fn build_publish_target_row(
    profile: &StoredPublishTargetProfile,
) -> Result<Option<DesktopPublishTarget>, String> {
    let credential_key = trim_non_empty(profile.credential_key.clone())
        .unwrap_or_else(generate_publish_target_credential_key);
    let Some(publish_target) = trim_non_empty(profile.publish_target.clone()) else {
        return Ok(None);
    };
    let Some(environment) = trim_non_empty(profile.environment.clone()) else {
        return Ok(None);
    };
    let Some(target_fingerprint) = trim_non_empty(profile.target_fingerprint.clone()) else {
        return Ok(None);
    };

    Ok(Some(DesktopPublishTarget {
        credential_key: Some(credential_key.clone()),
        publish_target,
        environment,
        target_fingerprint,
        connection_string: match trim_non_empty(profile.credential_key.clone()) {
            Some(_) => load_publish_target_connection_string_by_key(&credential_key)?,
            None => None,
        },
    }))
}

/// Stored publish target profile loaded from the desktop config file.
pub(crate) fn load_publish_target_profile(
    app: &AppHandle,
) -> Result<Option<StoredPublishTargetProfile>, String> {
    let config = load_desktop_config(app)?;
    let profile = config.publish.first().cloned();

    Ok(profile.and_then(|profile| {
        let publish_target = trim_non_empty(profile.publish_target);
        let environment = trim_non_empty(profile.environment);
        let target_fingerprint = trim_non_empty(profile.target_fingerprint);

        match (publish_target, environment, target_fingerprint) {
            (Some(publish_target), Some(environment), Some(target_fingerprint)) => {
                Some(StoredPublishTargetProfile {
                    credential_key: trim_non_empty(profile.credential_key),
                    publish_target: Some(publish_target),
                    environment: Some(environment),
                    target_fingerprint: Some(target_fingerprint),
                })
            }
            _ => None,
        }
    }))
}

/// Publish target profile written into the desktop config file.
fn store_publish_target_profile(
    app: &AppHandle,
    profile: Option<StoredPublishTargetProfile>,
) -> Result<(), String> {
    let mut config = load_desktop_config(app)?;
    let remaining = if config.publish.len() > 1 {
        config.publish.split_off(1)
    } else {
        Vec::new()
    };

    match profile {
        Some(profile) => {
            config.publish = vec![profile];
            config.publish.extend(remaining);
        }
        None => config.publish = remaining,
    }

    store_desktop_config(app, &config)
}

/// Publish target rows written into the desktop config file.
fn store_publish_target_rows(
    app: &AppHandle,
    rows: Vec<StoredPublishTargetProfile>,
) -> Result<(), String> {
    let mut config = load_desktop_config(app)?;
    config.publish = rows;

    store_desktop_config(app, &config)
}

/// Frontend settings payload loaded from the primary desktop publish row plus secure storage.
pub(crate) fn load_publish_target_settings(
    app: &AppHandle,
) -> Result<DesktopPublishTargetSettings, String> {
    let profile = load_publish_target_profile(app)?;
    let connection_string = match profile.as_ref() {
        Some(profile) => resolve_profile_connection_string(profile)?,
        None => None,
    };

    Ok(build_publish_target_settings(
        profile.as_ref(),
        connection_string,
    ))
}

/// Publish target rows loaded from desktop config plus secure storage.
pub(crate) fn load_publish_target_rows(
    app: &AppHandle,
) -> Result<Vec<DesktopPublishTarget>, String> {
    let config = load_desktop_config(app)?;

    let mut rows = Vec::new();

    for profile in &config.publish {
        if let Some(row) = build_publish_target_row(profile)? {
            rows.push(row);
        }
    }

    Ok(rows)
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
        .ok_or_else(|| "Publish target is required.".to_string())?;
    let environment = environment
        .ok_or_else(|| "Publish target environment is required.".to_string())?;
    let connection_string = connection_string
        .ok_or_else(|| "Publish target connection string is required.".to_string())?;

    Ok(Some((publish_target, environment, connection_string)))
}

/// Live publish target identity resolved from one explicit profile and connection string.
async fn resolve_publish_target(
    publish_target: String,
    environment: String,
    connection_string: String,
) -> Result<ResolvedPublishTarget, String> {
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
) -> Result<ResolvedPublishTarget, String> {
    let profile = load_publish_target_profile(app)?
        .ok_or_else(|| "Publish target profile is not configured.".to_string())?;
    let connection_string =
        resolve_profile_connection_string(&profile)?.ok_or_else(|| {
            "Publish target connection string is not configured.".to_string()
        })?;
    let target = resolve_publish_target(
        profile.publish_target.clone().unwrap_or_default(),
        profile.environment.clone().unwrap_or_default(),
        connection_string,
    )
    .await?;

    if Some(target.target_fingerprint.clone()) != profile.target_fingerprint {
        return Err(format!(
            "Configured Publish target fingerprint changed: expected {}, current {}.",
            profile.target_fingerprint.clone().unwrap_or_default(),
            target.target_fingerprint
        ));
    }

    Ok(target)
}

/// Frontend settings payload loaded by the desktop frontend.
#[tauri::command]
pub(crate) fn desktop_get_publish_target(
    app: AppHandle,
) -> Result<DesktopPublishTargetSettings, String> {
    load_publish_target_settings(&app)
}

/// Publish target rows loaded by the desktop frontend.
#[tauri::command]
pub(crate) fn desktop_get_publish_targets(
    app: AppHandle,
) -> Result<Vec<DesktopPublishTarget>, String> {
    load_publish_target_rows(&app)
}

/// Publish target connection tested without mutating stored desktop settings.
#[tauri::command]
pub(crate) async fn desktop_test_publish_target(
    publish_target: Option<String>,
    environment: Option<String>,
    connection_string: Option<String>,
) -> Result<DesktopPublishTargetTestResult, String> {
    let (publish_target, environment, connection_string) =
        resolve_requested_target_fields(publish_target, environment, connection_string)?
            .ok_or_else(|| "Publish target settings are required.".to_string())?;
    let started_at = Instant::now();
    let target = resolve_publish_target(publish_target, environment, connection_string).await?;

    Ok(DesktopPublishTargetTestResult {
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
pub(crate) async fn desktop_set_publish_target(
    app: AppHandle,
    publish_target: Option<String>,
    environment: Option<String>,
    connection_string: Option<String>,
) -> Result<DesktopPublishTargetSettings, String> {
    let requested =
        resolve_requested_target_fields(publish_target, environment, connection_string)?;

    let Some((publish_target, environment, connection_string)) = requested else {
        if let Some(profile) = load_publish_target_profile(&app)? {
            if let Some(credential_key) = trim_non_empty(profile.credential_key) {
                store_publish_target_connection_string_by_key(&credential_key, None)?;
            }
        }

        store_publish_target_profile(&app, None)?;
        schedule_desktop_runtime_config_sync(app.clone());
        return Ok(DesktopPublishTargetSettings {
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

    let credential_key = load_publish_target_profile(&app)?
        .and_then(|profile| trim_non_empty(profile.credential_key))
        .unwrap_or_else(generate_publish_target_credential_key);

    store_publish_target_connection_string_by_key(&credential_key, Some(connection_string.clone()))?;
    store_publish_target_profile(
        &app,
        Some(StoredPublishTargetProfile {
            credential_key: Some(credential_key),
            publish_target: Some(publish_target),
            environment: Some(environment),
            target_fingerprint: Some(target.target_fingerprint.clone()),
        }),
    )?;
    schedule_desktop_runtime_config_sync(app.clone());

    Ok(DesktopPublishTargetSettings {
        publish_target: Some(target.publish_target),
        environment: Some(target.environment),
        target_fingerprint: Some(target.target_fingerprint),
        connection_string: Some(connection_string),
    })
}

/// Publish target rows persisted into desktop config plus secure storage.
#[tauri::command]
pub(crate) async fn desktop_set_publish_targets(
    app: AppHandle,
    targets: Vec<DesktopPublishTarget>,
) -> Result<Vec<DesktopPublishTarget>, String> {
    let existing = load_publish_target_rows(&app)?;

    if targets.is_empty() {
        for target in existing {
            if let Some(credential_key) = trim_non_empty(target.credential_key) {
                store_publish_target_connection_string_by_key(&credential_key, None)?;
            }
        }

        store_publish_target_rows(&app, Vec::new())?;
        schedule_desktop_runtime_config_sync(app.clone());
        return Ok(Vec::new());
    }

    let mut rows = Vec::with_capacity(targets.len());
    let mut next_credential_keys = Vec::with_capacity(targets.len());

    for target in targets {
        let credential_key = trim_non_empty(target.credential_key)
            .unwrap_or_else(generate_publish_target_credential_key);
        let publish_target = trim_non_empty(Some(target.publish_target))
            .ok_or_else(|| "Publish target is required.".to_string())?;
        let environment = trim_non_empty(Some(target.environment))
            .ok_or_else(|| "Publish target environment is required.".to_string())?;
        let target_fingerprint = trim_non_empty(Some(target.target_fingerprint))
            .ok_or_else(|| "Publish target fingerprint is required.".to_string())?;
        let connection_string = trim_non_empty(target.connection_string);

        store_publish_target_connection_string_by_key(&credential_key, connection_string)?;
        next_credential_keys.push(credential_key.clone());

        rows.push(StoredPublishTargetProfile {
            credential_key: Some(credential_key),
            publish_target: Some(publish_target),
            environment: Some(environment),
            target_fingerprint: Some(target_fingerprint),
        });
    }

    for target in existing {
        let Some(credential_key) = trim_non_empty(target.credential_key) else {
            continue;
        };

        if !next_credential_keys.iter().any(|key| key == &credential_key) {
            store_publish_target_connection_string_by_key(&credential_key, None)?;
        }
    }

    store_publish_target_rows(&app, rows)?;
    schedule_desktop_runtime_config_sync(app.clone());

    load_publish_target_rows(&app)
}

/// Expected binding validated against the currently configured target profile and live database.
#[tauri::command]
pub(crate) async fn desktop_validate_publish_target_binding(
    app: AppHandle,
    publish_target: String,
    environment: String,
    target_fingerprint: String,
) -> Result<DesktopPublishTargetValidationResult, String> {
    let expected_publish_target = trim_non_empty(Some(publish_target))
        .ok_or_else(|| "Expected Publish target is required.".to_string())?;
    let expected_environment = trim_non_empty(Some(environment)).ok_or_else(|| {
        "Expected Publish target environment is required.".to_string()
    })?;
    let expected_target_fingerprint =
        trim_non_empty(Some(target_fingerprint)).ok_or_else(|| {
            "Expected Publish target fingerprint is required.".to_string()
        })?;

    let profile = load_publish_target_profile(&app)?;
    let connection_string = match profile.as_ref() {
        Some(profile) => resolve_profile_connection_string(profile)?,
        None => None,
    };
    let mut reasons = Vec::new();
    let current_publish_target = profile
        .as_ref()
        .and_then(|profile| profile.publish_target.clone());
    let current_environment = profile
        .as_ref()
        .and_then(|profile| profile.environment.clone());
    let mut current_target_fingerprint = profile
        .as_ref()
        .and_then(|profile| profile.target_fingerprint.clone());

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

    Ok(DesktopPublishTargetValidationResult {
        is_valid: reasons.is_empty(),
        reasons,
        current_publish_target,
        current_environment,
        current_target_fingerprint,
    })
}
