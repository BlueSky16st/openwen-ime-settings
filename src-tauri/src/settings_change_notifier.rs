use std::ffi::CString;

use crate::privacy_guard::{SETTINGS_NOTIFY, sanitized_error_code};

pub const SETTINGS_CHANGE_NOTIFICATION_NAME: &str = "org.openwen.settings.changed";

pub trait SettingsChangeNotifier: Send + Sync {
    /// 发送固定名称的设置变更通知。
    fn post(&self, notification_name: &str) -> Result<(), String>;
}

#[derive(Clone, Debug, Default)]
pub struct DarwinSettingsChangeNotifier;

impl SettingsChangeNotifier for DarwinSettingsChangeNotifier {
    /// 通过 Darwin 通知中心广播设置文件已更新。
    fn post(&self, notification_name: &str) -> Result<(), String> {
        post_darwin_notification(notification_name)
    }
}

#[cfg(target_os = "macos")]
/// 调用 Darwin notify API，失败只返回固定错误码。
fn post_darwin_notification(notification_name: &str) -> Result<(), String> {
    let notification_name =
        CString::new(notification_name).map_err(|_| sanitized_error_code(SETTINGS_NOTIFY))?;
    let status = unsafe { notify_post(notification_name.as_ptr()) };
    if status == 0 {
        Ok(())
    } else {
        Err(sanitized_error_code(SETTINGS_NOTIFY))
    }
}

#[cfg(not(target_os = "macos"))]
/// 非 macOS 构建保持通知接口成功可调用。
fn post_darwin_notification(_notification_name: &str) -> Result<(), String> {
    Ok(())
}

#[cfg(target_os = "macos")]
unsafe extern "C" {
    /// 调用系统 Darwin 通知发布函数。
    fn notify_post(name: *const std::ffi::c_char) -> i32;
}
