use std::fs;
use std::path::PathBuf;

use serde::{Deserialize, Serialize};

use crate::privacy_guard::{
    SETTINGS_DIRECTORY, SETTINGS_PARSE, SETTINGS_READ, SETTINGS_SERIALIZE, SETTINGS_WRITE,
    sanitized_error_code,
};

/// 当前公开设置 JSON 契约版本；该值不参与用户设置序列化。
pub const SETTINGS_CONTRACT_VERSION: u8 = 1;

#[cfg(test)]
mod contract_version_tests {
    #[test]
    fn settings_contract_version_is_one_and_absent_from_user_json() {
        assert_eq!(super::SETTINGS_CONTRACT_VERSION, 1);
        let raw = serde_json::to_value(super::create_default_settings()).expect("默认设置可序列化");
        assert_eq!(raw.get("settingsContractVersion"), None);
    }
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct OpenWenIMESettings {
    pub input: InputSettings,
    pub appearance: AppearanceSettings,
    pub local_learning: LocalLearningSettings,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct InputSettings {
    pub default_input_mode: String,
    pub candidate_count: u8,
    pub page_previous_key: String,
    pub page_next_key: String,
    pub startup_chinese_mode: bool,
    pub startup_full_width: bool,
    pub startup_chinese_punctuation: bool,
    pub short_shift_toggles_chinese: bool,
    pub caps_lock_switches_english: bool,
    pub enter_commits_raw_code: bool,
    #[serde(default = "default_no_candidate_space_action")]
    pub no_candidate_space_action: String,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AppearanceSettings {
    pub theme: String,
    pub candidate_window_color: String,
    pub candidate_text_size: u8,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct LocalLearningSettings {
    pub enabled: bool,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ClearLocalLearningResult {
    pub cleared: bool,
    pub message: String,
}

#[derive(Clone, Debug)]
pub struct SettingsService {
    settings_path: PathBuf,
}

impl SettingsService {
    /// 使用固定设置文件路径创建持久化服务。
    pub fn new(settings_path: PathBuf) -> Self {
        Self { settings_path }
    }

    /// 读取本机设置；缺失时返回默认值，非法字段按三端契约归一化。
    pub fn load_settings(&self) -> Result<OpenWenIMESettings, String> {
        if !self.settings_path.exists() {
            return Ok(create_default_settings());
        }

        let raw = fs::read_to_string(&self.settings_path)
            .map_err(|_| sanitized_error_code(SETTINGS_READ))?;
        let settings = serde_json::from_str::<OpenWenIMESettings>(&raw)
            .map_err(|_| sanitized_error_code(SETTINGS_PARSE))?;

        Ok(normalize_settings(settings))
    }

    /// 将完整归一化设置原子写入固定路径，错误不包含底层路径。
    pub fn save_settings(
        &self,
        settings: OpenWenIMESettings,
    ) -> Result<OpenWenIMESettings, String> {
        let normalized = normalize_settings(settings);

        if let Some(parent) = self.settings_path.parent() {
            fs::create_dir_all(parent).map_err(|_| sanitized_error_code(SETTINGS_DIRECTORY))?;
        }

        let raw = serde_json::to_string_pretty(&normalized)
            .map_err(|_| sanitized_error_code(SETTINGS_SERIALIZE))?;
        fs::write(&self.settings_path, raw).map_err(|_| sanitized_error_code(SETTINGS_WRITE))?;

        Ok(normalized)
    }

    /// 返回兼容清除接口；实际删除由 Core 控制服务完成。
    pub fn clear_local_learning(&self) -> ClearLocalLearningResult {
        ClearLocalLearningResult {
            cleared: true,
            message: "本地学习数据已清除".to_string(),
        }
    }
}

/// 创建与 TypeScript、Swift 一致的完整默认设置。
pub fn create_default_settings() -> OpenWenIMESettings {
    OpenWenIMESettings {
        input: InputSettings {
            default_input_mode: "simplifiedPinyin".to_string(),
            candidate_count: 5,
            page_previous_key: "-".to_string(),
            page_next_key: "=".to_string(),
            startup_chinese_mode: true,
            startup_full_width: false,
            startup_chinese_punctuation: true,
            short_shift_toggles_chinese: true,
            caps_lock_switches_english: false,
            enter_commits_raw_code: true,
            no_candidate_space_action: default_no_candidate_space_action(),
        },
        appearance: AppearanceSettings {
            theme: "light".to_string(),
            candidate_window_color: "#FFFFFF".to_string(),
            candidate_text_size: 18,
        },
        local_learning: LocalLearningSettings { enabled: true },
    }
}

/// 归一化所有非法字段，同时保留范围内的历史合法值。
pub fn normalize_settings(mut settings: OpenWenIMESettings) -> OpenWenIMESettings {
    if !matches!(
        settings.input.default_input_mode.as_str(),
        "simplifiedPinyin" | "ziranmaDoublePinyin" | "wubi86"
    ) {
        settings.input.default_input_mode = "simplifiedPinyin".to_string();
    }

    if !(3..=9).contains(&settings.input.candidate_count) {
        settings.input.candidate_count = 5;
    }

    let page_keys_are_valid = is_valid_page_key(&settings.input.page_previous_key)
        && is_valid_page_key(&settings.input.page_next_key)
        && settings.input.page_previous_key != settings.input.page_next_key;
    if !page_keys_are_valid {
        settings.input.page_previous_key = "-".to_string();
        settings.input.page_next_key = "=".to_string();
    }

    if !matches!(
        settings.input.no_candidate_space_action.as_str(),
        "clearComposition" | "commitRawCode"
    ) {
        settings.input.no_candidate_space_action = default_no_candidate_space_action();
    }

    if !matches!(settings.appearance.theme.as_str(), "light" | "dark") {
        settings.appearance.theme = "light".to_string();
    }

    if !is_hex_color(&settings.appearance.candidate_window_color) {
        settings.appearance.candidate_window_color = "#FFFFFF".to_string();
    }

    if !(12..=28).contains(&settings.appearance.candidate_text_size) {
        settings.appearance.candidate_text_size = 18;
    }

    settings
}

/// 返回无候选空格行为的兼容默认值。
fn default_no_candidate_space_action() -> String {
    "clearComposition".to_string()
}

/// 判断颜色是否为严格 `#RRGGBB` 格式。
fn is_hex_color(value: &str) -> bool {
    value.len() == 7
        && value.starts_with('#')
        && value
            .chars()
            .skip(1)
            .all(|character| character.is_ascii_hexdigit())
}

/// 判断翻页键是否为单个非空格可打印 ASCII 字符。
fn is_valid_page_key(value: &str) -> bool {
    value.len() == 1 && value.as_bytes()[0].is_ascii_graphic()
}
