use std::fs;
use std::process::Command;

use serde::Serialize;
use serde_json::Value;
use tauri::AppHandle;

use crate::desktop_database_settings::clear_desktop_database_connection_string_cache;
use crate::desktop_runtime_config_sync::schedule_desktop_runtime_config_sync;
use crate::{desktop_config_file, DesktopConfig};

/// Config file location metadata returned to the desktop frontend.
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DesktopConfigFileInfo {
    config_file_path: String,
    config_directory_path: String,
    exists: bool,
}

/// Raw desktop config payload returned to the desktop frontend.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DesktopRawConfig {
    text: String,
    file: DesktopConfigFileInfo,
}

/// Config file location metadata derived from the current desktop runtime.
fn build_desktop_config_file_info(app: &AppHandle) -> Result<DesktopConfigFileInfo, String> {
    let path = desktop_config_file(app)?;
    let directory = path
        .parent()
        .ok_or_else(|| "Failed to resolve desktop config directory.".to_string())?;

    Ok(DesktopConfigFileInfo {
        config_file_path: path.to_string_lossy().to_string(),
        config_directory_path: directory.to_string_lossy().to_string(),
        exists: path.exists(),
    })
}

/// Default JSON text rendered for a missing desktop config file.
fn build_default_raw_config_text() -> Result<String, String> {
    serde_json::to_string_pretty(&DesktopConfig::default())
        .map_err(|error| format!("Failed to encode default desktop config: {error}"))
}

/// Minimal JSON shape validation enforced before one raw config save.
fn validate_raw_config_value(value: &Value) -> Result<(), String> {
    let Some(object) = value.as_object() else {
        return Err("Desktop config must be a JSON object.".to_string());
    };

    if let Some(version) = object.get("version") {
        if !version.is_number() {
            return Err("Desktop config field \"version\" must be a number.".to_string());
        }
    }

    if let Some(games) = object.get("games") {
        if !games.is_object() {
            return Err("Desktop config field \"games\" must be an object.".to_string());
        }
    }

    Ok(())
}

/// Raw JSON text parsed and validated for one config save request.
fn parse_raw_config_text(text: &str) -> Result<Value, String> {
    let value = serde_json::from_str::<Value>(text)
        .map_err(|error| format!("Failed to parse desktop config JSON: {error}"))?;
    validate_raw_config_value(&value)?;
    Ok(value)
}

/// Pretty JSON text encoded from one validated raw config value.
fn encode_raw_config_text(value: &Value) -> Result<String, String> {
    serde_json::to_string_pretty(value)
        .map_err(|error| format!("Failed to encode desktop config JSON: {error}"))
}

/// Raw config payload loaded from the desktop config file or its default template.
fn load_raw_config(app: &AppHandle) -> Result<DesktopRawConfig, String> {
    let file = build_desktop_config_file_info(app)?;
    let text = if file.exists {
        fs::read_to_string(&file.config_file_path)
            .map_err(|error| format!("Failed to read desktop config: {error}"))?
    } else {
        build_default_raw_config_text()?
    };

    Ok(DesktopRawConfig { text, file })
}

/// Database-setting caches cleared after one raw config write invalidates structured readers.
fn clear_raw_config_dependent_caches(app: &AppHandle) -> Result<(), String> {
    clear_desktop_database_connection_string_cache(app)
}

/// Config directory created when one open-folder request targets a missing path.
fn ensure_config_directory(app: &AppHandle) -> Result<String, String> {
    let file = build_desktop_config_file_info(app)?;
    fs::create_dir_all(&file.config_directory_path)
        .map_err(|error| format!("Failed to create desktop config directory: {error}"))?;
    Ok(file.config_directory_path)
}

/// Config directory opened in the platform file manager.
#[cfg(target_os = "macos")]
fn open_config_directory_path(path: &str) -> Result<(), String> {
    Command::new("open")
        .arg(path)
        .status()
        .map_err(|error| format!("Failed to open desktop config directory: {error}"))
        .and_then(|status| {
            if status.success() {
                Ok(())
            } else {
                Err("Failed to open desktop config directory.".to_string())
            }
        })
}

/// Config directory opened in the platform file manager.
#[cfg(target_os = "windows")]
fn open_config_directory_path(path: &str) -> Result<(), String> {
    Command::new("explorer")
        .arg(path)
        .status()
        .map_err(|error| format!("Failed to open desktop config directory: {error}"))
        .and_then(|status| {
            if status.success() {
                Ok(())
            } else {
                Err("Failed to open desktop config directory.".to_string())
            }
        })
}

/// Config directory opened in the platform file manager.
#[cfg(target_os = "linux")]
fn open_config_directory_path(path: &str) -> Result<(), String> {
    Command::new("xdg-open")
        .arg(path)
        .status()
        .map_err(|error| format!("Failed to open desktop config directory: {error}"))
        .and_then(|status| {
            if status.success() {
                Ok(())
            } else {
                Err("Failed to open desktop config directory.".to_string())
            }
        })
}

/// Config directory opened in the platform file manager.
#[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
fn open_config_directory_path(_path: &str) -> Result<(), String> {
    Err("Opening the desktop config directory is not supported on this platform.".to_string())
}

/// Raw desktop config loaded by the desktop frontend.
#[tauri::command]
pub(crate) fn desktop_get_raw_config(app: AppHandle) -> Result<DesktopRawConfig, String> {
    load_raw_config(&app)
}

/// Desktop config file location loaded by the desktop frontend.
#[tauri::command]
pub(crate) fn desktop_get_config_file_info(
    app: AppHandle,
) -> Result<DesktopConfigFileInfo, String> {
    build_desktop_config_file_info(&app)
}

/// Desktop config directory opened by the desktop frontend.
#[tauri::command]
pub(crate) fn desktop_open_config_directory(app: AppHandle) -> Result<(), String> {
    let directory = ensure_config_directory(&app)?;
    open_config_directory_path(&directory)
}

/// Raw desktop config persisted from the desktop frontend.
#[tauri::command]
pub(crate) fn desktop_set_raw_config(
    app: AppHandle,
    json_text: String,
) -> Result<DesktopRawConfig, String> {
    let value = parse_raw_config_text(&json_text)?;
    let formatted_text = encode_raw_config_text(&value)?;

    let path = desktop_config_file(&app)?;
    let Some(parent) = path.parent() else {
        return Err("Failed to resolve desktop config directory.".to_string());
    };

    fs::create_dir_all(parent)
        .map_err(|error| format!("Failed to create desktop config directory: {error}"))?;
    fs::write(&path, formatted_text)
        .map_err(|error| format!("Failed to write desktop config: {error}"))?;

    clear_raw_config_dependent_caches(&app)?;
    schedule_desktop_runtime_config_sync(app.clone());
    load_raw_config(&app)
}
