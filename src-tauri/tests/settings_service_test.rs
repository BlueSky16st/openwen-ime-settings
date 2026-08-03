use std::collections::BTreeSet;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};

use openwen_ime_settings_lib::diagnostics_service::DiagnosticsState;
use openwen_ime_settings_lib::settings_service::{
    OpenWenIMESettings, SettingsService, create_default_settings, normalize_settings,
};
use serde_json::Value;

static TEST_PATH_COUNTER: AtomicU64 = AtomicU64::new(0);

fn test_settings_path(name: &str) -> std::path::PathBuf {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("系统时间需要晚于 UNIX_EPOCH")
        .as_nanos();
    let sequence = TEST_PATH_COUNTER.fetch_add(1, Ordering::Relaxed);

    std::env::temp_dir()
        .join("openwen-ime-settings-tests")
        .join(format!(
            "{name}-{}-{nanos}-{sequence}.json",
            std::process::id()
        ))
}

fn object_keys(value: &Value) -> BTreeSet<String> {
    value
        .as_object()
        .expect("设置 JSON 节点必须是 object")
        .keys()
        .cloned()
        .collect()
}

fn expected_keys(keys: &[&str]) -> BTreeSet<String> {
    keys.iter().map(|key| key.to_string()).collect()
}

fn assert_sanitized_error(error: String, expected_code: &str) {
    assert_eq!(error, expected_code);

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
        assert!(!error.contains(&sensitive));
    }
}

#[test]
fn default_settings_use_prd_values() {
    let settings = create_default_settings();

    assert_eq!(settings.input.default_input_mode, "simplifiedPinyin");
    assert_eq!(settings.input.candidate_count, 5);
    assert_eq!(settings.input.page_previous_key, "-");
    assert_eq!(settings.input.page_next_key, "=");
    assert!(settings.input.startup_chinese_mode);
    assert!(!settings.input.startup_full_width);
    assert!(settings.input.startup_chinese_punctuation);
    assert!(settings.input.short_shift_toggles_chinese);
    assert!(!settings.input.caps_lock_switches_english);
    assert!(settings.input.enter_commits_raw_code);
    assert_eq!(settings.input.no_candidate_space_action, "clearComposition");
    assert_eq!(settings.appearance.theme, "light");
    assert_eq!(settings.appearance.candidate_window_color, "#FFFFFF");
    assert_eq!(settings.appearance.candidate_text_size, 18);
    assert!(settings.local_learning.enabled);
}

#[test]
fn settings_serialize_to_camel_case_fields() {
    let raw = serde_json::to_string(&create_default_settings()).expect("默认设置可序列化");

    assert!(raw.contains("defaultInputMode"));
    assert!(raw.contains("candidateWindowColor"));
    assert!(raw.contains("localLearning"));
    assert!(!raw.contains("default_input_mode"));
    assert!(!raw.contains("candidate_window_color"));
    assert!(!raw.contains("local_learning"));
}

#[test]
fn diagnostics_state_serializes_to_camel_case_fields() {
    let diagnostics = DiagnosticsState {
        engine_state: "ready".to_string(),
        current_schema: "simplifiedPinyin".to_string(),
        core_p50_us: 420,
        core_p95_us: 14_200,
        startup_ms: 3,
        recent_error: None,
    };
    let raw = serde_json::to_string(&diagnostics).expect("诊断状态可序列化");

    assert!(raw.contains("engineState"));
    assert!(raw.contains("currentSchema"));
    assert!(raw.contains("coreP50Us"));
    assert!(raw.contains("coreP95Us"));
    assert!(!raw.contains("engine_state"));
    assert!(!raw.contains("current_schema"));
    assert!(!raw.contains("core_p50_us"));
    assert!(!raw.contains("core_p95_us"));
}

#[test]
fn normalize_settings_keeps_valid_boundaries_and_official_modes() {
    for input_mode in ["simplifiedPinyin", "ziranmaDoublePinyin", "wubi86"] {
        let mut settings = create_default_settings();
        settings.input.default_input_mode = input_mode.to_string();
        settings.input.candidate_count = 3;
        settings.input.no_candidate_space_action = "commitRawCode".to_string();
        settings.appearance.theme = "dark".to_string();
        settings.appearance.candidate_window_color = "#113355".to_string();
        settings.appearance.candidate_text_size = 12;

        let normalized = normalize_settings(settings);

        assert_eq!(normalized.input.default_input_mode, input_mode);
        assert_eq!(normalized.input.candidate_count, 3);
        assert_eq!(normalized.input.no_candidate_space_action, "commitRawCode");
        assert_eq!(normalized.appearance.theme, "dark");
        assert_eq!(normalized.appearance.candidate_window_color, "#113355");
        assert_eq!(normalized.appearance.candidate_text_size, 12);
    }

    let mut settings = create_default_settings();
    settings.input.candidate_count = 9;
    settings.appearance.candidate_text_size = 28;

    let normalized = normalize_settings(settings);

    assert_eq!(normalized.input.candidate_count, 9);
    assert_eq!(normalized.appearance.candidate_text_size, 28);
}

