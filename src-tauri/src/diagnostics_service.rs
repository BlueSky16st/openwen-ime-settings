use serde::{Deserialize, Serialize};
use std::path::PathBuf;

use crate::privacy_guard::sanitized_diagnostics_error_code;

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DiagnosticsState {
    pub engine_state: String,
    pub current_schema: String,
    pub core_p50_us: u64,
    pub core_p95_us: u64,
    pub startup_ms: u16,
    pub recent_error: Option<String>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DiagnosticsSnapshot {
    engine_state: String,
    current_schema: String,
    core_p50_us: Option<u64>,
    core_p95_us: Option<u64>,
    core_p50_ms: Option<u16>,
    core_p95_ms: Option<u16>,
    startup_ms: u16,
    recent_error: Option<String>,
}

#[derive(Clone, Debug)]
pub struct DiagnosticsService {
    snapshot_path: PathBuf,
}

impl DiagnosticsService {
    /// 使用固定快照路径创建诊断读取服务。
    pub fn new(snapshot_path: PathBuf) -> Self {
        Self { snapshot_path }
    }

    /// 读取本机快照；缺失或解析失败时返回安全默认值。
    pub fn get_diagnostics(&self) -> DiagnosticsState {
        let raw = match std::fs::read_to_string(&self.snapshot_path) {
            Ok(raw) => raw,
            Err(_) => return create_default_diagnostics(),
        };
        let snapshot = match serde_json::from_str::<DiagnosticsSnapshot>(&raw) {
            Ok(snapshot) => snapshot,
            Err(_) => return create_default_diagnostics(),
        };
        sanitize_diagnostics_state(snapshot.into_diagnostics_state())
    }
}

impl DiagnosticsSnapshot {
    /// 将兼容文件格式转换为当前诊断结构。
    fn into_diagnostics_state(self) -> DiagnosticsState {
        DiagnosticsState {
            engine_state: self.engine_state,
            current_schema: self.current_schema,
            core_p50_us: self
                .core_p50_us
                .or_else(|| self.core_p50_ms.map(milliseconds_to_microseconds))
                .unwrap_or(0),
            core_p95_us: self
                .core_p95_us
                .or_else(|| self.core_p95_ms.map(milliseconds_to_microseconds))
                .unwrap_or(0),
            startup_ms: self.startup_ms,
            recent_error: self.recent_error,
        }
    }
}

/// 创建不含输入内容的默认诊断状态。
pub fn create_default_diagnostics() -> DiagnosticsState {
    DiagnosticsState {
        engine_state: "unavailable".to_string(),
        current_schema: "simplifiedPinyin".to_string(),
        core_p50_us: 0,
        core_p95_us: 0,
        startup_ms: 0,
        recent_error: None,
    }
}

/// 将方案、状态、耗时和错误码限制为允许范围。
pub fn sanitize_diagnostics_state(mut diagnostics: DiagnosticsState) -> DiagnosticsState {
    if !matches!(
        diagnostics.engine_state.as_str(),
        "ready" | "unavailable" | "error" | "initializing"
    ) {
        diagnostics.engine_state = "unavailable".to_string();
    }

    if !matches!(
        diagnostics.current_schema.as_str(),
        "simplifiedPinyin" | "ziranmaDoublePinyin" | "wubi86"
    ) {
        diagnostics.current_schema = "simplifiedPinyin".to_string();
    }

    diagnostics.recent_error = sanitize_recent_error(diagnostics.recent_error);
    diagnostics
}

/// 仅保留固定格式的短错误码。
fn sanitize_recent_error(recent_error: Option<String>) -> Option<String> {
    let recent_error = recent_error?;
    let trimmed = recent_error.trim();

    if trimmed.is_empty() {
        return None;
    }

    let sanitized = sanitized_diagnostics_error_code(trimmed);
    Some(sanitized)
}

/// 将历史毫秒字段转换为微秒。
fn milliseconds_to_microseconds(milliseconds: u16) -> u64 {
    u64::from(milliseconds) * 1_000
}
