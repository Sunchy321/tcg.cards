use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::sync::Mutex;

#[derive(Default)]
struct AuthState {
    current: Mutex<Option<SessionClient>>,
}

struct SessionClient {
    base_url: String,
    client: Client,
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

impl From<RemoteAuthState> for DesktopAuthState {
    fn from(value: RemoteAuthState) -> Self {
        Self {
            session: DesktopSession {
                id: value.session.id,
                expires_at: value.session.expires_at,
            },
            user: DesktopUser {
                id: value.user.id,
                name: value.user.name,
                email: value.user.email,
                username: value.user.username,
                role: value.user.role,
            },
        }
    }
}

fn build_url(base_url: &str, path: &str) -> String {
    format!("{}{}", base_url.trim_end_matches('/'), path)
}

fn create_client() -> Result<Client, String> {
    Client::builder()
        .cookie_store(true)
        .user_agent("tcg-cards-console-desktop")
        .build()
        .map_err(|error| format!("Failed to create auth client: {error}"))
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

async fn fetch_session(
    client: &Client,
    base_url: &str,
) -> Result<Option<DesktopAuthState>, String> {
    let response = client
        .get(build_url(base_url, "/auth/get-session"))
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

    Ok(session.map(Into::into))
}

#[tauri::command]
async fn auth_sign_in(
    state: tauri::State<'_, AuthState>,
    base_url: String,
    username: String,
    password: String,
) -> Result<DesktopAuthState, String> {
    let client = create_client()?;

    let response = client
        .post(build_url(&base_url, "/auth/sign-in/username"))
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

    let session = fetch_session(&client, &base_url)
        .await?
        .ok_or_else(|| "Sign in succeeded but no session was returned".to_string())?;

    let mut current = state
        .current
        .lock()
        .map_err(|_| "Failed to update auth state".to_string())?;

    *current = Some(SessionClient { base_url, client });

    Ok(session)
}

#[tauri::command]
async fn auth_get_session(
    state: tauri::State<'_, AuthState>,
) -> Result<Option<DesktopAuthState>, String> {
    let (base_url, client) = {
        let current = state
            .current
            .lock()
            .map_err(|_| "Failed to read auth state".to_string())?;

        let Some(current) = current.as_ref() else {
            return Ok(None);
        };

        (current.base_url.clone(), current.client.clone())
    };

    fetch_session(&client, &base_url).await
}

#[tauri::command]
async fn auth_sign_out(state: tauri::State<'_, AuthState>) -> Result<(), String> {
    let (base_url, client) = {
        let current = state
            .current
            .lock()
            .map_err(|_| "Failed to read auth state".to_string())?;

        let Some(current) = current.as_ref() else {
            return Ok(());
        };

        (current.base_url.clone(), current.client.clone())
    };

    let response = client
        .post(build_url(&base_url, "/auth/sign-out"))
        .header(reqwest::header::ACCEPT, "application/json")
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

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(AuthState::default())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            auth_sign_in,
            auth_get_session,
            auth_sign_out
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