#[test]
fn normalize_settings_keeps_legacy_valid_text_size_17() {
    let mut settings = create_default_settings();
    settings.appearance.candidate_text_size = 17;

    assert_eq!(
        normalize_settings(settings).appearance.candidate_text_size,
        17
    );
}

#[test]
fn normalize_settings_falls_back_the_whole_page_key_pair() {
    for (previous, next) in [("中", "="), (" ", "="), ("[", "[")] {
        let mut settings = create_default_settings();
        settings.input.page_previous_key = previous.to_string();
        settings.input.page_next_key = next.to_string();

        let normalized = normalize_settings(settings);
        assert_eq!(normalized.input.page_previous_key, "-");
        assert_eq!(normalized.input.page_next_key, "=");
    }
}

#[test]
fn normalize_settings_rejects_invalid_color_and_numeric_ranges() {
    for candidate_window_color in ["", "not-a-color", "#FFF", "113355"] {
        let mut settings = create_default_settings();
        settings.input.candidate_count = 2;
        settings.appearance.candidate_window_color = candidate_window_color.to_string();
        settings.appearance.candidate_text_size = 30;

        let normalized = normalize_settings(settings);

        assert_eq!(normalized.input.candidate_count, 5);
        assert_eq!(normalized.appearance.candidate_window_color, "#FFFFFF");
        assert_eq!(normalized.appearance.candidate_text_size, 18);
    }
}

#[test]
fn service_saves_and_loads_settings_file() {
    let path = test_settings_path("round-trip");
    let service = SettingsService::new(path.clone());
    let mut settings: OpenWenIMESettings = create_default_settings();
    settings.input.default_input_mode = "wubi86".to_string();
    settings.input.candidate_count = 7;

    let saved = service.save_settings(settings).expect("设置写入成功");
    let loaded = service.load_settings().expect("设置读取成功");

    assert_eq!(saved.input.default_input_mode, "wubi86");
    assert_eq!(loaded.input.default_input_mode, "wubi86");
    assert_eq!(loaded.input.candidate_count, 7);

    let _ = std::fs::remove_file(path);
}

#[test]
fn service_returns_defaults_when_settings_file_is_missing() {
    let path = test_settings_path("missing-file");
    let service = SettingsService::new(path.clone());

    let loaded = service.load_settings().expect("缺失设置文件时返回默认设置");

    assert_eq!(loaded, create_default_settings());
    assert!(!path.exists());
}

#[test]
fn service_loads_legacy_settings_without_no_candidate_space_action() {
    let path = test_settings_path("legacy-no-candidate-space-action");
    std::fs::create_dir_all(path.parent().expect("测试路径必须有父目录")).expect("可创建测试目录");
    std::fs::write(
        &path,
        r##"{
  "input": {
    "defaultInputMode": "simplifiedPinyin",
    "candidateCount": 5,
    "pagePreviousKey": "-",
    "pageNextKey": "=",
    "startupChineseMode": true,
    "startupFullWidth": false,
    "startupChinesePunctuation": true,
    "shortShiftTogglesChinese": true,
    "capsLockSwitchesEnglish": false,
    "enterCommitsRawCode": true
  },
  "appearance": {
    "theme": "light",
    "candidateWindowColor": "#FFFFFF",
    "candidateTextSize": 17
  },
  "localLearning": {
    "enabled": true
  }
}"##,
    )
    .expect("可写入旧版设置文件");
    let service = SettingsService::new(path.clone());

    let loaded = service.load_settings().expect("旧版设置文件可读取");

    assert_eq!(loaded.input.no_candidate_space_action, "clearComposition");

    let _ = std::fs::remove_file(path);
}

