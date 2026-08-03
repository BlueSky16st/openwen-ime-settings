pub const SETTINGS_READ: &str = "settings-read";
pub const SETTINGS_PARSE: &str = "settings-parse";
pub const SETTINGS_DIRECTORY: &str = "settings-directory";
pub const SETTINGS_SERIALIZE: &str = "settings-serialize";
pub const SETTINGS_WRITE: &str = "settings-write";
pub const SETTINGS_NOTIFY: &str = "settings-notify";
pub const SETTINGS_PRIVACY: &str = "settings-privacy";
pub const DIAGNOSTICS_ERROR: &str = "diagnostics-error";

/// 将设置与 Core 错误限制为允许白名单。
pub fn sanitized_error_code(code: &str) -> String {
    if is_allowed_error_code(code) {
        code.to_string()
    } else {
        SETTINGS_PRIVACY.to_string()
    }
}

/// 将诊断错误限制为诊断输出白名单。
pub fn sanitized_diagnostics_error_code(code: &str) -> String {
    if is_allowed_error_code(code) {
        code.to_string()
    } else {
        DIAGNOSTICS_ERROR.to_string()
    }
}

/// 判断错误码是否只含受限字符且长度安全。
fn is_allowed_error_code(code: &str) -> bool {
    matches!(
        code,
        SETTINGS_READ
            | SETTINGS_PARSE
            | SETTINGS_DIRECTORY
            | SETTINGS_SERIALIZE
            | SETTINGS_WRITE
            | SETTINGS_NOTIFY
            | SETTINGS_PRIVACY
            | DIAGNOSTICS_ERROR
            | "ok"
            | "schema-load"
            | "schema-unsupported"
            | "engine-not-ready"
            | "runtime-dir"
            | "invalid-options"
            | "learning-clear"
            | "learning-policy"
            | "learning-reload"
            | "privacy-log"
    )
}
