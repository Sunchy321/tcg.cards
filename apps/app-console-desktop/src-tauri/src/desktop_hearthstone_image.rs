use serde::Serialize;
use tauri::AppHandle;

use crate::{
    desktop_runtime_config_sync::schedule_desktop_runtime_config_sync,
    load_desktop_config, store_desktop_config, trim_non_empty, DesktopConfig,
    StoredHearthstoneImageSettings, StoredHearthstoneSettings,
};

/// Hearthstone image settings returned to the desktop frontend.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DesktopHearthstoneImageSettings {
    pub(crate) renderer_base_url: Option<String>,
    pub(crate) bucket_dir: Option<String>,
}

/// Frontend settings payload built from one stored image config section.
fn build_image_settings(
    settings: Option<&StoredHearthstoneImageSettings>,
) -> DesktopHearthstoneImageSettings {
    DesktopHearthstoneImageSettings {
        renderer_base_url: settings.and_then(|settings| settings.renderer_base_url.clone()),
        bucket_dir: settings.and_then(|settings| settings.bucket_dir.clone()),
    }
}

/// Stored image settings loaded from the desktop config file.
pub(crate) fn load_image_settings(
    app: &AppHandle,
) -> Result<DesktopHearthstoneImageSettings, String> {
    let config = load_desktop_config(app)?;

    Ok(build_image_settings(
        config
            .games
            .hearthstone
            .as_ref()
            .and_then(|settings| settings.image.as_ref()),
    ))
}

/// Image settings written into the desktop config file.
fn store_image_settings(
    app: &AppHandle,
    renderer_base_url: Option<String>,
    bucket_dir: Option<String>,
) -> Result<DesktopHearthstoneImageSettings, String> {
    let mut config: DesktopConfig = load_desktop_config(app)?;
    let renderer_base_url = trim_non_empty(renderer_base_url);
    let bucket_dir = trim_non_empty(bucket_dir);

    match (renderer_base_url.clone(), bucket_dir.clone()) {
        (None, None) => {
            if let Some(settings) = config.games.hearthstone.as_mut() {
                settings.image = None;

                if settings.is_empty() {
                    config.games.hearthstone = None;
                }
            }
        }
        _ => {
            let settings = config
                .games
                .hearthstone
                .get_or_insert_with(StoredHearthstoneSettings::default);
            settings.image = Some(StoredHearthstoneImageSettings {
                renderer_base_url: renderer_base_url.clone(),
                bucket_dir: bucket_dir.clone(),
            });
        }
    }

    store_desktop_config(app, &config)?;

    Ok(DesktopHearthstoneImageSettings {
        renderer_base_url,
        bucket_dir,
    })
}

/// Frontend settings payload loaded by the desktop frontend.
#[tauri::command]
pub(crate) fn desktop_get_hearthstone_image_settings(
    app: AppHandle,
) -> Result<DesktopHearthstoneImageSettings, String> {
    load_image_settings(&app)
}

/// Image settings persisted into the desktop config file.
#[tauri::command]
pub(crate) fn desktop_set_hearthstone_image_settings(
    app: AppHandle,
    renderer_base_url: Option<String>,
    bucket_dir: Option<String>,
) -> Result<DesktopHearthstoneImageSettings, String> {
    let settings = store_image_settings(&app, renderer_base_url, bucket_dir)?;
    schedule_desktop_runtime_config_sync(app.clone());
    Ok(settings)
}
