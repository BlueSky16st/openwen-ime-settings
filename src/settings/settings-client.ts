import { invoke } from "@tauri-apps/api/core";
import { ClearLocalLearningResult, DiagnosticsState, OpenWenIMESettings } from "./settings-model";

export type PlatformId = "mac" | "windows";

export interface PlatformCapabilities {
  platformId: PlatformId;
  settingContributionIds: string[];
}

export interface SettingsClient {
  getSettings(): Promise<OpenWenIMESettings>;
  saveSettings(settings: OpenWenIMESettings): Promise<OpenWenIMESettings>;
  getDiagnostics(): Promise<DiagnosticsState>;
  clearLocalLearning(): Promise<ClearLocalLearningResult>;
  getPlatformCapabilities(): Promise<PlatformCapabilities>;
}

export const tauriSettingsClient: SettingsClient = {
  getSettings: () => invoke<OpenWenIMESettings>("get_settings"),
  saveSettings: (settings) => invoke<OpenWenIMESettings>("save_settings", { settings }),
  getDiagnostics: () => invoke<DiagnosticsState>("get_diagnostics"),
  clearLocalLearning: () => invoke<ClearLocalLearningResult>("clear_local_learning"),
  getPlatformCapabilities: () =>
    invoke<PlatformCapabilities>("get_platform_capabilities")
};
