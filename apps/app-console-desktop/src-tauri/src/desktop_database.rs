use std::time::Duration;

use sea_orm::{
    ConnectOptions, ConnectionTrait, Database, DatabaseConnection, DbBackend, QueryResult, Statement,
    TransactionTrait, TryGetable,
};
use tauri::AppHandle;
use tokio::time::timeout;

use crate::desktop_database_settings::require_desktop_database_connection_string;

const DESKTOP_DATABASE_CONNECT_TIMEOUT: Duration = Duration::from_secs(5);
const DESKTOP_DATABASE_QUERY_TIMEOUT: Duration = Duration::from_secs(5);
const DESKTOP_DATABASE_TRANSACTION_TIMEOUT: Duration = Duration::from_secs(5);
const DESKTOP_DATABASE_SCHEMA_SEARCH_PATH: &str = "hearthstone_data, hearthstone, public";

/// Database identity resolved from one desktop PostgreSQL session.
pub(crate) struct DesktopDatabaseIdentity {
    pub(crate) database_name: String,
    pub(crate) user_name: String,
}

/// SeaORM connection used by desktop local data-processing commands.
pub(crate) struct DesktopDatabase {
    connection: DatabaseConnection,
}

impl DesktopDatabase {
    /// SeaORM connection opened with one explicit PostgreSQL connection string.
    pub(crate) async fn connect(connection_string: &str) -> Result<Self, String> {
        let mut options = ConnectOptions::new(connection_string.to_string());
        // Keep the hsdata and hearthstone schemas on the session search path so generated SeaORM
        // enums resolve correctly even when codegen emits unqualified Postgres enum names.
        options.set_schema_search_path(DESKTOP_DATABASE_SCHEMA_SEARCH_PATH);

        let connection = timeout(
            DESKTOP_DATABASE_CONNECT_TIMEOUT,
            Database::connect(options),
        )
        .await
        .map_err(|_| "Timed out while connecting to PostgreSQL.".to_string())?
        .map_err(|error| format!("Failed to connect to PostgreSQL: {error}"))?;

        Ok(Self { connection })
    }

    /// Borrowed SeaORM connection for desktop queries.
    pub(crate) fn connection(&self) -> &DatabaseConnection {
        &self.connection
    }

    /// Transaction started from the current desktop PostgreSQL connection.
    pub(crate) async fn transaction(&self) -> Result<sea_orm::DatabaseTransaction, String> {
        timeout(
            DESKTOP_DATABASE_TRANSACTION_TIMEOUT,
            self.connection.begin(),
        )
        .await
        .map_err(|_| "Timed out while starting PostgreSQL transaction.".to_string())?
        .map_err(|error| format!("Failed to start PostgreSQL transaction: {error}"))
    }
}

/// Configured SeaORM connection loaded from desktop secure storage.
pub(crate) async fn connect_configured_desktop_database(
    app: &AppHandle,
) -> Result<DesktopDatabase, String> {
    let connection_string = require_desktop_database_connection_string(app)?;
    DesktopDatabase::connect(&connection_string).await
}

/// PostgreSQL statement built from one static SQL string.
pub(crate) fn postgres_statement(sql: &str) -> Statement {
    Statement::from_string(DbBackend::Postgres, sql.to_string())
}

/// PostgreSQL statement built from SQL plus one explicit value list.
pub(crate) fn postgres_statement_with_values(sql: &str, values: Vec<sea_orm::Value>) -> Statement {
    Statement::from_sql_and_values(DbBackend::Postgres, sql, values)
}

/// Typed column loaded from one raw SeaORM query row.
pub(crate) fn read_query_value<T>(row: &QueryResult, column: &str) -> Result<T, String>
where
    T: TryGetable,
{
    row.try_get("", column)
        .map_err(|error| format!("Failed to decode PostgreSQL column {column}: {error}"))
}

/// Database identity loaded from one borrowed SeaORM connection.
pub(crate) async fn read_desktop_database_identity(
    connection: &DatabaseConnection,
) -> Result<DesktopDatabaseIdentity, String> {
    let row = timeout(
        DESKTOP_DATABASE_QUERY_TIMEOUT,
        connection.query_one(postgres_statement(
            "select current_database()::text as database_name, current_user::text as user_name",
        )),
    )
    .await
    .map_err(|_| "Timed out while querying PostgreSQL.".to_string())?
    .map_err(|error| format!("Failed to query PostgreSQL: {error}"))?
    .ok_or_else(|| "Failed to load PostgreSQL identity.".to_string())?;

    Ok(DesktopDatabaseIdentity {
        database_name: read_query_value(&row, "database_name")?,
        user_name: read_query_value(&row, "user_name")?,
    })
}
