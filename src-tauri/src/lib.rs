pub mod commands;
pub mod core_control_service;
pub mod diagnostics_service;
pub(crate) mod platform_settings_backend;
pub mod privacy_guard;
pub mod settings_change_notifier;
pub mod settings_service;

use std::path::PathBuf;

use core_control_service::CoreControlService;
use diagnostics_service::DiagnosticsService;
use platform_settings_backend::{PlatformBackendState, current_platform_backend};
use settings_service::SettingsService;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
/// 注册五个稳定 Tauri command 与平台后端和本机服务后启动设置应用。
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let backend = PlatformBackendState::new(current_platform_backend());
            app.manage(SettingsService::new(settings_file_path(app.handle())));
            app.manage(diagnostics_service(&backend));
            app.manage(core_control_service(&backend));
            app.manage(backend);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_settings,
            commands::save_settings,
            commands::get_diagnostics,
            commands::clear_local_learning,
            commands::get_platform_capabilities
        ])
        .run(tauri::generate_context!())
        .expect("OpenWen Settings 运行失败");
}

/// 解析设置 JSON 的应用配置目录路径。
fn settings_file_path(app_handle: &tauri::AppHandle) -> PathBuf {
    app_handle
        .path()
        .app_config_dir()
        .unwrap_or_else(|_| std::env::temp_dir().join("openwen-ime-settings"))
        .join("settings.json")
}

/// 根据平台后端创建诊断服务；不支持的平台只返回安全默认快照。
fn diagnostics_service(backend: &PlatformBackendState) -> DiagnosticsService {
    DiagnosticsService::new(backend.diagnostics_snapshot_path().unwrap_or_default())
}

/// 根据平台后端创建 Core 控制服务；helper 不可用时保留固定失败结果。
fn core_control_service(backend: &PlatformBackendState) -> CoreControlService {
    match backend.core_control_paths() {
        Some(paths) => CoreControlService::with_paths(
            paths.helper_path(),
            paths.shared_data_path(),
            paths.user_data_path(),
            paths.log_path(),
        ),
        None => CoreControlService::with_paths(
            PathBuf::new(),
            PathBuf::new(),
            PathBuf::new(),
            PathBuf::new(),
        ),
    }
}

#[cfg(test)]
mod platform_backend_contract_tests {
    use std::path::PathBuf;

    #[cfg(target_os = "macos")]
    use crate::platform_settings_backend::{MacPlatformSettingsBackend, PlatformSettingsBackend};

    #[cfg(target_os = "macos")]
    #[test]
    fn mac_backend_preserves_capabilities_diagnostics_and_core_paths() {
        let home = PathBuf::from("/Users/openwen-test");
        let executable =
            PathBuf::from("/Applications/OpenWen Settings.app/Contents/MacOS/openwen-ime-settings");
        let backend = MacPlatformSettingsBackend::with_environment(home.clone(), executable);

        assert_eq!(
            serde_json::to_value(backend.capabilities()).expect("macOS 能力可序列化"),
            serde_json::json!({"platformId":"mac","settingContributionIds":[]})
        );
        assert_eq!(
            backend.diagnostics_snapshot_path(),
            Some(home.join(
                "Library/Application Support/OpenWen/InputMethod/diagnostics/core-diagnostics.json"
            ))
        );
        let paths = backend
            .core_control_paths()
            .expect("macOS 必须提供 Core helper 路径");
        assert_eq!(
            paths.helper_path(),
            PathBuf::from("/Applications/OpenWen Settings.app/Contents/MacOS/openwen-core-control")
        );
        assert_eq!(
            paths.shared_data_path(),
            home.join("Library/Application Support/OpenWen/InputMethod/shared-data")
        );
        assert_eq!(
            paths.user_data_path(),
            home.join("Library/Application Support/OpenWen/InputMethod/user-data")
        );
        assert_eq!(
            paths.log_path(),
            home.join("Library/Application Support/OpenWen/InputMethod/logs")
        );
    }

    #[cfg(target_os = "windows")]
    #[test]
    fn windows_backend_reports_only_safe_skeleton_capabilities() {
        use crate::platform_settings_backend::WindowsPlatformSettingsBackend;
        let backend = WindowsPlatformSettingsBackend;
        assert_eq!(
            serde_json::to_value(backend.capabilities()).expect("Windows 能力可序列化"),
            serde_json::json!({"platformId":"windows","settingContributionIds":[]})
        );
        assert_eq!(backend.diagnostics_snapshot_path(), None);
        assert_eq!(backend.core_control_paths(), None);
        assert_eq!(backend.post_settings_changed(), Ok(()));
    }
}
