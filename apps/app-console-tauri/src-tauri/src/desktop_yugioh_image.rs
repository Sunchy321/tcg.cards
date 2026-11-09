use serde::Serialize;
use tauri::AppHandle;

use crate::{
    desktop_runtime_config_sync::schedule_desktop_runtime_config_sync, load_desktop_config,
    store_desktop_config, trim_non_empty, DesktopConfig, StoredYugiohImageSettings,
    StoredYugiohSettings,
};

/// Yu-Gi-Oh! image settings returned to the desktop frontend.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DesktopYugiohImageSettings {
    pub(crate) bucket_dir: Option<String>,
}

/// Frontend settings payload built from one stored Yu-Gi-Oh! image section.
fn build_image_settings(
    settings: Option<&StoredYugiohImageSettings>,
) -> DesktopYugiohImageSettings {
    DesktopYugiohImageSettings {
        bucket_dir: settings.and_then(|settings| settings.bucket_dir.clone()),
    }
}

/// Stored Yu-Gi-Oh! image settings loaded from the desktop config file.
pub(crate) fn load_image_settings(
    app: &AppHandle,
) -> Result<DesktopYugiohImageSettings, String> {
    let config = load_desktop_config(app)?;

    Ok(build_image_settings(
        config
            .games
            .yugioh
            .as_ref()
            .and_then(|settings| settings.image.as_ref()),
    ))
}

/// Yu-Gi-Oh! image settings written into the desktop config file.
fn store_image_settings(
    app: &AppHandle,
    bucket_dir: Option<String>,
) -> Result<DesktopYugiohImageSettings, String> {
    let mut config: DesktopConfig = load_desktop_config(app)?;
    let bucket_dir = trim_non_empty(bucket_dir);

    match bucket_dir.clone() {
        None => {
            if let Some(settings) = config.games.yugioh.as_mut() {
                settings.image = None;

                if settings.is_empty() {
                    config.games.yugioh = None;
                }
            }
        }
        Some(bucket_dir) => {
            let settings = config
                .games
                .yugioh
                .get_or_insert_with(StoredYugiohSettings::default);
            settings.image = Some(StoredYugiohImageSettings {
                bucket_dir: Some(bucket_dir),
            });
        }
    }

    store_desktop_config(app, &config)?;

    Ok(DesktopYugiohImageSettings { bucket_dir })
}

/// Frontend Yu-Gi-Oh! image settings loaded by the desktop frontend.
#[tauri::command]
pub(crate) fn desktop_get_yugioh_image_settings(
    app: AppHandle,
) -> Result<DesktopYugiohImageSettings, String> {
    load_image_settings(&app)
}

/// Yu-Gi-Oh! image settings persisted into the desktop config file.
#[tauri::command]
pub(crate) fn desktop_set_yugioh_image_settings(
    app: AppHandle,
    bucket_dir: Option<String>,
) -> Result<DesktopYugiohImageSettings, String> {
    let settings = store_image_settings(&app, bucket_dir)?;
    schedule_desktop_runtime_config_sync(app.clone());
    Ok(settings)
}
