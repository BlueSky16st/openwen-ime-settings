use std::path::{Path, PathBuf};

use serde::Serialize;

#[cfg(target_os = "macos")]
use crate::settings_change_notifier::{
    DarwinSettingsChangeNotifier, SETTINGS_CHANGE_NOTIFICATION_NAME, SettingsChangeNotifier,
};

/// 描述当前平台可贡献给 Settings 的受控能力，不包含用户设置内容。
#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PlatformCapabilities {
    platform_id: String,
    setting_contribution_ids: Vec<String>,
}

impl PlatformCapabilities {
    /// 从固定平台标识和贡献标识创建能力快照。
    pub(crate) fn new(platform_id: &str, setting_contribution_ids: Vec<String>) -> Self {
        Self {
            platform_id: platform_id.to_string(),
            setting_contribution_ids,
        }
    }

    /// 判断能力快照是否可以从公开 Tauri command 返回。
    pub(crate) fn is_public_platform(&self) -> bool {
        matches!(self.platform_id.as_str(), "mac" | "windows")
    }
}

/// 汇总 Settings 调用 Core helper 所需的四个本机路径。
#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) struct CoreControlPaths {
    helper_path: PathBuf,
    shared_data_path: PathBuf,
    user_data_path: PathBuf,
    log_path: PathBuf,
}

impl CoreControlPaths {
    /// 使用 helper 和三个运行数据目录创建路径集合。
    pub(crate) fn new(
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

    /// 返回 Core helper 可执行文件路径。
    pub(crate) fn helper_path(&self) -> PathBuf {
        self.helper_path.clone()
    }

    /// 返回 Core 共享数据目录。
    pub(crate) fn shared_data_path(&self) -> PathBuf {
        self.shared_data_path.clone()
    }

    /// 返回 Core 用户数据目录。
    pub(crate) fn user_data_path(&self) -> PathBuf {
        self.user_data_path.clone()
    }

    /// 返回 Core 日志目录。
    pub(crate) fn log_path(&self) -> PathBuf {
        self.log_path.clone()
    }
}

/// 隔离各平台的能力、通知、诊断路径和 Core helper 路径。
pub(crate) trait PlatformSettingsBackend: Send + Sync {
    /// 返回不含用户数据的平台能力快照。
    fn capabilities(&self) -> PlatformCapabilities;

    /// 在设置保存成功后发送平台通知；失败不撤销已保存设置。
    fn post_settings_changed(&self) -> Result<(), String>;

    /// 返回平台提供的脱敏诊断快照路径；不可用时返回空。
    fn diagnostics_snapshot_path(&self) -> Option<PathBuf>;

    /// 返回平台提供的 Core helper 路径集合；不可用时返回空。
    fn core_control_paths(&self) -> Option<CoreControlPaths>;
}

/// 承载可由 Tauri 管理的线程安全平台后端。
pub(crate) struct PlatformBackendState {
    backend: Box<dyn PlatformSettingsBackend>,
}

impl PlatformBackendState {
    /// 包装已选择的平台后端供 command 与服务初始化复用。
    pub(crate) fn new(backend: Box<dyn PlatformSettingsBackend>) -> Self {
        Self { backend }
    }

    /// 返回后端的只读能力快照。
    pub(crate) fn capabilities(&self) -> PlatformCapabilities {
        self.backend.capabilities()
    }

    /// 转发设置保存后的平台通知。
    pub(crate) fn post_settings_changed(&self) -> Result<(), String> {
        self.backend.post_settings_changed()
    }

    /// 返回后端提供的诊断快照路径。
    pub(crate) fn diagnostics_snapshot_path(&self) -> Option<PathBuf> {
        self.backend.diagnostics_snapshot_path()
    }

    /// 返回后端提供的 Core helper 路径。
    pub(crate) fn core_control_paths(&self) -> Option<CoreControlPaths> {
        self.backend.core_control_paths()
    }
}

#[cfg(target_os = "macos")]
/// 保持现有 macOS 通知与运行目录行为的平台后端。
#[derive(Clone, Debug)]
pub(crate) struct MacPlatformSettingsBackend {
    home: PathBuf,
    executable: PathBuf,
}

#[cfg(target_os = "macos")]
impl MacPlatformSettingsBackend {
    /// 使用当前进程环境创建 macOS 后端。
    pub(crate) fn current() -> Self {
        Self::with_environment(home_directory(), current_executable())
    }

    /// 使用显式主目录和可执行文件创建可复现的 macOS 后端。
    pub(crate) fn with_environment(home: PathBuf, executable: PathBuf) -> Self {
        Self { home, executable }
    }

