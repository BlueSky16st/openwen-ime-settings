use tauri::State;

use crate::core_control_service::CoreControlService;
use crate::diagnostics_service::{DiagnosticsService, DiagnosticsState};
use crate::platform_settings_backend::{PlatformBackendState, PlatformCapabilities};
#[cfg(test)]
use crate::settings_change_notifier::{SETTINGS_CHANGE_NOTIFICATION_NAME, SettingsChangeNotifier};
use crate::settings_service::{ClearLocalLearningResult, OpenWenIMESettings, SettingsService};

#[tauri::command]
/// 从本机设置服务读取并返回完整归一化设置。
pub(crate) fn get_settings(
    service: State<'_, SettingsService>,
) -> Result<OpenWenIMESettings, String> {
    get_settings_from_service(&service)
}

#[tauri::command]
/// 归一化并保存完整设置，然后发送固定名称的跨进程变更通知。
pub(crate) fn save_settings(
    settings: OpenWenIMESettings,
    service: State<'_, SettingsService>,
    backend: State<'_, PlatformBackendState>,
) -> Result<OpenWenIMESettings, String> {
    save_settings_with_service_and_backend(settings, &service, &backend)
}

#[tauri::command]
/// 返回仅含允许字段的本机诊断快照。
pub(crate) fn get_diagnostics(service: State<'_, DiagnosticsService>) -> DiagnosticsState {
    get_diagnostics_from_service(&service)
}

#[tauri::command]
/// 调用本机 Core helper 清除学习数据，不修改普通设置。
pub(crate) fn clear_local_learning(
    service: State<'_, CoreControlService>,
) -> ClearLocalLearningResult {
    clear_local_learning_with_service(&service)
}

#[tauri::command]
/// 返回当前编译平台的只读能力快照，不访问设置、helper 或通知接口。
pub(crate) fn get_platform_capabilities(
    backend: State<'_, PlatformBackendState>,
) -> Result<PlatformCapabilities, String> {
    let capabilities = get_platform_capabilities_from_backend(&backend);
    if capabilities.is_public_platform() {
        Ok(capabilities)
    } else {
        Err("platform-unsupported".to_string())
    }
}

/// 将设置服务读取错误限制为固定错误码。
fn get_settings_from_service(service: &SettingsService) -> Result<OpenWenIMESettings, String> {
    service.load_settings()
}

/// 使用正式通知器保存设置。
fn save_settings_with_service(
    settings: OpenWenIMESettings,
    service: &SettingsService,
) -> Result<OpenWenIMESettings, String> {
    service.save_settings(settings)
}

/// 保存归一化设置，并在成功后调用所选平台后端的通知接口。
fn save_settings_with_service_and_backend(
    settings: OpenWenIMESettings,
    service: &SettingsService,
    backend: &PlatformBackendState,
) -> Result<OpenWenIMESettings, String> {
    let saved = save_settings_with_service(settings, service)?;
    let _ = backend.post_settings_changed();
    Ok(saved)
}

#[cfg(test)]
/// 保存归一化设置，并在成功后发送变更通知。
fn save_settings_with_service_and_notifier<N: SettingsChangeNotifier>(
    settings: OpenWenIMESettings,
    service: &SettingsService,
    notifier: &N,
) -> Result<OpenWenIMESettings, String> {
    let saved = save_settings_with_service(settings, service)?;
    let _ = notifier.post(SETTINGS_CHANGE_NOTIFICATION_NAME);
    Ok(saved)
}

/// 从诊断服务读取已脱敏快照。
fn get_diagnostics_from_service(service: &DiagnosticsService) -> DiagnosticsState {
    service.get_diagnostics()
}

/// 将 Core helper 清除结果转换为前端固定结构。
fn clear_local_learning_with_service(service: &CoreControlService) -> ClearLocalLearningResult {
    service.clear_local_learning()
}

/// 只读取平台能力，不触发后端其他方法。
fn get_platform_capabilities_from_backend(backend: &PlatformBackendState) -> PlatformCapabilities {
    backend.capabilities()
}

#[cfg(test)]
mod tests {
    use std::time::{SystemTime, UNIX_EPOCH};

    use crate::core_control_service::CoreControlService;
    use crate::platform_settings_backend::{
        PlatformBackendState, PlatformCapabilities, PlatformSettingsBackend,
    };
    use crate::settings_change_notifier::SettingsChangeNotifier;
    use crate::settings_service::{OpenWenIMESettings, create_default_settings};

    use super::*;

    #[derive(Debug)]
    struct ReadOnlyTestBackend {
        capabilities: PlatformCapabilities,
        post_count: std::sync::Arc<std::sync::atomic::AtomicUsize>,
    }

