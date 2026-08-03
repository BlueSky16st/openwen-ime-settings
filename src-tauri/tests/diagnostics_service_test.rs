use openwen_ime_settings_lib::diagnostics_service::{
    DiagnosticsState, create_default_diagnostics, sanitize_diagnostics_state,
};

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
fn default_diagnostics_use_sanitized_placeholder_state() {
    let diagnostics = create_default_diagnostics();

    assert_eq!(diagnostics.engine_state, "unavailable");
    assert_eq!(diagnostics.current_schema, "simplifiedPinyin");
    assert_eq!(diagnostics.core_p50_us, 0);
    assert_eq!(diagnostics.core_p95_us, 0);
    assert_eq!(diagnostics.startup_ms, 0);
    assert_eq!(diagnostics.recent_error, None);
}

#[test]
fn sanitize_diagnostics_state_keeps_valid_values() {
    let diagnostics = sanitize_diagnostics_state(DiagnosticsState {
        engine_state: "ready".to_string(),
        current_schema: "wubi86".to_string(),
        core_p50_us: 420,
        core_p95_us: 14_200,
        startup_ms: 11,
        recent_error: Some("schema-load".to_string()),
    });

    assert_eq!(diagnostics.engine_state, "ready");
    assert_eq!(diagnostics.current_schema, "wubi86");
    assert_eq!(diagnostics.core_p50_us, 420);
    assert_eq!(diagnostics.core_p95_us, 14_200);
    assert_eq!(diagnostics.startup_ms, 11);
    assert_eq!(diagnostics.recent_error, Some("schema-load".to_string()));
}

#[test]
fn sanitize_diagnostics_state_replaces_sensitive_recent_error() {
    let fixture_input = "ni".to_string() + "hao";
    let fixture_selection = "候选选择".to_string() + "历史";
    let fixture_context = "上下文".to_string() + "文本";
    let diagnostics = sanitize_diagnostics_state(DiagnosticsState {
        engine_state: format!("/Users/example/{fixture_input}"),
        current_schema: "unknown".to_string(),
        core_p50_us: 0,
        core_p95_us: 0,
        startup_ms: 0,
        recent_error: Some(format!(
            "/Users/example {fixture_input} {fixture_selection} {fixture_context}"
        )),
    });

    assert_eq!(diagnostics.engine_state, "unavailable");
    assert_eq!(diagnostics.current_schema, "simplifiedPinyin");
    assert_eq!(
        diagnostics.recent_error,
        Some("diagnostics-error".to_string())
    );
    assert_sanitized_text(&diagnostics.engine_state);
    assert_sanitized_text(&diagnostics.current_schema);
    assert_sanitized_text(diagnostics.recent_error.as_deref().expect("错误码存在"));
}

#[test]
fn sanitize_diagnostics_state_replaces_unknown_error_codes() {
    let diagnostics = sanitize_diagnostics_state(DiagnosticsState {
        engine_state: "ready".to_string(),
        current_schema: "simplifiedPinyin".to_string(),
        core_p50_us: 0,
        core_p95_us: 0,
        startup_ms: 0,
        recent_error: Some("raw-os-error".to_string()),
    });

    assert_eq!(
        diagnostics.recent_error,
        Some("diagnostics-error".to_string())
    );
}
