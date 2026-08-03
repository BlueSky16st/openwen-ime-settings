use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};

use openwen_ime_settings_lib::core_control_service::CoreControlService;

static TEST_PATH_COUNTER: AtomicU64 = AtomicU64::new(0);

fn test_root(name: &str) -> std::path::PathBuf {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("系统时间需要晚于 UNIX_EPOCH")
        .as_nanos();
    let sequence = TEST_PATH_COUNTER.fetch_add(1, Ordering::Relaxed);

    std::env::temp_dir()
        .join("openwen-core-control-service-tests")
        .join(format!("{name}-{}-{nanos}-{sequence}", std::process::id()))
}

#[test]
fn core_control_service_returns_success_for_helper_ok_result() {
    let root = test_root("success");
    let helper = root.join("openwen-core-control");
    std::fs::create_dir_all(&root).expect("可创建测试目录");
    std::fs::write(
        &helper,
        "#!/bin/sh\nprintf '{\"cleared\":true,\"errorCode\":\"ok\"}\\n'\n",
    )
    .expect("可写入 helper");
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&helper, std::fs::Permissions::from_mode(0o755))
            .expect("可设置 helper 可执行");
    }

    let service = CoreControlService::with_paths(
        helper,
        root.join("shared-data"),
        root.join("user-data"),
        root.join("logs"),
    );
    let result = service.clear_local_learning();

    assert!(result.cleared);
    assert_eq!(result.message, "ok");

    let _ = std::fs::remove_dir_all(root);
}

#[test]
fn core_control_service_returns_sanitized_failure_for_missing_or_bad_helper() {
    let root = test_root("failure");
    let missing = CoreControlService::with_paths(
        root.join("missing-helper"),
        root.join("shared-data"),
        root.join("user-data"),
        root.join("logs"),
    )
    .clear_local_learning();

    assert!(!missing.cleared);
    assert_eq!(missing.message, "learning-clear");
    for sensitive in [
        "ni".to_string() + "hao",
        "候选选择".to_string() + "历史",
        "上下文".to_string() + "文本",
        "真实用户".to_string() + "输入",
        "candidateText".to_string(),
        ".user".to_string() + "db",
    ] {
        assert!(!missing.message.contains(&sensitive));
    }
}