    impl PlatformSettingsBackend for ReadOnlyTestBackend {
        fn capabilities(&self) -> PlatformCapabilities {
            self.capabilities.clone()
        }

        fn post_settings_changed(&self) -> Result<(), String> {
            self.post_count
                .fetch_add(1, std::sync::atomic::Ordering::SeqCst);
            Ok(())
        }

        fn diagnostics_snapshot_path(&self) -> Option<std::path::PathBuf> {
            None
        }

        fn core_control_paths(&self) -> Option<crate::platform_settings_backend::CoreControlPaths> {
            None
        }
    }

    #[test]
    fn platform_capabilities_command_is_repeatable_and_read_only() {
        let post_count = std::sync::Arc::new(std::sync::atomic::AtomicUsize::new(0));
        let backend = PlatformBackendState::new(Box::new(ReadOnlyTestBackend {
            capabilities: PlatformCapabilities::new("mac", vec![]),
            post_count: post_count.clone(),
        }));
        let first = get_platform_capabilities_from_backend(&backend);
        let second = get_platform_capabilities_from_backend(&backend);

        assert_eq!(first, second);
        assert_eq!(
            serde_json::to_value(first).expect("能力可序列化"),
            serde_json::json!({"platformId":"mac","settingContributionIds":[]})
        );
        assert_eq!(post_count.load(std::sync::atomic::Ordering::SeqCst), 0);
    }

    fn test_settings_path(name: &str) -> std::path::PathBuf {
        let millis = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("系统时间需要晚于 UNIX_EPOCH")
            .as_millis();

        std::env::temp_dir()
            .join("openwen-ime-settings-command-tests")
            .join(format!("{name}-{millis}.json"))
    }

    fn assert_sanitized_text(value: &str) {
        for sensitive in [
            "ni".to_string() + "hao",
            "你".to_string() + "好",
            "候选选择".to_string() + "历史",
            "上下文".to_string() + "文本",
            "真实用户".to_string() + "输入",
            "candidateSelectionHistory".to_string(),
            "contextText".to_string(),
            "diagnosticSamples".to_string(),
            ".user".to_string() + "db",
        ] {
            assert!(!value.contains(&sensitive));
        }
    }

    #[test]
    fn get_settings_command_returns_defaults_when_file_is_missing() {
        let path = test_settings_path("get-defaults");
        let service = SettingsService::new(path.clone());

        let settings = get_settings_from_service(&service).expect("缺失设置文件时返回默认设置");

        assert_eq!(settings, create_default_settings());
        assert!(!path.exists());
    }

    #[test]
    fn get_settings_command_returns_normalized_settings() {
        let path = test_settings_path("get-normalized");
        let service = SettingsService::new(path.clone());
        std::fs::create_dir_all(path.parent().expect("测试路径必须有父目录")).expect("可创建目录");
        std::fs::write(
            &path,
            r##"{
              "input": {
                "defaultInputMode": "unknown",
                "candidateCount": 10,
                "pagePreviousKey": "",
                "pageNextKey": "",
                "startupChineseMode": true,
                "startupFullWidth": false,
                "startupChinesePunctuation": true,
                "shortShiftTogglesChinese": true,
                "capsLockSwitchesEnglish": false,
                "enterCommitsRawCode": true
              },
              "appearance": {
                "theme": "system",
                "candidateWindowColor": "not-a-color",
                "candidateTextSize": 40
              },
              "localLearning": {
                "enabled": true
              }
            }"##,
        )
        .expect("可写入测试设置");

        let settings = get_settings_from_service(&service).expect("设置读取成功");

