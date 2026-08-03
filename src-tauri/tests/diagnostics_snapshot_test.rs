use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};

use openwen_ime_settings_lib::diagnostics_service::{
    DiagnosticsService, create_default_diagnostics,
};

static TEST_PATH_COUNTER: AtomicU64 = AtomicU64::new(0);

fn test_snapshot_path(name: &str) -> std::path::PathBuf {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("系统时间需要晚于 UNIX_EPOCH")
        .as_nanos();
    let sequence = TEST_PATH_COUNTER.fetch_add(1, Ordering::Relaxed);

    std::env::temp_dir()
        .join("openwen-diagnostics-service-tests")
        .join(format!(
            "{name}-{}-{nanos}-{sequence}.json",
            std::process::id()
        ))
}

#[test]
fn diagnostics_service_reads_runtime_snapshot() {
    let path = test_snapshot_path("snapshot");
    std::fs::create_dir_all(path.parent().expect("测试路径必须有父目录")).expect("可创建测试目录");
    std::fs::write(
        &path,
        r#"{
          "engineState": "ready",
          "currentSchema": "wubi86",
          "coreP50Us": 420,
          "coreP95Us": 14200,
          "coreP50Ms": 0,
          "coreP95Ms": 14,
          "startupMs": 31,
          "recentError": "schema-load"
        }"#,
    )
    .expect("可写入诊断快照");

    let diagnostics = DiagnosticsService::new(path.clone()).get_diagnostics();

    assert_eq!(diagnostics.engine_state, "ready");
    assert_eq!(diagnostics.current_schema, "wubi86");
    assert_eq!(diagnostics.core_p50_us, 420);
    assert_eq!(diagnostics.core_p95_us, 14_200);
    assert_eq!(diagnostics.startup_ms, 31);
    assert_eq!(diagnostics.recent_error.as_deref(), Some("schema-load"));

    let _ = std::fs::remove_file(path);
}

#[test]
fn diagnostics_service_converts_legacy_millisecond_snapshot_to_microseconds() {
    let path = test_snapshot_path("legacy-snapshot");
    std::fs::create_dir_all(path.parent().expect("测试路径必须有父目录")).expect("可创建测试目录");
    std::fs::write(
        &path,
        r#"{
          "engineState": "ready",
          "currentSchema": "simplifiedPinyin",
          "coreP50Ms": 4,
          "coreP95Ms": 19,
          "startupMs": 31,
          "recentError": null
        }"#,
    )
    .expect("可写入旧诊断快照");

    let diagnostics = DiagnosticsService::new(path.clone()).get_diagnostics();

    assert_eq!(diagnostics.core_p50_us, 4_000);
    assert_eq!(diagnostics.core_p95_us, 19_000);

    let _ = std::fs::remove_file(path);
}

#[test]
fn diagnostics_service_falls_back_for_missing_or_invalid_snapshot() {
    let missing = test_snapshot_path("missing");
    assert_eq!(
        DiagnosticsService::new(missing).get_diagnostics(),
        create_default_diagnostics()
    );

    let invalid = test_snapshot_path("invalid");
    std::fs::create_dir_all(invalid.parent().expect("测试路径必须有父目录"))
        .expect("可创建测试目录");
    let sensitive = "ni".to_string() + "hao";
    std::fs::write(
        &invalid,
        format!(r#"{{"engineState":"ready","recentError":"{sensitive}"}}"#),
    )
    .expect("可写入非法快照");

    let diagnostics = DiagnosticsService::new(invalid.clone()).get_diagnostics();

    assert_eq!(diagnostics.engine_state, "unavailable");
    assert_eq!(diagnostics.current_schema, "simplifiedPinyin");
    assert_eq!(diagnostics.core_p50_us, 0);
    assert_eq!(diagnostics.core_p95_us, 0);
    assert_eq!(diagnostics.startup_ms, 0);
    assert_eq!(diagnostics.recent_error, None);

    let _ = std::fs::remove_file(invalid);
}
