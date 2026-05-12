use std::time::{Duration, Instant};

use serde::Serialize;
use tauri::async_runtime;
use tokio::time::timeout;
use tokio_postgres::NoTls;

use crate::{trim_non_empty, CREDENTIAL_SERVICE};

/// Resolved database settings returned to the desktop frontend.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DesktopDatabaseSettings {
    external_connection_string: Option<String>,
}

/// Connection test result returned to the desktop frontend.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DesktopDatabaseConnectionTestResult {
    database_name: String,
    user_name: String,
    latency_ms: u128,
}

const DATABASE_EXTERNAL_LOCAL_PG_ACCOUNT: &str = "database-external-local-pg";

/// External PostgreSQL connection string loaded from secure storage.
fn load_external_local_pg_connection_string() -> Result<Option<String>, String> {
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

/// External PostgreSQL connection string persisted to secure storage.
fn store_external_local_pg_connection_string(
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

/// Database settings resolved from secure storage.
fn resolve_desktop_database_settings() -> Result<DesktopDatabaseSettings, String> {
    Ok(DesktopDatabaseSettings {
        external_connection_string: load_external_local_pg_connection_string()?,
    })
}

/// Database settings resolved from one already-known connection string value.
fn build_desktop_database_settings(
    external_connection_string: Option<String>,
) -> DesktopDatabaseSettings {
    DesktopDatabaseSettings {
        external_connection_string,
    }
}

/// External PostgreSQL connection string resolved from one explicit test request.
fn resolve_database_test_connection_string(
    external_connection_string: Option<String>,
) -> Result<String, String> {
    let external_connection_string = trim_non_empty(external_connection_string)
        .ok_or_else(|| "External local PostgreSQL connection string is required.".to_string())?;

    Ok(external_connection_string)
}

/// Executes one database connection probe against the configured PostgreSQL server.
async fn test_external_local_pg_connection_inner(
    external_connection_string: String,
) -> Result<DesktopDatabaseConnectionTestResult, String> {
    let started_at = Instant::now();
    let connect_result = timeout(
        Duration::from_secs(5),
        tokio_postgres::connect(&external_connection_string, NoTls),
    )
    .await
    .map_err(|_| "Timed out while connecting to PostgreSQL.".to_string())?
    .map_err(|error| format!("Failed to connect to PostgreSQL: {error}"))?;

    let (client, connection) = connect_result;
    async_runtime::spawn(async move {
        if let Err(error) = connection.await {
            eprintln!("[desktop][database] PostgreSQL connection task failed: {error}");
        }
    });

    let row = timeout(
        Duration::from_secs(5),
        client.query_one(
            "select current_database()::text as database_name, current_user::text as user_name",
            &[],
        ),
    )
    .await
    .map_err(|_| "Timed out while querying PostgreSQL.".to_string())?
    .map_err(|error| format!("Failed to query PostgreSQL: {error}"))?;

    Ok(DesktopDatabaseConnectionTestResult {
        database_name: row.get::<usize, String>(0),
        user_name: row.get::<usize, String>(1),
        latency_ms: started_at.elapsed().as_millis(),
    })
}

/// Database settings loaded by the desktop frontend.
#[tauri::command]
pub(crate) fn desktop_get_database_settings() -> Result<DesktopDatabaseSettings, String> {
    resolve_desktop_database_settings()
}

/// Database connection tested by the desktop frontend.
#[tauri::command]
pub(crate) async fn desktop_test_database_connection(
    external_connection_string: Option<String>,
) -> Result<DesktopDatabaseConnectionTestResult, String> {
    let external_connection_string =
        resolve_database_test_connection_string(external_connection_string)?;

    test_external_local_pg_connection_inner(external_connection_string).await
}

/// Database settings persisted from the desktop frontend.
#[tauri::command]
pub(crate) fn desktop_set_database_settings(
    external_connection_string: Option<String>,
) -> Result<DesktopDatabaseSettings, String> {
    let external_connection_string = trim_non_empty(external_connection_string);

    if external_connection_string.is_none() {
        return Err("External local PostgreSQL connection string is required.".to_string());
    }

    store_external_local_pg_connection_string(external_connection_string.clone())?;

    Ok(build_desktop_database_settings(external_connection_string))
}