        assert_eq!(settings.input.default_input_mode, "simplifiedPinyin");
        assert_eq!(settings.input.candidate_count, 5);
        assert_eq!(settings.input.page_previous_key, "-");
        assert_eq!(settings.input.page_next_key, "=");
        assert_eq!(settings.appearance.theme, "light");
        assert_eq!(settings.appearance.candidate_window_color, "#FFFFFF");
        assert_eq!(settings.appearance.candidate_text_size, 18);

        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn save_settings_command_persists_normalized_settings() {
        let path = test_settings_path("save-normalized");
        let service = SettingsService::new(path.clone());
        let mut settings: OpenWenIMESettings = create_default_settings();
        settings.input.default_input_mode = "wubi86".to_string();
        settings.input.candidate_count = 99;
        settings.appearance.candidate_window_color = "not-a-color".to_string();

        let notifier = FakeSettingsChangeNotifier::default();

        let saved = save_settings_with_service_and_notifier(settings, &service, &notifier)
            .expect("保存命令必须返回归一化设置");
        let loaded = service.load_settings().expect("保存后可再次读取");

        assert_eq!(saved.input.default_input_mode, "wubi86");
        assert_eq!(saved.input.candidate_count, 5);
        assert_eq!(saved.appearance.candidate_window_color, "#FFFFFF");
        assert_eq!(loaded, saved);
        assert_eq!(
            notifier.posted_names(),
            vec!["org.openwen.settings.changed".to_string()]
        );

        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn get_diagnostics_command_returns_sanitized_placeholder_state() {
        let service = DiagnosticsService::new(test_settings_path("missing-diagnostics"));

        let diagnostics = get_diagnostics_from_service(&service);

        assert_eq!(diagnostics.current_schema, "simplifiedPinyin");
        assert_eq!(diagnostics.engine_state, "unavailable");
        assert_eq!(diagnostics.core_p50_us, 0);
        assert_eq!(diagnostics.core_p95_us, 0);
        assert_eq!(diagnostics.startup_ms, 0);
        assert_eq!(diagnostics.recent_error, None);
        assert_sanitized_text(&diagnostics.engine_state);
        assert_sanitized_text(&diagnostics.current_schema);
    }

    #[test]
    fn clear_local_learning_command_returns_result_without_changing_settings() {
        let path = test_settings_path("clear-learning");
        let service = SettingsService::new(path.clone());
        let helper_path = test_settings_path("core-control-helper");
        std::fs::create_dir_all(helper_path.parent().expect("测试路径必须有父目录"))
            .expect("可创建 helper 目录");
        std::fs::write(
            &helper_path,
            "#!/bin/sh\nprintf '{\"cleared\":true,\"errorCode\":\"ok\"}\\n'\n",
        )
        .expect("可写入 helper");
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            std::fs::set_permissions(&helper_path, std::fs::Permissions::from_mode(0o755))
                .expect("可设置 helper 可执行");
        }
        let core_control_service = CoreControlService::with_paths(
            helper_path.clone(),
            test_settings_path("shared-data"),
            test_settings_path("user-data"),
            test_settings_path("logs"),
        );
        let mut settings = create_default_settings();
        settings.local_learning.enabled = false;
        let saved = service.save_settings(settings).expect("设置写入成功");

        let result = clear_local_learning_with_service(&core_control_service);
        let loaded = service.load_settings().expect("清除后设置仍可读取");

        assert!(result.cleared);
        assert_sanitized_text(&result.message);
        assert_eq!(loaded.local_learning.enabled, saved.local_learning.enabled);

        let _ = std::fs::remove_file(path);
        let _ = std::fs::remove_file(helper_path);
    }

    #[test]
    fn command_errors_use_sanitized_settings_service_codes() {
        let parse_path = test_settings_path("parse-error");
        std::fs::create_dir_all(parse_path.parent().expect("测试路径必须有父目录"))
            .expect("可创建目录");
        let fixture_input = "ni".to_string() + "hao";
        let fixture_candidate = "你".to_string() + "好";
        let fixture_context = "上下文".to_string() + "文本";
        std::fs::write(
            &parse_path,
            format!(
                r#"{{"input":"{fixture_input}","candidateSelectionHistory":"{fixture_candidate}","contextText":"{fixture_context}"}}"#
            ),
        )
        .expect("可写入非法 JSON");

        let parse_error = get_settings_from_service(&SettingsService::new(parse_path.clone()))
            .expect_err("非法 JSON 必须返回错误");

        assert_eq!(parse_error, "settings-parse");
        assert_sanitized_text(&parse_error);

        let directory_path = test_settings_path("write-directory");
        std::fs::create_dir_all(&directory_path).expect("可创建目录");
        let notifier = FakeSettingsChangeNotifier::default();
        let write_error = save_settings_with_service_and_notifier(
            create_default_settings(),
            &SettingsService::new(directory_path.clone()),
            &notifier,
        )
        .expect_err("写入目录必须返回错误");

        assert_eq!(write_error, "settings-write");
        assert_sanitized_text(&write_error);
        assert!(notifier.posted_names().is_empty());

        let _ = std::fs::remove_file(parse_path);
        let _ = std::fs::remove_dir_all(directory_path);
    }

    #[derive(Default)]
    struct FakeSettingsChangeNotifier {
        posted_names: std::sync::Mutex<Vec<String>>,
    }

    impl FakeSettingsChangeNotifier {
        fn posted_names(&self) -> Vec<String> {
            self.posted_names.lock().expect("测试锁必须可用").clone()
        }
    }

    impl SettingsChangeNotifier for FakeSettingsChangeNotifier {
        fn post(&self, notification_name: &str) -> Result<(), String> {
            self.posted_names
                .lock()
                .expect("测试锁必须可用")
                .push(notification_name.to_string());
            Ok(())
        }
    }
}