    /// 返回 OpenWen InputMethod 的固定运行根目录。
    fn runtime_root(&self) -> PathBuf {
        self.home
            .join("Library")
            .join("Application Support")
            .join("OpenWen")
            .join("InputMethod")
    }
}

#[cfg(target_os = "macos")]
impl PlatformSettingsBackend for MacPlatformSettingsBackend {
    /// 返回固定 mac 平台标识且不声明设置贡献。
    fn capabilities(&self) -> PlatformCapabilities {
        PlatformCapabilities::new("mac", vec![])
    }

    /// 发送固定 Darwin 设置变更通知。
    fn post_settings_changed(&self) -> Result<(), String> {
        DarwinSettingsChangeNotifier.post(SETTINGS_CHANGE_NOTIFICATION_NAME)
    }

    /// 返回 InputMethod 诊断快照的兼容路径。
    fn diagnostics_snapshot_path(&self) -> Option<PathBuf> {
        Some(
            self.runtime_root()
                .join("diagnostics")
                .join("core-diagnostics.json"),
        )
    }

    /// 返回与 Settings 可执行文件同目录的 helper 及兼容运行目录。
    fn core_control_paths(&self) -> Option<CoreControlPaths> {
        let helper_path = self
            .executable
            .parent()
            .unwrap_or_else(|| Path::new(""))
            .join("openwen-core-control");
        let runtime_root = self.runtime_root();
        Some(CoreControlPaths::new(
            helper_path,
            runtime_root.join("shared-data"),
            runtime_root.join("user-data"),
            runtime_root.join("logs"),
        ))
    }
}

#[cfg(target_os = "windows")]
/// 表示本轮仅提供安全能力骨架的 Windows 后端。
#[derive(Clone, Debug, Default)]
pub(crate) struct WindowsPlatformSettingsBackend;

#[cfg(target_os = "windows")]
impl PlatformSettingsBackend for WindowsPlatformSettingsBackend {
    /// 返回固定 windows 平台标识且不声明设置贡献。
    fn capabilities(&self) -> PlatformCapabilities {
        PlatformCapabilities::new("windows", vec![])
    }

    /// Windows 本轮不发送设置通知，受控返回成功。
    fn post_settings_changed(&self) -> Result<(), String> {
        Ok(())
    }

    /// Windows 本轮不提供诊断快照路径。
    fn diagnostics_snapshot_path(&self) -> Option<PathBuf> {
        None
    }

    /// Windows 本轮不提供 Core helper 路径。
    fn core_control_paths(&self) -> Option<CoreControlPaths> {
        None
    }
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
/// 防止其他测试平台被误报为 macOS 或 Windows 的内部后端。
#[derive(Clone, Debug, Default)]
struct UnsupportedPlatformSettingsBackend;

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
impl PlatformSettingsBackend for UnsupportedPlatformSettingsBackend {
    /// 返回仅供内部识别的 unsupported 标识。
    fn capabilities(&self) -> PlatformCapabilities {
        PlatformCapabilities::new("unsupported", vec![])
    }

    /// 未支持平台不发送通知，受控返回成功。
    fn post_settings_changed(&self) -> Result<(), String> {
        Ok(())
    }

    /// 未支持平台不提供诊断快照路径。
    fn diagnostics_snapshot_path(&self) -> Option<PathBuf> {
        None
    }

    /// 未支持平台不提供 Core helper 路径。
    fn core_control_paths(&self) -> Option<CoreControlPaths> {
        None
    }
}

/// 按编译目标创建唯一的平台后端，不通过运行时猜测平台。
pub(crate) fn current_platform_backend() -> Box<dyn PlatformSettingsBackend> {
    #[cfg(target_os = "macos")]
    {
        Box::new(MacPlatformSettingsBackend::current())
    }
    #[cfg(target_os = "windows")]
    {
        Box::new(WindowsPlatformSettingsBackend)
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        Box::new(UnsupportedPlatformSettingsBackend)
    }
}

#[cfg(target_os = "macos")]
/// 返回当前用户主目录；缺失时使用临时目录维持安全降级。
fn home_directory() -> PathBuf {
    std::env::var_os("HOME")
        .map(PathBuf::from)
        .unwrap_or_else(std::env::temp_dir)
}

#[cfg(target_os = "macos")]
/// 返回 Settings 当前可执行文件；解析失败时保留相对 helper 语义。
fn current_executable() -> PathBuf {
    std::env::current_exe().unwrap_or_else(|_| PathBuf::from("openwen-ime-settings"))
}
