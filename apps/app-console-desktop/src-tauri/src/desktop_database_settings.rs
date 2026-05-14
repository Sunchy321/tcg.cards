use std::sync::Mutex;

use serde::Serialize;
use tauri::{AppHandle, Manager};

use crate::{trim_non_empty, CREDENTIAL_SERVICE};

const DATABASE_EXTERNAL_LOCAL_PG_ACCOUNT: &str = "database-external-local-pg";

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

/// Optional external PostgreSQL connection string loaded from desktop secure storage.
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

    let entry = keyring::Entry::new(CREDENTIAL_SERVICE, DATABASE_EXTERNAL_LOCAL_PG_ACCOUNT)
        .map_err(|error| format!("Failed to open database credential entry: {error}"))?;

    match entry.get_password() {
        Ok(connection_string) => {
            let trimmed_connection_string = trim_non_empty(Some(connection_string));
            *current = Some(trimmed_connection_string.clone());
            eprintln!(
                "[desktop][database] loaded external PostgreSQL connection string: found={}, nonEmpty={}",
                true,
                trimmed_connection_string.is_some(),
            );
            Ok(trimmed_connection_string)
        }
        Err(keyring::Error::NoEntry) => {
            *current = Some(None);
            eprintln!(
                "[desktop][database] loaded external PostgreSQL connection string: found=false reason=no-entry"
            );
            Ok(None)
        }
        Err(error) => Err(format!(
            "Failed to read external local PostgreSQL connection string: {error}"
        )),
    }
}

/// Required external PostgreSQL connection string loaded from desktop secure storage.
pub(crate) fn require_desktop_database_connection_string(app: &AppHandle) -> Result<String, String> {
    load_desktop_database_connection_string(app)?
        .ok_or_else(|| "External local PostgreSQL connection string is required.".to_string())
}

/// External PostgreSQL connection string persisted to desktop secure storage.
pub(crate) fn store_desktop_database_connection_string(
    app: &AppHandle,
    connection_string: Option<String>,
) -> Result<(), String> {
    let entry = keyring::Entry::new(CREDENTIAL_SERVICE, DATABASE_EXTERNAL_LOCAL_PG_ACCOUNT)
        .map_err(|error| format!("Failed to open database credential entry: {error}"))?;

    match trim_non_empty(connection_string) {
        Some(connection_string) => {
            eprintln!(
                "[desktop][database] storing external PostgreSQL connection string: nonEmpty=true length={}",
                connection_string.len(),
            );
            entry.set_password(&connection_string).map_err(|error| {
                format!("Failed to store external local PostgreSQL connection string: {error}")
            })?;

            let stored_connection_string = entry.get_password().map_err(|error| {
                format!(
                    "Failed to verify external local PostgreSQL connection string after save: {error}"
                )
            })?;

            if stored_connection_string != connection_string {
                return Err(
                    "Stored external local PostgreSQL connection string did not match the saved value."
                        .to_string(),
                );
            }

            eprintln!(
                "[desktop][database] verified external PostgreSQL connection string after save: nonEmpty=true length={}",
                stored_connection_string.len(),
            );
            write_cached_connection_string(app, Some(connection_string))?;

            Ok(())
        }
        None => match entry.delete_credential() {
            Ok(()) => {
                eprintln!(
                    "[desktop][database] cleared external PostgreSQL connection string: deleted=true"
                );
                write_cached_connection_string(app, None)?;
                Ok(())
            }
            Err(keyring::Error::NoEntry) => {
                eprintln!(
                    "[desktop][database] cleared external PostgreSQL connection string: deleted=false reason=no-entry"
                );
                write_cached_connection_string(app, None)?;
                Ok(())
            }
            Err(error) => Err(format!(
                "Failed to clear external local PostgreSQL connection string: {error}"
            )),
        },
    }
}

/// Frontend settings payload built from one resolved connection string value.
pub(crate) fn build_desktop_database_settings(
    external_connection_string: Option<String>,
) -> DesktopDatabaseSettings {
    DesktopDatabaseSettings {
        external_connection_string,
    }
}

/// Frontend settings payload loaded from desktop secure storage.
pub(crate) fn load_desktop_database_settings(
    app: &AppHandle,
) -> Result<DesktopDatabaseSettings, String> {
    Ok(build_desktop_database_settings(
        load_desktop_database_connection_string(app)?,
    ))
}
