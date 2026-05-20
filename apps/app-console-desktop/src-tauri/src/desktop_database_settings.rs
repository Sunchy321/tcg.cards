use std::sync::Mutex;

use serde::Serialize;
use tauri::{AppHandle, Manager};

use crate::{load_desktop_config, store_desktop_config, trim_non_empty};

/// In-process cache for the configured desktop PostgreSQL connection string.
pub(crate) struct DesktopDatabaseConnectionStringCache {
    current: Mutex<Option<Option<String>>>,
}

impl Default for DesktopDatabaseConnectionStringCache {
    fn default() -> Self {
        Self {
            current: Mutex::new(None),
        }
    }
}

/// Database connection settings returned to the desktop frontend.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DesktopDatabaseSettings {
    pub(crate) external_connection_string: Option<String>,
}

/// In-process cache updated after the desktop runtime loads or stores the connection string.
fn write_cached_connection_string(
    app: &AppHandle,
    connection_string: Option<String>,
) -> Result<(), String> {
    let cache = app.state::<DesktopDatabaseConnectionStringCache>();
    let mut current = cache
        .current
        .lock()
        .map_err(|_| "Failed to lock database connection string cache.".to_string())?;
    *current = Some(connection_string);
    Ok(())
}

/// In-process cache cleared before the next config-backed database read.
pub(crate) fn clear_desktop_database_connection_string_cache(
    app: &AppHandle,
) -> Result<(), String> {
    let cache = app.state::<DesktopDatabaseConnectionStringCache>();
    let mut current = cache
        .current
        .lock()
        .map_err(|_| "Failed to lock database connection string cache.".to_string())?;
    *current = None;
    Ok(())
}

/// Optional external PostgreSQL connection string loaded from the desktop config file.
pub(crate) fn load_desktop_database_connection_string(
    app: &AppHandle,
) -> Result<Option<String>, String> {
    let cache = app.state::<DesktopDatabaseConnectionStringCache>();
    let mut current = cache
        .current
        .lock()
        .map_err(|_| "Failed to lock database connection string cache.".to_string())?;

    if let Some(connection_string) = current.clone() {
        eprintln!(
            "[desktop][database] reused cached external PostgreSQL connection string: found={}, nonEmpty={}",
            connection_string.is_some(),
            connection_string.is_some(),
        );
        return Ok(connection_string);
    }

    let config = load_desktop_config(app)?;
    let connection_string = trim_non_empty(config.external_database_connection_string);
    *current = Some(connection_string.clone());

    eprintln!(
        "[desktop][database] loaded external PostgreSQL connection string from config: found={}, nonEmpty={}",
        connection_string.is_some(),
        connection_string.is_some(),
    );

    Ok(connection_string)
}

/// Required external PostgreSQL connection string loaded from the desktop config file.
pub(crate) fn require_desktop_database_connection_string(
    app: &AppHandle,
) -> Result<String, String> {
    load_desktop_database_connection_string(app)?
        .ok_or_else(|| "External local PostgreSQL connection string is required.".to_string())
}

/// External PostgreSQL connection string persisted to the desktop config file.
pub(crate) fn store_desktop_database_connection_string(
    app: &AppHandle,
    connection_string: Option<String>,
) -> Result<(), String> {
    let connection_string = trim_non_empty(connection_string);
    let mut config = load_desktop_config(app)?;
    config.external_database_connection_string = connection_string.clone();
    store_desktop_config(app, &config)?;

    eprintln!(
        "[desktop][database] stored external PostgreSQL connection string in config: found={}, nonEmpty={}",
        connection_string.is_some(),
        connection_string.is_some(),
    );

    write_cached_connection_string(app, connection_string)
}

/// Frontend settings payload built from one resolved connection string value.
pub(crate) fn build_desktop_database_settings(
    external_connection_string: Option<String>,
) -> DesktopDatabaseSettings {
    DesktopDatabaseSettings {
        external_connection_string,
    }
}

/// Frontend settings payload loaded from the desktop config file.
pub(crate) fn load_desktop_database_settings(
    app: &AppHandle,
) -> Result<DesktopDatabaseSettings, String> {
    Ok(build_desktop_database_settings(
        load_desktop_database_connection_string(app)?,
    ))
}
