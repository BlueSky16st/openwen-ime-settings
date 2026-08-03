use std::path::PathBuf;
use std::process::Command;

use serde::Deserialize;

use crate::settings_service::ClearLocalLearningResult;

pub const CORE_CONTROL_HELPER_NAME: &str = "openwen-core-control";

#[derive(Clone, Debug)]
pub struct CoreControlService {
    helper_path: PathBuf,
    shared_data_path: PathBuf,
    user_data_path: PathBuf,
    log_path: PathBuf,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CoreControlOutput {
    cleared: bool,
    #[serde(default)]
    error_code: String,
}

impl CoreControlService {
    /// 使用正式运行目录创建 Core 控制服务。
    pub fn new(helper_path: PathBuf) -> Self {
        let runtime_root = openwen_input_method_runtime_root();
        Self::with_paths(
            helper_path,
            runtime_root.join("shared-data"),
            runtime_root.join("user-data"),
            runtime_root.join("logs"),
        )
    }

    /// 使用显式 helper 与运行目录创建服务，供隔离验证复用。
    pub fn with_paths(
        helper_path: PathBuf,
        shared_data_path: PathBuf,
        user_data_path: PathBuf,
        log_path: PathBuf,
    ) -> Self {
        Self {
            helper_path,
            shared_data_path,
            user_data_path,
            log_path,
        }
    }

    /// 执行受控 helper 清除本机学习数据，并只返回固定结果码。
    pub fn clear_local_learning(&self) -> ClearLocalLearningResult {
        if !self.helper_path.is_file() {
            return clear_failure();
        }

        let output = match Command::new(&self.helper_path)
            .arg("--clear-local-learning")
            .arg("--shared-data")
            .arg(&self.shared_data_path)
            .arg("--user-data")
            .arg(&self.user_data_path)
            .arg("--log-dir")
            .arg(&self.log_path)
            .output()
        {
            Ok(output) => output,
            Err(_) => return clear_failure(),
        };

        if !output.status.success() {
            return clear_failure();
        }

        let parsed = match serde_json::from_slice::<CoreControlOutput>(&output.stdout) {
            Ok(parsed) => parsed,
            Err(_) => return clear_failure(),
        };
        if parsed.cleared && parsed.error_code == "ok" {
            ClearLocalLearningResult {
                cleared: true,
                message: "ok".to_string(),
            }
        } else {
            clear_failure()
        }
    }
}

/// 创建不含路径或命令输出的清除失败结果。
fn clear_failure() -> ClearLocalLearningResult {
    ClearLocalLearningResult {
        cleared: false,
        message: "learning-clear".to_string(),
    }
}

/// 解析输入法本机运行根目录。
fn openwen_input_method_runtime_root() -> PathBuf {
    std::env::var_os("HOME")
        .map(PathBuf::from)
        .unwrap_or_else(std::env::temp_dir)
        .join("Library")
        .join("Application Support")
        .join("OpenWen")
        .join("InputMethod")
}
