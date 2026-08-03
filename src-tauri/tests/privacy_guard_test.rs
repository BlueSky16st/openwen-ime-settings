use openwen_ime_settings_lib::privacy_guard::{
    DIAGNOSTICS_ERROR, SETTINGS_PARSE, SETTINGS_PRIVACY, SETTINGS_WRITE, sanitized_error_code,
};

#[test]
fn sanitized_error_code_keeps_known_codes() {
    assert_eq!(sanitized_error_code(SETTINGS_PARSE), SETTINGS_PARSE);
    assert_eq!(sanitized_error_code(SETTINGS_WRITE), SETTINGS_WRITE);
    assert_eq!(sanitized_error_code(DIAGNOSTICS_ERROR), DIAGNOSTICS_ERROR);
}

#[test]
fn sanitized_error_code_replaces_unknown_or_sensitive_values() {
    for raw in [
        "raw-os-error".to_string(),
        "/Users/example/settings.json".to_string(),
        "ni".to_string() + "hao",
        "候选选择".to_string() + "历史",
        "contextText".to_string(),
        ".user".to_string() + "db",
    ] {
        assert_eq!(sanitized_error_code(&raw), SETTINGS_PRIVACY);
    }
}
