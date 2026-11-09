use serde::Serialize;
use tauri::AppHandle;

use crate::{
    desktop_runtime_config_sync::schedule_desktop_runtime_config_sync,
    load_desktop_config, store_desktop_config, trim_non_empty, DesktopConfig,
    StoredAiConfig,
};

/// AI config returned to the desktop frontend.
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DesktopAiConfig {
    pub(crate) api_key: Option<String>,
    pub(crate) base_url: Option<String>,
    pub(crate) model: Option<String>,
}

fn build_ai_config(config: Option<&StoredAiConfig>) -> DesktopAiConfig {
    DesktopAiConfig {
        api_key: config.and_then(|c| c.api_key.clone()),
        base_url: config.and_then(|c| c.base_url.clone()),
        model: config.and_then(|c| c.model.clone()),
    }
}

/// Stored AI config loaded from the desktop config file.
pub(crate) fn load_ai_config(app: &AppHandle) -> Result<DesktopAiConfig, String> {
    let config = load_desktop_config(app)?;
    Ok(build_ai_config(config.ai.as_ref()))
}

/// AI config written into the desktop config file.
fn store_ai_config(
    app: &AppHandle,
    api_key: Option<String>,
    base_url: Option<String>,
    model: Option<String>,
) -> Result<DesktopAiConfig, String> {
    let mut config: DesktopConfig = load_desktop_config(app)?;
    let api_key = trim_non_empty(api_key);
    let base_url = trim_non_empty(base_url);
    let model = trim_non_empty(model);

    match (&api_key, &base_url, &model) {
        (None, None, None) => {
            config.ai = None;
        }
        _ => {
            config.ai = Some(StoredAiConfig {
                api_key: api_key.clone(),
                base_url: base_url.clone(),
                model: model.clone(),
            });
        }
    }

    store_desktop_config(app, &config)?;

    Ok(DesktopAiConfig {
        api_key,
        base_url,
        model,
    })
}

/// Frontend settings payload loaded by the desktop frontend.
#[tauri::command]
pub(crate) fn desktop_get_ai_config(
    app: AppHandle,
) -> Result<DesktopAiConfig, String> {
    load_ai_config(&app)
}

/// AI config persisted into the desktop config file.
#[tauri::command]
pub(crate) fn desktop_set_ai_config(
    app: AppHandle,
    api_key: Option<String>,
    base_url: Option<String>,
    model: Option<String>,
) -> Result<DesktopAiConfig, String> {
    let config = store_ai_config(&app, api_key, base_url, model)?;
    schedule_desktop_runtime_config_sync(app.clone());
    Ok(config)
}