#[test]
fn service_normalizes_invalid_settings_before_saving() {
    let path = test_settings_path("normalize-on-save");
    let service = SettingsService::new(path.clone());
    let mut settings: OpenWenIMESettings = create_default_settings();
    settings.input.default_input_mode = "unknown".to_string();
    settings.input.candidate_count = 2;
    settings.input.page_previous_key.clear();
    settings.input.page_next_key.clear();
    settings.input.no_candidate_space_action = "unknown".to_string();
    settings.appearance.theme = "system".to_string();
    settings.appearance.candidate_window_color.clear();
    settings.appearance.candidate_text_size = 30;

    let saved = service.save_settings(settings).expect("设置写入成功");
    let loaded = service.load_settings().expect("设置读取成功");

    assert_eq!(saved.input.default_input_mode, "simplifiedPinyin");
    assert_eq!(saved.input.candidate_count, 5);
    assert_eq!(saved.input.page_previous_key, "-");
    assert_eq!(saved.input.page_next_key, "=");
    assert_eq!(saved.input.no_candidate_space_action, "clearComposition");
    assert_eq!(saved.appearance.theme, "light");
    assert_eq!(saved.appearance.candidate_window_color, "#FFFFFF");
    assert_eq!(saved.appearance.candidate_text_size, 18);
    assert_eq!(loaded, saved);

    let _ = std::fs::remove_file(path);
}

#[test]
fn service_persists_only_prd_settings_fields() {
    let path = test_settings_path("field-whitelist");
    let service = SettingsService::new(path.clone());

    let saved = service
        .save_settings(create_default_settings())
        .expect("设置写入成功");
    let raw = std::fs::read_to_string(&path).expect("设置文件可读取");
    let value = serde_json::from_str::<Value>(&raw).expect("设置文件必须是合法 JSON");

    assert_eq!(
        object_keys(&value),
        expected_keys(&["appearance", "input", "localLearning"])
    );
    assert_eq!(
        object_keys(&value["input"]),
        expected_keys(&[
            "capsLockSwitchesEnglish",
            "candidateCount",
            "defaultInputMode",
            "enterCommitsRawCode",
            "noCandidateSpaceAction",
            "pageNextKey",
            "pagePreviousKey",
            "shortShiftTogglesChinese",
            "startupChineseMode",
            "startupChinesePunctuation",
            "startupFullWidth",
        ])
    );
    assert_eq!(
        object_keys(&value["appearance"]),
        expected_keys(&["candidateTextSize", "candidateWindowColor", "theme"])
    );
    assert_eq!(
        object_keys(&value["localLearning"]),
        expected_keys(&["enabled"])
    );
    assert_eq!(saved, create_default_settings());

    for forbidden in [
        "candidateSelectionHistory".to_string(),
        "contextText".to_string(),
        "diagnosticSamples".to_string(),
        "localLearningDetails".to_string(),
        "userInput".to_string(),
        ".user".to_string() + "db",
    ] {
        assert!(!raw.contains(&forbidden));
    }

    let _ = std::fs::remove_file(path);
}

#[test]
fn service_returns_sanitized_error_codes_for_read_and_parse_failures() {
    let parse_path = test_settings_path("parse-error");
    let fixture_input = "ni".to_string() + "hao";
    let fixture_candidate = "你".to_string() + "好";
    let fixture_context = "上下文".to_string() + "文本";
    std::fs::create_dir_all(parse_path.parent().expect("测试路径必须有父目录"))
        .expect("可创建测试目录");
    std::fs::write(
        &parse_path,
        format!(
            r#"{{"input":"{fixture_input}","candidateSelectionHistory":"{fixture_candidate}","contextText":"{fixture_context}"}}"#
        ),
    )
    .expect("可写入非法 JSON");
    let parse_service = SettingsService::new(parse_path.clone());
    let parse_error = parse_service
        .load_settings()
        .expect_err("解析失败必须返回错误");

    assert_sanitized_error(parse_error, "settings-parse");

    let directory_path = test_settings_path("read-directory");
    std::fs::create_dir_all(&directory_path).expect("可创建目录");
    let directory_service = SettingsService::new(directory_path.clone());
    let read_error = directory_service
        .load_settings()
        .expect_err("读取目录必须返回错误");

    assert_sanitized_error(read_error, "settings-read");

    let _ = std::fs::remove_file(parse_path);
    let _ = std::fs::remove_dir_all(directory_path);
}

#[test]
fn service_returns_sanitized_error_codes_for_write_failures() {
    let directory_path = test_settings_path("write-directory");
    std::fs::create_dir_all(&directory_path).expect("可创建目录");
    let directory_service = SettingsService::new(directory_path.clone());
    let write_error = directory_service
        .save_settings(create_default_settings())
        .expect_err("写入目录必须返回错误");

    assert_sanitized_error(write_error, "settings-write");

    let parent_file = test_settings_path("parent-file");
    std::fs::write(&parent_file, "parent blocks directory").expect("可创建父级阻断文件");
    let nested_path = parent_file.join("settings.json");
    let directory_error = SettingsService::new(nested_path)
        .save_settings(create_default_settings())
        .expect_err("父路径为文件时必须返回错误");

    assert_sanitized_error(directory_error, "settings-directory");

    let _ = std::fs::remove_dir_all(directory_path);
    let _ = std::fs::remove_file(parent_file);
}
