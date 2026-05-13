use serde::Serialize;

use crate::{trim_non_empty, CREDENTIAL_SERVICE};

const DATABASE_EXTERNAL_LOCAL_PG_ACCOUNT: &str = "database-external-local-pg";

/// Database connection settings returned to the desktop frontend.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DesktopDatabaseSettings {
    pub(crate) external_connection_string: Option<String>,
}

/// Optional external PostgreSQL connection string loaded from desktop secure storage.
pub(crate) fn load_desktop_database_connection_string() -> Result<Option<String>, String> {
    let entry = keyring::Entry::new(CREDENTIAL_SERVICE, DATABASE_EXTERNAL_LOCAL_PG_ACCOUNT)
        .map_err(|error| format!("Failed to open database credential entry: {error}"))?;

    match entry.get_password() {
        Ok(connection_string) => {
            let trimmed_connection_string = trim_non_empty(Some(connection_string));
            eprintln!(
                "[desktop][database] loaded external PostgreSQL connection string: found={}, nonEmpty={}",
                true,
                trimmed_connection_string.is_some(),
            );
            Ok(trimmed_connection_string)
        }
        Err(keyring::Error::NoEntry) => {
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
pub(crate) fn require_desktop_database_connection_string() -> Result<String, String> {
    load_desktop_database_connection_string()?
        .ok_or_else(|| "External local PostgreSQL connection string is required.".to_string())
}

/// External PostgreSQL connection string persisted to desktop secure storage.
pub(crate) fn store_desktop_database_connection_string(
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

            Ok(())
        }
        None => match entry.delete_credential() {
            Ok(()) => {
                eprintln!(
                    "[desktop][database] cleared external PostgreSQL connection string: deleted=true"
                );
                Ok(())
            }
            Err(keyring::Error::NoEntry) => {
                eprintln!(
                    "[desktop][database] cleared external PostgreSQL connection string: deleted=false reason=no-entry"
                );
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
pub(crate) fn load_desktop_database_settings() -> Result<DesktopDatabaseSettings, String> {
    Ok(build_desktop_database_settings(
        load_desktop_database_connection_string()?,
    ))
}
